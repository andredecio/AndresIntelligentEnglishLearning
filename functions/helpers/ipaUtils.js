import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { 
  allRpPhonemes, 
  knownThreeCharPhonemes, 
  knownTwoCharPhonemes, 
  knownSingleCharPhonemes 
} from './phonemeData.js';

// Safe-guard Firebase Admin SDK initialization
if (getApps().length === 0) {
  initializeApp();
}

function getPhonemeIDsFromSyllableIPA(ipaSyllable) {
    if (!ipaSyllable) return [];

    // Sanitize stress marks and syllable boundaries before parsing
    const cleanedSyllable = ipaSyllable.replace(/[ˈˌ.]/g, '').trim();
    const phonemeIDs = [];
    let currentIndex = 0;
    const syllableLength = cleanedSyllable.length;

    logger.debug(`[DEBUG-IPA-PARSE] Starting parse for syllable: '${cleanedSyllable}'`);

    while (currentIndex < syllableLength) {
        let matchedPhoneme = null;
        let foundMatch = false;

        // 1. Try to match a known three-character phoneme
        for (const threeCharPhoneme of knownThreeCharPhonemes) {
            if (currentIndex + threeCharPhoneme.length <= syllableLength &&
                cleanedSyllable.substring(currentIndex, currentIndex + threeCharPhoneme.length) === threeCharPhoneme) {
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
                    cleanedSyllable.substring(currentIndex, currentIndex + twoCharPhoneme.length) === twoCharPhoneme) {
                    matchedPhoneme = twoCharPhoneme;
                    currentIndex += twoCharPhoneme.length;
                    foundMatch = true;
                    break;
                }
            }
        }

        // 3. If no two- or three-character phoneme matched, try a single-character phoneme
        if (!foundMatch) {
            const potentialSingleChar = cleanedSyllable.substring(currentIndex, currentIndex + 1);
            if (knownSingleCharPhonemes.includes(potentialSingleChar)) {
                matchedPhoneme = potentialSingleChar;
                currentIndex += 1;
                foundMatch = true;
            } else {
                logger.warn(
                    `[getPhonemeIDsFromSyllableIPA] Unrecognized IPA character/sequence: '${potentialSingleChar}' ` +
                    `at index ${currentIndex} in syllable '${cleanedSyllable}'. Skipping character.`
                );
                currentIndex += 1; 
                continue; 
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
    const cleanedIpa = ipaWord.replace(/[ˈˌ]/g, '');
    return cleanedIpa.split('.').filter(s => s.length > 0);
}

// Helper Function to generate new, unique Firestore Document IDs using modern modular imports
const generateUniqueFirestoreId = () => getFirestore().collection('learningContent').doc().id;

// Helper Function to normalize titles for consistent lookup
const normalizeTitle = (title) => {
    return title.toLowerCase().trim();
};

export {
  getPhonemeIDsFromSyllableIPA,
  splitIpaIntoSyllables,
  generateUniqueFirestoreId,
  normalizeTitle
};
