import { getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getGenerativeModel, AgentPlatformBackend, getAI } from 'firebase-admin/ai';
import * as functions from 'firebase-functions/v1';

// Safe-guard Firebase Admin SDK initialization
if (getApps().length === 0) {
    initializeApp();
}

let generativeModelInstance = null;

function getImageGenModel() {
    if (!generativeModelInstance) {
        const vertexAiRegion = 'us-central1'; // Or 'global' depending on model support

        const aiService = getAI(getApp(), {
            backend: new AgentPlatformBackend(vertexAiRegion)
        });

        generativeModelInstance = getGenerativeModel(aiService, {
            model: "gemini-2.0-flash-preview-image-generation", 
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
            },
        });
    }
    return generativeModelInstance;
}


async function processVocabularyImageGeneration(doc) {
    const firestore = getFirestore();
    const storage = getStorage();
    const bucket = storage.bucket(getApp().options.storageBucket);

    const vocabData = doc.data();
    const vocabRef = doc.ref;
    const imagePrompt = vocabData.imagePrompt;
    const vocabId = vocabData.MODULEID;

    if (!imagePrompt || vocabData.MODULETYPE !== "VOCABULARY") {
        functions.logger.info(`Skipping image generation for ${vocabId}: No image prompt or wrong MODULETYPE.`);
        return { id: vocabId, status: 'skipped', reason: 'No image prompt or wrong MODULETYPE' };
    }

    try {
        await vocabRef.update({ imageStatus: 'generating' });
        functions.logger.info(`Processing image for ${vocabId} with prompt: "${imagePrompt}"`);

        const imageGenModel = getImageGenModel();

        const result = await imageGenModel.generateContent({
            contents: [{ parts: [{ text: imagePrompt }] }],
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"]
            }
        });

        const response = result.response;

        const loggableResponse = JSON.parse(JSON.stringify(response));
        if (loggableResponse.candidates && loggableResponse.candidates[0] &&
            loggableResponse.candidates[0].content && loggableResponse.candidates[0].content.parts) {
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

        if (!imagePart) {
            throw new Error("No image data (inlineData) part found in Gemini response.");
        }

        const mimeType = imagePart.inlineData.mimeType;
        const imageDataBase64 = imagePart.inlineData.data;
        const imageDataBuffer = Buffer.from(imageDataBase64, 'base64');

        const fileExtension = mimeType.split('/')[1] || 'png';
        const filePath = `vocabulary_images/${vocabId}.${fileExtension}`;
        const file = bucket.file(filePath);

        await file.save(imageDataBuffer, {
            metadata: {
                contentType: mimeType,
            },
        });

        await file.makePublic();
        const publicUrl = file.publicUrl();

        await vocabRef.update({
            IMAGEURL: publicUrl,
            imageStatus: 'completed',
            updatedAt: FieldValue.serverTimestamp(),
        });
        functions.logger.info(`Successfully generated and uploaded image for ${vocabId}. URL: ${publicUrl}`);
        return { id: vocabId, status: 'completed', url: publicUrl };
    }
    catch (imgError) {
        await vocabRef.update({
            imageStatus: 'failed',
            updatedAt: FieldValue.serverTimestamp(),
        });
        functions.logger.error(`Failed to generate or upload image for ${vocabId}:`, imgError);
        return { id: vocabId, status: 'failed', error: imgError.message };
    }
}

export { getImageGenModel, processVocabularyImageGeneration };
