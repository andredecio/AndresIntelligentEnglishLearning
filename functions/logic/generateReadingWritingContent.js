const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
// UPDATED: Import getReadingWritingTextGenModel instead of getTextGenModel
const { getReadingWritingTextGenModel } = require("../helpers/gemini");
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
 * Estimates the total cost in the base currency for generating ReadingWriting content.
 * This needs to be carefully tuned based on actual Gemini/Firestore/Functions pricing
 * and the expected output length of a ReadingWriting module.
 * @param {number} numItems - The number of top-level ReadingWriting items requested.
 * @param {string} geminiPrompt - The prompt sent to Gemini.
 * @returns {number} Estimated cost in base currency.
 */
function calculateEstimatedReadingWritingCost(numItems, geminiPrompt) {
    // If no items requested, no cost
    if (numItems <= 0) return 0;

    // 1. Gemini API Token Costs
    const inputTokens = estimateTokens(geminiPrompt);
    // Assume output tokens are roughly 2000-3000 per ReadingWriting item (adjust this heuristic)
    // ReadingWriting content typically involves a passage + multiple questions, making it quite long.
    const estimatedOutputTokens = numItems * 2500; // Average 2500 tokens per item
    const geminiCost = (inputTokens / 1000 * COST_PER_1000_GEMINI_INPUT_TOKENS) +
                       (estimatedOutputTokens / 1000 * COST_PER_1000_GEMINI_OUTPUT_TOKENS);

    // 2. Firestore Write Costs
    // Estimate 1 Firestore write per ReadingWriting module
    const firestoreCost = numItems * FIRESTORE_WRITE_COST_PER_MODULE;

    // 3. Cloud Function Execution Cost
    const functionCost = CLOUD_FUNCTION_BASE_COST; // Small fixed cost per invocation

    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;

    functions.logger.debug(`Estimated cost for ${numItems} reading/writing items (prompt length ${geminiPrompt.length}): ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- generate Reading-WritingContent Callable Function ---
const generateReadingWritingContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
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
            topLevelReadingWritingCount: 0,
        };
    }

    functions.logger.info(`User ${currentUserUid}: Starting Reading-Writing content generation for CEFR: ${cefrLevel}, Items: ${numItems}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`); // Add currentUserUid to log

    // UPDATED: Use the specific getReadingWritingTextGenModel
    const textGenModel = getReadingWritingTextGenModel(); // Get the Gemini text generation model instance
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
    const skippedWords = [];
    let geminiReturnedItemCount = 0;
    let topLevelReadingWritingCount = 0;

    // 3. Prepare lessonDataToMerge for conditional LESSON_ID
    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {}; // <-- ADD THIS LINE

    // --- 1. Construct the sophisticated prompt for Gemini ---
    // MOVED THIS BLOCK UP so geminiPrompt is defined BEFORE calculateEstimatedReadingWritingCost
    const geminiPrompt = `
Generate a JSON array of ${numItems} ReadingWriting  exercises for CEFR ${cefrLevel} level, concerning the subject of "${theme}" and with reference to  the teaching points of "${theme} if it is a grammatical subject (eg. Past Tense).
        Each item in the array MUST comprise an interesting and topical reading passage of between 100 and 200 words, and it MUST BE followed by 5 numbered questions that require a written answer, concerning comprehension of the points of the passage.
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
		- "MODULETYPE": String (e.g. READING-WRITING ).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **READING-WRITING** (for comprehension reading and writing practice of the student):
            - "MODULETYPE": "READING-WRITING"
            - "TITLE": The title of the Reading-Writing subject
			- "CEFR": This must be ${cefrLevel}
            - "DESCRIPTION": Must be about 100 to 200 word long passage on a subject related to the TITLE, and exemplifying the grammar (if any) explicit in the THEME. It MUST be followed by 5 numbered questions to the user that test the user's reading comprehension.
			- "THEME":This MUST have the literal value  ${theme} exclusively
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on the subject of the passage in the DESCRIPTION field, and/or the theme.

        **Crucial Rules for Generation:**
		- The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax (e.g., correct commas, brackets, and quotes). Any deviation from standard JSON syntax will render the output unusable.
		- **MODULETYPE:** You MUST create a unique READING-WRITING MODULETYPE document for EACH distinct and complete Reading-Writing passage.
		- **DESCRIPTION** You MUST create an interesting and topical passage that is related to the TITLE but also exemplifying the THEME if it is a grammatical THEME.This MUST be followed by 5 numbered comprehension questions about the passge, appropriate for the CEFR level of this module.
		- **CEFR Hierarchy:** For All READING-WRITING modules, their 'CEFR' level MUST be used to decide on the degree of sophistication of the exercise detailed in DESCRIPTION.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numItems} top-level complete Reading-Writing items, each with a unique exercise containing a reading passage and 5 numbered questions.
        - **TITLE:** This field must contain the title of the Reading-Writing subject and/or theme.

		Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "Regular Verbs",
            "MODULETYPE": "Reading-Writing",
            "CEFR": "A2",
            "DESCRIPTION": "Stonehenge stands in the south of England. People visit it every year. It has many big stones. Some stones stand in a circle. Others rest on the ground. Long ago, people moved these stones from far away.
			They used simple tools. No one knows why they built Stonehenge. Some people say it was a place for the sun. Others believed it was for special events. On the longest day of the year, the sun rises between two stones.
			This sight amazed people and made them think about the past. Today, people walk around the stones. They take photos and learn about history. A group of workers cleans the area and helps visitors. Stonehenge gives us many questions.
			We look at the stones and wonder about the people who lived long ago. What did they think? What did they feel? We still try to understand this old and special place.
			**Comprehension Questions:**
			Write your answers in full sentences

			1. Where does Stonehenge stand?
			2. What do people do when they visit Stonehenge?
			3. How did people move the stones in the past?
			4. What happens on the longest day of the year at Stonehenge?
			5. Why do people still wonder about Stonehenge today?",
            "THEME": "Verb Rules",
			"imagePrompt": "A beautiful view of Ancient Stonehenge in its prime with ancient people"
          },
          {
            "TITLE": "Jane Goodall",
            "MODULETYPE": "READING-WRITING",
            "CEFR": "A1",
            "DESCRIPTION": "Jane Goodall studies animals. She works with chimpanzees in Africa. She lives in the UK, but she often travels for her work. Jane gives talks, visits schools, and shares her stories with people around the world.
			She teaches others about animals and the environment. Jane also runs a group called the Jane Goodall Institute. It protects nature and helps young people learn about science. She believes that one person makes a big difference.
			Every day, she speaks to children, leaders, and scientists. She asks them to care about animals. Jane loves nature, and she spends her time helping the planet. People listen to her because she knows so much.
			Even though she is older now, she still works hard. Jane Goodall shows us that one voice changes the world.
			**Comprehension Questions:**
			Write your answers in full sentences

			1. Where does Jane Goodall often travel for her work?
			2. What animals does she study?
			3. What does the Jane Goodall Institute do?
			4. Who does Jane speak to every day?
			5. Why do people listen to her?",
			"THEME": "Chimpanzees and Ecology",
			"imagePrompt": "Jane Goodall sitting next to a chimpanzee"

		  },
          {
            "TITLE": "Dr Jane Goodall",
            "MODULETYPE": "READING-WRITING",
            "CEFR": "C1",
            "DESCRIPTION": "Jane Goodall is one of the world’s most respected primatologists. She became known in the 1960s for her pioneering work with wild chimpanzees in Tanzania.
			Rather than relying on detached observation, she immersed herself in their world, patiently gaining their trust. Her discoveries—such as chimpanzees using tools,
			forming emotional bonds, and engaging in social rituals—redefined the way scientists view animal intelligence and behaviour.
			Today, Goodall no longer conducts field research, but she remains deeply involved in conservation. She travels the globe to raise awareness about environmental issues,
			speak at conferences, and promote her Roots & Shoots program, which empowers young people to protect animals and the planet. Despite her age, she maintains a demanding schedule,
			fuelled by hope and a strong moral purpose.
			Goodall’s message is clear: every individual can make a difference. She urges people to act mindfully—whether by reducing waste, protecting wildlife, or making sustainable choices.
			Her calm yet passionate voice continues to inspire global audiences toward compassion and action.
			**Comprehension & Inference Questions:**
			Write your answers in full sentences

			1. What approach did Goodall take in her early research that made it unique?
			2. What key behaviours did she observe in chimpanzees?
			3. What is the main focus of her work today?
			4. What motivates her continued efforts despite her age?
			5. What is the central message she shares with the public?",
			"THEME": "Chimpanzees and Ecology",
			"imagePrompt": "A Jane Goodall hugging a chimpanzee"
		  },

			]
        `;

    // --- NEW: Call to calculateEstimatedReadingWritingCost ---
    // Now geminiPrompt is defined!
    const estimatedCost = calculateEstimatedReadingWritingCost(numItems, geminiPrompt);

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

            // Check if current request exceeds the limit (using numItems for reading/writing)
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
                if (parsedOutput.readingWriting && Array.isArray(parsedOutput.readingWriting)) {
                    generatedContent = parsedOutput.readingWriting;
                } else if (parsedOutput.items && Array.isArray(parsedOutput.items)) {
                    generatedContent = parsedOutput.items;
                } else if (parsedOutput['READING-WRITING'] && Array.isArray(parsedOutput['READING-WRITING'])) { // Based on MODULETYPE
                    generatedContent = parsedOutput['READING-WRITING'];
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
            const itemModuleType = item.MODULETYPE || 'READING-WRITING';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['READING-WRITING'])
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
            if (itemModuleType === "READING-WRITING") {
                topLevelReadingWritingCount++;
                functions.logger.info(`Processing  READING-WRITING: "${item.TITLE}".`);
                const readingWritingId = generateUniqueFirestoreId(); // Renamed variable for clarity
                const readingWritingRef = firestore.collection('learningContent').doc(readingWritingId); // Renamed variable

                batch.set(readingWritingRef, { // Using readingWritingRef
                    MODULEID: readingWritingId, // Using readingWritingId
                    MODULETYPE: "READING-WRITING",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [], // Reading-Writing modules typically don't contain sub-modules. Keep if applicable.
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ownerUid: ownerUid,     // NEW: Set owner UID
                    status: status,         // NEW: Set status
                    ...lessonDataToMerge // <-- ADD THIS LINE to include LESSON_ID if present
                });
                createdModuleIds.push(readingWritingId); // Using readingWritingId

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

        functions.logger.info(`User ${currentUserUid}: Content generation summary: Requested ${numItems}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelReadingWritingCount} READING-WRITING modules. Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`); // Adjusted log message

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
            skippedWords: skippedWords,
            geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelReadingWritingCount: topLevelReadingWritingCount,
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

module.exports = { generateReadingWritingContent };
