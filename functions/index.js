// functions/index.js Modified today 12/7/25
// --- 1. Module Imports, Firebase Admin SDK Initialization, Gemini Model Initialization, and Schema Definition ---
const functions = require("firebase-functions/v1"); // Main Firebase Functions module MUST BE V1.
const admin = require('firebase-admin'); // Firebase Admin SDK
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Core Google Generative AI SDK (Gemini)
//const { Schema } = require('@firebase/ai'); // Firebase AI SDK for Schema ONLY
const { Schema, ResponseModality } = require('@firebase/ai'); // IMPORT ResponseModality HERE

functions.logger.info('Firebase Functions code deployed: v1.006e');  //Version control

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
            WORD_TYPE: Schema.enumString({ enum: ['Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Interjection', 'Article', 'Determiner'] }),
            MEANING_ORIGIN: Schema.string(),
            imagePrompt: Schema.string(),
            items: Schema.array({
                items: Schema.object({
                    properties: {
                        TITLE: Schema.string(),
                        CEFR: Schema.string(),
                        DESCRIPTION: Schema.string(),
                        THEME: Schema.enumString({ enum: ['General English'] }),
                        MODULETYPE: Schema.string(), // Expected: "VOCABULARY" for nested items
                        WORD_TYPE: Schema.enumString({ enum: ['Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Interjection', 'Article', 'Determiner'] }),
                        MEANING_ORIGIN: Schema.string(),
                        imagePrompt: Schema.string(),
                    },
                    required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN", "imagePrompt"],
                    propertyOrdering: [
                        "MODULETYPE", "TITLE", "DESCRIPTION", "WORD_TYPE", "CEFR", "THEME", "MEANING_ORIGIN", "imagePrompt"
                    ]
                }),
            }),
        },
        required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN"],
        optionalProperties: ["imagePrompt", "items"],
        propertyOrdering: [
            "MODULETYPE", "TITLE", "DESCRIPTION", "WORD_TYPE", "CEFR", "THEME", "MEANING_ORIGIN", "imagePrompt", "items"
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
            - "items": An array of nested "VOCABULARY" modules, each defining a unique meaning of the word.

        2.  **VOCABULARY** (for single-meaning words, or individual meanings within a VOCABULARY_GROUP):
            - "MODULETYPE": "VOCABULARY"
            - "TITLE": The word (or phrase)
            - "CEFR": This must be "A1"
            - "DESCRIPTION": Must be 3 numbered sentences (e.g., "1. Sentence one. 2. Sentence two. 3. Sentence three.") that use the word in the context of its specific meaning
            - "THEME":This must be ${theme}
            - "WORD_TYPE": This must be one of the following: "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction", "Interjection", "Article", "Determiner"
            - "MEANING_ORIGIN": This must contain the meaning of the specific instance of the word
            - "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on one of the sentences in the DESCRIPTION field. (Only for MODULETYPE "VOCABULARY")

        **Crucial Rules for Generation:**
        - **CEFR Hierarchy:** For All VOCABULARY AND VOCABULARY_GROUP modules, their 'CEFR' level MUST be set to "A1").
        - **Polysemy:** If a word has multiple *distinct* meanings or functions including as different parts of speech (e.g., "book" as a noun and "book" as a verb; "like" as a verb and as an adjective, and as a preposition, and as a conjunction ), you MUST create a "VOCABULARY_GROUP" for it. This "VOCABULARY_GROUP" must contain individual "VOCABULARY" entries for *each* distinct meaning and/or part of speech. If a word has only one primary meaning, create only a single "VOCABULARY" entry directly.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numWords} top-level vocabulary items (including VOCABULARY_GROUPs).
        - **WORD_TYPE and MODULETYPE** Values for 'WORD_TYPE' may only exist for modules with a MODULETYPE of 'VOCABULARY'.That is because a word could have more than one 'WORD_TYPE'.
        - **TITLE:** This field must contain the word exclusively.
        Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "cat",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. The cat sat. 2. The cat purred. 3. I like cats.",
                    "THEME": "General English",
                    "WORD_TYPE": "Noun",
                    "MEANING_ORIGIN": "A carnivorous mammal of the Genus 'Felis'",
            "imagePrompt": "A fluffy cat sitting."
          },
          {
            "TITLE": "set",
            "MODULETYPE": "VOCABULARY_GROUP",
            "CEFR": "A1",
            "DESCRIPTION": "",
                    "
        // --- 1. Construct the sophisticated prompt for Gemini ---
        // ... (previous content of geminiPrompt, including the example JSON structure) ...
        // END OF YOUR PREVIOUS TRUNCATED SECTION


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
			geminiReturnedItemCount = generatedContent.length; // ✨ SET THE COUNT HERE (around Line 367) ✨
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
                    MODULEID_ARRAY: meaningIds,
                    IMAGEURL: "",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(groupId);

            } else if (itemModuleType === "VOCABULARY") {
                 topLevelVocabCount++; // ✨ Increment counter (around Line 458) ✨
                functions.logger.info(`Processing top-level VOCABULARY: "${item.TITLE}".`); // ✨ Add log (around Line 459) ✨
				const vocabId = generateUniqueFirestoreId();
                const vocabRef = firestore.collection('learningContent').doc(vocabId);

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
