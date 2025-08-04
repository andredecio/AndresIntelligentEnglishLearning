// --- Cloud Firestore onCreate Trigger for New Module Content ---
// This function is triggered when a new document is created in the 'learningContent' collection.
// It is responsible for enriching Module content with phonetics, audio, and syllable breakdowns,
// and then triggering image generation.It also adds each moduleid to the LESSON if selected

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { generateAudioAndUpload } = require('../helpers/generateAudioAndUpload');
const { getPhonemeIDsFromSyllableIPA } = require('../helpers/ipaUtils');
const { processModuleImageGeneration } = require('../helpers/processModuleImageGeneration');


function splitIpaIntoSyllables(ipaWord) {
    if (!ipaWord) {
        return [];
    }
    // Remove primary and secondary stress marks before splitting
    const cleanedIpa = ipaWord.replace(/[ˈˌ]/g, '');
    return cleanedIpa.split('.').filter(s => s.length > 0);
}


const onNewModuleContentCreate = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).firestore
    .document('learningContent/{docId}')
    .onCreate(async (snapshot, context) => {
        const data = snapshot.data();
        const docId = context.params.docId; // This is the MODULEID of the newly created module
        const db = admin.firestore(); // Firestore instance

        functions.logger.info(`onNewModuleContentCreate triggered for document: ${docId}`);
	
        // Firstly, check if it's to be included in a Lesson. If so, update the Lesson's moduleid_array with this module's moduleid.
        const lessonModuleId = data.LESSON_ID; // Retrieve LESSON_ID from the new module's data

        if (lessonModuleId) { // Check if LESSON_ID exists and has a value
            functions.logger.info(`Module ${docId} has LESSON_ID: ${lessonModuleId}. Attempting to link to LESSON document.`);
            try {
                const lessonRef = db.collection("LESSON").doc(lessonModuleId); 
                
                // Atomically add the current module's ID (docId) to the LESSON's MODULEID_ARRAY
                await lessonRef.update({
                    MODULEID_ARRAY: admin.firestore.FieldValue.arrayUnion(docId)
                });
                functions.logger.info(`Successfully added module ${docId} to LESSON ${lessonModuleId}'s MODULEID_ARRAY.`);
            } catch (error) {
                // Log and re-throw the error so Firebase retries this part of the function
                functions.logger.error(`Error linking module ${docId} to LESSON ${lessonModuleId}:`, error);
                throw new Error(`Failed to update LESSON MODULEID_ARRAY: ${error.message}`);
            }
        } else {
            functions.logger.info(`Module ${docId} does not have a LESSON_ID. Skipping LESSON MODULEID_ARRAY update.`);
        }



        if (data.MODULETYPE === 'VOCABULARY') {
            let fullWordIpaWithDelimiters = null; // Stores IPA like 'ˈɛk.skə.veɪt'
            let fullWordIpaClean = null;        // Stores IPA like 'ɛk.skə.veɪt' (no stress/delimiters, for storage)
            let syllablesParsedFromIpa = [];    // Stores ['ɛk', 'skə', 'veɪt']

            try {
           
                // Step 1: Use IPA provided directly by Gemini
                if (data.IPA) {
                    functions.logger.info(`Using IPA from Gemini for "${data.TITLE}": "${data.IPA}"`);

                    // Gemini is now expected to provide the IPA in the desired format
                    // (with stress marks and syllable delimiters)
                    fullWordIpaWithDelimiters = data.IPA;

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
		
		//If it's a ListeningSpeaking type, we need to create an mp3 for the speaking exercise
		if (data.MODULETYPE === 'LISTENINGSPEAKING') {
			            functions.logger.info(`Document ${docId} ListeningSpeaking module being processed to generate audio. `);

			    const updateLSPayload = {};				

                // --- Generate Text Audio  ---
                    const LSAudioUrl = await generateAudioAndUpload(
                        data.DESCRIPTION,
                        '', //Blank to cause function to handle the large text string for TTS
                        `word_${docId}`,
                        'ListeningSpeaking_audio/'
                    );

                    if (LSAudioUrl) {
                        updateLSPayload.audioUrl = LSAudioUrl;
                        functions.logger.info(`ListeningSpeaking audio URL generated for ${docId}.`);
                    } else {
                        functions.logger.warn(`Could not generate or upload audio for passage: "${data.DESCRIPTION.substring(0, 50)}...".`);
                    }		
			   
					if (Object.keys(updateLSPayload).length > 0) {
						await snapshot.ref.update(updateLSPayload);
						functions.logger.info(`Updated learningContent document ${docId} with payload: ${JSON.stringify(updateLSPayload)}`);
					}
			
		}
        if (data.imageStatus === 'pending') {
            functions.logger.info(`New MODULE document of type ${data.MODULETYPE } created with pending image for ${docId} about: ${data.TITLE}. Attempting image generation.`);
            await processModuleImageGeneration(snapshot);
        } else {
            functions.logger.info(`New document ${docId} created, but not a pending VOCABULARY item for image generation. Skipping.`);
        }

        return null;
    });

module.exports = { onNewModuleContentCreate };
