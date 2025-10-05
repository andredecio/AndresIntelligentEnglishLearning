const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { getTextGenModel } = require("../helpers/gemini");
const { normalizeTitle, generateUniqueFirestoreId } = require("../helpers/ipaUtils"); // adjust path if needed

// --- Configuration Constants ---
// You MUST replace this with the actual UID of your primary admin user.
// Vocabulary and VOCABULARY_GROUP modules will be owned by this UID and marked as 'shared'.
const ADMIN_UID = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; // <<== IMPORTANT: REPLACE WITH YOUR ACTUAL ADMIN UID

// Base cost for Gemini API interactions (example values, you will need to fine-tune these)
// These represent the cost in your internal base currency (e.g., USD)
const COST_PER_1000_GEMINI_INPUT_TOKENS = 0.0005; // Example: 0.5 USD per 1000 input tokens
const COST_PER_1000_GEMINI_OUTPUT_TOKENS = 0.0015; // Example: 1.5 USD per 1000 output tokens

// Estimated fixed costs for Firestore writes and Cloud Function execution per module generated
const FIRESTORE_WRITE_COST_PER_MODULE = 0.00005; // Example: very low cost per module write
const CLOUD_FUNCTION_BASE_COST = 0.00001; // Example: very low fixed cost per function invocation

// --- Helper Functions for Cost Estimation ---

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
 * Estimates the total cost in the base currency for generating vocabulary content.
 * This needs to be carefully tuned based on actual Gemini/Firestore/Functions pricing.
 * @param {number} numWords - The number of top-level vocabulary items requested.
 * @param {string} geminiPrompt - The prompt sent to Gemini.
 * @returns {number} Estimated cost in base currency.
 */
function calculateEstimatedCost(numWords, geminiPrompt) {
    // If no words requested, no cost
    if (numWords <= 0) return 0;

    // 1. Gemini API Token Costs
    const inputTokens = estimateTokens(geminiPrompt);
    // Assume output tokens are roughly 500-1000 per word for vocabulary items (adjust this heuristic)
    // This is a rough estimation. Gemini's actual response can vary greatly.
    const estimatedOutputTokens = numWords * 800; // Average 800 tokens per word item
    const geminiCost = (inputTokens / 1000 * COST_PER_1000_GEMINI_INPUT_TOKENS) +
                       (estimatedOutputTokens / 1000 * COST_PER_1000_GEMINI_OUTPUT_TOKENS);

    // 2. Firestore Write Costs
    // Estimate 1-2 Firestore writes per module (actual depends on VOCABULARY_GROUP nesting)
    const firestoreCost = numWords * 1.5 * FIRESTORE_WRITE_COST_PER_MODULE; // 1.5 average writes per requested word

    // 3. Cloud Function Execution Cost
    const functionCost = CLOUD_FUNCTION_BASE_COST; // Small fixed cost per invocation

    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;

    functions.logger.debug(`Estimated cost for ${numWords} words (prompt length ${geminiPrompt.length}): ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- generateVocabularyContent Callable Function ---
const generateVocabularyContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    const firestore = admin.firestore();
    const currentUserUid = context.auth?.uid;

    // --- Security Check (Auth and Custom Claims) ---
    if (!currentUserUid) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Custom claims are expected to be set by a separate Cloud Function
    const customClaims = context.auth.token;
    const canCreateModule = customClaims.canCreateModule || customClaims.admin; // Admins can always create modules

    if (!canCreateModule) {
        throw new functions.https.HttpsError('permission-denied', 'Your payment plan does not permit module creation.');
    }
    // --- End Security Check ---

    const { cefrLevel, numWords, theme, lessonModuleId } = data;

    // Validation: 0 numWords is allowed on the client side, but means no generation here
    if (numWords <= 0) {
        functions.logger.info(`User ${currentUserUid} requested 0 words. Skipping generation.`);
        return {
            status: "success",
            message: `Requested 0 words. No content generated.`,
            moduleIds: [],
            skippedWords: [],
            geminiReturnedItemCount: 0,
            topLevelVocabCount: 0,
            vocabGroupCount: 0,
            nestedVocabCount: 0
        };
    }

    if (!cefrLevel || !theme || typeof numWords !== 'number' || numWords < 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Words (must be an integer > 0), and Theme are required and must be valid.'
        );
    }

    functions.logger.info(`User ${currentUserUid}: Starting content generation for CEFR: ${cefrLevel}, Words: ${numWords}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`);

    const textGenModel = getTextGenModel();
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
    const skippedWords = [];
    let geminiReturnedItemCount = 0;
    let topLevelVocabCount = 0;
    let vocabGroupCount = 0;
    let nestedVocabCount = 0;

    // --- Prepare lessonDataToMerge for conditional LESSON_ID ---
    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {};
    // --- End Prepare lessonDataToMerge ---

    // Construct the sophisticated prompt for Gemini
    const geminiPrompt = `
        Generate a JSON array of ${numWords} vocabulary items for CEFR ${cefrLevel} level, themed around "${theme}".
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
        - "MODULETYPE": String (e.g. VOCABULARY_GROUP, VOCABULARY).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **VOCABULARY_GROUP** (each single VOCABULARY_GROUP is made when there is a word with multiple distinct meanings. For single meaning words  no VOCABULARY_GROUP will be created ):
            - "MODULETYPE": "VOCABULARY_GROUP"
            - "TITLE": The word (or phrase)
            - "CEFR": This must be "A1"
            - "THEME":This must be ${theme}
            - "MEANING_ORIGIN": This must contain ONLY details of the multi-meaning word's origin, etymology, common prefixes, infixes, or suffixes relevant to the multi-meaning word, NOT one of the meanings of the mulit-meaning word.
            - "items": An array of AT LEAST 2 nested "VOCABULARY" modules, each defining a unique meaning of the multi-meaning word (eg. 'set' can be a verb or a noun, 'like' has at least 8 separate meanings so that would result in one VOCABULARY_GROUP record, and at least 8 separate VOCABULARY records for 'like').

        2.  **VOCABULARY** (for single-meaning words, or for individual meanings within a VOCABULARY_GROUP):
            - "MODULETYPE": "VOCABULARY"
            - "TITLE": The word (or phrase)
            - "IPA": String. The British English (RP) IPA transcription of the word. This MUST include:
                - Primary stress marks (ˈ)
                - Secondary stress marks (ˌ)
                - **Syllable delimiters (.), accurately placed between syllables.**
                For example:
                - "music" should be "ˈmjuː.zɪk"
                - "apple" should be "ˈæp.əl"
                - "elephant" should be "ˈel.ɪ.fənt"
                - "important" should be "ɪmˈpɔː.tənt"
            - "CEFR": This must be "A1"
            - "DESCRIPTION": MUST be 3 numbered sentences (e.g., "1. Sentence one. 2. Sentence two. 3. Sentence three.") that MUST include and be an example of the use of the word in the context of its specific meaning
            - "THEME":This must be ${theme}
            - "WORD_TYPE": This must be one of the following: "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "article", "determiner"
            - "MEANING_ORIGIN": This must contain the meaning of the specific instance of the word. This must be followed by details of the word's origin, etymology, common prefixes, infixes, or suffixes relevant to the group.
            - "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": This should exist only when WORD_TYPE = "verb". Provide the 3rd person singular simple present tense form, e.g., "eats" for "eat"
            - "SIMPLE_PAST": This should exist only when WORD_TYPE = "verb". Provide the simple past tense form, e.g., "ate" for "eat"
            - "PAST_PARTICIPLE": This should exist only when WORD_TYPE = "verb". Provide the past participle form, e.g., "eaten" for "eat"
            - "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on one of the sentences in the DESCRIPTION field. (Only for MODULETYPE "VOCABULARY")

        **Crucial Rules for Generation:**
        - The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax (e.g., correct commas, brackets, and quotes). Any deviation from standard JSON syntax will render the output unusable.
        - ALWAYS check first if a word has more than one meaning. You MUST create a document with VOCABULARY_GROUP MODULETYPE for a word when there is more than one possible meaning of that word. You MUST create a VOCABULARY_GROUP record if there is more than 1 meaning of the word eg. 'present' can be a verb or a noun each with different pronunciation.Of course, there will always be a minimum of 2 VOCABULARY documents with each VOCABULARY_GROUP document, each with a unique meaning.
        - Once you have generated a VOCABULARY_GROUP record, you MUST then create at least 2 new VOCABULARY records. That is, 1 for each meaning of that word that you created the VOCABULARY_GROUP for.
        - **MODULETYPE:** You MUST create a unique VOCABULARY MODULETYPE document for EACH and EVERY POSSIBLE meaning of any given word. For example 'set' has more than 10 separarate meanings, so it MUST cause the creation of a VOCABULARY_GROUP MODULETYPE document, and at least 10 documents for that word with a MODULETYPE of VOCABULARY, each with their specific values for each specific meaning.
        - **CEFR Hierarchy:** For All VOCABULARY AND VOCABULARY_GROUP modules, their 'CEFR' level MUST be set to "A1").
        - **Polysemy:** If a word has multiple *distinct* meanings or functions including as different parts of speech (e.g., "book" as a noun and "book" as a verb; "like" as a verb and as an adjective, and as a preposition, and as a conjunction ), you MUST create a "VOCABULARY_GROUP" for it. This "VOCABULARY_GROUP" must contain individual "VOCABULARY" entries for *each* distinct meaning and/or part of speech. If a word has only one primary meaning, create only a single "VOCABULARY" entry directly.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numWords} top-level vocabulary items (including VOCABULARY_GROUPs).
        - **WORD_TYPE:** Values for 'WORD_TYPE' may only exist for modules with a MODULETYPE of 'VOCABULARY'.That is because a word could have more than one 'WORD_TYPE'.**This field MUST ONLY be provided for modules with "MODULETYPE": "VOCABULARY".
        - **TITLE:** This field must contain the word exclusively.
        - **MEANING_ORIGIN:** You MUST include a description of the particular meaning of that instance of a VOCABULARY MODULETYPE document AND you must add to that a description of the etymology of that instance of the word also.
        - **IPA**: This field MUST contain the British English (RP) IPA transcription, including primary (ˈ) and secondary (ˌ) stress marks, and syllable delimiters (.). Ensure accurate syllable breakdown.**This field MUST ONLY be provided for modules with "MODULETYPE": "VOCABULARY". For "VOCABULARY_GROUP" modules, this field MUST be omitted or be an empty string.**

        Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "cat",
            "IPA": "kæt",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. The cat sat. 2. The cat purred. 3. I like cats.",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "A carnivorous mammal of the Genus 'Felis'.originates from the Old English word "catt" (masculine) and "catte" (feminine), which themselves are derived from the Proto-West Germanic *kattu. This Germanic form likely comes from the Late Latin *cattus, first appearing around the 6th century.  ",
            "imagePrompt": "A fluffy cat sitting."
          },
          {
            "TITLE": "set",
            "MODULETYPE": "VOCABULARY_GROUP",
            "CEFR": "A1",
            "THEME":"General English",
            "MEANING_ORIGIN": "Old English settan, of Germanic origin; related to Dutch zetten, German setzen, also to sit."
         },
          {
            "TITLE": "set",
            "IPA": "sɛt",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. He set the scene. 2. Have you set the table? 3. Let me set the record straight.",
            "THEME": "General English",
            "WORD_TYPE": "verb",
            "MEANING_ORIGIN": "1. put or bring into a specified state.2. put, lay, or stand (something) in a specified place or position. Old English 'settan', of Germanic origin; related to Dutch zetten, German 'setzen', also 'to sit'.",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "sets",
            "SIMPLE_PAST": "set",
            "PAST_PARTICIPLE": "set",
            "imagePrompt": "A person setting a table for a meal."
            },
          {
            "TITLE": "set",
            "IPA": "sɛt",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. Do you have a set of golf clubs? 2. I would like the whole album set. 3. Is this the complete set?",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "a group of similar things that belong together in some way. The most common meaning of "set" as a noun refers to a group of related items. This sense is related to the Old English word "set" meaning "seat" or "place," and also the Middle English "set" referring to a group or sequence. ",
            "imagePrompt": "A golfer holding a set of clubs."
          },
          {
            "TITLE": "music",
            "IPA": "ˈmjuː.zɪk",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. I love to listen to music. 2. The music filled the room. 3. She studies music theory.",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "The art of combining vocal or instrumental sounds in a harmonious or expressive way. From Old French musique, from Latin musica, from Greek mousikē (tekhnē) 'art of the Muses'.",
            "imagePrompt": "People enjoying live music at a concert.",
        }

            ]
        `;

    // --- IMPORTANT: Call to calculateEstimatedCost needs the geminiPrompt for input tokens ---
    const estimatedCost = calculateEstimatedCost(numWords, geminiPrompt);

    // --- TRANSACTIONAL CREDIT & LIMIT CHECK (Firestore Transaction) ---
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

            // Check if current request exceeds the limit
            if (modulesCreatedThisMonth + numWords > paymentPlan.moduleCreationLimit) {
                throw new functions.https.HttpsError('resource-exhausted', `Monthly module creation limit reached. You have created ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} modules.`);
            }

            // Update user profile for the transaction
            userProfile.modulesCreatedThisMonth = modulesCreatedThisMonth + numWords; // Increment by requested words
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
    // --- END TRANSACTIONAL CREDIT & LIMIT CHECK ---

    try {
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

            if (Array.isArray(parsedOutput)) {
                generatedContent = parsedOutput;
            } else if (typeof parsedOutput === 'object' && parsedOutput !== null) {
                if (parsedOutput.vocabulary && Array.isArray(parsedOutput.vocabulary)) {
                    generatedContent = parsedOutput.vocabulary;
                } else if (parsedOutput.items && Array.isArray(parsedOutput.items)) {
                    generatedContent = parsedOutput.items;
                } else if (parsedOutput.VOCABULARY && Array.isArray(parsedOutput.VOCABULARY)) {
                    generatedContent = parsedOutput.VOCABULARY;
                } else if (parsedOutput.VOCABULARY_GROUP && Array.isArray(parsedOutput.VOCABULARY_GROUP)) {
                    generatedContent = parsedOutput.VOCABULARY_GROUP;
                }
            }

            if (!Array.isArray(generatedContent)) {
                throw new Error("Gemini output is not a JSON array or an object containing a recognizable array.");
            }

            geminiReturnedItemCount = generatedContent.length;
            functions.logger.info(`Gemini returned ${geminiReturnedItemCount} top-level JSON items.`);
        } catch (e) {
            functions.logger.error("Failed to parse or process Gemini JSON:", cleanedText, e);
            throw new functions.https.HttpsError('internal', "Failed to parse or process Gemini output as JSON/expected format.", e.message);
        }

        // --- Process Generated Content and Write to Firestore (with Deduplication) ---
        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'VOCABULARY';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            // Deduplication check
            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['VOCABULARY', 'VOCABULARY_GROUP'])
                .where('normalizedTitle', '==', itemNormalizedTitle)
                .limit(1)
                .get();

            if (!existingContentSnapshot.empty) {
                functions.logger.info(`Skipping "${item.TITLE}" (${itemModuleType}) as a record with this title already exists.`);
                numSkipped++;
                skippedWords.push(item.TITLE);
                continue; // Skip to the next item
            }

            // --- Set Module Ownership and Status ---
            // VOCABULARY and VOCABULARY_GROUP are always admin-owned and shared
            const ownerUid = ADMIN_UID;
            const status = 'shared';

            if (itemModuleType === "VOCABULARY_GROUP") {
                vocabGroupCount++;
                functions.logger.info(`Processing VOCABULARY_GROUP: "${item.TITLE}".`);
                const groupId = generateUniqueFirestoreId();
                const groupRef = firestore.collection('learningContent').doc(groupId);
                const meaningIds = []; // IDs of nested VOCABULARY modules

                if (Array.isArray(item.items)) {
                    for (const meaning of item.items) {
                        if (meaning.MODULETYPE === "VOCABULARY") {
                            nestedVocabCount++;
                            functions.logger.info(`  - Processing nested VOCABULARY item: "${meaning.TITLE}".`);
                            const vocabId = generateUniqueFirestoreId();
                            const vocabRef = firestore.collection('learningContent').doc(vocabId);

                            const verbFields = (meaning.WORD_TYPE === 'verb') ? {
                                PRESENT_SIMPLE_3RD_PERSON_SINGULAR: meaning.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || '',
                                SIMPLE_PAST: meaning.SIMPLE_PAST || '',
                                PAST_PARTICIPLE: meaning.PAST_PARTICIPLE || '',
                            } : {};

                            batch.set(vocabRef, {
                                MODULEID: vocabId,
                                MODULETYPE: "VOCABULARY",
                                TITLE: meaning.TITLE,
                                normalizedTitle: normalizeTitle(meaning.TITLE),
                                IPA: meaning.IPA,
                                CEFR: meaning.CEFR,
                                DESCRIPTION: meaning.DESCRIPTION,
                                imagePrompt: meaning.imagePrompt,
                                THEME: meaning.THEME,
                                WORD_TYPE: meaning.WORD_TYPE,
                                MEANING_ORIGIN: meaning.MEANING_ORIGIN,
                                ...verbFields,
                                IMAGEURL: "",
                                imageStatus: "pending",
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                                ownerUid: ownerUid, // Set owner UID
                                status: status,     // Set status
                                ...lessonDataToMerge
                            });
                            meaningIds.push(vocabId);
                        } else {
                            functions.logger.warn(`Unexpected module type found in VOCABULARY_GROUP items: ${meaning.MODULETYPE}. Skipping nested item.`);
                        }
                    }
                }

                batch.set(groupRef, {
                    MODULEID: groupId,
                    MODULETYPE: "VOCABULARY_GROUP",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    THEME: item.THEME,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    MODULEID_ARRAY: meaningIds,
                    IMAGEURL: "",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ownerUid: ownerUid, // Set owner UID
                    status: status,     // Set status
                    ...lessonDataToMerge
                });
                createdModuleIds.push(groupId);

            } else if (itemModuleType === "VOCABULARY") {
                topLevelVocabCount++;
                functions.logger.info(`Processing top-level VOCABULARY: "${item.TITLE}".`);
                const vocabId = generateUniqueFirestoreId();
                const vocabRef = firestore.collection('learningContent').doc(vocabId);

                const verbFields = (item.WORD_TYPE === 'verb') ? {
                    PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || '',
                    SIMPLE_PAST: item.SIMPLE_PAST || '',
                    PAST_PARTICIPLE: item.PAST_PARTICIPLE || '',
                } : {};

                batch.set(vocabRef, {
                    MODULEID: vocabId,
                    MODULETYPE: "VOCABULARY",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    IPA: item.IPA,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    WORD_TYPE: item.WORD_TYPE,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    ...verbFields,
                    IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    ownerUid: ownerUid, // Set owner UID
                    status: status,     // Set status
                    ...lessonDataToMerge
                });
                createdModuleIds.push(vocabId);

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

        functions.logger.info(`User ${currentUserUid}: Content generation summary: Requested ${numWords}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelVocabCount} top-level VOCABULARY, ${vocabGroupCount} VOCABULARY_GROUPs (containing ${nestedVocabCount} nested VOCABULARY items). Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`);

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
            skippedWords: skippedWords,
            geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelVocabCount: topLevelVocabCount,
            vocabGroupCount: vocabGroupCount,
            nestedVocabCount: nestedVocabCount
        };

    } catch (error) {
        functions.logger.error(`User ${currentUserUid}: Error generating or saving content:`, error);
        // If it's a credit/limit error, it's already an HttpsError, re-throw directly
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        // Catch all other unexpected errors and convert them to HttpsError
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}); // This closes the exports.generateVocabularyContent function definition

module.exports = { generateVocabularyContent };
