import * as functions from 'firebase-functions/v1';
import admin from 'firebase-admin';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

// Ensure this runs only once, even if required in multiple files
// It's good practice to initialize clients outside the function for performance
const textToSpeechClient = new TextToSpeechClient();

/**
 * Purpose: A reusable function to synthesize speech using Google Cloud Text-to-Speech and upload the resulting MP3 to Cloud Storage.
 * This function can handle either a single word with IPA for precise pronunciation
 * or a longer plain text string (up to 200 words or more).
 *
 * @param {string} text - The text string for audio synthesis.
 *                        If `ipaForSsml` is provided, this is the word/syllable to be pronounced.
 *                        Otherwise, this is the full plain text string to convert to audio.
 * @param {string} [ipaForSsml] - OPTIONAL. The IPA string to be used in the SSML <phoneme> tag's ph attribute for precise pronunciation.
 *                                If omitted, `text` will be treated as plain text.
 * @param {string} fileNamePrefix - The base for the MP3 filename (e.g., 'word_title', 'syllable_ipa', 'chapter_segment').
 * @param {string} storagePathPrefix - The folder in Cloud Storage (e.g., 'word_audio/', 'syllable_audio/', 'long_text_audio/').
 * @returns {Promise<string|null>} The publicly accessible URL of the uploaded audio, or null if an error occurred.
 */
// Adding 'export' so other files can import this helper
export async function generateAudioAndUpload(text, ipaForSsml, ttsRespelling, fileNamePrefix, storagePathPrefix) {
    try {
        let input;
        let logMessage; // Fully preserved!

        // Determine if we should use IPA SSML or plain text input
        if (ipaForSsml && ipaForSsml.trim() !== '') {
            // If ipaForSsml is provided and not just empty space, use SSML
            // Use the clean respelling as the inner fallback text if provided [1.1.5]
            const fallbackText = ttsRespelling || text;
            input = {
                ssml: `<speak><phoneme alphabet="ipa" ph="${ipaForSsml}">${fallbackText}</phoneme></speak>`,
            };
            logMessage = `Synthesizing audio for word: "${text}" with IPA: "${ipaForSsml}" (Fallback: "${fallbackText}")`;
        } else {
            // Otherwise, treat 'text' as plain text within ssml wrapper
            input = {
                ssml: text,
            };
            // Log only the beginning of the text for long inputs
            logMessage = `Synthesizing audio for plain text (first 50 chars): "${text.substring(0, 50)}..."`;
        }

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

        // Fully preserved logger call!
        functions.logger.info(logMessage);
        
        const [response] = await textToSpeechClient.synthesizeSpeech({
            input: input,
            voice: voice,
            audioConfig: audioConfig,
        });

        if (!response.audioContent) {
            functions.logger.warn(`No audio content received for the provided text.`);
            return null;
        }

        const bucket = admin.storage().bucket();
        const sanitizedFileNamePrefix = fileNamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_'); 
        const filename = `${storagePathPrefix}${sanitizedFileNamePrefix}_${Date.now()}.mp3`;
        const file = bucket.file(filename);

        functions.logger.info(`Uploading audio to Cloud Storage: ${filename}`);
        await file.save(response.audioContent, {
            contentType: 'audio/mpeg',
            public: true,
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        functions.logger.info(`Audio uploaded successfully: ${publicUrl}`);
        return publicUrl;

    } catch (error) {
        functions.logger.error(`Failed to generate or upload audio for text:`, error);
        return null;
    }
}

