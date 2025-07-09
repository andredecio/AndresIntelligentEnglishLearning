// functions/index.js Modified today 9/7/25 at 21.17

// --- 1. Module Imports ---
const functions = require("firebase-functions/v1"); // Main Firebase Functions module MUST BE V1.
const admin = require('firebase-admin'); // Firebase Admin SDK
// IMPORTANT: Import Schema alongside GoogleGenerativeAI
//const { GoogleGenerativeAI, Schema } = require('@google/generative-ai'); // Google Generative AI SDK (Gemini)
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Core Google Generative AI SDK (Gemini)
const { Schema } = require('@firebase/ai'); // Firebase AI SDK for Schema ONLY

// --- 2. Firebase Admin SDK Initialization ---
// Initialize the Firebase Admin SDK once at the top level.
// This is the recommended practice for Cloud Functions.
admin.initializeApp();

// --- 3. Lazy Initialization for Gemini Models and Schema Definition ---
// These variables will hold our Gemini client and models.
// They are initialized only when a function that needs them is first invoked
// to prevent "timeout during initialization" errors during deployment.
let _genAIClient;
let _textGenModel;

// Define the expected JSON schema for vocabulary content.
// This is super important! It guides Gemini to produce output that perfectly matches your data structure.
// Define the expected JSON schema for vocabulary content.
const vocabularySchema = Schema.array({
    items: Schema.object({
        properties: {
            TITLE: Schema.string(),
            CEFR: Schema.string(),
            DESCRIPTION: Schema.string(),
            THEME: Schema.enumString({ enum: ['General English'] }),
            MODULETYPE: Schema.string(), // Expected: "VOCABULARY" or "VOCABULARY_GROUP"
            WORD_TYPE: Schema.enumString({ enum: ['Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Interjection', 'Article', 'Determiner'] }), // <--- ADD THIS
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
						WORD_TYPE: Schema.enumString({ enum: ['Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Interjection', 'Article', 'Determiner'] }), // <--- ADD THIS
						MEANING_ORIGIN: Schema.string(), 
                        imagePrompt: Schema.string(),
                    },
                    // Ensure WORD_TYPE is in the required list for nested vocabulary
                    required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN", "imagePrompt"], 
                     // *** ADD PROPERTY ORDERING FOR NESTED VOCABULARY ITEMS ***
                    propertyOrdering: [
                        "MODULETYPE",
                        "TITLE",
                        "DESCRIPTION",						
                        "WORD_TYPE",
                        "CEFR",
                        "THEME",
						"MEANING_ORIGIN",
                        "imagePrompt"
                    ]               
				}),
            }),
        },
        // Ensure WORD_TYPE is in the required list for top-level vocabulary
        required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN"], 
        optionalProperties: ["imagePrompt", "items"],
                     // *** ADD PROPERTY ORDERING FOR NESTED VOCABULARY ITEMS *** 
                    propertyOrdering: [
                        "MODULETYPE",
                        "TITLE",
                        "DESCRIPTION",						
                        "WORD_TYPE",
                        "CEFR",
                        "THEME",
						"MEANING_ORIGIN",
                        "imagePrompt",
						"items"         // This is optional for VOCABULARY
					]
    }),
});


// Helper function to get or create the Gemini text generation model instance
function getTextGenModel() {
    if (!_textGenModel) {
        // Re-introduce API key retrieval for direct GoogleGenerativeAI client
        const GEMINI_API_KEY = functions.config().gemini.api_key;
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is not configured. Run 'firebase functions:config:set gemini.api_key=\"YOUR_KEY\"' and redeploy.");
        }
        _genAIClient = new GoogleGenerativeAI(GEMINI_API_KEY); // Initialize GoogleGenerativeAI directly
        _textGenModel = _genAIClient.getGenerativeModel({ // Get model from _genAIClient
            model: "gemini-1.5-flash", // Keep your preferred Gemini model
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: vocabularySchema,
            }
        });
    }
    return _textGenModel;
}

/*
// Placeholder for a potential image generation model.
// Uncomment and implement if you use a specific Gemini model for text-to-image or image understanding.
function getImageGenModel() {
    if (!_imageGenModel) {
        const GEMINI_API_KEY = functions.config().gemini.api_key;
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is not configured.");
        }
        _genAIClient = _genAIClient || new GoogleGenerativeAI(GEMINI_API_KEY); // Ensure client is initialized
        _imageGenModel = _genAIClient.getGenerativeModel({ model: "gemini-pro-vision" }); // Example vision model
    }
    return _imageGenModel;
}
*/


// --- 4. Helper Functions (General Purpose) ---

// Helper Function to generate new, unique Firestore Document IDs
// This doesn't write to Firestore, just creates an ID string for use as a document ID.
const generateUniqueFirestoreId = () => admin.firestore().collection('learningContent').doc().id;

// Helper Function to normalize titles for consistent lookup (e.g., for deduplication)
const normalizeTitle = (title) => {
    return title.toLowerCase().trim();
};

//Part 2 from here:
// --- 5. Existing: Mark User as Deleted Function ---
// This function is triggered when a user is deleted from Firebase Authentication.
// It marks their corresponding Firestore document as deleted rather than removing it.
const handleUserDeletion = async (userRecord) => {
    const db = admin.firestore(); // Get Firestore instance from the initialized admin app

    const userId = userRecord.uid;
    const userEmail = userRecord.email;

    functions.logger.log(`Auth user deletion detected for UID: ${userId}, Email: ${userEmail || 'N/A'}.`);

    const userDocRef = db.collection("users").doc(userId); // Reference to the user's document in 'users' collection

    try {
        const docSnapshot = await userDocRef.get(); // Check if the document exists

        if (docSnapshot.exists) {
            // If it exists, update it to mark as deleted
            await userDocRef.update({
                isDeleted: true,
                deletedAt: admin.firestore.FieldValue.serverTimestamp(), // Firestore server timestamp
            });
            functions.logger.log(`Firestore document for user ${userId} successfully marked as deleted. All data retained.`);
            return { status: "success", message: `Document for ${userId} marked as deleted, data retained.` };
        } else {
            // If the document doesn't exist, no action is needed
            functions.logger.log(`Firestore document for UID ${userId} not found. No marking needed as no data exists to retain.`);
            return { status: "success", message: `No document found for ${userId}.` };
        }
    } catch (error) {
        // Log and throw an error if the update fails
        functions.logger.error(`Error marking user ${userId} as deleted in Firestore:`, error);
        // Re-throw as a generic Error; for background triggers, a re-thrown error indicates failure.
        throw new Error(`Failed to mark user as deleted: ${error.message}`);
    }
};

// Export the function trigger for user deletion
exports.markUserAsDeletedInFirestore = functions.region('asia-southeast1').auth.user().onDelete(handleUserDeletion);

// --- 6. generateVocabularyContent Callable Function ---
// This function is called from your AdminSystem webpage to generate new vocabulary content using Gemini.
exports.generateVocabularyContent = functions.region('asia-southeast1').https.onCall(async (data, context) => {

    // --- Security Check (Crucial for Admin Functions) ---
    // Ensure the caller is authenticated.
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    // Check for the 'admin: true' custom claim. Only users with this claim can proceed.
    if (!context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Only authorized administrators can perform this action.');
    }
    // --- End Security Check ---

    const { cefrLevel, numWords, theme } = data; // Destructure inputs from the frontend

    // Basic input validation
    if (!cefrLevel || !numWords || !theme || numWords <= 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Words, and Theme are required and must be valid.'
        );
    }

    functions.logger.info(`AdminSystem: Starting content generation for CEFR: ${cefrLevel}, Words: ${numWords}, Theme: ${theme}`);

    // Get the Gemini text generation model instance inside the function (lazy initialization)
    const textGenModel = getTextGenModel();

    const firestore = admin.firestore(); // Get Firestore instance
    const batch = firestore.batch(); // Create a Firestore write batch for efficiency and atomicity
    const createdModuleIds = []; // List to store IDs of newly created modules
    let numSkipped = 0; // Counter for skipped (duplicate) modules

    try {
        // --- 1. Construct the sophisticated prompt for Gemini ---
        // This prompt instructs Gemini on the desired structure and content rules.
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
        - **CEFR Hierarchy:** fOR All VOCABULARY AND VOCABULARY_GROUP modules, their 'CEFR' level MUST be set to "A1").
		- **Polysemy:** If a word has multiple *distinct* meanings or functions including as different parts of speech (e.g., "book" as a noun and "book" as a verb; "like" as a verb and as an adjective, and as a preposition, and as a conjunction ), you MUST create a "VOCABULARY_GROUP" for it. This "VOCABULARY_GROUP" must contain individual "VOCABULARY" entries for *each* distinct meaning and/or part of speech. If a word has only one primary meaning, create only a single "VOCABULARY" entry directly. // <--- Strengthened instruction        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text. (This is now strongly enforced by \`responseMimeType\` and \`responseSchema\` in \`getTextGenModel()\`).
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
			"THEME": "General English"
			"WORD_TYPE": "Noun", 
			"MEANING_ORIGIN": "A carnivorous mammal of the Genus 'Felis'"
            "imagePrompt": "A fluffy cat sitting."
          },
          {
            "TITLE": "set",
            "MODULETYPE": "VOCABULARY_GROUP",
            "CEFR": "A1",
            "DESCRIPTION": ""
			"THEME": "General English"
			"MEANING_ORIGIN": "Origin from Old English; 'settan' meaning 'to cause to sit', 'to place', or 'to fix.'"
	
            "items": [
              {
                "TITLE": "set",
                "MODULETYPE": "VOCABULARY",
                "CEFR": "A1",
                "DESCRIPTION": "1. He set the book on the table. 2. Set your glass here. 3. I set the alarm.",
				"THEME": "General English" 
				"WORD_TYPE": "Verb", 
				"MEANING_ORIGIN": "to place"
				"imagePrompt": "A hand placing a book on a table."
              },
              {
                "TITLE": "set",
                "MODULETYPE": "VOCABULARY",
                "CEFR": "A1",
                "DESCRIPTION": "1. I bought a set of tools. 2. A chess set. 3. This is a complete set.",
				"THEME": "General English"
				"WORD_TYPE": "Noun", 
				"MEANING_ORIGIN": "a group"
				"imagePrompt": "A collection of shiny tools."
              }
            ]
          }
        ]
        `;

        const result = await textGenModel.generateContent(geminiPrompt); // Call Gemini API
        const response = await result.response;
        // With responseMimeType: "application/json" and responseSchema set, response.text()
        // should now reliably return pure, valid JSON string.
        const text = response.text();

        let generatedContent;
        try {
            // Directly parse the text. No need for regex to strip markdown blocks anymore!
            generatedContent = JSON.parse(text);
        } catch (parseError) {
            // Log and throw an error if JSON parsing fails
            functions.logger.error("Failed to parse Gemini output as JSON:", { rawText: text, error: parseError });
            throw new functions.https.HttpsError('internal', 'AI generation failed: Invalid JSON output from Gemini.', { rawResponse: text, parseError: parseError.message });
        }

        // --- 2. Process Generated Content and Write to Firestore (with Deduplication) ---
        for (const item of generatedContent) {
            // Determine the module type (default to VOCABULARY if not explicitly provided by Gemini, though schema should prevent this)
            const itemModuleType = item.MODULETYPE || 'VOCABULARY';
            const itemNormalizedTitle = normalizeTitle(item.TITLE); // Normalize title for consistent lookups

            // Deduplication: Check against both 'VOCABULARY' and 'VOCABULARY_GROUP' types
            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['VOCABULARY', 'VOCABULARY_GROUP']) // Check both top-level types
                .where('normalizedTitle', '==', itemNormalizedTitle) // Match on the normalized title
                .limit(1) // We only need to know if *any* document with this title exists
                .get();

            if (!existingContentSnapshot.empty) {
                // If a document with this normalized title (as a VOCABULARY or VOCABULARY_GROUP type) already exists, skip adding it.
                functions.logger.info(`Skipping "${item.TITLE}" (${itemModuleType}) as a record with this title already exists.`);
                numSkipped++;
                continue; // Move to the next item in Gemini's generated content
            }
			
//Part 3 starts here:
            // --- If the item is NOT skipped, process it and add to the Firestore batch ---
            if (itemModuleType === "VOCABULARY_GROUP") {
                // Handle VOCABULARY_GROUP type
                const groupId = generateUniqueFirestoreId(); // Generate a unique ID for the group
                const groupRef = firestore.collection('learningContent').doc(groupId); // Document reference

                const meaningIds = []; // Array to hold IDs of nested VOCABULARY meanings

                // Process individual meaning items within the VOCABULARY_GROUP
                if (Array.isArray(item.items)) {
                    for (const meaning of item.items) {
                        // Ensure the nested item is actually a VOCABULARY type (schema should enforce this)
                        if (meaning.MODULETYPE === "VOCABULARY") {
                            const vocabId = generateUniqueFirestoreId(); // Generate ID for nested vocabulary
                            const vocabRef = firestore.collection('learningContent').doc(vocabId);

                            // Add the nested VOCABULARY document to the batch
                            batch.set(vocabRef, {
                                MODULEID: vocabId,
                                MODULETYPE: "VOCABULARY",
                                TITLE: meaning.TITLE,
                                normalizedTitle: normalizeTitle(meaning.TITLE), // Add normalized title to nested vocab
                                CEFR: meaning.CEFR,
                                DESCRIPTION: meaning.DESCRIPTION,
                                imagePrompt: meaning.imagePrompt, // Needed for later image generation
                                THEME: meaning.THEME,
								WORD_TYPE: meaning.WORD_TYPE, 
								MEANING_ORIGIN: meaning.MEANING_ORIGIN, 
                                IMAGEURL: "", // Placeholder for image URL
                                imageStatus: "pending", // Mark for batch image generation
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            meaningIds.push(vocabId); // Add its ID to the group's list
                        } else {
                            functions.logger.warn(`Unexpected module type found in VOCABULARY_GROUP items: ${meaning.MODULETYPE}. Skipping nested item.`);
                        }
                    }
                }

                // Add the VOCABULARY_GROUP document itself to the batch
                batch.set(groupRef, {
                    MODULEID: groupId,
                    MODULETYPE: "VOCABULARY_GROUP",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle, // Add normalized title to the group document
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION, // Origin description
                    THEME: item.THEME,
					WORD_TYPE: item.WORD_TYPE, 
					MEANING_ORIGIN: item.MEANING_ORIGIN,
                    MODULEID_ARRAY: meaningIds, // Link to its nested meanings
                    IMAGEURL: "", // Not typically used for groups, but keep consistent for now
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(groupId); // Add group ID to the list of created modules

            } else if (itemModuleType === "VOCABULARY") {
                // Handle single VOCABULARY items
                const vocabId = generateUniqueFirestoreId();
                const vocabRef = firestore.collection('learningContent').doc(vocabId);

                // Add the single VOCABULARY document to the batch
                batch.set(vocabRef, {
                    MODULEID: vocabId,
                    MODULETYPE: "VOCABULARY",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle, // Add normalized title to single vocab document
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION, // The 3 sentences
                    imagePrompt: item.imagePrompt, // Essential for later image generation
                    THEME: item.THEME,
					WORD_TYPE: item.WORD_TYPE, 
					MEANING_ORIGIN: item.MEANING_ORIGIN,
                    IMAGEURL: "", // Placeholder for batch image generation
                    imageStatus: "pending", // Mark for batch image generation
                    MODULEID_ARRAY: [], // Not used for single vocabulary, but keep consistent field
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(vocabId);

            } else {
                // For any other unexpected top-level module types that Gemini might incorrectly generate, log a warning
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        // Commit all batched writes to Firestore
        await batch.commit();

        functions.logger.info(`Successfully created ${createdModuleIds.length} new vocabulary-related modules. Skipped ${numSkipped} duplicates.`);
        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds // Return the IDs of what was actually created
        };

    } catch (error) {
        // Log and re-throw any errors as HTTPS errors to be sent back to the client
        functions.logger.error("Error generating or saving content:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error; // Re-throw our custom HttpsError
        }
        // Catch any other unexpected errors and convert them to a generic HTTPS error
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
});

//Part 4 starts here:
//  This should be 4 of 4 now): batchGenerateVocabularyImages Scheduled Function and final export freezing

// --- 7. batchGenerateVocabularyImages Scheduled Function ---
// This function will be triggered periodically (e.g., every 30 minutes)
// to generate images for pending vocabulary items.
// You will need to implement the actual image generation logic here
// (e.g., calling another AI API for text-to-image generation, as Gemini-Pro is text-to-text).
exports.batchGenerateVocabularyImages = functions.region('asia-southeast1').pubsub.schedule('every 30 minutes').onRun(async (context) => {

    const firestore = admin.firestore(); // Get Firestore instance
    const storage = admin.storage(); // Get Cloud Storage instance
    // Get your default storage bucket. Ensure your project has one configured.
    const bucket = storage.bucket(admin.app().options.storageBucket);

    functions.logger.info('Starting batch image generation for pending vocabulary items.');

    try {
        // Query for VOCABULARY items that are pending image generation
        const pendingVocabSnapshot = await firestore.collection('learningContent')
            .where('MODULETYPE', '==', 'VOCABULARY')
            .where('imageStatus', '==', 'pending')
            .limit(20) // Process a manageable batch at a time to avoid timeouts or excessive resource usage
            .get();

        if (pendingVocabSnapshot.empty) {
            functions.logger.info('No pending vocabulary items found for image generation.');
            return null; // Exit early if nothing to process
        }

        const imageGenerationPromises = []; // Array to hold promises for each image generation task
        const updateBatch = firestore.batch(); // Create a new Firestore batch for updates from this function

        for (const doc of pendingVocabSnapshot.docs) {
            const vocabData = doc.data();
            const vocabRef = doc.ref; // Document reference to update later
            const imagePrompt = vocabData.imagePrompt;
            const vocabId = vocabData.MODULEID;

            // Mark status as 'generating' immediately. This prevents other concurrent function invocations
            // from trying to process the same image if you scale up.
            await vocabRef.update({ imageStatus: 'generating' });
            functions.logger.info(`Processing image for ${vocabId} with prompt: "${imagePrompt}"`);

            // Add the image generation and upload process to a list of promises
            imageGenerationPromises.push(async () => {
                try {
                    // --- PLACEHOLDER FOR ACTUAL IMAGE GENERATION LOGIC ---
                    // This is the CRITICAL part you need to implement.
                    // You will likely use a different AI API for text-to-image generation.
                    // Examples include:
                    // 1. Google Cloud's Vertex AI Image Generation (Imagen models)
                    // 2. OpenAI's DALL-E API
                    // 3. Stability AI's Stable Diffusion API
                    // 4. Other services like Midjourney (though often not direct API)

                    // You would make an API call to your chosen image generation service here.
                    // const imageResult = await YOUR_IMAGE_GEN_SERVICE.generate({ prompt: imagePrompt });
                    // const imageDataBuffer = imageResult.imageData; // Assuming this returns image data as a Buffer

                    // --- SIMULATED IMAGE GENERATION AND UPLOAD ---
                    // For demonstration, we'll simulate success/failure and dummy image data.
                    // REPLACE THIS WITH REAL IMAGE DATA FROM YOUR AI SERVICE!
                    const dummyImageDataBuffer = Buffer.from("simulated_image_data_for_" + vocabId + Date.now(), 'utf8'); // Just some dummy data
                    const filePath = `vocabulary_images/${vocabId}.png`; // Path in Cloud Storage bucket
                    const file = bucket.file(filePath);

                    // Upload the generated image data to Cloud Storage
                    await file.save(dummyImageDataBuffer, {
                        metadata: {
                            contentType: 'image/png', // IMPORTANT: Adjust content type based on actual image format
                        },
                    });

                    // Make the file publicly accessible. This generates a public URL.
                    // BE CAREFUL: Public files are accessible by anyone with the URL.
                    // Consider signed URLs for more secure access if needed in your app.
                    await file.makePublic();
                    const publicUrl = file.publicUrl();

                    // Update the Firestore document with the image URL and mark as completed
                    updateBatch.update(vocabRef, {
                        IMAGEURL: publicUrl,
                        imageStatus: 'completed',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    functions.logger.info(`Successfully generated and uploaded image for ${vocabId}. URL: ${publicUrl}`);
                    return { id: vocabId, status: 'completed', url: publicUrl }; // Return result for logging

                } catch (imgError) {
                    // If image generation or upload fails for this item, mark its status as 'failed'
                    updateBatch.update(vocabRef, {
                        imageStatus: 'failed',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    functions.logger.error(`Failed to generate or upload image for ${vocabId}:`, imgError);
                    return { id: vocabId, status: 'failed', error: imgError.message }; // Return error for logging
                }
            });
        }

        // Run all image generation and upload promises concurrently using Promise.all
        // This will wait for all individual image tasks in the batch to complete.
        const results = await Promise.all(imageGenerationPromises.map(p => p()));

        // Commit all Firestore updates (successful or failed image generations)
        await updateBatch.commit();

        functions.logger.info('Batch image generation completed. Results:', results);
        return { status: "success", results: results };

    } catch (error) {
        // Catch any errors that occur during the overall batch process (e.g., Firestore query failures)
        functions.logger.error("Error in batch image generation process:", error);
        throw error; // Re-throw the error to indicate function failure in Cloud Functions logs
    }
});


// --- 8. Freeze Exports ---
// This prevents accidental modifications to the exports object during runtime,
// ensuring a stable execution environment for all exported functions.
// This line should be the very last line in your functions/index.js file.
Object.freeze(exports);


