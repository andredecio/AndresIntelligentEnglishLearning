import { getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as functions from 'firebase-functions/v1';
import { getImageGenModel } from './gemini.js';


// Safe-guard Firebase Admin SDK initialization
if (getApps().length === 0) {
    initializeApp();
}

async function processVocabularyImageGeneration(doc) {
    const firestore = getFirestore();
    const storage = getStorage();
    const bucket = storage.bucket(getApp().options.storageBucket);

    const vocabData = doc.data();
    const vocabRef = doc.ref;
    const imagePrompt = vocabData.imagePrompt;
    const vocabId = vocabData.MODULEID;

    // Skip if there's no image prompt or if it's not a VOCABULARY type (though this should be filtered by query/trigger)
    if (!imagePrompt || vocabData.MODULETYPE !== "VOCABULARY") {
        functions.logger.info(`Skipping image generation for ${vocabId}: No image prompt or wrong MODULETYPE.`);
        return { id: vocabId, status: 'skipped', reason: 'No image prompt or wrong MODULETYPE' };
    }

    try { 
        // Mark status as 'generating' immediately.
        // This prevents other concurrent invocations from trying to process the same image.
        await vocabRef.update({ imageStatus: 'generating' });
        functions.logger.info(`Processing image for ${vocabId} with prompt: "${imagePrompt}"`);

        const imageGenModel = getImageGenModel(); // Get the Gemini image generation model

        // Generate content (image) using Gemini

		const result = await imageGenModel.generateContent(imagePrompt);


        // The image data is usually found within the `candidates` array.
        // It's typically base64 encoded and needs to be decoded.
        const response = result.response;

        //  Update log sanitization to dynamically find the image part
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
        functions.logger.info('Gemini Image Gen Raw Response (Sanitized):', JSON.stringify(loggableResponse, null, 2));
        const candidates = response.candidates;

        if (!candidates || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || candidates[0].content.parts.length === 0) {
            throw new Error("No candidates or content parts found in Gemini response.");
        }

        const imagePart = candidates[0].content.parts.find(part => part.inlineData && part.inlineData.data);

        if (!imagePart) { // this check directly after finding the imagePart
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
            updatedAt: FieldValue.serverTimestamp(),
        });
        functions.logger.info(`Successfully generated and uploaded image for ${vocabId}. URL: ${publicUrl}`);
        return { id: vocabId, status: 'completed', url: publicUrl };
    } 
    catch (imgError) {
        // If image generation or upload fails for this item, mark its status as 'failed'
        await vocabRef.update({
            imageStatus: 'failed',
            updatedAt: FieldValue.serverTimestamp(),
        });
        functions.logger.error(`Failed to generate or upload image for ${vocabId}:`, imgError);
        return { id: vocabId, status: 'failed', error: imgError.message };
    }
}

export { processVocabularyImageGeneration };
