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
 * Estimates the total cost in the base currency for generating ListeningSpeaking content.
 * This needs to be carefully tuned based on actual Gemini/Firestore/Functions pricing
 * and the expected output length of a ListeningSpeaking module.
 * @param {number} numItems - The number of top-level ListeningSpeaking items requested.
 * @param {string} geminiPrompt - The prompt sent to Gemini.
 * @returns {number} Estimated cost in base currency.
 */
function calculateEstimatedListeningSpeakingCost(numItems, geminiPrompt) {
    // If no items requested, no cost
    if (numItems <= 0) return 0;

    // 1. Gemini API Token Costs
    const inputTokens = estimateTokens(geminiPrompt);
    // Assume output tokens are roughly 1000-1500 per ListeningSpeaking item (adjust this heuristic)
    const estimatedOutputTokens = numItems * 1200; // Average 1200 tokens per item, slightly more than grammar due to SSML
    const geminiCost = (inputTokens / 1000 * COST_PER_1000_GEMINI_INPUT_TOKENS) +
                       (estimatedOutputTokens / 1000 * COST_PER_1000_GEMINI_OUTPUT_TOKENS);

    // 2. Firestore Write Costs
    // Estimate 1 Firestore write per ListeningSpeaking module
    const firestoreCost = numItems * FIRESTORE_WRITE_COST_PER_MODULE;

    // 3. Cloud Function Execution Cost
    const functionCost = CLOUD_FUNCTION_BASE_COST; // Small fixed cost per invocation

    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;

    functions.logger.debug(`Estimated cost for ${numItems} listening/speaking items (prompt length ${geminiPrompt.length}): ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- generateListeningSpeakingContent Callable Function ---
const generateListeningSpeakingContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
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

    // 2. Adjust validation to allow 0 numItems
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
            topLevelListeningSpeakingCount: 0,
        };
    }

    functions.logger.info(`User ${currentUserUid}: Starting ListeningSpeaking content generation for CEFR: ${cefrLevel}, Items: ${numItems}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`); // Add currentUserUid to log

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
    const skippedWords = [];
    let geminiReturnedItemCount = 0;
    let topLevelListeningSpeakingCount = 0;

    // 3. Prepare lessonDataToMerge for conditional LESSON_ID
    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {}; // <-- ADD THIS LINE

    // --- 1. Construct the sophisticated prompt for Gemini ---
    const geminiPrompt = `
Generate a JSON array of ${numItems} Listening Speaking  exercises for CEFR ${cefrLevel} level, concerning the subject of "${theme}" and with reference to  the teaching points of "${theme} if it is a grammatical subject (eg. Past Tense).
        Each item in the array will comprise an interesting and topical reading passage of just 3 numbered sentences, preceded by the statement: "Please repeat these after me..." followed by a sentence, then a pause to enable the user to repeat the sentence back.
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
		- "MODULETYPE": String (e.g. LISTENINGSPEAKING ).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **LISTENINGSPEAKING** (for listening and speaking practice of the student):
            - "MODULETYPE": "LISTENINGSPEAKING"
            - "TITLE": The title of the ListeningSpeaking subject
			- "CEFR": This must be ${cefrLevel}
            - "DESCRIPTION": Must begin with the literal string "<speak> Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> " and then, for example: "Stonehenge is a very interesting archaeological site.", then "<break time='?s'/> Number 2 <break time='2s'/> " then for example: "It is located in Southern England on Salisbury Plain in Wiltshire.<break time='?s'/> Number 3 <break time='2s'/> " then for example "Stonehenge is owned by the charitable organisation called The National Trust." and then end with "</speak>" where '?' is replaced with the number of words in the sentence divided by 2 and then add 2.
			- "THEME":This MUST have the literal value  ${theme} exclusively
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on the sentences in the DESCRIPTION field, and/or the theme.

        **Crucial Rules for Generation:**
		- The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax (e.g., correct commas, brackets, and quotes). Any deviation from standard JSON syntax will render the output unusable.
		- **MODULETYPE:** You MUST create a unique LISTENINGSPEAKING MODULETYPE document for EACH distinct and complete set of 3 sentences.
		- **DESCRIPTION** You MUST create 3 sentences that are related to the TITLE but also exemplifying the THEME if it is a grammatical THEME.The string MUST begin specifically with: "<speak>Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> " and after the inserted sentence what MUST follow is: "<break time='?s'/> Number 2 <break time='2s'/> " then  after the 2nd inserted sentence what MUST follow is: "<break time='?s'/> Number 3 <break time='2s'/> " and after the 3rd inserted sentence what MUST follow is: "</speak> " '?' should be replaced by an integer equal to the number of words in the preceding sentence, divided by 2 and add 2. eg. if there are 10 words in the sentence the value should be 7.
						This format is required to conform to SSML format for TTS application. The number of seconds to pause after each sentence should be proportional to the number of words in the sentence. For example if the first sentance has 10 words the the break time value shold = 6s ie. half a second per word plus one second.
		- **CEFR Hierarchy:** For All LISTENINGSPEAKING modules, their 'CEFR' level MUST be used to decide on the degree of sophistication of the 3 sentences detailed in DESCRIPTION.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numItems} top-level complete Reading-Writing items, each with a unique exercise containing a reading passage and 5 numbered questions.
        - **TITLE:** This field must contain the title of the ListeningSpeaking subject and/or theme.

		Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "Regular Verbs",
            "MODULETYPE": "LISTENINGSPEAKING",
            "CEFR": "A2",
            "DESCRIPTION": "<speak> Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> The mysterious stones of  Stonehenge stand in the south of England. <break time='7s'/> Number 2 <break time='2s'/> People visit it every year. <break time='4s'/> Number 3 <break time='2s'/> It has many big stones in a circle.</speak>"
            "THEME": "Verb Rules",
			"imagePrompt": "A beautiful view of Ancient Stonehenge in its prime with ancient people"
          },
          {
            "TITLE": "Jane Goodall",
            "MODULETYPE": "LISTENINGSPEAKING",
            "CEFR": "A1",
            "DESCRIPTION": "<speak> Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> Jane Goodall studies animals. She works with chimpanzees in Africa. <break time='6s'/> Number 2 <break time='2s'/> She lives in the UK, but she often travels for her work. <break time='7s'/> Number 3 <break time='2s'/> Jane gives talks, visits schools, and shares her stories with people around the world.</speak>"
			"THEME": "Chimpanzees and Ecology",
			"imagePrompt": "Jane Goodall sitting next to a chimpanzee"

		  },
          {
            "TITLE": "Dr Jane Goodall",
            "MODULETYPE": "LISTENINGSPEAKING",
            "CEFR": "C1",
            "DESCRIPTION": "<speak> Please repeat these three sentences <break time='2s'/> Number 1 <break time='2s'/> Jane Goodall is one of the world’s most respected primatologists. <break time='6s'/> Number 2 <break time='2s'/> She became known in the 1960s for her pioneering work with wild chimpanzees in Tanzania. <break time='9s'/> Number 3 <break time='2s'/> Rather than relying on detached observation, she immersed herself in their world. </speak>"
			"THEME": "Chimpanzees and Ecology",
			"imagePrompt": "A Jane Goodall hugging a chimpanzee"
		  },

			]
        `;

    // --- NEW: Call to calculateEstimatedListeningSpeakingCost ---
    const estimatedCost = calculateEstimatedListeningSpeakingCost(numItems, geminiPrompt);

    // --- NEW: TRANSACTIONAL CREDIT & LIMIT CHECK (Firestore Transaction) ---
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

            // Check if current request exceeds the limit (using numItems for listening/speaking)
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
                if (parsedOutput.listeningSpeaking && Array.isArray(parsedOutput.listeningSpeaking)) {
                    generatedContent = parsedOutput.listeningSpeaking;
                } else if (parsedOutput.items && Array.isArray(parsedOutput.items)) {
                    generatedContent = parsedOutput.items;
                } else if (parsedOutput.LISTENINGSPEAKING && Array.isArray(parsedOutput.LISTENINGSPEAKING)) { // Based on MODULETYPE
                    generatedContent = parsedOutput.LISTENINGSPEAKING;
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
            const itemModuleType = item.MODULETYPE || 'LISTENINGSPEAKING';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['LISTENINGSPEAKING'])
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
            if (itemModuleType === "LISTENINGSPEAKING") {
                topLevelListeningSpeakingCount++;
                functions.logger.info(`Processing  LISTENINGSPEAKING: "${item.TITLE}".`);
                const listeningSpeakingId = generateUniqueFirestoreId(); // Renamed variable for clarity
                const listeningSpeakingRef = firestore.collection('learningContent').doc(listeningSpeakingId); // Renamed variable

                batch.set(listeningSpeakingRef, { // Using listeningSpeakingRef
                    MODULEID: listeningSpeakingId, // Using listeningSpeakingId
                    MODULETYPE: "LISTENINGSPEAKING",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [], // ListeningSpeaking modules typically don't contain sub-modules. Keep if applicable.
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ownerUid: ownerUid,     // NEW: Set owner UID
                    status: status,         // NEW: Set status
                    ...lessonDataToMerge // <-- ADD THIS LINE to include LESSON_ID if present
                });
                createdModuleIds.push(listeningSpeakingId); // Using listeningSpeakingId

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

        functions.logger.info(`User ${currentUserUid}: Content generation summary: Requested ${numItems}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelListeningSpeakingCount} LISTENINGSPEAKING modules. Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`); // Adjusted log message

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
            skippedWords: skippedWords,
            geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelListeningSpeakingCount: topLevelListeningSpeakingCount,
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
}); // <--- This closes the onCall function. This is line 383 where the error was reported.

module.exports = { generateListeningSpeakingContent };
