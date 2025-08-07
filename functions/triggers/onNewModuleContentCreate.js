// --- Cloud Firestore onCreate Trigger for New Module Content ---
// This function is triggered when a new document is created in the 'learningContent' collection.
// It is responsible for enriching Module content with phonetics, audio, and syllable breakdowns,
// and then triggering image generation.It also adds each moduleid to the LESSON if selected

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { generateAudioAndUpload } = require('../helpers/generateAudioAndUpload');
const { getPhonemeIDsFromSyllableIPA } = require('../helpers/ipaUtils');
const { processModuleImageGeneration } = require('../helpers/processModuleImageGeneration');


// Function to determine if an IPA character is a known English vowel sound
function isIpaVowel(char) {
    // A comprehensive list of common English IPA vowel sounds,
    // including monophthongs and diphthongs.
    // This list might need to be expanded based on the exact IPA set Gemini uses.
    const ipaVowels = new Set([
        'i', 'ɪ', 'e', 'ɛ', 'æ', 'a', 'ɑ', 'ɒ', 'ɔ', 'o', 'ʊ', 'u', 'ʌ', 'ə', 'ɜ',
        // Diphthongs
        'aɪ', 'aʊ', 'ɔɪ', 'eɪ', 'oʊ',
        // R-colored vowels (often treated as single units in English phonology)
        'ər', 'ɜr' // Simplified for common use, may be represented differently.
    ]);
    // Check for single character vowels
    if (ipaVowels.has(char)) {
        return true;
    }
    // Check for common two-character diphthongs/vowel sequences
    // This is a simplification and would ideally involve more complex pattern matching
    // or a proper IPA parser.
    if (char.length > 1 && ipaVowels.has(char.substring(0,2))) { // rudimentary check for two-char vowels
         return true;
    }
    return false;
}

// Function to determine if an IPA character is a known English consonant sound
function isIpaConsonant(char) {
    // This set includes common English IPA consonant sounds.
    // This should be as exhaustive as possible for your expected IPA input.
    const ipaConsonants = new Set([
        'p', 'b', 't', 'd', 'k', 'ɡ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h', 'm', 'n', 'ŋ', 'l', 'r', 'w', 'j',
        // Affricates (often treated as single consonant units)
        'tʃ', 'dʒ',
        // Other common consonant-like sounds or non-vowels
        'ʔ' // Glottal stop
    ]);
    return ipaConsonants.has(char);
}

// A more advanced syllabification logic for IPA,
// attempting to infer boundaries if they are missing.
function splitIpaIntoSyllables(ipaWord) {
    if (!ipaWord) {
        return [];
    }

    // Step 1: Normalize the IPA string.
    // Remove primary and secondary stress marks for initial processing.
    // We keep any existing syllable delimiters '.' as they are likely correct.
    let processedIpa = ipaWord.replace(/[ˈˌ]/g, '');

    // If Gemini already provided delimiters, we trust them first.
    if (processedIpa.includes('.')) {
        return processedIpa.split('.').filter(s => s.length > 0);
    }

    // Step 2: Attempt to infer syllable boundaries if no dots exist.
    // This is a simplified heuristic based on Vowel-Consonant patterns.
    // It's still a simplification and won't be perfect for all edge cases.

    const syllables = [];
    let currentSyllable = '';
    let lastCharType = null; // 'vowel', 'consonant', 'other'

    // Iterate through the IPA string character by character (or sound by sound)
    for (let i = 0; i < processedIpa.length; i++) {
        const char = processedIpa[i]; // Current character

        // Basic classification (can be improved with lookaheads for diphthongs/affricates)
        let charType = 'other';
        if (isIpaVowel(char)) {
            charType = 'vowel';
        } else if (isIpaConsonant(char)) {
            charType = 'consonant';
        }

        // Simplified rule: a syllable boundary often occurs after a vowel
        // and before the next consonant, *unless* it's the start of a valid consonant cluster.
        // This is a very basic "VC.CV" or "V.CV" type rule.

        if (charType === 'vowel') {
            if (currentSyllable && lastCharType === 'consonant') {
                // If previous was consonant and current is vowel,
                // consider breaking if the consonant can form a coda.
                // This part is the trickiest without a full phonotactic engine.
                // For now, a simple split before a new vowel.
                // Example: 'bɑs kɛt' -> 'bɑs.kɛt'
                // If a new vowel starts a new syllable, and there's a consonant cluster before it.
                // This is a highly simplified heuristic.
                // A better heuristic would be Maximal Onset Principle.
            }
        }
        
        // Let's refine the loop to try and find VC/CV transitions more effectively.
        // This is a common starting point for simple phonetic syllabification:
        // Syllable break after a vowel, before a consonant, unless that consonant begins a valid onset.
        // Or, break between two consonants if the first can form a coda and the second begins an onset.

        // Simpler approach: find vowel and then potential boundary after it.
        // This is a placeholder for a more sophisticated phonological rule engine.
        // For demonstration, let's try a very basic V.CV or VC.CV splitting.
        
        // This part needs a proper IPA segmenter first, as 'aɪ' is two chars but one sound.
        // A simple char-by-char loop will fail for multi-character IPA symbols.
        // Let's acknowledge that limitation and provide a function that correctly handles IPA *symbols*
        // rather than just characters. This requires an IPA parser.

        // Given the constraints and the complexity, let's pivot to a more practical
        // character-level heuristic that tries to identify VCV patterns and split there.
        // This will still be a simplification but better than nothing for raw IPA.

        // A more advanced attempt at splitting that tries to identify Vowel-Consonant-Vowel (VCV) patterns.
        // It will place a boundary after the first vowel in an VCV sequence if possible (V.CV)
        // or after the consonant if the VCV sequence implies a closed syllable (VC.V) or (VCCV) (VC.CV).

        // For practical implementation within a Cloud Function, you'd want to use a more
        // robust IPA parsing library if possible, or build a more exhaustive set of IPA regex patterns.
        
        // Given that Gemini sometimes gives IPA without dots, let's *insert* dots
        // based on a very basic VCV rule for *potential* improvement.
        
        // A naive approach: find a VCV sequence. If V is followed by C and then V, split between C and V.
        // This doesn't account for consonant clusters, stress, or specific English phonotactics well.
        
        // Let's re-think `splitIpaIntoSyllables` based on the user's primary problem:
        // "Gemini is not consistent with it's syllable delimiters."
        // This means, if IPA is `ˈɛkskəveɪt`, it should become `ˈɛk.skə.veɪt`.
        // If it's `ˈɛk.skə.veɪt`, it should remain `ˈɛk.skə.veɪt`.

        // This implies we need a process to *add* delimiters if they're missing.
        // A common heuristic for English is to break after a vowel followed by a single consonant
        // (V.CV) or between two consonants (VC.CV) if a vowel is prior to the first consonant.

        // Let's use a regex-based approach for simplicity that tries to apply this heuristic.
        // This is still highly simplified compared to a full phonetic syllabifier.
        
        // Define common IPA vowel and consonant patterns for regex
        // These are simplified patterns and would need to be very carefully curated
        // for comprehensive accuracy across all IPA symbols and combinations.
        const ipaVowelPattern = /[aæʌeɛɪiɒɔuʊyəɚɜɝoøɤʉɯʏøœɶɑæɒɔʉɯʌəɚɜɝʀʁʔʕʢʜʢʡɕʑɧǁǃǂʘʬʭ]/; // A broad set of IPA vowel-like characters
        const ipaConsonantPattern = /[pbtdkɡfvθðszʃʒhmnŋlrjwʔɲŋʎɮʋɹɻɽɣχʀʁʕħʢʜʡɕʑçʝɫɬɮʋɹɻɽɾʈɖɳʂʐɲŋɭɬɫʀʁʕʢʜʢʡ]/; // A broad set of IPA consonant-like characters

        // A more practical phonetic syllabification heuristic using regex
        // This attempts to place boundaries in VCV, VCCV, VCCCV patterns.
        // It's a simplification!
        let syllabifiedIpa = processedIpa;

        // Pattern 1: VCV -> V.CV (e.g., 'a.pəl') - simple open syllable
        syllabifiedIpa = syllabifiedIpa.replace(new RegExp(`(${ipaVowelPattern.source})(${ipaConsonantPattern.source})(${ipaVowelPattern.source})`, 'g'), '$1.$2$3');
        
        // Pattern 2: VCCV -> VC.CV (e.g., 'bas.kɛt') - often splits between consonants
        syllabifiedIpa = syllabifiedIpa.replace(new RegExp(`(${ipaVowelPattern.source})(${ipaConsonantPattern.source})(${ipaConsonantPattern.source})(${ipaVowelPattern.source})`, 'g'), '$1$2.$3$4');

        // Note: This regex-based approach is extremely simplistic and might fail for many
        // complex IPA sequences, consonant clusters, and diphthongs represented as single symbols.
        // It also doesn't handle word-final syllables or stress rules.
        // It's a starting point for inferring boundaries when none are present.

        return syllabifiedIpa.split('.').filter(s => s.length > 0);
}

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
