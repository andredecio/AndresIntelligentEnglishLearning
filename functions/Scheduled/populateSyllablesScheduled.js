// --- NEW: Scheduled Function to populate the Syllables Collection from an external json file. ---
// This function can be triggered manually from the Firebase Console (Functions -> 'populateSyllablesScheduled' -> Trigger Now)
// It will run automatically once a year (Jan 1st), but you'll primarily trigger it manually for one-time setup.
 
import * as functions from 'firebase-functions/v1';
import { regionalFunctions } from "../config.js"; // <--- ADD THIS LINE!
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { getPhonemeIDsFromSyllableIPA } from '../helpers/ipaUtils.js';

// --- Initialize Firebase Admin Safely ---
if (getApps().length === 0) {
    initializeApp();
}

export const populateSyllablesScheduled = regionalFunctions.runWith({ timeoutSeconds: 540 }).pubsub.schedule('0 0 1 1 *') // <--- CHANGE THIS!
    .onRun(async (context) => {
        const firestore = getFirestore();
        const bucket = getStorage().bucket();
        const ttsClient = new TextToSpeechClient();
        const collectionName = 'syllables';
        const batch = firestore.batch();
        const now = FieldValue.serverTimestamp();

        // --- IMPORTANT: PASTE YOUR GENERATED 3000 SYLLABLES ARRAY HERE! ---
        const commonEnglishSyllables = [];

    functions.logger.info(`[populateSyllablesScheduled] Starting to create ${commonEnglishSyllables.length} English syllable documents...`);

        try {
            for (const s of commonEnglishSyllables) {
                const moduleID = s.ipa; // Direct use of IPA as the Document ID
                const syllableDocRef = firestore.collection(collectionName).doc(moduleID);

                const docSnapshot = await syllableDocRef.get();

                let newAudioUrl = null;

                try {
                    const request = {
                        input: { ssml: `<speak><phoneme alphabet="ipa" ph="${s.ipa}">${s.ipa}</phoneme></speak>` },
                        voice: { languageCode: 'en-GB', ssmlGender: 'FEMALE', name: 'en-GB-Neural2-A' },
                        audioConfig: { audioEncoding: 'MP3' },
                    };

                    const [response] = await ttsClient.synthesizeSpeech(request);
                    const audioContent = response.audioContent;

                    if (audioContent.length < 500) {
                        functions.logger.warn(`Generated audio for syllable ${s.ipa} is suspiciously small (${audioContent.length} bytes).`);
                    }

                    const audioFileName = `${s.ipa}.mp3`;
                    const audioFilePath = `syllable_audio/${audioFileName}`;
                    const file = bucket.file(audioFilePath);

                    await file.save(audioContent, {
                        metadata: { contentType: 'audio/mpeg' },
                        public: true
                    });

                    newAudioUrl = file.publicUrl();
                    functions.logger.info(`Generated and uploaded audio for syllable ${s.ipa} to: ${newAudioUrl}`);

                } catch (audioGenError) {
                    functions.logger.error(`Failed to generate or upload audio for syllable ${s.ipa}:`, audioGenError);
                    newAudioUrl = docSnapshot.exists && docSnapshot.data().audioUrl ? docSnapshot.data().audioUrl : null;
                    functions.logger.warn(`Retaining previous audioUrl for ${s.ipa} due to generation error: ${newAudioUrl}`);
                }

                const phonemeModuleIDsForSyllable = getPhonemeIDsFromSyllableIPA(s.ipa);
                functions.logger.info(`Syllable '${s.ipa}' decomposed into phonemes: ${JSON.stringify(phonemeModuleIDsForSyllable)}`);

                const baseDocData = {
                    MODULEID: moduleID, // This field now matches the Document ID directly (the raw IPA)
                    MODULETYPE: 'SYLLABLE',
                    TITLE: `Syllable: ${s.ipa}`, // Updated title format to use raw IPA
                    IPA: s.ipa,
                    DESCRIPTION: `Audio and details for the English syllable "${s.ipa}".`,
                    normalizedTitle: s.ipa.toLowerCase(),
                    audioUrl: newAudioUrl,
                    MODULEID_ARRAY: phonemeModuleIDsForSyllable, // Populate with the parsed phoneme IDs
                    createdAt: now,
                    updatedAt: now,
                };

                if (docSnapshot.exists) {
                    batch.update(syllableDocRef, {
                        ...baseDocData,
                        createdAt: docSnapshot.data().createdAt,
                        MODULEID_ARRAY: phonemeModuleIDsForSyllable, // Ensure update applies the new array
                    });
                    functions.logger.info(`[populateSyllablesScheduled] Updating existing document for syllable ${s.ipa}.`);
                } else {
                    batch.set(syllableDocRef, baseDocData);
                    functions.logger.info(`[populateSyllablesScheduled] Creating new document for syllable ${s.ipa}.`);
                }
            }

            await batch.commit();
            functions.logger.info(`[populateSyllablesScheduled] Batch commit completed for English syllable documents.`);
            return { status: "success", message: `Successfully processed syllable documents in '${collectionName}' collection.` };
        } catch (error) {
            functions.logger.error('[populateSyllablesScheduled] Error processing syllable documents:', error);
            return { status: "error", message: `Failed to process syllable documents: ${error.message}` };
        }
    });

