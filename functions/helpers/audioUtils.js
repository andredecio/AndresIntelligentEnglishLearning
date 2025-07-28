
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const textToSpeechClient = new TextToSpeechClient(); 


async function generateAudioAndUpload(text, ipaForSsml, fileNamePrefix, storagePathPrefix) {
    try {
        const input = {
            ssml: `<speak><phoneme alphabet="ipa" ph="${ipaForSsml}">${text}</phoneme></speak>`,
            // You can also use just 'text: text' if IPA SSML is not desired for some cases
        };

        const voice = {
            languageCode: 'en-GB', // Consistent language code
            name: 'en-GB-Neural2-A', // Consistent voice configuration
            ssmlGender: 'FEMALE', // Or 'NEUTRAL', 'MALE'
        };

        const audioConfig = {
            audioEncoding: 'MP3',
            pitch: 0,
            speakingRate: 1,
        };

        functions.logger.info(`Synthesizing audio for text: "${text}" with IPA: "${ipaForSsml}"`);
        // The 'textToSpeechClient' is already initialized globally in your file, so it's directly available here.
        const [response] = await textToSpeechClient.synthesizeSpeech({
            input: input,
            voice: voice,
            audioConfig: audioConfig,
        });

        if (!response.audioContent) {
            functions.logger.warn(`No audio content received for "${text}".`);
            return null;
        }

        const bucket = admin.storage().bucket();
        const filename = `${storagePathPrefix}${fileNamePrefix}_${Date.now()}.mp3`;
        const file = bucket.file(filename);

        functions.logger.info(`Uploading audio to Cloud Storage: ${filename}`);
        await file.save(response.audioContent, {
            contentType: 'audio/mpeg',
            public: true, // Make the file publicly accessible
        });

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
        functions.logger.info(`Audio uploaded successfully: ${publicUrl}`);
        return publicUrl;

    } catch (error) {
        functions.logger.error(`Failed to generate or upload audio for "${text}":`, error);
        return null;
    }
}

module.exports = { generateAudioAndUpload };

