const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
// No direct Gemini usage, but including for consistency if helpers evolve
// const { getTextGenModel } = require("../helpers/gemini");
// No direct ipaUtils needed, but including for consistency if helpers evolve
// const { normalizeTitle, generateUniqueFirestoreId } = require("../helpers/ipaUtils");

// --- Configuration Constants (COPIED FROM generateVocabularyContent.js) ---
// You MUST replace this with the actual UID of your primary admin user.
const ADMIN_UID = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; // <<== IMPORTANT: REPLACE WITH YOUR ACTUAL ADMIN UID

// Base cost for Gemini API interactions (example values, not directly used here)
const COST_PER_1000_GEMINI_INPUT_TOKENS = 0.0005; // Example: 0.5 USD per 1000 input tokens
const COST_PER_1000_GEMINI_OUTPUT_TOKENS = 0.0015; // Example: 1.5 USD per 1000 output tokens

// Estimated fixed costs for Firestore writes and Cloud Function execution per module generated
const FIRESTORE_WRITE_COST_PER_MODULE = 0.00005; // Example: very low cost per module write
const CLOUD_FUNCTION_BASE_COST = 0.00001; // Example: very low fixed cost per function invocation

// --- Helper Function for Cost Estimation (ADAPTED for Lesson Creation) ---

/**
 * Estimates the total cost in the base currency for creating a lesson.
 * This is a fixed cost per lesson, as it does not involve Gemini generation.
 * @returns {number} Estimated cost in base currency.
 */
function calculateEstimatedLessonCost() {
    // Lesson creation has no Gemini token costs
    const geminiCost = 0;

    // 1 Firestore write for the lesson document
    const firestoreCost = FIRESTORE_WRITE_COST_PER_MODULE;

    // Fixed cost for Cloud Function execution
    const functionCost = CLOUD_FUNCTION_BASE_COST;

    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;

    functions.logger.debug(`Estimated cost for creating one lesson: ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

const createLesson = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    const firestore = admin.firestore(); // Consistent naming with other functions
    const currentUserUid = context.auth?.uid;

    // --- NEW: Security Check (Auth and Custom Claims - REPLACED OLD ADMIN CHECK) ---
    if (!currentUserUid) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Custom claims are expected to be set by a separate Cloud Function
    const customClaims = context.auth.token;
    // canCreateModule allows general content creation; 'admin' is a fallback for administrative overrides
    const canCreateModule = customClaims.canCreateModule || customClaims.admin;

    if (!canCreateModule) {
        throw new functions.https.HttpsError('permission-denied', 'Your payment plan does not permit module creation.');
    }
    // --- End NEW Security Check ---

    const { theme, cefr, expectedModuleCount } = data;

    // Perform validation for lesson creation parameters
    if (!theme || !cefr) { // 'expectedModuleCount' can be 0 or null, so not strictly required here.
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Lesson Theme and CEFR level are required.'
        );
    }

    functions.logger.info(`User ${currentUserUid}: Starting lesson creation for Theme: ${theme}, CEFR: ${cefr}`);

    // --- NEW: Calculate Estimated Cost for Lesson Creation ---
    const estimatedCost = calculateEstimatedLessonCost();

    // --- NEW: TRANSACTIONAL CREDIT & LIMIT CHECK (Firestore Transaction) ---
    // The lesson creation will be wrapped in a transaction to ensure atomicity
    // with the user's balance and module count updates.
    await firestore.runTransaction(async (transaction) => {
        const userRef = firestore.collection('users').doc(currentUserUid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found. Please log in again.');
        }
        const userProfile = userDoc.data();

        const paymentPlanRef = firestore.collection('paymentPlans').doc(userProfile.planid);
        const paymentPlanDoc = await transaction.get(paymentPlanRef);

        if (!paymentPlanDoc.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'Invalid payment plan assigned to user.');
        }
        const paymentPlan = paymentPlanDoc.data();

        let currentBalance = userProfile.currentBalance || 0;

        // 1. Credit Check
        if (currentBalance < estimatedCost) {
            throw new functions.https.HttpsError('resource-exhausted', `Insufficient funds. Current balance: ${currentBalance.toFixed(2)}. Estimated cost for this operation: ${estimatedCost.toFixed(2)}.`);
        }

        // 2. Monthly Module Limit Check (for fixed plans only)
        // A lesson counts as 1 module for the limit check
        const moduleCountForLimit = 1;
        if (paymentPlan.type !== 'PayAsYouGo' && paymentPlan.moduleCreationLimit !== null) {
            let modulesCreatedThisMonth = userProfile.modulesCreatedThisMonth || 0;
            let lastBillingCycleReset = userProfile.lastBillingCycleReset ? userProfile.lastBillingCycleReset.toDate() : null;
            const now = new Date();

            let shouldReset = false;
            if (!lastBillingCycleReset) {
                shouldReset = true;
            } else if (paymentPlan.type === 'Monthly' && (now.getMonth() !== lastBillingCycleReset.getMonth() || now.getFullYear() !== lastBillingCycleReset.getFullYear())) {
                shouldReset = true;
            } else if (paymentPlan.type === 'Yearly' && (now.getFullYear() !== lastBillingCycleReset.getFullYear())) {
                shouldReset = true;
            }

            if (shouldReset) {
                modulesCreatedThisMonth = 0; // Reset counter for new cycle
                lastBillingCycleReset = admin.firestore.Timestamp.fromDate(now); // Update timestamp to now
                functions.logger.info(`User ${currentUserUid}: Monthly module count reset for new billing cycle.`);
            }

            // Check if current request exceeds the limit
            if (modulesCreatedThisMonth + moduleCountForLimit > paymentPlan.moduleCreationLimit) {
                throw new functions.https.HttpsError('resource-exhausted', `Monthly module creation limit reached. You have created ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} modules.`);
            }

            // Update user profile for the transaction
            userProfile.modulesCreatedThisMonth = modulesCreatedThisMonth + moduleCountForLimit;
            userProfile.lastBillingCycleReset = lastBillingCycleReset;
        }

        // 3. Deduct Funds and Update Counters
        transaction.update(userRef, {
            currentBalance: currentBalance - estimatedCost,
            modulesCreatedThisMonth: userProfile.modulesCreatedThisMonth,
            lastBillingCycleReset: userProfile.lastBillingCycleReset
        });
        functions.logger.info(`User ${currentUserUid}: Deducted ${estimatedCost.toFixed(6)}. New balance: ${(currentBalance - estimatedCost).toFixed(2)}. Modules this month: ${userProfile.modulesCreatedThisMonth}.`);

    });
    // --- END NEW TRANSACTIONAL CREDIT & LIMIT CHECK ---


    try {
        const newLessonRef = firestore.collection("LESSON").doc();
        const MODULEID = newLessonRef.id;

        // --- NEW: Set Module Ownership and Status for LESSONS ---
        // As per "Course/Lesson Creation: Only via AdminSystem page", lessons are ADMIN_UID owned and shared
        const ownerUid = ADMIN_UID;
        const status = 'shared';

        const lessonData = {
            MODULETYPE: "LESSON",
            MODULEID,
            TITLE: theme ? "Lesson Theme: " + theme : "New Lesson",
            THEME: theme || "",
            CEFR_LEVEL: cefr || "",
            EXPECTED_MODULE_COUNT: expectedModuleCount || 0,
            MODULEID_ARRAY: [],
            CREATED_AT: admin.firestore.FieldValue.serverTimestamp(),
            ownerUid: ownerUid, // NEW: Set owner UID
            status: status,     // NEW: Set status
        };

        await firestore.collection("LESSON").doc(MODULEID).set(lessonData); // Use firestore instance for direct write after transaction

        functions.logger.info(`User ${currentUserUid}: Successfully created lesson with ID: ${MODULEID}`);

        return { success: true, MODULEID, ownerUid, status }; // Return ownerUid and status for transparency
    } catch (error) {
        functions.logger.error(`User ${currentUserUid}: Error creating LESSON:`, error); // Consistent logging
        // If it's a credit/limit error, it's already an HttpsError, re-throw directly
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        // Catch all other unexpected errors and convert them to HttpsError
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during lesson creation.', error.message);
    }
});

module.exports = { createLesson };
