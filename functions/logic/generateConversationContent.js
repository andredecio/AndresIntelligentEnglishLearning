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
 * Estimates the total cost in the base currency for generating conversation content.
 * This needs to be carefully tuned based on actual Gemini/Firestore/Functions pricing
 * and the expected output length of a conversation module.
 * @param {number} numItems - The number of top-level conversation items requested.
 * @param {string} geminiPrompt - The prompt sent to Gemini.
 * @returns {number} Estimated cost in base currency.
 */
function calculateEstimatedConversationCost(numItems, geminiPrompt) {
    // If no items requested, no cost
    if (numItems <= 0) return 0;

    // 1. Gemini API Token Costs
    const inputTokens = estimateTokens(geminiPrompt);
    // Assume output tokens are roughly 1500-2500 per conversation item (adjust this heuristic)
    // A conversation is typically longer than a vocabulary item.
    const estimatedOutputTokens = numItems * 2000; // Average 2000 tokens per conversation item
    const geminiCost = (inputTokens / 1000 * COST_PER_1000_GEMINI_INPUT_TOKENS) +
                       (estimatedOutputTokens / 1000 * COST_PER_1000_GEMINI_OUTPUT_TOKENS);

    // 2. Firestore Write Costs
    // Estimate 1 Firestore write per conversation module
    const firestoreCost = numItems * FIRESTORE_WRITE_COST_PER_MODULE;

    // 3. Cloud Function Execution Cost
    const functionCost = CLOUD_FUNCTION_BASE_COST; // Small fixed cost per invocation

    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;

    functions.logger.debug(`Estimated cost for ${numItems} conversations (prompt length ${geminiPrompt.length}): ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- generateConversationContent Callable Function ---
// This function is called from your AdminSystem webpage to generate new grammar content using Gemini.
const generateConversationContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
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
        functions.logger.info(`User ${currentUserUid} requested 0 items. Skipping generation.`);
        return {
            status: "success",
            message: `Requested 0 items. No content generated.`,
            moduleIds: [],
            skippedWords: [],
            geminiReturnedItemCount: 0,
            topLevelConversationCount: 0,
        };
    }

    functions.logger.info(`User ${currentUserUid}: Starting Conversation content generation for CEFR: ${cefrLevel}, Items: ${numItems}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`); // Add currentUserUid to log

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
    const skippedWords = [];
    let geminiReturnedItemCount = 0;
    let topLevelConversationCount = 0;

    // 3. Prepare lessonDataToMerge for conditional LESSON_ID
    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {}; // <-- ADD THIS LINE

    // Construct the sophisticated prompt for Gemini (existing prompt)
    const geminiPrompt = `
        Generate a JSON array of ${numItems} Conversation  passages for CEFR ${cefrLevel} level, either concerning the subject of "${theme}" or in the vein of "${theme} if it is a grammatical subject (eg. Past Tense).
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
        - "MODULETYPE": String (e.g. CONVERSATION ).
        - "TITLE": String.
        - "CEFR": String.
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **CONVERSATION** (for conversation practice of the student):
            - "MODULETYPE": "CONVERSATION"
            - "TITLE": The title of the Conversation subject
            - "CEFR": This must be ${cefrLevel}
            - "DESCRIPTION": Must be about 10 to 20 name labelled sentences, 5 to 10 from person A. and 5 to 10 from person B. in an imaginary conversation (e.g., "Brian: Hi David, how are you? David: I'm OK thanks. Did you get my message yesterday? Brian: Message? What message? David: Didn't you see it? I left you a message on Whatsapp.
            Brian: I didn't see it, sorry. What time did you leave the message? David: Oh, about 7pm, or something. Brian: Oh that explains it. I was away from my phone at that time, and I didn't check for messages when I got back. David: Oh OK. What were you doing? Brian: Excuse me? David: I mean, what were you doing
            when I messaged you? Brian: I went to the gym. David: Oh I see.").
            - "THEME":This must be ${theme}
            - "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on the Conversation in the DESCRIPTION field, and/or the theme.

        **Crucial Rules for Generation:**
        - The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax (e.g., correct commas, brackets, and quotes). Any deviation from standard JSON syntax will render the output unusable.
        - **MODULETYPE:** You MUST create a unique CONVERSATION MODULETYPE document for EACH distinct and complete Conversation passage.
        - **DESCRIPTION** You MUST label each item in the conversation, according to person A and person B speaking. So the sequence is: Person A, Person B, Person A, Person B, etc. You can choose the name or title of the characters.
        - **CEFR Hierarchy:** For All CONVERSATION modules, their 'CEFR' level MUST be used to decide on the Conversation  degree of sophistication.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numItems} top-level complete Conversation items, each with a unique Conversation sequence between two people (A and B).
        - **TITLE:** This field must contain the title of the Conversation subject and/or theme.

        Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "Regular Verbs",
            "MODULETYPE": "Conversation",
            "CEFR": "A2",
            "DESCRIPTION": "Person A: What did you achieve today? Person B: Not much dad. I was a bit distracted. Person A: Did you get carried away with your computer games again? Person B: Yes, I think so. But I studied hard for a good few hours after that. Person A: Well, at least you admit it. Person B: What do you mean? Person A: I mean you accept that you're not achieving as much as you should be.
            Person B: That's not fair dad. I'm working hard, and I'm achieving all my work goals. Person A: Yes but if you want to do well in life, if you want to achieve more, you have to spend more time focusing on learning. Person B: I'd feel better if you encouraged me rather than just criticised. Person A: OK, I see what you mean. I'm just worried you'll miss the opportunities in life.
            Person B: Yes, OK. I see what you mean dad.",
            "THEME": "Verb Rules",
            "imagePrompt": "A father and teenage son in his bedroom discussing things."
          },
          {
            "TITLE": "He/She/It for Present Simple verbs",
            "MODULETYPE": "CONVERSATION",
            "CEFR": "A1",
            "DESCRIPTION": "Person A: Where does John usually go? Person B: He usually goes to the market. But He knows it's not good for business these days. Person A: Yes, he's right. It is very slow at the moment. Person B: Does Sarah sell fruit there too? Person A: Yes she does, and she says business is slow too.
           Person B: Maybe it's because it rains a lot there. Does it rain often there? Person A: It's often wet what where she lives? Person B: No, it doesn't rain that often, but it's cold. I think that's the problem. What kind of fruit does Sarah sell? Person A: I think she sells mostly exotic fruit like mangosteens, and lychees. Person B: Really? I think
            that's why she doesn't sell much. Person A: Does John assist her? Person B: He tries, but he has a lot of work himself with his own stall. If it rains he has to open the large umbrella. She doesn't have the same set up so she just get's wet along with her mangosteens, ha ha."
            "THEME": "Third Person Singular",
            "imagePrompt": "A young woman selling mangosteens in a market stall, with a young man at the next stall selling cauliflowers. It's raining, and he has a large umbrella over his stall"
          },
          {
            "TITLE": "Fishing in the river",
            "MODULETYPE": "CONVERSATION",
            "CEFR": "B1",
            "DESCRIPTION": "Person A: Where shall we set up Bill? Person B: I've not fished here before. Can you see anywhere that looks promising MIke: Yes, I just saw a fish surface over there. Wow, that's a big one! BIll: Oh yes, OK let's both set up here. Oh, I forgot to pack my floats. Can I borrow yours? Person A: Er, alright but take care of it, it cost a lot.
            Person B: Sure. Will you be careful with the rod I lent you? Person A: Yes, yes I will. What bait are you going to use? BIll: I was thinking of worms. Did you bring any?. Ahh it jumped again. it's a big one. Person A: I want to try bread. You try worm, I'll try bread. Person B: Really? I think worm's best.
            But that's up to you. Person A: Here's the float. Be careful, OK? Person B: Don't worry. OK, I'm set up. I'm going to cast in. Did you see that fish again? Person A: Yes it's still around. Look! See? Under those tree branches. Person B: I can't see it. Oh yes!"
            "THEME": "Fishing",
            "imagePrompt": "A young woman selling mangosteens in a market stall, with a young man at the next stall selling cauliflowers. It's raining, and he has a large umbrella over his stall"
          },
            ]
        `;

    // --- NEW: Call to calculateEstimatedConversationCost ---
    const estimatedCost = calculateEstimatedConversationCost(numItems, geminiPrompt);

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

            // Check if current request exceeds the limit (using numItems for conversations)
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

    try {
        const result = await textGenModel.generateContent(geminiPrompt);
        const response = await result.response;
        const rawText = await response.text();

        // Clean & parse
        const cleanedText = rawText
            .trim()
            .replace(/^```json/, '')
            .replace(/```$/, ''); // REMOVED: .replace(/\s*}+\s*$/, ']'); // Fix Gemini's trailing brace issue

        functions.logger.info(`Cleaned text from Gemini. Length: ${cleanedText.length}`);
        functions.logger.info(`Cleaned text (first 500 chars): ${cleanedText.substring(0, 500)}`);
        functions.logger.info(`Cleaned text (last 500 chars): ${cleanedText.length > 500 ? cleanedText.substring(cleanedText.length - 500) : cleanedText}`);

        let generatedContent;
        try {
            const parsedOutput = JSON.parse(cleanedText);

            // Handle cases where Gemini might wrap the array in an object (e.g., {"conversations": [...]})
            if (typeof parsedOutput === 'object' && parsedOutput !== null && 'conversations' in parsedOutput && Array.isArray(parsedOutput.conversations)) {
                generatedContent = parsedOutput.conversations; // Extract the array from the 'conversations' key
            } else if (Array.isArray(parsedOutput)) {
                generatedContent = parsedOutput; // If it's already a direct array, use it as is
            } else {
                // If it's neither the expected object nor a direct array, it's an unexpected format
                throw new Error("Gemini output is not a JSON array or an object containing a 'conversations' array.");
            }

            geminiReturnedItemCount = generatedContent.length; // Now this correctly counts items in the extracted array
            functions.logger.info(`Gemini returned ${geminiReturnedItemCount} top-level JSON items.`);
        } catch (e) {
            functions.logger.error(`User ${currentUserUid}: Failed to parse or process Gemini JSON:`, cleanedText, e); // Updated logging for full error object and cleanedText
            throw new functions.https.HttpsError('internal', "Failed to parse or process Gemini output as JSON/expected format.", e.message); // Updated HttpsError message
        }

        // --- Process Generated Content and Write to Firestore (with Deduplication) ---
        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'CONVERSATION';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            // Deduplication check
            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['CONVERSATION'])
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
            if (itemModuleType === "CONVERSATION") {
                topLevelConversationCount++;
                functions.logger.info(`Processing  CONVERSATION: "${item.TITLE}".`);
                const conversationId = generateUniqueFirestoreId(); // Renamed variable for clarity
                const conversationRef = firestore.collection('learningContent').doc(conversationId); // Renamed variable

                batch.set(conversationRef, { // Using conversationRef
                    MODULEID: conversationId, // Using conversationId
                    MODULETYPE: "CONVERSATION",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [], // Conversation modules typically don't contain sub-modules. Keep if applicable.
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ownerUid: ownerUid,     // NEW: Set owner UID
                    status: status,         // NEW: Set status
                    ...lessonDataToMerge // <-- ADD THIS LINE to include LESSON_ID if present
                });
                createdModuleIds.push(conversationId); // Using conversationId

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

        functions.logger.info(`User ${currentUserUid}: Content generation summary: Requested ${numItems}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelConversationCount} CONVERSATION modules. Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`); // Adjusted log message

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
            skippedWords: skippedWords,
            geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelConversationCount: topLevelConversationCount,
        };

    } catch (error) {
        functions.logger.error(`User ${currentUserUid}: Error generating or saving content:`, error); // Added currentUserUid to error log
        // If it's a credit/limit error, it's already an HttpsError, re-throw directly
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        // Catch all other unexpected errors and convert them to HttpsError
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}); // This closes the exports.generateConversationContent function definition

module.exports = { generateConversationContent };
