// --- NEW: Scheduled Function to populate the initial RP Phonemes Collection ---
// This function can be triggered manually from the GCP Console (Functions -> 'populatePhonemesScheduled' -> Trigger Now)
// It will also run automatically once a year, though that's a side result. We dont want to use that.

// Use ES Module imports
import * as functions from "firebase-functions/v1";
import { regionalFunctions } from "../config.js"; // <--- ADD THIS LINE!
import { allRpPhonemes } from '../helpers/phonemeData.js'; // Changed to named import with .js extension
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { TextToSpeechClient } from '@google-cloud/text-to-speech'; // ES Module import

// Safe initialization of Firebase Admin SDK
if (getApps().length === 0) {
    initializeApp();
}

export const populatePhonemesScheduled = regionalFunctions.runWith({ timeoutSeconds: 540 }).pubsub.schedule('0 0 1 1 *') // <--- CHANGE THIS!
    .onRun(async (context) => {
    // --- IMPORTANT: Removed context.auth checks as scheduled functions do not have them. ---
    // Security for scheduled functions is managed by IAM permissions for deploying/triggering.

    const firestore = getFirestore(); // Get Firestore instance
    const bucket = getStorage().bucket(); // Get the default storage bucket
    const ttsClient = new TextToSpeechClient(); // Initialize Text-to-Speech Client
    const collectionName = 'phonemes'; // Hardcoded as this is a specific, one-time setup
    const batch = firestore.batch();
    const now = FieldValue.serverTimestamp();

    functions.logger.info(`[populatePhonemesScheduled] Starting to create ${allRpPhonemes.length} British English (RP) phoneme documents in '${collectionName}' collection...`);

    try {
        for (const p of allRpPhonemes) {
            const moduleID = p.ipa; // Direct use of IPA as the Document ID
			const phonemeDocRef = firestore.collection(collectionName).doc(moduleID);

            const docSnapshot = await phonemeDocRef.get();

            let ssmlInputText = p.ipa; // Default to just the IPA symbol for the text inside the phoneme tag
            let ssmlPhAttribute = p.ipa; // Default to just the IPA symbol for the 'ph' attribute

            // Consonants that are silent or say their letter name. These will get the 'p.ipa + ə' treatment.
            const consonantProblemPhonemes = ['z', 'w', 'v', 't', 's', 'r', 'p', 'n', 'm', 'l', 'k', 'l', 'h', 'g', 'f', 'e', 'd', 'b', 'j', 'ʒ','tʃ', 'ʔ', 'ʃ', 'ŋ', 'ð', 'dʒ', 'θ', 'c', 'kʼ', 'pʼ', 'q', 'sʼ', 'tʼ', 'x', 'y', 'ç', 'ħ', 'ǀ', 'ǁ', 'ǂ', 'ǃ', 'ɓ', 'ɕ', 'ɖ', 'ɗ', 'ɟ', 'ɠ', 'ɡ', 'ɢ', 'ɣ', 'ɥ', 'ɦ', 'ɧ', 'ɬ', 'ɭ', 'ɮ', 'ɯ', 'ɰ', 'ɱ', 'ɲ', 'ɳ', 'ɴ', 'ɸ', 'ɹ', 'ɺ', 'ɻ', 'ɽ', 'ɾ', 'ʀ', 'ʁ', 'ʂ', 'ʄ', 'ʈ', 'ʋ', 'ʍ', 'ʎ', 'ʐ', 'ʑ', 'ʕ', 'ʘ', 'ʙ', 'ʛ', 'ʜ', 'ʝ', 'ʟ', 'ʡ', 'ʢ', 'β', 'χ', 'ⱱ']; 
            // Vowels that are silent. These will rely on voice selection for vocalization.
            const vowelProblemPhonemes = ['ʊ', 'ʔ', 'ɪ', 'ʊə', 'i', 'eəʳ', 'o', 'uː', 'ø', 'ɐ', 'ɑ', 'ɑː', 'ɒ', 'ɔ', 'ɘ', 'ɜ', 'ɜː', 'ɜːʳ', 'ɞ', 'ɤ', 'ɨ', 'ɪəʳ', 'ɵ', 'ɶ', 'ʉ', 'ʊəʳ', 'ʌ', 'ʏ'];

            // Check if the current phoneme is in our problematic list
            if (consonantProblemPhonemes.includes(p.ipa)) {
                // For problematic consonants: append a schwa to force vocalization.
                ssmlPhAttribute = p.ipa + 'ə';
                ssmlInputText = p.ipa; // Keep the visible text as just the IPA symbol
                functions.logger.info(`[populatePhonemesScheduled] Applying schwa for problematic consonant: ${p.ipa}`);
            } else if (vowelProblemPhonemes.includes(p.ipa)) {
                // For problematic vowels: Do NOT add a schwa. Rely on Neural2 voice instead.
                ssmlPhAttribute = p.ipa;
                ssmlInputText = p.ipa;
                functions.logger.info(`[populatePhonemesScheduled] Relying on Neural2 voice for problematic vowel: ${p.ipa}`);
            }
            
            let newAudioUrl = null; // This will hold the URL of the newly generated audio

            try {
                const request = {
                    input: { ssml: `<speak><phoneme alphabet="ipa" ph="${ssmlPhAttribute}">${ssmlInputText}</phoneme></speak>` },
                    voice: { languageCode: 'en-GB', ssmlGender: 'FEMALE', name: 'en-GB-Neural2-A' }, 
                    audioConfig: { audioEncoding: 'MP3' },
                };

                // 2. Call the Text-to-Speech API
                const [response] = await ttsClient.synthesizeSpeech(request);
                const audioContent = response.audioContent; // This is a Buffer containing the MP3 data

                // Log the audio content buffer length for debugging purposes
                functions.logger.info(`Audio content buffer length for ${p.ipa}: ${audioContent.length} bytes`);

                if (audioContent.length < 500) { 
                    functions.logger.warn(`Generated audio for ${p.ipa} is suspiciously small (${audioContent.length} bytes). May indicate an issue or silent output.`);
                }

                // 3. Upload the Audio to Cloud Storage
                const audioFileName = `${p.ipa}.mp3`; // e.g., ɪ.mp3
				const audioFilePath = `phoneme_audio/${audioFileName}`; // Path in Cloud Storage bucket
                const file = bucket.file(audioFilePath);

                await file.save(audioContent, {
                    metadata: { contentType: 'audio/mpeg' },
                    public: true // Make the file publicly accessible
                });

                newAudioUrl = file.publicUrl(); // Get the public URL for the uploaded audio
                functions.logger.info(`Generated and uploaded audio for ${p.ipa} to: ${newAudioUrl}`);

            } catch (audioGenError) {
                functions.logger.error(`Failed to generate or upload audio for phoneme ${p.ipa}:`, audioGenError);
                newAudioUrl = docSnapshot.exists && docSnapshot.data().audioUrl ? docSnapshot.data().audioUrl : null;
                functions.logger.warn(`Retaining previous audioUrl for ${p.ipa} due to generation error: ${newAudioUrl}`);
            }

            // Prepare base data that will be used for both set and update operations
            const baseDocData = {
                MODULEID: moduleID,
                MODULETYPE: 'PHONEME',
                TITLE: `${p.ipa} - ${p.titleSuffix}`,
                IPA: p.ipa,
                DESCRIPTION: `Learn how to produce the ${p.titleSuffix}. This phoneme is crucial for clear British English pronunciation.`,
                CEFR: null,
                MEANING_ORIGIN: null,
                THEME: p.theme,
                WORD_TYPE: null,
                MODULEID_ARRAY: [],
                ImagePrompt: null,
                ImageStatus: null,
                normalizedTitle: p.ipa.toLowerCase(),
                updatedAt: now, // Always update timestamp on change
                IMAGEURL: null,
                VIDEOURL: null
            };

            if (docSnapshot.exists) {
                // Document exists. Update it.
                const updateData = {
                    ...baseDocData,
                    audioUrl: newAudioUrl !== null ? newAudioUrl : (docSnapshot.data().audioUrl || null), 
                    createdAt: docSnapshot.data().createdAt, 
                };
                batch.update(phonemeDocRef, updateData); 
                functions.logger.info(`[populatePhonemesScheduled] Updating existing document for phoneme ${p.ipa}.`);
            } else {
                // Document does not exist. Create it.
                const createData = {
                    ...baseDocData,
                    audioUrl: newAudioUrl, 
                    createdAt: now, 
                };
                batch.set(phonemeDocRef, createData); 
                functions.logger.info(`[populatePhonemesScheduled] Creating new document for phoneme ${p.ipa}.`);
            }
        }

        await batch.commit();
        functions.logger.info(`[populatePhonemesScheduled] Batch commit completed for British English (RP) phoneme documents.`);
        return { status: "success", message: `Successfully processed RP phoneme documents in '${collectionName}' collection.` };
    } catch (error) {
        functions.logger.error('[populatePhonemesScheduled] Error processing phoneme documents:', error);
        return { status: "error", message: `Failed to process phoneme documents: ${error.message}` };
    }
});

