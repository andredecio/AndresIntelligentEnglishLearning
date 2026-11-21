import * as functions from "firebase-functions/v1";
import { regionalFunctions } from "../config.js"; 
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

// Safe-guard Firebase Admin SDK initialization
if (getApps().length === 0) {
    initializeApp();
}

// --- Configuration Constants ---
const ADMIN_UID = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; 

const COST_PER_1000_GEMINI_INPUT_TOKENS = 0.0005; 
const COST_PER_1000_GEMINI_OUTPUT_TOKENS = 0.0015; 

const FIRESTORE_WRITE_COST_PER_MODULE = 0.00005; 
const CLOUD_FUNCTION_BASE_COST = 0.00001; 

/**
 * Estimates the total cost in the base currency for creating a lesson.
 * This is a fixed cost per lesson, as it does not involve Gemini generation.
 * @returns {number} Estimated cost in base currency.
 */
function calculateEstimatedLessonCost() {
    const geminiCost = 0;
    const firestoreCost = FIRESTORE_WRITE_COST_PER_MODULE;
    const functionCost = CLOUD_FUNCTION_BASE_COST;
    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;

    functions.logger.debug(`Estimated cost for creating one lesson: ${totalEstimatedCost.toFixed(6)}`);
    return totalEstimatedCost;
}

export const createLesson = regionalFunctions
    .runWith({ timeoutSeconds: 540 })
    .https.onCall(async (data, context) => {
        const firestore = getFirestore(); 
        const currentUserUid = context.auth?.uid;
    if (!currentUserUid) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const customClaims = context.auth.token;
    const canCreateModule = customClaims.canCreateModule || customClaims.admin;

    if (!canCreateModule) {
        throw new functions.https.HttpsError('permission-denied', 'Your payment plan does not permit module creation.');
    }

    const { theme, cefr, expectedModuleCount } = data;

    if (!theme || !cefr) { 
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Lesson Theme and CEFR level are required.'
        );
    }

    functions.logger.info(`User ${currentUserUid}: Starting lesson creation for Theme: ${theme}, CEFR: ${cefr}`);

    const estimatedCost = calculateEstimatedLessonCost();

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
                modulesCreatedThisMonth = 0; 
                lastBillingCycleReset = Timestamp.fromDate(now); 
                functions.logger.info(`User ${currentUserUid}: Monthly module count reset for new billing cycle.`);
            }

            if (modulesCreatedThisMonth + moduleCountForLimit > paymentPlan.moduleCreationLimit) {
                throw new functions.https.HttpsError('resource-exhausted', `Monthly module creation limit reached. You have created ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} modules.`);
            }

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

    try {
        const newLessonRef = firestore.collection("LESSON").doc();
        const MODULEID = newLessonRef.id;

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
            CREATED_AT: FieldValue.serverTimestamp(),
            ownerUid: ownerUid, 
            status: status,     
        };

        await firestore.collection("LESSON").doc(MODULEID).set(lessonData); 

        functions.logger.info(`User ${currentUserUid}: Successfully created lesson with ID: ${MODULEID}`);

        return { success: true, MODULEID, ownerUid, status }; 
    } catch (error) {
        functions.logger.error(`User ${currentUserUid}: Error creating LESSON:`, error); 
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during lesson creation.', error.message);
    }
});


