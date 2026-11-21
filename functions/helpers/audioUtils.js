import { logger } from 'firebase-functions/v1';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

// Safeguard Firebase Admin SDK initialization
if (getApps().length === 0) {
    initializeApp();
}

const textToSpeechClient = new TextToSpeechClient(); 

/**
 * Synthesizes speech from text and IPA SSML, then uploads the generated MP3 to Cloud Storage.
 */
export async function generateAudioAndUpload(text, ipaForSsml, fileNamePrefix, storagePathPrefix) {
    try {
        const input = {
            ssml: `<speak><phoneme alphabet="ipa" ph="${ipaForSsml}">${text}</phoneme></speak>`,
        };

        const voice = {
            languageCode: 'en-GB', 
            name: 'en-GB-Neural2-A', 
            ssmlGender: 'FEMALE', 
        };

        const audioConfig = {
            audioEncoding: 'MP3',
            pitch: 0,
            speakingRate: 1,
        };

        logger.info(`Synthesizing audio for text: "${text}" with IPA: "${ipaForSsml}"`);
        
        const [response] = await textToSpeechClient.synthesizeSpeech({
            input: input,
            voice: voice,
            audioConfig: audioConfig,
        });

        if (!response.audioContent) {
            logger.warn(`No audio content received for "${text}".`);
            return null;
        }

        // Using modular getStorage() instead of legacy admin.storage()
        const bucket = getStorage().bucket();
        const filename = `${storagePathPrefix}${fileNamePrefix}_${Date.now()}.mp3`;
        const file = bucket.file(filename);

        logger.info(`Uploading audio to Cloud Storage: ${filename}`);
        await file.save(response.audioContent, {
            contentType: 'audio/mpeg',
            public: true, 
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        logger.info(`Audio uploaded successfully: ${publicUrl}`);
        return publicUrl;

    } catch (error) {
        logger.error(`Failed to generate or upload audio for "${text}":`, error);
        return null;
    }
}
