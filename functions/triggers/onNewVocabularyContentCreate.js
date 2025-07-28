// --- Cloud Firestore onCreate Trigger for New Vocabulary Content ---
// This function is triggered when a new document is created in the 'learningContent' collection.
// It is responsible for enriching vocabulary content with phonetics, audio, and syllable breakdowns,
// and then triggering image generation.

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { generateAudioAndUpload } = require('../helpers/generateAudioAndUpload');
const { getPhonemeIDsFromSyllableIPA } = require('../helpers/ipaUtils');
const { processVocabularyImageGeneration } = require('../helpers/processVocabularyImageGeneration');


function splitIpaIntoSyllables(ipaWord) {
    if (!ipaWord) {
        return [];
    }
    // Remove primary and secondary stress marks before splitting
    const cleanedIpa = ipaWord.replace(/[ˈˌ]/g, '');
    return cleanedIpa.split('.').filter(s => s.length > 0);
}


const onNewVocabularyContentCreate = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).firestore
    .document('learningContent/{docId}')
    .onCreate(async (snapshot, context) => {
        const data = snapshot.data();
        const docId = context.params.docId;
        const db = admin.firestore();

        functions.logger.info(`onNewVocabularyContentCreate triggered for document: ${docId}`);

        if (data.MODULETYPE === 'VOCABULARY') {
            let fullWordIpaWithDelimiters = null; // Stores IPA like 'ˈɛk.skə.veɪt'
            let fullWordIpaClean = null;        // Stores IPA like 'ɛk.skə.veɪt' (no stress/delimiters, for storage)
            let syllablesParsedFromIpa = [];    // Stores ['ɛk', 'skə', 'veɪt']

            try {
                // Step 1: Fetch Word Phonetics from Dictionary API
                //if (data.TITLE) {
                //    const wordToFetch = data.TITLE.toLowerCase();
                //    functions.logger.info(`Attempting to fetch phonetics for word: "${wordToFetch}" from dictionary API.`);
           
                // Step 1: Use IPA provided directly by Gemini
                if (data.IPA) {
                    functions.logger.info(`Using IPA from Gemini for "${data.TITLE}": "${data.IPA}"`);

                    // Gemini is now expected to provide the IPA in the desired format
                    // (with stress marks and syllable delimiters)
                    fullWordIpaWithDelimiters = data.IPA;

                    // For storage in Firestore's 'IPA' field, if you want a clean version
                    // without stress or syllable delimiters (as your old code suggested for storage),
                    // then apply the cleaning here. Otherwise, you can just use fullWordIpaWithDelimiters.
                    // Assuming you still want a "clean" stored version:
                    fullWordIpaClean = data.IPA.replace(/[ˈˌ.]/g, '');

                    // Syllabify using your existing helper based on the IPA from Gemini
                    syllablesParsedFromIpa = splitIpaIntoSyllables(fullWordIpaWithDelimiters);
                    functions.logger.info(`Syllables parsed from Gemini's IPA for "${data.TITLE}": ${JSON.stringify(syllablesParsedFromIpa)}`);

                } else {
                    functions.logger.warn(`Document ${docId} (Title: ${data.TITLE}) has no IPA provided by Gemini. Skipping phonetic enrichment for this item.`);
                    // If Gemini didn't provide IPA, the 'fullWordIpaWithDelimiters' will remain null,
                    // preventing subsequent audio generation and syllable processing for this item.
                }

                

                const updatePayload = {};

                // --- Set IPA field ---
                //if (fullWordIpaClean) {
                    functions.logger.info(`Current Value to load IPA = "${fullWordIpaWithDelimiters}": "${data.TITLE}": "${data.IPA}"`);
					updatePayload.IPA = fullWordIpaWithDelimiters;
                //}

                // --- Generate Word Audio and Syllable Processing ---
                // We proceed if we have a full word IPA to work with
                if (fullWordIpaWithDelimiters) {
                    // Generate audio for the full word
                    const wordAudioUrl = await generateAudioAndUpload(
                        data.TITLE,
                        fullWordIpaWithDelimiters, // Use IPA with stress and delimiters for accurate TTS
                        `word_${docId}`,
                        'word_audio/'
                    );

                    if (wordAudioUrl) {
                        updatePayload.audioUrl = wordAudioUrl;
                        functions.logger.info(`Word audio URL generated for ${docId}.`);
                    } else {
                        functions.logger.warn(`Could not generate or upload audio for word: "${data.TITLE}".`);
                    }

                    // Process Syllables and Update VOCABULARY MODULEID_ARRAY
                    const syllableIDsForVocabulary = [];
                    const syllablesCollection = db.collection('syllables');
                    const batch = db.batch();

                    if (syllablesParsedFromIpa.length > 0) {
                        functions.logger.info(`Processing ${syllablesParsedFromIpa.length} actual syllables for word: "${data.TITLE}".`);

                        for (const syllableIpa of syllablesParsedFromIpa) {
                            const syllableId = syllableIpa.replace(/[.#$/[\]]/g, '_').toLowerCase();
                            functions.logger.debug(`Checking syllable: "${syllableIpa}" (ID: ${syllableId})`);

                            const existingSyllableDoc = await syllablesCollection.doc(syllableId).get();
                            let currentSyllableAudioUrl = null;
                            let currentSyllablePhonemeIDs = []; // This will hold the extracted phoneme symbols

                            if (!existingSyllableDoc.exists) {
                                functions.logger.info(`Syllable "${syllableIpa}" does not exist (ID: ${syllableId}). Creating new document.`);

                                // Generate Audio for this specific syllable
                                currentSyllableAudioUrl = await generateAudioAndUpload(
                                    syllableIpa, // Use the syllable's IPA as text for TTS
                                    syllableIpa, // Use the syllable's IPA for SSML
                                    `syllable_${syllableId}`,
                                    'syllable_audio/' // Audio for individual syllables
                                );

                                // Link syllable to phonemes using the helper function
                                currentSyllablePhonemeIDs = getPhonemeIDsFromSyllableIPA(syllableIpa);
                                functions.logger.info(`Syllable "${syllableIpa}" decomposed into phonemes: ${JSON.stringify(currentSyllablePhonemeIDs)}`);

                                // Create Syllable Document
                                const newSyllableData = {
                                    MODULEID: syllableId,
                                    MODULETYPE: 'SYLLABLE',
                                    TITLE: syllableIpa,
                                    IPA: syllableIpa,
                                    audioUrl: currentSyllableAudioUrl || null,
                                    MODULEID_ARRAY: currentSyllablePhonemeIDs, // Link to phonemes (literal IPA symbols)
                                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                                    normalizedTitle: syllableIpa.toLowerCase(),
                                };
                                batch.set(syllablesCollection.doc(syllableId), newSyllableData);
                                functions.logger.info(`Added syllable "${syllableId}" to batch.`);
                            } else {
                                functions.logger.info(`Syllable "${syllableIpa}" (ID: ${syllableId}) already exists. Skipping creation/update.`);
                                if (existingSyllableDoc.data().MODULEID_ARRAY) {
                                    currentSyllablePhonemeIDs = existingSyllableDoc.data().MODULEID_ARRAY;
                                }
                            }
                            syllableIDsForVocabulary.push(syllableId);
                        }
                    }

                    if (syllableIDsForVocabulary.length > 0) {
                        await batch.commit();
                        functions.logger.info(`Firestore batch committed for ${syllableIDsForVocabulary.length} syllables.`);

                        updatePayload.MODULEID_ARRAY = admin.firestore.FieldValue.arrayUnion(...syllableIDsForVocabulary);
                        functions.logger.info(`Prepared MODULEID_ARRAY for vocabulary document ${docId} with syllable IDs.`);
                    } else {
                        functions.logger.info(`No actual syllables processed for ${docId}. No batch commit needed.`);
                    }
                } else {
                    functions.logger.warn(`No valid IPA (with or without delimiters) found to process syllables for "${data.TITLE}".`);
                }

                if (Object.keys(updatePayload).length > 0) {
                    await snapshot.ref.update(updatePayload);
                    functions.logger.info(`Updated learningContent document ${docId} with payload: ${JSON.stringify(updatePayload)}`);
                }

            } catch (error) {
                functions.logger.error(`Error during phonetic and syllable processing for ${docId}:`, error);
            }
        } else {
            functions.logger.info(`Document ${docId} is not a VOCABULARY type. Skipping phonetic enrichment.`);
        }

        if (data.MODULETYPE === 'VOCABULARY' && data.imageStatus === 'pending') {
            functions.logger.info(`New VOCABULARY document created with pending image for ${docId}. Attempting image generation.`);
            await processVocabularyImageGeneration(snapshot);
        } else {
            functions.logger.info(`New document ${docId} created, but not a pending VOCABULARY item for image generation. Skipping.`);
        }

        return null;
    });

module.exports = { onNewVocabularyContentCreate };
