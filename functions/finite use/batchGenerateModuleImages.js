// to catch any remaining pending items for image generation. Should be used to change image for any
// chosen document in learningContent with an image prompt

const functions = require("firebase-functions/v1");
const admin = require('firebase-admin'); 
const { processModuleImageGeneration } = require('../helpers/processModuleImageGeneration');

const batchGenerateModuleImages = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 })
    .pubsub.schedule('0 0 1 1 *') // This sets the schedule!
    .onRun(async (context) => {
	const firestore = admin.firestore();

    functions.logger.info('Starting batch image generation for pending module items via forced submit .'); // UPDATED LOG MESSAGE

    try {
        // Query for module items that are pending image generation
        // --- CHANGE: Limit increased to 100 . ---
        const pendingModuleSnapshot = await firestore.collection('learningContent')
            .where('imageStatus', '==', 'pending')
			.where('MODULETYPE', 'in', ['VOCABULARY', 'GRAMMAR', 'CONVERSATION'])
            .where('imagePrompt', '!=', '')
            .limit(100) // Process a manageable batch at a time
            .get();

        if (pendingModuleSnapshot.empty) {
            functions.logger.info('No pending module items found for batch image generation.');
            return null;
        }

        const imageGenerationPromises = [];

        for (const doc of pendingModuleSnapshot.docs) {
            // Add the image generation process to a list of promises, using the reusable helper
            imageGenerationPromises.push(processModuleImageGeneration(doc));
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
}) // This closes the exports.batchGenerateModuleImages function definition

module.exports = { batchGenerateModuleImages };
