
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { allRpPhonemes, knownThreeCharPhonemes, knownTwoCharPhonemes, knownSingleCharPhonemes} = require('./phonemeData');


function getPhonemeIDsFromSyllableIPA(ipaSyllable) {
    const phonemeIDs = [];
    let currentIndex = 0;
    const syllableLength = ipaSyllable.length;

    functions.logger.debug(`[DEBUG-IPA-PARSE] Starting parse for syllable: '${ipaSyllable}'`);

    while (currentIndex < syllableLength) {
        let matchedPhoneme = null;
        let foundMatch = false;

        // 1. Try to match a known three-character phoneme
        for (const threeCharPhoneme of knownThreeCharPhonemes) {
            if (currentIndex + threeCharPhoneme.length <= syllableLength &&
                ipaSyllable.substring(currentIndex, currentIndex + threeCharPhoneme.length) === threeCharPhoneme) {
                matchedPhoneme = threeCharPhoneme;
                currentIndex += threeCharPhoneme.length;
                foundMatch = true;
                break;
            }
        }

        // 2. If no three-character phoneme matched, try a two-character phoneme
        if (!foundMatch) {
            for (const twoCharPhoneme of knownTwoCharPhonemes) {
                if (currentIndex + twoCharPhoneme.length <= syllableLength &&
                    ipaSyllable.substring(currentIndex, currentIndex + twoCharPhoneme.length) === twoCharPhoneme) {
                    matchedPhoneme = twoCharPhoneme;
                    currentIndex += twoCharPhoneme.length;
                    foundMatch = true;
                    break;
                }
            }
        }

        // 3. If no two- or three-character phoneme matched, try a single-character phoneme
        if (!foundMatch) {
            const potentialSingleChar = ipaSyllable.substring(currentIndex, currentIndex + 1);
            if (knownSingleCharPhonemes.includes(potentialSingleChar)) {
                matchedPhoneme = potentialSingleChar;
                currentIndex += 1;
                foundMatch = true;
            } else {
                // If still not recognized after checking all lengths, it's an issue. Log and skip.
                functions.logger.warn(
                    `[getPhonemeIDsFromSyllableIPA] Unrecognized IPA character/sequence: '${potentialSingleChar}' ` +
                    `at index ${currentIndex} in syllable '${ipaSyllable}'. Skipping character.`
                );
                currentIndex += 1; // Skip the unrecognized character
                continue; // Move to the next iteration of the loop
            }
        }

        if (matchedPhoneme) {
            phonemeIDs.push(matchedPhoneme);
        }
    }
    return phonemeIDs;
}

function splitIpaIntoSyllables(ipaWord) {
    if (!ipaWord) {
        return [];
    }
    // Remove primary and secondary stress marks before splitting
    const cleanedIpa = ipaWord.replace(/[ˈˌ]/g, '');
    return cleanedIpa.split('.').filter(s => s.length > 0);
}

// Helper Function to generate new, unique Firestore Document IDs
// --- CHANGE: Updated to use admin.firestore() directly. ---
const generateUniqueFirestoreId = () => admin.firestore().collection('learningContent').doc().id;

// Helper Function to normalize titles for consistent lookup (e.g., for deduplication)
const normalizeTitle = (title) => {
    return title.toLowerCase().trim();
};





module.exports = {
  getPhonemeIDsFromSyllableIPA,
  splitIpaIntoSyllables,
  generateUniqueFirestoreId,
  normalizeTitle
};
