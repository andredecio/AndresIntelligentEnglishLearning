// --- NEW: Scheduled Function to populate the initial RP Phonemes Collection ---
// This function can be triggered manually from the GCP Console (Functions -> 'populatePhonemesScheduled' -> Trigger Now)
// It will also run automatically once a year, though that's a side result. We dont want to use that.

const functions = require("firebase-functions/v1");
const allRpPhonemes = require('../helpers/phonemeData');
const admin = require('firebase-admin');
//const { processVocabularyImageGeneration } = require('../helpers/imageGenerator'); // adjust path if needed
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');



const populatePhonemesScheduled = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).pubsub.schedule('0 0 1 1 *')
    .onRun(async (context) => {
    // --- IMPORTANT: Removed context.auth checks as scheduled functions do not have them. ---
    // Security for scheduled functions is managed by IAM permissions for deploying/triggering.

    const firestore = admin.firestore(); // Get Firestore instance
    const bucket = admin.storage().bucket(); // Get the default storage bucket
    const ttsClient = new TextToSpeechClient(); // Initialize Text-to-Speech Client
    const collectionName = 'phonemes'; // Hardcoded as this is a specific, one-time setup
    const batch = firestore.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    functions.logger.info(`[populatePhonemesScheduled] Starting to create ${allRpPhonemes.length} British English (RP) phoneme documents in '${collectionName}' collection...`);

    try {
        for (const p of allRpPhonemes) {
		//const moduleID = `phoneme_${encodeURIComponent(p.ipa).replace(/%/g, '_').toLowerCase()}`;
          const moduleID = p.ipa; // Direct use of IPA as the Document ID   
			const phonemeDocRef = firestore.collection(collectionName).doc(moduleID);

            const docSnapshot = await phonemeDocRef.get();
// Inside your for (const p of allRpPhonemes) loop, before constructing the 'request' object:

let ssmlInputText = p.ipa; // Default to just the IPA symbol for the text inside the phoneme tag
let ssmlPhAttribute = p.ipa; // Default to just the IPA symbol for the 'ph' attribute

// Define the problematic phonemes (YOU NEED TO FILL THIS ARRAY WITH YOUR SPECIFIC ONES)
// *** YOU WILL POPULATE THESE ARRAYS BASED ON YOUR COMPLETE LIST OF PROBLEMATIC PHONEMES ***
// Consonants that are silent or say their letter name. These will get the 'p.ipa + ə' treatment.
const consonantProblemPhonemes = ['z', 'w', 'v', 't', 's', 'r', 'p', 'n', 'm', 'l', 'k', 'l', 'h', 'g', 'f', 'e', 'd', 'b', 'j', 'ʒ','tʃ', 'ʔ', 'ʃ', 'ŋ', 'ð', 'dʒ', 'θ', 'c', 'kʼ', 'pʼ', 'q', 'sʼ', 'tʼ', 'x', 'y', 'ç', 'ħ', 'ǀ', 'ǁ', 'ǂ', 'ǃ', 'ɓ', 'ɕ', 'ɖ', 'ɗ', 'ɟ', 'ɠ', 'ɡ', 'ɢ', 'ɣ', 'ɥ', 'ɦ', 'ɧ', 'ɬ', 'ɭ', 'ɮ', 'ɯ', 'ɰ', 'ɱ', 'ɲ', 'ɳ', 'ɴ', 'ɸ', 'ɹ', 'ɺ', 'ɻ', 'ɽ', 'ɾ', 'ʀ', 'ʁ', 'ʂ', 'ʄ', 'ʈ', 'ʋ', 'ʍ', 'ʎ', 'ʐ', 'ʑ', 'ʕ', 'ʘ', 'ʙ', 'ʛ', 'ʜ', 'ʝ', 'ʟ', 'ʡ', 'ʢ', 'β', 'χ', 'ⱱ']; //  list, problematic consonants 
// Vowels that are silent. These will rely on voice selection for vocalization.
const vowelProblemPhonemes = ['ʊ', 'ʔ', 'ɪ', 'ʊə', 'i', 'eəʳ', 'o', 'uː', 'ø', 'ɐ', 'ɑ', 'ɑː', 'ɒ', 'ɔ', 'ɘ', 'ɜ', 'ɜː', 'ɜːʳ', 'ɞ', 'ɤ', 'ɨ', 'ɪəʳ', 'ɵ', 'ɶ', 'ʉ', 'ʊəʳ', 'ʌ', 'ʏ'];

// Check if the current phoneme is in our problematic list
if (consonantProblemPhonemes.includes(p.ipa)) {
    // For problematic consonants: append a schwa to force vocalization.
    // Example: 'ʒ' becomes 'ʒə', 'v' becomes 'və'
    ssmlPhAttribute = p.ipa + 'ə';
    ssmlInputText = p.ipa; // Keep the visible text as just the IPA symbol
 functions.logger.info(`[populatePhonemesScheduled] Applying schwa for problematic consonant: ${p.ipa}`);
} else if (vowelProblemPhonemes.includes(p.ipa)) {
    // For problematic vowels: Do NOT add a schwa.
    // We rely on switching voices for these.
    ssmlPhAttribute = p.ipa;
    ssmlInputText = p.ipa;
    // You might also want to log a warning here to investigate voice changes for these specific vowels
	functions.logger.info(`[populatePhonemesScheduled] Relying on Neural2 voice for problematic vowel: ${p.ipa}`);}
            let newAudioUrl = null; // This will hold the URL of the newly generated audio

            try {
// Then construct the request using these variables:
const request = {
    input: { ssml: `<speak><phoneme alphabet="ipa" ph="${ssmlPhAttribute}">${ssmlInputText}</phoneme></speak>` },
    // IMPORTANT: Let's explicitly try a top-tier voice like Neural2-A or Wavenet-A.
    // This could solve the vowel issues and generally improve consonant rendering.
    voice: { languageCode: 'en-GB', ssmlGender: 'FEMALE', name: 'en-GB-Neural2-A' }, // Or 'en-GB-Wavenet-A'
    audioConfig: { audioEncoding: 'MP3' },
};

                // 2. Call the Text-to-Speech API
                const [response] = await ttsClient.synthesizeSpeech(request);
                const audioContent = response.audioContent; // This is a Buffer containing the MP3 data

                // Log the audio content buffer length for debugging purposes
                functions.logger.info(`Audio content buffer length for ${p.ipa}: ${audioContent.length} bytes`);

                // Optional: A more aggressive check for "empty" or bad audio.
                // An MP3 header is usually around 4-8 bytes. If content.length is < 100-200 bytes, it's likely still empty or bad.
                // If the file is still 5KB, this check won't catch it, but it's good for truly empty responses.
                if (audioContent.length < 500) { // A threshold, 5KB (5120 bytes) is still large for silence if nothing's there.
                    functions.logger.warn(`Generated audio for ${p.ipa} is suspiciously small (${audioContent.length} bytes). May indicate an issue or silent output.`);
                    // If you wanted to entirely abandon and NOT update the URL if it's too small:
                    // throw new Error("Generated audio content is too small, likely inaudible.");
                }

                // 3. Upload the Audio to Cloud Storage
                //const audioFileName = `${moduleID}.mp3`; // e.g., phoneme_ɪ.mp3
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
                // If audio generation fails, keep the old URL if one existed, otherwise it remains null.
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
                // We prioritize newAudioUrl if successful, otherwise retain the old one.
                const updateData = {
                    ...baseDocData,
                    audioUrl: newAudioUrl !== null ? newAudioUrl : (docSnapshot.data().audioUrl || null), // Use new URL if successful, else old URL if exists, else null
                    createdAt: docSnapshot.data().createdAt, // Preserve original createdAt
                };
                batch.update(phonemeDocRef, updateData); // Use update to merge changes
                functions.logger.info(`[populatePhonemesScheduled] Updating existing document for phoneme ${p.ipa}.`);
            } else {
                // Document does not exist. Create it.
                const createData = {
                    ...baseDocData,
                    audioUrl: newAudioUrl, // For new documents, this is either the generated URL or null
                    createdAt: now, // Set createdAt for new documents
                };
                batch.set(phonemeDocRef, createData); // Use set for new documents
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

module.exports = {
  populatePhonemesScheduled
};