/**
 * Helper function to process image generation and upload for a single vocabulary item.
 * This function is designed to be reusable by both the Firestore onCreate trigger
 * and the scheduled batch function.
 * @param {admin.firestore.DocumentSnapshot} doc - The Firestore DocumentSnapshot of the vocabulary item.
 */
const admin = require('firebase-admin');
const functions = require('firebase-functions/v1');


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

module.exports = { processVocabularyImageGeneration };
