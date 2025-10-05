const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { getTextGenModel } = require("../helpers/gemini");
const { normalizeTitle, generateUniqueFirestoreId } = require("../helpers/ipaUtils"); // adjust path if needed

// --- Configuration Constants (COPIED FROM generateVocabularyContent.js) ---
// You MUST replace this with the actual UID of your primary admin user.
const ADMIN_UID = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; // <<== IMPORTANT: REPLACE WITH YOUR ACTUAL ADMIN UID

// Base cost for Gemini API interactions (example values, you will need to fine-tune these)
const COST_PER_1000_GEMINI_INPUT_TOKENS = 0.0005; // Example: 0.5 USD per 1000 input tokens
const COST_PER_1000_GEMINI_OUTPUT_TOKENS = 0.0015; // Example: 1.5 USD per 1000 output tokens

// Estimated fixed costs for Firestore writes and Cloud Function execution per module generated
const FIRESTORE_WRITE_COST_PER_MODULE = 0.00005; // Example: very low cost per module write
const CLOUD_FUNCTION_BASE_COST = 0.00001; // Example: very low fixed cost per function invocation

// --- Helper Functions for Cost Estimation (COPIED & ADAPTED) ---

/**
 * Calculates the estimated number of tokens for a given text.
 * This is a simplified estimation; for precise billing, you might integrate a token counter utility
 * or rely on Gemini's actual token count returned in its response (if available and feasible).
 * @param {string} text
 * @returns {number} Estimated token count.
 */
function estimateTokens(text) {
    // Rough estimation: 1 token ~ 4 characters
    return Math.ceil(text.length / 4);
}

/**
 * Estimates the total cost in the base currency for generating grammar content.
 * This needs to be carefully tuned based on actual Gemini/Firestore/Functions pricing
 * and the expected output length of a grammar module.
 * @param {number} numItems - The number of top-level grammar items requested.
 * @param {string} geminiPrompt - The prompt sent to Gemini.
 * @returns {number} Estimated cost in base currency.
 */
function calculateEstimatedGrammarCost(numItems, geminiPrompt) {
    // If no items requested, no cost
    if (numItems <= 0) return 0;

    // 1. Gemini API Token Costs
    const inputTokens = estimateTokens(geminiPrompt);
    // Assume output tokens are roughly 1000-1500 per grammar item (adjust this heuristic)
    // A grammar item might be slightly less verbose than a full conversation.
    const estimatedOutputTokens = numItems * 1200; // Average 1200 tokens per grammar item
    const geminiCost = (inputTokens / 1000 * COST_PER_1000_GEMINI_INPUT_TOKENS) +
                       (estimatedOutputTokens / 1000 * COST_PER_1000_GEMINI_OUTPUT_TOKENS);

    // 2. Firestore Write Costs
    // Estimate 1 Firestore write per grammar module
    const firestoreCost = numItems * FIRESTORE_WRITE_COST_PER_MODULE;

    // 3. Cloud Function Execution Cost
    const functionCost = CLOUD_FUNCTION_BASE_COST; // Small fixed cost per invocation

    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;

    functions.logger.debug(`Estimated cost for ${numItems} grammar items (prompt length ${geminiPrompt.length}): ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- generateGrammarContent Callable Function ---
const generateGrammarContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    const firestore = admin.firestore();
    const currentUserUid = context.auth?.uid; // Moved up for earlier use

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

    const { cefrLevel, numItems, theme, lessonModuleId } = data; // <-- ADD lessonModuleId here

    // 2. Adjust validation to allow 0 numItems if this is for a lesson (handled client-side)
    // If not for a lesson, numItems must be > 0.
    // For simplicity, we'll keep it numItems > 0 as 0 items means no function call from client
    // for standalone generation.
    if (!cefrLevel || !theme || typeof numItems !== 'number' || numItems < 0) { // Changed to numItems < 0 to allow 0
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Items (must be a number >= 0), and Theme are required and must be valid.'
        );
    }

    // NEW: Handle 0 numItems early to avoid unnecessary processing
    if (numItems <= 0) {
        functions.logger.info(`User ${currentUserUid}: Requested 0 items. Skipping generation.`);
        return {
            status: "success",
            message: `Requested 0 items. No content generated.`,
            moduleIds: [],
            skippedWords: [],
            geminiReturnedItemCount: 0,
            topLevelGrammarCount: 0,
        };
    }

    functions.logger.info(`User ${currentUserUid}: Starting grammar content generation for CEFR: ${cefrLevel}, Items: ${numItems}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`); // Add currentUserUid to log

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
    const skippedWords = [];
    let geminiReturnedItemCount = 0;
    let topLevelGrammarCount = 0;

    // 3. Prepare lessonDataToMerge for conditional LESSON_ID
    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {}; // <-- ADD THIS LINE

    // --- 1. Construct the sophisticated prompt for Gemini ---
    // MOVED THIS BLOCK UP so geminiPrompt is defined BEFORE calculateEstimatedGrammarCost
    const geminiPrompt = `
        Generate a JSON array of ${numItems} grammar teaching items for CEFR ${cefrLevel} level, themed around "${theme}".
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
        - "MODULETYPE": String (e.g. GRAMMAR ).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **GRAMMAR** (for individual teaching point:
            - "MODULETYPE": "GRAMMAR"
            - "TITLE": The title of the grammar point
            - "CEFR": This must be ${cefrLevel}
            - "DESCRIPTION": Must be about 3 numbered sentences (e.g., "1. Sentence one. 2. Sentence two. 3. Sentence three.") that explain the grammar teaching point
            - "THEME":This must be ${theme}
            - "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on the grammar teaching point(s) in the DESCRIPTION field.

        **Crucial Rules for Generation:**
        - The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax (e.g., correct commas, brackets, and quotes). Any deviation from standard JSON syntax will render the output unusable.
        - **MODULETYPE:** You MUST create a unique GRAMMAR MODULETYPE document for EACH distinct grammar teaching point. For example 'ed' is the common ending for the Past Participle form of regular verbs.
        - **CEFR Hierarchy:** For All GRAMMAR modules, their 'CEFR' level MUST be used to decide on the grammar teaching point degree of sophistication.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numItems} top-level GRAMMAR items, each with a unique grammar teaching point
        - **TITLE:** This field must contain the title of the grammar teaching point exclusively.

        Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "Regular Verbs",
            "MODULETYPE": "GRAMMAR",
            "CEFR": "A2",
            "DESCRIPTION": "1. Regular verbs end with 'ed' for the Perfect Tenses. 2. Regular verbs end with 'ed' for the Simple Past Tense too. 3. We met in the restaurant but he HAD FINISHED his meal already",
            "THEME": "Verb Rules",
            "imagePrompt": "A young woman meeting a man in a restaurant, showing an empty plate infront of him."
          },
          {
            "TITLE": "'-ed' at the end of a word",
            "MODULETYPE": "GRAMMAR",
            "CEFR": "A2",
            "DESCRIPTION": "1. When the letter before '-ed' is VOICED (you make a sound in your voicebox) then it's pronounced 'd'. 2. When the letter before '-ed' is NONVOICED (you make no sound in your voicebox) then it's pronounced 't'. 3.When the letter before '-ed' is either 't' or 'd' then it's pronounced 'id'.",
            "THEME": "Pronunciation",
            "imagePrompt": "An image of the suffix 'ed' in bold."
            },
          {
            "TITLE": "He/She/It for Present Simple verbs",
            "MODULETYPE": "GRAMMAR",
            "CEFR": "A1",
            "DESCRIPTION": "1. The Present Simple form of the verb must end with 's' or 'es' 2. He walks to school everyday. 3. She washes her hair every week",
            "THEME": "Third Person Singular",
            "imagePrompt": "A young woman washing her hair"
          },
            ]
        `;

    // --- NEW: Call to calculateEstimatedGrammarCost ---
    // Now geminiPrompt is defined!
    const estimatedCost = calculateEstimatedGrammarCost(numItems, geminiPrompt);

    // --- NEW: TRANSACTIONAL CREDIT & LIMIT CHECK (Firestore Transaction) ---
    await firestore.runTransaction(async (transaction) => {
        const userRef = firestore.collection('users').doc(currentUserUid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found. Please log in again.');
        }
        const userProfile = userDoc.data();

        const paymentPlanRef = firestore.collection('paymentPlans').doc(userProfile.planid); // Fixed 'paymentPlanId' to 'planid' here
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
        if (paymentPlan.type !== 'PayAsYouGo' && paymentPlan.moduleCreationLimit !== null) {
            let modulesCreatedThisMonth = userProfile.modulesCreatedThisMonth || 0;
            let lastBillingCycleReset = userProfile.lastBillingCycleReset ? userProfile.lastBillingCycleReset.toDate() : null;
            const now = new Date();

            let shouldReset = false;
            if (!lastBillingCycleReset) {
                // If never reset, or first module, assume new cycle starts now
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

            // Check if current request exceeds the limit (using numItems for grammar)
            if (modulesCreatedThisMonth + numItems > paymentPlan.moduleCreationLimit) {
                throw new functions.https.HttpsError('resource-exhausted', `Monthly module creation limit reached. You have created ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} modules.`);
            }

            // Update user profile for the transaction
            userProfile.modulesCreatedThisMonth = modulesCreatedThisMonth + numItems; // Increment by requested items
            userProfile.lastBillingCycleReset = lastBillingCycleReset;
        }

        // 3. Deduct Funds and Update Counters
        transaction.update(userRef, {
            currentBalance: currentBalance - estimatedCost,
            modulesCreatedThisMonth: userProfile.modulesCreatedThisMonth, // This will be the updated value or original for PAYG
            lastBillingCycleReset: userProfile.lastBillingCycleReset // This will be the updated timestamp or original for PAYG
        });
        functions.logger.info(`User ${currentUserUid}: Deducted ${estimatedCost.toFixed(6)}. New balance: ${(currentBalance - estimatedCost).toFixed(2)}. Modules this month: ${userProfile.modulesCreatedThisMonth}.`);
    });
    // --- END NEW TRANSACTIONAL CREDIT & LIMIT CHECK ---

    try { // <--- This 'try' block starts here
        const result = await textGenModel.generateContent(geminiPrompt);
        const response = await result.response;
        const rawText = await response.text();


        // Clean & parse
        const cleanedText = rawText
            .trim()
            .replace(/^```json/, '')
            .replace(/```$/, '');

        functions.logger.info(`Cleaned text from Gemini. Length: ${cleanedText.length}`);
        functions.logger.info(`Cleaned text (first 500 chars): ${cleanedText.substring(0, 500)}`);
        functions.logger.info(`Cleaned text (last 500 chars): ${cleanedText.length > 500 ? cleanedText.substring(cleanedText.length - 500) : cleanedText}`);


        let generatedContent;
        try {
            const parsedOutput = JSON.parse(cleanedText);

            // Attempt to extract the array, checking for common wrapping keys
            if (Array.isArray(parsedOutput)) {
                generatedContent = parsedOutput; // Directly an array
            } else if (typeof parsedOutput === 'object' && parsedOutput !== null) {
                // Check common wrapper keys if it's an object
                if (parsedOutput.grammar && Array.isArray(parsedOutput.grammar)) {
                    generatedContent = parsedOutput.grammar;
                } else if (parsedOutput.items && Array.isArray(parsedOutput.items)) {
                    generatedContent = parsedOutput.items;
                } else if (parsedOutput.GRAMMAR && Array.isArray(parsedOutput.GRAMMAR)) { // Based on MODULETYPE
                    generatedContent = parsedOutput.GRAMMAR;
                }
                // Add more keys here if other wrapping patterns are observed
            }

            // If generatedContent is still undefined after checks, throw an error
            if (!Array.isArray(generatedContent)) {
                throw new Error("Gemini output is not a JSON array or an object containing a recognizable array.");
            }

            geminiReturnedItemCount = generatedContent.length; //  SET THE COUNT HERE
            functions.logger.info(`Gemini returned ${geminiReturnedItemCount} top-level JSON items.`);
        } catch (e) {
            functions.logger.error(`User ${currentUserUid}: Failed to parse or process Gemini JSON:`, cleanedText, e); // Updated logging for full error object and cleanedText
            throw new functions.https.HttpsError('internal', "Failed to parse or process Gemini output as JSON/expected format.", e.message); // Updated HttpsError message
        }

        // --- 2. Process Generated Content and Write to Firestore (with Deduplication) ---
        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'GRAMMAR';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['GRAMMAR'])
                .where('normalizedTitle', '==', itemNormalizedTitle)
                .limit(1)
                .get();

            if (!existingContentSnapshot.empty) {
                functions.logger.info(`Skipping "${item.TITLE}" (${itemModuleType}) as a record with this title already exists.`);
                numSkipped++;
                skippedWords.push(item.TITLE);
                continue;
            }

            // --- NEW: Set Module Ownership and Status ---
            // For most user-generated modules, the user is the owner and the status is private.
            const ownerUid = currentUserUid; // Set owner UID to the authenticated user
            const status = 'private';       // Set status to private

            // --- If the item is NOT skipped, process it and add to the Firestore batch ---
            if (itemModuleType === "GRAMMAR") {
                topLevelGrammarCount++;
                functions.logger.info(`Processing  GRAMMAR: "${item.TITLE}".`);
                const grammarid = generateUniqueFirestoreId();
                const grammarRef = firestore.collection('learningContent').doc(grammarid);

                batch.set(grammarRef, {
                    MODULEID: grammarid,
                    MODULETYPE: "GRAMMAR",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [], // Grammar modules typically don't contain sub-modules. Keep if applicable.
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ownerUid: ownerUid,     // NEW: Set owner UID
                    status: status,         // NEW: Set status
                    ...lessonDataToMerge // <-- ADD THIS LINE to include LESSON_ID if present
                });
                createdModuleIds.push(grammarid);

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

        functions.logger.info(`User ${currentUserUid}: Content generation summary: Requested ${numItems}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelGrammarCount} GRAMMAR modules. Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`); // Adjusted log message

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
            skippedWords: skippedWords,
            geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelGrammarCount: topLevelGrammarCount,
        };

    } catch (error) { // <--- This 'catch' block handles errors from the 'try' above
        functions.logger.error(`User ${currentUserUid}: Error generating or saving content:`, error); // Added currentUserUid to error log
        // If it's a credit/limit error, it's already an HttpsError, re-throw directly
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        // Catch all other unexpected errors and convert them to HttpsError
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}); // <--- This closes the onCall function.

module.exports = { generateGrammarContent };
