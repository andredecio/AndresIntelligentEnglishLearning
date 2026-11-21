import * as functions from 'firebase-functions/v1';
import { getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import pRetry, { AbortError } from 'p-retry';
import { getImageGenModel } from '../helpers/gemini.js';

// Safe-guard Firebase Admin SDK initialization
if (getApps().length === 0) {
    initializeApp();
}

async function processModuleImageGeneration(doc) {
    const firestore = getFirestore();
    const storage = getStorage();
    const bucket = storage.bucket(getApp().options.storageBucket);

    const moduleData = doc.data();
    const moduleRef = doc.ref;
    const imagePrompt = moduleData.imagePrompt;
    const moduleId = moduleData.MODULEID;

    try {
        await moduleRef.update({ imageStatus: 'generating' });
        functions.logger.info(`Processing image for ${moduleId} with prompt: "${imagePrompt}"`);

        const imageGenerationModel = getImageGenModel();

        // --- DIAGNOSTIC LOGGING FOR p-retry ---
        functions.logger.info(`Diagnostic (pRetry): Type of pRetry variable: ${typeof pRetry}`);
        if (typeof pRetry === 'object' && pRetry !== null) {
            functions.logger.info(`Diagnostic (pRetry): pRetry.default exists: ${typeof pRetry.default}`);
            functions.logger.info(`Diagnostic (pRetry): pRetry.AbortError exists: ${typeof pRetry.AbortError}`);
        }
        // --- END DIAGNOSTIC LOGGING FOR p-retry ---

        // CRITICAL CHANGE: Call pRetry as the function
        const result = await pRetry(async () => {
            try {
                // IMPORTANT: Now using generateContent(), as imageGenerationModel is a GenerativeModel
                const generativeResponse = await imageGenerationModel.generateContent(imagePrompt);
                return generativeResponse;
            } catch (error) {
                const errorCode = error.code || (error.cause && error.cause.code) || null;
                const errorMessage = error.message || (error.cause && error.cause.message) || 'Unknown error';

                // --- ESSENTIAL NEW LOGGING FOR DEBUGGING HTTP ERRORS ---
                functions.logger.error(`Vertex AI API Error for ${moduleId}:`, {
                    message: errorMessage,
                    errorCode: errorCode,
                    rawResponseContent: error.response?.text || error.details || (errorMessage.includes('<!DOCTYPE') ? errorMessage : null),
                    fullErrorObject: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
                    stack: error.stack,
                });

                if (typeof error.response?.text === 'string' && error.response.text.startsWith('<!DOCTYPE html>')) {
                    functions.logger.error(`Detected HTML response body from Vertex AI, indicating an API error page for ${moduleId}.`);
                } else if (typeof error.details === 'string' && error.details.startsWith('<!DOCTYPE html>')) {
                     functions.logger.error(`Detected HTML in error.details from Vertex AI, indicating an API error page for ${moduleId}.`);
                }

                if (errorCode === 429 || errorCode === 500 || errorCode === 503) {
                    functions.logger.warn(`Transient error (code: ${errorCode}) during image generation for ${moduleId}. Retrying...`);
                    throw error;
                } else if (errorCode === 404 && (errorMessage.includes('not found') || errorMessage.includes('Invalid Endpoint name'))) {
                    functions.logger.error(`Permanent model not found or invalid endpoint error (code: ${errorCode}) for image generation for ${moduleId}. Aborting retries. Error: ${errorMessage}`);
                    throw new AbortError(error);
                } else if (errorCode === 400 && errorMessage.includes('Invalid Endpoint name')) {
                    functions.logger.error(`Permanent configuration error (code: ${errorCode}) during image generation for ${moduleId}. Aborting retries. Error: ${errorMessage}`);
                    throw new AbortError(error);
                } else {
                    functions.logger.error(`Permanent error (code: ${errorCode}) during image generation for ${moduleId}. Aborting retries. Error: ${errorMessage}`);
                    throw new AbortError(error);
                }
            }
        }, {
            retries: 5,
            minTimeout: 2000,
            maxTimeout: 20 * 1000,
            factor: 2,
            onFailedAttempt: error => {
                functions.logger.warn(`p-retry: Attempt ${error.attemptNumber} failed for image generation for ${moduleId}. Remaining retries: ${error.retriesLeft}. Delaying for ${error.delay}ms.`);
            }
        });

        functions.logger.info('Generative AI Image Gen Raw Response (Full):', JSON.stringify(result, null, 2));

        const responseCandidates = result.response?.candidates;

		if (!responseCandidates || responseCandidates.length === 0 || !responseCandidates[0].content || !responseCandidates[0].content.parts || responseCandidates[0].content.parts.length === 0) {
			throw new Error("No candidates or content parts found in Generative AI response.");
		}

        const imagePart = responseCandidates[0].content.parts.find(part => part.inlineData && part.inlineData.data);

        if (!imagePart) {
            throw new Error("No image data (inlineData) part found in Generative AI response.");
        }

        const mimeType = imagePart.inlineData.mimeType;
        const imageDataBase64 = imagePart.inlineData.data;
        const imageDataBuffer = Buffer.from(imageDataBase64, 'base64');

        const fileExtension = mimeType.split('/')[1] || 'png';
        const filePath = `module_images/${moduleId}.${fileExtension}`;
        const file = bucket.file(filePath);

        await file.save(imageDataBuffer, {
            metadata: {
                contentType: mimeType,
            },
        });

        await file.makePublic();
        const publicUrl = file.publicUrl();

        await moduleRef.update({
            IMAGEURL: publicUrl,
            imageStatus: 'completed',
            updatedAt: FieldValue.serverTimestamp(),
        });
        functions.logger.info(`Successfully generated and uploaded image for ${moduleId}. URL: ${publicUrl}`);
        return { id: moduleId, status: 'completed', url: publicUrl };
    }
    catch (imgError) {
        await moduleRef.update({
            imageStatus: 'failed',
            updatedAt: FieldValue.serverTimestamp(),
        });
        functions.logger.error(`Failed to generate or upload image for ${moduleId}:`, imgError);
        throw imgError;
    }
}

export { processModuleImageGeneration };
