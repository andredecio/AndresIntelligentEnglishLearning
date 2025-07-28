// This function will be triggered upon successful completion of generateVocabularyContent
// to catch any remaining pending vocabulary items for image generation.
// --- CHANGE: Changed from pubsub.schedule to https.onCall, and added .runWith() for timeout. ---

const functions = require("firebase-functions/v1");
const admin = require('firebase-admin'); 
const { processVocabularyImageGeneration } = require('../helpers/processVocabularyImageGeneration');

const batchGenerateVocabularyImages = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 })
    .pubsub.schedule('0 0 1 1 *') // This sets the schedule!
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

module.exports = { batchGenerateVocabularyImages };
