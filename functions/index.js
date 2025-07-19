// functions/index.js Modified today 12/7/25
// --- 1. Module Imports, Firebase Admin SDK Initialization, Gemini Model Initialization, and Schema Definition ---
const functions = require("firebase-functions/v1"); // Main Firebase Functions module MUST BE V1.
const admin = require('firebase-admin'); // Firebase Admin SDK
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Core Google Generative AI SDK (Gemini)
const { Schema, ResponseModality } = require('@firebase/ai'); // IMPORT ResponseModality HERE
const { TextToSpeechClient } = require('@google-cloud/text-to-speech'); // ✨ NEW: Google Cloud Text-to-Speech Client for audio generation ✨

functions.logger.info('Firebase Functions code deployed: v1.006g');  //Version control

// --- CHANGE: Direct initialization of Firebase Admin SDK. This is the most robust way. ---
admin.initializeApp();

// --- CHANGE: Removed previous commented-out 'let _adminAppInstance;' and 'getAdminApp()' helper and their comments.
// These are no longer needed as admin.initializeApp() is called directly.

let _genAIClient;
let _textGenModel;
let _imageGenModel; // Variable for the image generation model

// Define the expected JSON schema for vocabulary content.
const vocabularySchema = Schema.array({
    items: Schema.object({
        properties: {
            TITLE: Schema.string(),
            CEFR: Schema.string(),
            DESCRIPTION: Schema.string(),
            THEME: Schema.enumString({ enum: ['General English'] }),
            MODULETYPE: Schema.string(), // Expected: "VOCABULARY" or "VOCABULARY_GROUP"
            WORD_TYPE: Schema.enumString({ enum: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', "conjunction", "interjection", "article", "determiner"] }),
            MEANING_ORIGIN: Schema.string(),
            PRESENT_SIMPLE_3RD_PERSON_SINGULAR: Schema.string(),
            SIMPLE_PAST: Schema.string(),
            PAST_PARTICIPLE: Schema.string(),
			imagePrompt: Schema.string(),
            items: Schema.array({
                items: Schema.object({
                    properties: {
                        TITLE: Schema.string(),
                        CEFR: Schema.string(),
                        DESCRIPTION: Schema.string(),
                        THEME: Schema.enumString({ enum: ['General English'] }),
                        MODULETYPE: Schema.string(), // Expected: "VOCABULARY" for nested items
                        WORD_TYPE: Schema.enumString({ enum: ['noun', 'verb', 'adjective', 'adverb', "pronoun", "preposition", "conjunction", "interjection", "article", "determiner"] }),
                        MEANING_ORIGIN: Schema.string(),
                        PRESENT_SIMPLE_3RD_PERSON_SINGULAR: Schema.string(),
						SIMPLE_PAST: Schema.string(),
						PAST_PARTICIPLE: Schema.string(),
						imagePrompt: Schema.string(),
                    },
                    required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN", "imagePrompt"],
                    propertyOrdering: [
                        "MODULETYPE", "TITLE", "DESCRIPTION", "WORD_TYPE", "CEFR", "THEME", "MEANING_ORIGIN", 
						"PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE", "imagePrompt"
					]
                }),
            }),
        },
        required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN"],
        optionalProperties: ["imagePrompt", "items", "PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE"],
        propertyOrdering: [
            "MODULETYPE", "TITLE", "DESCRIPTION", "WORD_TYPE", "CEFR", "THEME", "MEANING_ORIGIN", 
								"PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE", "imagePrompt", "items"

		]
    }),
});
// Helper function to get or create the Gemini text generation model instance
function getTextGenModel() {
    if (!_textGenModel) {
        const GEMINI_API_KEY = functions.config().gemini.api_key;
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is not configured. Run 'firebase functions:config:set gemini.api_key=\"YOUR_KEY\"' and redeploy.");
        }
        _genAIClient = new GoogleGenerativeAI(GEMINI_API_KEY);
        _textGenModel = _genAIClient.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: vocabularySchema,
                maxOutputTokens: 20000, // <--- ADD THIS LINE (Line 67)
            }
        });
    }
    return _textGenModel;
}

// Helper function to get or create the Gemini image generation model instance
function getImageGenModel() {
    if (!_imageGenModel) {
        const GEMINI_API_KEY = functions.config().gemini.api_key;
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is not configured for image generation. Run 'firebase functions:config:set gemini.api_key=\"YOUR_KEY\"' and redeploy.");
        }
        // Ensure _genAIClient is initialized before getting the model
        _genAIClient = _genAIClient || new GoogleGenerativeAI(GEMINI_API_KEY);
        _imageGenModel = _genAIClient.getGenerativeModel({
            model: "gemini-2.0-flash-preview-image-generation", // Use the new image generation model
            // ADD THIS CONFIGURATION BLOCK:
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"]

            },
        });
    }
    return _imageGenModel;
}

// This is the last line of section 1
// This is the beginning of section 2

// --- 2. Helper Functions, User Deletion Handler, and Vocabulary Content Generation ---

// Helper Function to generate new, unique Firestore Document IDs
// --- CHANGE: Updated to use admin.firestore() directly. ---
const generateUniqueFirestoreId = () => admin.firestore().collection('learningContent').doc().id;

// Helper Function to normalize titles for consistent lookup (e.g., for deduplication)
const normalizeTitle = (title) => {
    return title.toLowerCase().trim();
};
// --- Existing: Mark User as Deleted Function ---
// This function is triggered when a user is deleted from Firebase Authentication.
// It marks their corresponding Firestore document as deleted rather than removing it.
const handleUserDeletion = async (userRecord) => {
    // --- CHANGE: Updated to use admin.firestore() directly. ---
    const db = admin.firestore();
    const userId = userRecord.uid;
    const userEmail = userRecord.email;

    functions.logger.log(`Auth user deletion detected for UID: ${userId}, Email: ${userEmail || 'N/A'}.`);

    const userDocRef = db.collection("users").doc(userId);

    try {
        const docSnapshot = await userDocRef.get();

        if (docSnapshot.exists) {
            // --- CHANGE: Fixed typo (removed 'f' before await). ---
            await userDocRef.update({
                isDeleted: true,
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            functions.logger.log(`Firestore document for user ${userId} successfully marked as deleted. All data retained.`);
            return { status: "success", message: `Document for ${userId} marked as deleted, data retained.` };
        } else {
            functions.logger.log(`Firestore document for UID ${userId} not found. No marking needed as no data exists to retain.`);
            return { status: "success", message: `No document found for ${userId}.` };
        }
    } catch (error) {
        functions.logger.error(`Error marking user ${userId} as deleted in Firestore:`, error);
        throw new Error(`Failed to mark user as deleted: ${error.message}`);
    }
};
exports.markUserAsDeletedInFirestore = functions.region('asia-southeast1').auth.user().onDelete(handleUserDeletion);

// --- generateVocabularyContent Callable Function ---
// This function is called from your AdminSystem webpage to generate new vocabulary content using Gemini.
// --- CHANGE: Added .runWith() for timeout configuration. ---
exports.generateVocabularyContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    // --- Security Check (Crucial for Admin Functions) ---
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    if (!context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Only authorized administrators can perform this action.');
    }
    // --- End Security Check ---

    const { cefrLevel, numWords, theme } = data;

    if (!cefrLevel || !numWords || !theme || numWords <= 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Words, and Theme are required and must be valid.'
        );
    }

    functions.logger.info(`AdminSystem: Starting content generation for CEFR: ${cefrLevel}, Words: ${numWords}, Theme: ${theme}`);

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const firestore = admin.firestore(); // --- CHANGE: Using admin.firestore() directly. ---
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
	const skippedWords = [];
	let geminiReturnedItemCount = 0;
    let topLevelVocabCount = 0;
    let vocabGroupCount = 0;
    let nestedVocabCount = 0;
    try {
        // --- 1. Construct the sophisticated prompt for Gemini ---
        const geminiPrompt = `
        Generate a JSON array of ${numWords} vocabulary items for CEFR ${cefrLevel} level, themed around "${theme}".
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **VOCABULARY_GROUP** (for words with multiple distinct meanings ):
            - "MODULETYPE": "VOCABULARY_GROUP"
            - "TITLE": The word (or phrase)
            - "CEFR": This must be "A1"
            - "DESCRIPTION": This must be empty
            - "THEME":This must be ${theme}
            - "WORD_TYPE": This must be empty
            - "MEANING_ORIGIN": This must contain details of the group's origin, etymology, common prefixes, infixes, or suffixes relevant to the group.
            - "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": This must be empty
            - "SIMPLE_PAST": This must be empty
            - "PAST_PARTICIPLE": This must be empty
			- "items": An array of nested "VOCABULARY" modules, each defining a unique meaning of the word.

        2.  **VOCABULARY** (for single-meaning words, or individual meanings within a VOCABULARY_GROUP):
            - "MODULETYPE": "VOCABULARY"
            - "TITLE": The word (or phrase)
            - "CEFR": This must be "A1"
            - "DESCRIPTION": Must be 3 numbered sentences (e.g., "1. Sentence one. 2. Sentence two. 3. Sentence three.") that use the word in the context of its specific meaning
            - "THEME":This must be ${theme}
            - "WORD_TYPE": This must be one of the following: "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "article", "determiner"
            - "MEANING_ORIGIN": This must contain the meaning of the specific instance of the word. This must be followed by details of the word's origin, etymology, common prefixes, infixes, or suffixes relevant to the group.
            - "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": This has a value only when WORD_TYPE = "verb". Provide the 3rd person singular simple present tense form, e.g., "eats" for "eat"
            - "SIMPLE_PAST": This has a value only when WORD_TYPE = "verb". Provide the simple past tense form, e.g., "ate" for "eat"
            - "PAST_PARTICIPLE": This has a value only when WORD_TYPE = "verb". Provide the past participle form, e.g., "eaten" for "eat"
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on one of the sentences in the DESCRIPTION field. (Only for MODULETYPE "VOCABULARY")

        **Crucial Rules for Generation:**
        - You MUST create a document with VOCABULARY_GROUP MODULETYPE for a word when there is more than one possible meaning of that word. That VOCABULARY_GROUP document must have a null WORD_TYPE.
		- **MODULETYPE:** You MUST create a unique VOCABULARY MODULETYPE document for EACH and EVERY POSSIBLE meaning of any given word. For example 'set' has more than 10 separarate meanings, so it MUST cause the creation of a VOCABULARY_GROUP MODULETYPE document, and at least 10 documents for that word with a MODULETYPE of VOCABULARY, each with their specific values for the other relevant fields described here.      
		- **CEFR Hierarchy:** For All VOCABULARY AND VOCABULARY_GROUP modules, their 'CEFR' level MUST be set to "A1").
        - **Polysemy:** If a word has multiple *distinct* meanings or functions including as different parts of speech (e.g., "book" as a noun and "book" as a verb; "like" as a verb and as an adjective, and as a preposition, and as a conjunction ), you MUST create a "VOCABULARY_GROUP" for it. This "VOCABULARY_GROUP" must contain individual "VOCABULARY" entries for *each* distinct meaning and/or part of speech. If a word has only one primary meaning, create only a single "VOCABULARY" entry directly.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numWords} top-level vocabulary items (including VOCABULARY_GROUPs).
        - **WORD_TYPE and MODULETYPE** Values for 'WORD_TYPE' may only exist for modules with a MODULETYPE of 'VOCABULARY'.That is because a word could have more than one 'WORD_TYPE'.
        - **TITLE:** This field must contain the word exclusively.
        - **MEANING_ORIGIN:** You MUST include a description of the particular meaning of that instance of a VOCABULARY MODULETYPE document AND you must add to that a description of the etymology of that instance of the word also.
		
		Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "cat",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. The cat sat. 2. The cat purred. 3. I like cats.",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "A carnivorous mammal of the Genus 'Felis'.originates from the Old English word "catt" (masculine) and "catte" (feminine), which themselves are derived from the Proto-West Germanic *kattu. This Germanic form likely comes from the Late Latin *cattus, first appearing around the 6th century.  ",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",
			"imagePrompt": "A fluffy cat sitting."
          },
          {
            "TITLE": "set",
            "MODULETYPE": "VOCABULARY_GROUP",
            "CEFR": "A1",
            "DESCRIPTION": "",
            "THEME":"General English",
            "WORD_TYPE": "",
            "MEANING_ORIGIN": "Old English settan, of Germanic origin; related to Dutch zetten, German setzen, also to sit."
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",

		 },
          {
            "TITLE": "set",
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
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. Do you have a set of golf clubs? 2. I would like the whole album set. 3. Is this the complete set?",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "a group of similar things that belong together in some way. The most common meaning of "set" as a noun refers to a group of related items. This sense is related to the Old English word "set" meaning "seat" or "place," and also the Middle English "set" referring to a group or sequence. ",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",
			"imagePrompt": "A golfer holding a set of clubs."

        `; // This closes the backtick for the geminiPrompt multiline string.

        const result = await textGenModel.generateContent(geminiPrompt);
        const response = await result.response;
        const text = response.text();

		functions.logger.info(`Received text from Gemini. Length: ${text.length}`);
        functions.logger.info(`Raw text (first 500 chars): ${text.substring(0, 500)}`);
        functions.logger.info(`Raw text (last 500 chars): ${text.length > 500 ? text.substring(text.length - 500) : text}`);


        let generatedContent;
        try {
            generatedContent = JSON.parse(text);
			geminiReturnedItemCount = generatedContent.length; //  SET THE COUNT HERE 
            functions.logger.info(`Gemini returned ${geminiReturnedItemCount} top-level JSON items.`);
	   } catch (parseError) {
            functions.logger.error("Failed to parse Gemini output as JSON:", { rawText: text, error: parseError });
            throw new functions.https.HttpsError('internal', 'AI generation failed: Invalid JSON output from Gemini.', { rawResponse: text, parseError: parseError.message });
        }

        // --- 2. Process Generated Content and Write to Firestore (with Deduplication) ---
        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'VOCABULARY';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['VOCABULARY', 'VOCABULARY_GROUP'])
                .where('normalizedTitle', '==', itemNormalizedTitle)
                .limit(1)
                .get();

            if (!existingContentSnapshot.empty) {
                functions.logger.info(`Skipping "${item.TITLE}" (${itemModuleType}) as a record with this title already exists.`);
                numSkipped++;
                skippedWords.push(item.TITLE);
				continue;
            }

            // --- If the item is NOT skipped, process it and add to the Firestore batch ---
            if (itemModuleType === "VOCABULARY_GROUP") {
                vocabGroupCount++;
				functions.logger.info(`Processing VOCABULARY_GROUP: "${item.TITLE}".`);
				const groupId = generateUniqueFirestoreId();
                const groupRef = firestore.collection('learningContent').doc(groupId);
                const meaningIds = [];

                if (Array.isArray(item.items)) {
                    for (const meaning of item.items) {
                        if (meaning.MODULETYPE === "VOCABULARY") {
                            nestedVocabCount++;
							functions.logger.info(`  - Processing nested VOCABULARY item: "${meaning.TITLE}".`);
							const vocabId = generateUniqueFirestoreId();
                            const vocabRef = firestore.collection('learningContent').doc(vocabId);
                            //new bit below
							const verbFields = (meaning.WORD_TYPE === 'verb') ? {
							PRESENT_SIMPLE_3RD_PERSON_SINGULAR: meaning.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || null,
							SIMPLE_PAST: meaning.SIMPLE_PAST || null,
							PAST_PARTICIPLE: meaning.PAST_PARTICIPLE || null,
								} : {};
							//
						   batch.set(vocabRef, {
                                MODULEID: vocabId,
                                MODULETYPE: "VOCABULARY",
                                TITLE: meaning.TITLE,
                                normalizedTitle: normalizeTitle(meaning.TITLE),
                                CEFR: meaning.CEFR,
                                DESCRIPTION: meaning.DESCRIPTION,
                                imagePrompt: meaning.imagePrompt,
                                THEME: meaning.THEME,
                                WORD_TYPE: meaning.WORD_TYPE,
                                MEANING_ORIGIN: meaning.MEANING_ORIGIN,
								PRESENT_SIMPLE_3RD_PERSON_SINGULAR: meaning.PRESENT_SIMPLE_3RD_PERSON_SINGULAR,
								SIMPLE_PAST: meaning.SIMPLE_PAST,
								PAST_PARTICIPLE: meaning.PAST_PARTICIPLE,
								IMAGEURL: "", // Placeholder for image URL
                                imageStatus: "pending", // Mark for batch image generation
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
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
                    DESCRIPTION: item.DESCRIPTION,
                    THEME: item.THEME,
                    WORD_TYPE: item.WORD_TYPE,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR,
					SIMPLE_PAST: item.SIMPLE_PAST,
					PAST_PARTICIPLE: item
					
					
					
					
					.PAST_PARTICIPLE,
					MODULEID_ARRAY: meaningIds,
                    IMAGEURL: "",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(groupId);

            } else if (itemModuleType === "VOCABULARY") {
                 topLevelVocabCount++; 
                functions.logger.info(`Processing top-level VOCABULARY: "${item.TITLE}".`); 
				const vocabId = generateUniqueFirestoreId();
                const vocabRef = firestore.collection('learningContent').doc(vocabId);
				// --- NEW: Conditionally add verb conjugation fields ---
							const verbFields = (item.WORD_TYPE === 'verb') ? {
							PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || null,
							SIMPLE_PAST: item.SIMPLE_PAST || null,
							PAST_PARTICIPLE: item.PAST_PARTICIPLE || null,
						} : {};

                batch.set(vocabRef, {
                    MODULEID: vocabId,
                    MODULETYPE: "VOCABULARY",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    WORD_TYPE: item.WORD_TYPE,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR,
					SIMPLE_PAST: item.SIMPLE_PAST,
					PAST_PARTICIPLE: item.PAST_PARTICIPLE,
					IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(vocabId);

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

 functions.logger.info(`Content generation summary: Requested ${numWords}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelVocabCount} top-level VOCABULARY, ${vocabGroupCount} VOCABULARY_GROUPs (containing ${nestedVocabCount} nested VOCABULARY items). Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`);//        // --- CHANGE: Trigger batchGenerateVocabularyImages (cleaned up and restored) ---
//        try {
//            // Get the functions client directly from the initialized admin object.
//            const functionsClient = admin.functions('asia-southeast1');
//            const callBatchImageGeneration = functionsClient.httpsCallable('batchGenerateVocabularyImages');
//            await callBatchImageGeneration({});
//            functions.logger.info('Successfully triggered batchGenerateVocabularyImages after content creation.');
//        } catch (callError) {
//            // Log the error but don't re-throw, as content creation was already successful.
//            functions.logger.error('Failed to trigger batchGenerateVocabularyImages (callable function):', callError);
//        }
        // --- END CHANGE: Trigger batchGenerateVocabularyImages ---

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
        functions.logger.error("Error generating or saving content:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}) // This closes the exports.generateVocabularyContent function definition


// --- NEW: Scheduled Function to populate the initial RP Phonemes Collection ---
// This function can be triggered manually from the GCP Console (Functions -> 'populatePhonemesScheduled' -> Trigger Now)
// It will also run automatically once a year, though that's a side result. We dont want to use that.
exports.populatePhonemesScheduled = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).pubsub.schedule('0 0 1 1 *')
    .onRun(async (context) => {
    // --- IMPORTANT: Removed context.auth checks as scheduled functions do not have them. ---
    // Security for scheduled functions is managed by IAM permissions for deploying/triggering.

    const firestore = admin.firestore(); // Get Firestore instance
    const bucket = admin.storage().bucket(); // Get the default storage bucket
    const ttsClient = new TextToSpeechClient(); // Initialize Text-to-Speech Client
    const collectionName = 'phonemes'; // Hardcoded as this is a specific, one-time setup
    const batch = firestore.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    // British English (Received Pronunciation) Phoneme Data
    const rpPhonemes = [
        // --- RP Monophthongs (Short Vowels) ---
        { ipa: 'ɪ', titleSuffix: "Short 'i' sound (as in 'kit')", theme: 'Vowel' },
        { ipa: 'e', titleSuffix: "Short 'e' sound (as in 'dress')", theme: 'Vowel' },
        { ipa: 'æ', titleSuffix: "Short 'a' sound (as in 'trap')", theme: 'Vowel' },
        { ipa: 'ɒ', titleSuffix: "Short 'o' sound (as in 'lot')", theme: 'Vowel' },
        { ipa: 'ʌ', titleSuffix: "Short 'u' sound (as in 'strut')", theme: 'Vowel' },
        { ipa: 'ʊ', titleSuffix: "Short 'oo' sound (as in 'foot')", theme: 'Vowel' },
        { ipa: 'ə', titleSuffix: "Schwa sound (as in 'about', unstressed)", theme: 'Vowel' },

        // --- RP Monophthongs (Long Vowels) ---
        { ipa: 'iː', titleSuffix: "Long 'ee' sound (as in 'fleece')", theme: 'Vowel' },
        { ipa: 'ɑː', titleSuffix: "Long 'ah' sound (as in 'start')", theme: 'Vowel' },
        { ipa: 'ɔː', titleSuffix: "Long 'aw' sound (as in 'thought')", theme: 'Vowel' },
        { ipa: 'uː', titleSuffix: "Long 'oo' sound (as in 'goose')", theme: 'Vowel' },
        { ipa: 'ɜː', titleSuffix: "Long 'er' sound (as in 'nurse')", theme: 'Vowel' },

        // --- RP Diphthongs (Vowel Glides) ---
        { ipa: 'eɪ', titleSuffix: "Diphthong 'ay' sound (as in 'face')", theme: 'Diphthong' },
        { ipa: 'aɪ', titleSuffix: "Diphthong 'eye' sound (as in 'my')", theme: 'Diphthong' },
        { ipa: 'ɔɪ', titleSuffix: "Diphthong 'oy' sound (as in 'boy')", theme: 'Diphthong' },
        { ipa: 'əʊ', titleSuffix: "Diphthong 'oh' sound (as in 'goat')", theme: 'Diphthong' },
        { ipa: 'aʊ', titleSuffix: "Diphthong 'ow' sound (as in 'mouth')", theme: 'Diphthong' },
        { ipa: 'ɪə', titleSuffix: "Diphthong 'ear' sound (as in 'near')", theme: 'Diphthong' },
        { ipa: 'eə', titleSuffix: "Diphthong 'air' sound (as in 'square')", theme: 'Diphthong' },
        { ipa: 'ʊə', titleSuffix: "Diphthong 'ure' sound (as in 'cure')", theme: 'Diphthong' },

        // --- Consonants (Plosives) ---
        { ipa: 'p', titleSuffix: "Voiceless 'p' sound", theme: 'Consonant' },
        { ipa: 'b', titleSuffix: "Voiced 'b' sound", theme: 'Consonant' },
        { ipa: 't', titleSuffix: "Voiceless 't' sound", theme: 'Consonant' },
        { ipa: 'd', titleSuffix: "Voiced 'd' sound", theme: 'Consonant' },
        { ipa: 'k', titleSuffix: "Voiceless 'k' sound", theme: 'Consonant' },
        { ipa: 'g', titleSuffix: "Voiced 'g' sound", theme: 'Consonant' },
        { ipa: 'ʔ', titleSuffix: "Glottal stop (as in 'uh-oh')", theme: 'Consonant' },

        // --- Consonants (Fricatives) ---
        { ipa: 'f', titleSuffix: "Voiceless 'f' sound", theme: 'Consonant' },
        { ipa: 'v', titleSuffix: "Voiced 'v' sound", theme: 'Consonant' },
        { ipa: 'θ', titleSuffix: "Voiceless 'th' sound (as in 'thin')", theme: 'Consonant' },
        { ipa: 'ð', titleSuffix: "Voiced 'th' sound (as in 'this')", theme: 'Consonant' },
        { ipa: 's', titleSuffix: "Voiceless 's' sound", theme: 'Consonant' },
        { ipa: 'z', titleSuffix: "Voiced 'z' sound", theme: 'Consonant' },
        { ipa: 'ʃ', titleSuffix: "Voiceless 'sh' sound (as in 'she')", theme: 'Consonant' },
        { ipa: 'ʒ', titleSuffix: "Voiced 'zh' sound (as in 'measure')", theme: 'Consonant' },
        { ipa: 'h', titleSuffix: "Voiceless 'h' sound", theme: 'Consonant' },

        // --- Consonants (Affricates) ---
        { ipa: 'tʃ', titleSuffix: "Voiceless 'ch' sound (as in 'church')", theme: 'Consonant' },
        { ipa: 'dʒ', titleSuffix: "Voiced 'j' sound (as in 'judge')", theme: 'Consonant' },

        // --- Consonants (Nasals) ---
        { ipa: 'm', titleSuffix: "Voiced 'm' sound", theme: 'Consonant' },
        { ipa: 'n', titleSuffix: "Voiced 'n' sound", theme: 'Consonant' },
        { ipa: 'ŋ', titleSuffix: "Voiced 'ng' sound (as in 'sing')", theme: 'Consonant' },

        // --- Consonants (Approximants) ---
        { ipa: 'l', titleSuffix: "Voiced 'l' sound", theme: 'Consonant' },
        { ipa: 'r', titleSuffix: "Voiced 'r' sound (as in 'rat')", theme: 'Consonant' },
        { ipa: 'w', titleSuffix: "Voiced 'w' sound", theme: 'Consonant' },
        { ipa: 'j', titleSuffix: "Voiced 'y' sound (as in 'yes')", theme: 'Consonant' }
    ];

    functions.logger.info(`[populatePhonemesScheduled] Starting to create ${rpPhonemes.length} British English (RP) phoneme documents in '${collectionName}' collection...`);

    try {
        for (const p of rpPhonemes) {
		const moduleID = `phoneme_${encodeURIComponent(p.ipa).replace(/%/g, '_').toLowerCase()}`;
            const phonemeDocRef = firestore.collection(collectionName).doc(moduleID);

            const docSnapshot = await phonemeDocRef.get();
// Inside your for (const p of rpPhonemes) loop, before constructing the 'request' object:

let ssmlInputText = p.ipa; // Default to just the IPA symbol for the text inside the phoneme tag
let ssmlPhAttribute = p.ipa; // Default to just the IPA symbol for the 'ph' attribute

// Define the problematic phonemes (YOU NEED TO FILL THIS ARRAY WITH YOUR SPECIFIC ONES)
// *** YOU WILL POPULATE THESE ARRAYS BASED ON YOUR COMPLETE LIST OF PROBLEMATIC PHONEMES ***
// Consonants that are silent or say their letter name. These will get the 'p.ipa + ə' treatment.
const consonantProblemPhonemes = ['z', 'w', 'v', 't', 's', 'r', 'p', 'n', 'm', 'l', 'k', 'l', 'h', 'g', 'f', 'e', 'd', 'b', 'j', 'ʒ','tʃ', 'ʔ', 'ʃ', 'ŋ', 'ð', 'dʒ', 'θ']; //  list, problematic consonants 
// Vowels that are silent. These will rely on voice selection for vocalization.
const vowelProblemPhonemes = ['ʊ', 'ʔ', 'ɪ', 'ʊə', 'i'];

// Check if the current phoneme is in our problematic list
if (consonantProblemPhonemes.includes(p.ipa)) {
    // For problematic consonants: append a schwa to force vocalization.
    // Example: 'ʒ' becomes 'ʒə', 'v' becomes 'və'
    ssmlPhAttribute = p.ipa + 'ə';
    ssmlInputText = p.ipa; // Keep the visible text as just the IPA symbol
 functions.logger.info(`[populatePhonemesScheduled] Applying schwa for problematic consonant: ${p.ipa}`);
} else if (vowelProblemPhonemes.includes(p.ipa)) {
    // For problematic vowels: Do NOT add a schwa.
    // We rely on switching voices for these.
    ssmlPhAttribute = p.ipa;
    ssmlInputText = p.ipa;
    // You might also want to log a warning here to investigate voice changes for these specific vowels
	functions.logger.info(`[populatePhonemesScheduled] Relying on Neural2 voice for problematic vowel: ${p.ipa}`);}
            let newAudioUrl = null; // This will hold the URL of the newly generated audio

            try {
// Then construct the request using these variables:
const request = {
    input: { ssml: `<speak><phoneme alphabet="ipa" ph="${ssmlPhAttribute}">${ssmlInputText}</phoneme></speak>` },
    // IMPORTANT: Let's explicitly try a top-tier voice like Neural2-A or Wavenet-A.
    // This could solve the vowel issues and generally improve consonant rendering.
    voice: { languageCode: 'en-GB', ssmlGender: 'FEMALE', name: 'en-GB-Neural2-A' }, // Or 'en-GB-Wavenet-A'
    audioConfig: { audioEncoding: 'MP3' },
};

                // 2. Call the Text-to-Speech API
                const [response] = await ttsClient.synthesizeSpeech(request);
                const audioContent = response.audioContent; // This is a Buffer containing the MP3 data

                // Log the audio content buffer length for debugging purposes
                functions.logger.info(`Audio content buffer length for ${p.ipa}: ${audioContent.length} bytes`);

                // Optional: A more aggressive check for "empty" or bad audio.
                // An MP3 header is usually around 4-8 bytes. If content.length is < 100-200 bytes, it's likely still empty or bad.
                // If the file is still 5KB, this check won't catch it, but it's good for truly empty responses.
                if (audioContent.length < 500) { // A threshold, 5KB (5120 bytes) is still large for silence if nothing's there.
                    functions.logger.warn(`Generated audio for ${p.ipa} is suspiciously small (${audioContent.length} bytes). May indicate an issue or silent output.`);
                    // If you wanted to entirely abandon and NOT update the URL if it's too small:
                    // throw new Error("Generated audio content is too small, likely inaudible.");
                }

                // 3. Upload the Audio to Cloud Storage
                const audioFileName = `${moduleID}.mp3`; // e.g., phoneme_ɪ.mp3
                const audioFilePath = `phoneme_audio/${audioFileName}`; // Path in Cloud Storage bucket
                const file = bucket.file(audioFilePath);

                await file.save(audioContent, {
                    metadata: { contentType: 'audio/mpeg' },
                    public: true // Make the file publicly accessible
                });

                newAudioUrl = file.publicUrl(); // Get the public URL for the uploaded audio
                functions.logger.info(`Generated and uploaded audio for ${p.ipa} to: ${newAudioUrl}`);

            } catch (audioGenError) {
                functions.logger.error(`Failed to generate or upload audio for phoneme ${p.ipa}:`, audioGenError);
                // If audio generation fails, keep the old URL if one existed, otherwise it remains null.
                newAudioUrl = docSnapshot.exists && docSnapshot.data().audioUrl ? docSnapshot.data().audioUrl : null;
                functions.logger.warn(`Retaining previous audioUrl for ${p.ipa} due to generation error: ${newAudioUrl}`);
            }

            // Prepare base data that will be used for both set and update operations
            const baseDocData = {
                MODULEID: moduleID,
                MODULETYPE: 'PHONEME',
                TITLE: `${p.ipa} - ${p.titleSuffix}`,
                IPA_SYMBOL: p.ipa,
                DESCRIPTION: `Learn how to produce the ${p.titleSuffix}. This phoneme is crucial for clear British English pronunciation.`,
                CEFR: null,
                MEANING_ORIGIN: null,
                THEME: p.theme,
                WORD_TYPE: null,
                MODULEID_ARRAY: [],
                ImagePrompt: null,
                ImageStatus: null,
                normalizedTitle: p.ipa.toLowerCase(),
                updatedAt: now, // Always update timestamp on change
                IMAGEURL: null,
                VIDEOURL: null
            };

            if (docSnapshot.exists) {
                // Document exists. Update it.
                // We prioritize newAudioUrl if successful, otherwise retain the old one.
                const updateData = {
                    ...baseDocData,
                    audioUrl: newAudioUrl !== null ? newAudioUrl : (docSnapshot.data().audioUrl || null), // Use new URL if successful, else old URL if exists, else null
                    createdAt: docSnapshot.data().createdAt, // Preserve original createdAt
                };
                batch.update(phonemeDocRef, updateData); // Use update to merge changes
                functions.logger.info(`[populatePhonemesScheduled] Updating existing document for phoneme ${p.ipa}.`);
            } else {
                // Document does not exist. Create it.
                const createData = {
                    ...baseDocData,
                    audioUrl: newAudioUrl, // For new documents, this is either the generated URL or null
                    createdAt: now, // Set createdAt for new documents
                };
                batch.set(phonemeDocRef, createData); // Use set for new documents
                functions.logger.info(`[populatePhonemesScheduled] Creating new document for phoneme ${p.ipa}.`);
            }
        }

        await batch.commit();
        functions.logger.info(`[populatePhonemesScheduled] Batch commit completed for British English (RP) phoneme documents.`);
        return { status: "success", message: `Successfully processed RP phoneme documents in '${collectionName}' collection.` };
    } catch (error) {
        functions.logger.error('[populatePhonemesScheduled] Error processing phoneme documents:', error);
        return { status: "error", message: `Failed to process phoneme documents: ${error.message}` };
    }
});


// This is the last line of section 2
// This is the beginning of section 3

// --- 3. Image Generation Logic and Cloud Function Triggers (Firestore and PubSub) ---

/**
 * Helper function to process image generation and upload for a single vocabulary item.
 * This function is designed to be reusable by both the Firestore onCreate trigger
 * and the scheduled batch function.
 * @param {admin.firestore.DocumentSnapshot} doc - The Firestore DocumentSnapshot of the vocabulary item.
 */
async function processVocabularyImageGeneration(doc) {
    // --- CHANGE: Updated to use admin.firestore() and admin.storage() directly. ---
    const firestore = admin.firestore();
    const storage = admin.storage();
    const bucket = storage.bucket(admin.app().options.storageBucket); // admin.app() here is okay as it gets the default app instance.

    const vocabData = doc.data();
    const vocabRef = doc.ref;
    const imagePrompt = vocabData.imagePrompt;
    const vocabId = vocabData.MODULEID;

    // Skip if there's no image prompt or if it's not a VOCABULARY type (though this should be filtered by query/trigger)
    if (!imagePrompt || vocabData.MODULETYPE !== "VOCABULARY") {
        functions.logger.info(`Skipping image generation for ${vocabId}: No image prompt or wrong MODULETYPE.`);
        return { id: vocabId, status: 'skipped', reason: 'No image prompt or wrong MODULETYPE' };
    }

    try { // <-- This 'try' block starts here
        // Mark status as 'generating' immediately.
        // This prevents other concurrent invocations from trying to process the same image.
        await vocabRef.update({ imageStatus: 'generating' });
        functions.logger.info(`Processing image for ${vocabId} with prompt: "${imagePrompt}"`);

        const imageGenModel = getImageGenModel(); // Get the Gemini image generation model

        // Generate content (image) using Gemini
        const result = await imageGenModel.generateContent({
            contents: [{ parts: [{ text: imagePrompt }] }],
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"] // Explicitly pass it here too, matching the error message order
                // responseMimeType: "image/png" // Any other settings you might need
            }
        });

        // The image data is usually found within the `candidates` array.
        // It's typically base64 encoded and needs to be decoded.
        // Refer to Gemini API documentation for exact response structure of image generation.
        const response = result.response;

        // 🟦 BEGIN CHANGE: Update log sanitization to dynamically find the image part
        const loggableResponse = JSON.parse(JSON.stringify(response)); // Deep copy
        if (loggableResponse.candidates && loggableResponse.candidates[0] &&
            loggableResponse.candidates[0].content && loggableResponse.candidates[0].content.parts) {
            // Find the image part and sanitize its data for logging
            const imagePartForLogging = loggableResponse.candidates[0].content.parts.find(
                p => p.inlineData && p.inlineData.data
            );
            if (imagePartForLogging) {
                imagePartForLogging.inlineData.data = '[IMAGE_DATA_OMITTED_FOR_LOGGING_SIZE]';
            }
        }
        // 🟦 END CHANGE: Update log sanitization to dynamically find the image part
        functions.logger.info('Gemini Image Gen Raw Response (Sanitized):', JSON.stringify(loggableResponse, null, 2));
        const candidates = response.candidates;

        if (!candidates || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || candidates[0].content.parts.length === 0) {
            throw new Error("No candidates or content parts found in Gemini response.");
        }

        const imagePart = candidates[0].content.parts.find(part => part.inlineData && part.inlineData.data);

        if (!imagePart) { // 🟦 Moved this check directly after finding the imagePart
            throw new Error("No image data (inlineData) part found in Gemini response.");
        }

        const mimeType = imagePart.inlineData.mimeType;
        const imageDataBase64 = imagePart.inlineData.data;
        const imageDataBuffer = Buffer.from(imageDataBase64, 'base64'); // Decode base64 to buffer

        const fileExtension = mimeType.split('/')[1] || 'png'; // e.g., 'image/png' -> 'png'
        const filePath = `vocabulary_images/${vocabId}.${fileExtension}`; // Path in Cloud Storage bucket
        const file = bucket.file(filePath);

        // Upload the generated image data to Cloud Storage
        await file.save(imageDataBuffer, {
            metadata: {
                contentType: mimeType, // Use the detected MIME type
            },
        });

        // Make the file publicly accessible.
        await file.makePublic();
        const publicUrl = file.publicUrl();

        // Update the Firestore document with the image URL and mark as completed
        await vocabRef.update({
            IMAGEURL: publicUrl,
            imageStatus: 'completed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.info(`Successfully generated and uploaded image for ${vocabId}. URL: ${publicUrl}`);
        return { id: vocabId, status: 'completed', url: publicUrl };
    } // <-- This is the missing closing brace for the 'try' block!
    catch (imgError) {
        // If image generation or upload fails for this item, mark its status as 'failed'
        await vocabRef.update({
            imageStatus: 'failed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.error(`Failed to generate or upload image for ${vocabId}:`, imgError);
        return { id: vocabId, status: 'failed', error: imgError.message };
    }
}
//************************ THIS FUNCTION BELOW SWITCHED OFF FOR NOW. RESOURCE HEAVY. THE SAME RESULT***        ***
//************************ CAN BE ACHIEVED WITH THE 'BATCH' FUNCTION INSTEAD, AND WITH LESS RESOURCE***
// --- Firestore onCreate Trigger for Image Generation ---
// This function triggers when a new document is created in 'learningContent'.
// It immediately tries to generate an image if it's a VOCABULARY type.
// --- CHANGE: Commented out to disable this trigger. ---

exports.onNewVocabularyContentCreate = functions.region('asia-southeast1').firestore
    .document('learningContent/{docId}')
    .onCreate(async (snapshot, context) => {
        const data = snapshot.data();
        // Only process documents that are of type 'VOCABULARY' and are 'pending' image generation
        if (data.MODULETYPE === 'VOCABULARY' && data.imageStatus === 'pending') {
            functions.logger.info(`New VOCABULARY document created with pending image for ${context.params.docId}. Attempting image generation.`);
            // Use the reusable helper function
            await processVocabularyImageGeneration(snapshot);
        } else {
            functions.logger.info(`New document ${context.params.docId} created, but not a pending VOCABULARY item for image generation. Skipping.`);
        }
        return null;
    });

//************************ THIS FUNCTION ABOVE ^SWITCHED OFF FOR NOW. RESOURCE HEAVY. THE SAME RESULT***        ***
//************************ CAN BE ACHIEVED WITH THE 'BATCH' FUNCTION INSTEAD, AND WITH LESS RESOURCE ***

// --- batchGenerateVocabularyImages NOW a Callable Function ---
// This function will be triggered upon successful completion of generateVocabularyContent
// to catch any remaining pending vocabulary items for image generation.
// --- CHANGE: Changed from pubsub.schedule to https.onCall, and added .runWith() for timeout. ---
exports.batchGenerateVocabularyImages = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 })
    .pubsub.schedule('every 24 hours') // This sets the schedule!
    .onRun(async (context) => {
	const firestore = admin.firestore();

    functions.logger.info('Starting batch image generation for pending vocabulary items via explicit call.'); // UPDATED LOG MESSAGE

    try {
        // Query for VOCABULARY items that are pending image generation
        // --- CHANGE: Limit increased to 100 as per discussion. ---
        const pendingVocabSnapshot = await firestore.collection('learningContent')
            .where('MODULETYPE', '==', 'VOCABULARY')
            .where('imageStatus', '==', 'pending')
            .limit(100) // Process a manageable batch at a time
            .get();

        if (pendingVocabSnapshot.empty) {
            functions.logger.info('No pending vocabulary items found for batch image generation.');
            return null;
        }

        const imageGenerationPromises = [];

        for (const doc of pendingVocabSnapshot.docs) {
            // Add the image generation process to a list of promises, using the reusable helper
            imageGenerationPromises.push(processVocabularyImageGeneration(doc));
        }

        // Run all image generation and upload promises concurrently
        const results = await Promise.all(imageGenerationPromises);

        functions.logger.info('Batch image generation completed. Results:', results);
        return null;

    } catch (error) {
        functions.logger.error("Error in batch image generation process:", error);
        // --- CHANGE: For callable functions, throw an HttpsError on failure. ---
        throw error;
    }
}) // This closes the exports.batchGenerateVocabularyImages function definition
// --- 8. Freeze Exports ---
// This prevents accidental modifications to the exports object during runtime,
// ensuring a stable execution environment for all exported functions.
// This line should be the very last line in your functions/index.js file.
Object.freeze(exports);

// This is the END
