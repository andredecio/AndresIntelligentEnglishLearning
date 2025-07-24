// functions/index.js Modified today 12/7/25
// --- 1. Module Imports, Firebase Admin SDK Initialization, Gemini Model Initialization, and Schema Definition ---
const functions = require("firebase-functions/v1"); // Main Firebase Functions module MUST BE V1.
const admin = require('firebase-admin'); // Firebase Admin SDK
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Core Google Generative AI SDK (Gemini)
const { Schema, ResponseModality } = require('@firebase/ai'); // IMPORT ResponseModality HERE
const { TextToSpeechClient } = require('@google-cloud/text-to-speech'); 
const textToSpeechClient = new TextToSpeechClient();
functions.logger.info('Firebase Functions code deployed: v1.006K');  //Version audio for vocab, syllables

// Direct initialization of Firebase Admin SDK. This is the most robust way. ---
admin.initializeApp();
// --- CHANGE: Removed previous commented-out 'let _adminAppInstance;' and 'getAdminApp()' helper and their comments.
// These are no longer needed as admin.initializeApp() is called directly.

let _genAIClient;
let _textGenModel;
let _imageGenModel; // Variable for the image generation model

// Define the expected JSON schema for vocabulary content.
const vocabularySchema = Schema.array({
    items: Schema.object({
        properties: {
            TITLE: Schema.string(),
			IPA:  Schema.string(),
            CEFR: Schema.string(),
            DESCRIPTION: Schema.string(),
            THEME: Schema.enumString({ enum: ['General English'] }),
            MODULETYPE: Schema.string(), // Expected: "VOCABULARY" or "VOCABULARY_GROUP"
            WORD_TYPE: Schema.enumString({ enum: ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', "conjunction", "interjection", "article", "determiner"] }),
            MEANING_ORIGIN: Schema.string(),
            PRESENT_SIMPLE_3RD_PERSON_SINGULAR: Schema.string(),
            SIMPLE_PAST: Schema.string(),
            PAST_PARTICIPLE: Schema.string(),
			imagePrompt: Schema.string(),
            items: Schema.array({
                items: Schema.object({
                    properties: {
                        TITLE: Schema.string(),
						IPA:  Schema.string(),
                        CEFR: Schema.string(),
                        DESCRIPTION: Schema.string(),
                        THEME: Schema.enumString({ enum: ['General English'] }),
                        MODULETYPE: Schema.string(), // Expected: "VOCABULARY" for nested items
                        WORD_TYPE: Schema.enumString({ enum: ['noun', 'verb', 'adjective', 'adverb', "pronoun", "preposition", "conjunction", "interjection", "article", "determiner"] }),
                        MEANING_ORIGIN: Schema.string(),
                        PRESENT_SIMPLE_3RD_PERSON_SINGULAR: Schema.string(),
						SIMPLE_PAST: Schema.string(),
						PAST_PARTICIPLE: Schema.string(),
						imagePrompt: Schema.string(),
                    },
                    required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN", "imagePrompt"],
                    propertyOrdering: [
                        "MODULETYPE", "TITLE", "IPA", "DESCRIPTION", "WORD_TYPE", "CEFR", "THEME", "MEANING_ORIGIN", 
						"PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE", "imagePrompt"
					]
                }),
            }),
        },
        required: ["TITLE", "CEFR", "DESCRIPTION", "THEME", "MODULETYPE", "WORD_TYPE", "MEANING_ORIGIN"],
        optionalProperties: ["imagePrompt", "items", "PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE"],
        propertyOrdering: [
            "MODULETYPE", "TITLE", "IPA", "DESCRIPTION", "WORD_TYPE", "CEFR", "THEME", "MEANING_ORIGIN", 
								"PRESENT_SIMPLE_3RD_PERSON_SINGULAR", "SIMPLE_PAST", "PAST_PARTICIPLE", "imagePrompt", "items"

		]
    }),
});

// --- BEGIN: Helper data for phoneme parsing ---
// These lists are crucial for getPhonemeIDsFromSyllableIPA to accurately parse IPA strings.
// Ensure this list is comprehensive and matches the phonemes you expect to encounter.
const allRpPhonemes = [
	

        // --- RP Monophthongs (Long Vowels) ---
	{ ipa: 'iː', titleSuffix: "Long 'ee' sound (as in 'fleece')", theme: 'Vowel' },
	{ ipa: 'ɑː', titleSuffix: "Long 'ah' sound (as in 'start')", theme: 'Vowel' },
	{ ipa: 'ɔː', titleSuffix: "Long 'aw' sound (as in 'thought')", theme: 'Vowel' },
	{ ipa: 'uː', titleSuffix: "Long 'oo' sound (as in 'goose')", theme: 'Vowel' },
	{ ipa: 'ɜː', titleSuffix: "Long 'er' sound (as in 'nurse')", theme: 'Vowel' },
    { ipa: 'ɜːʳ', titleSuffix: "Long 'er' sound (as in 'nurse')rhotic! ", theme: 'Vowel'},
    // --- RP Diphthongs (Vowel Glides) ---
    { ipa: 'eɪ', titleSuffix: "Diphthong 'ay' sound (as in 'face')", theme: 'Diphthong' },
    { ipa: 'aɪ', titleSuffix: "Diphthong 'eye' sound (as in 'my')", theme: 'Diphthong' },
    { ipa: 'ɔɪ', titleSuffix: "Diphthong 'oy' sound (as in 'boy')", theme: 'Diphthong' },
    { ipa: 'əʊ', titleSuffix: "Diphthong 'oh' sound (as in 'goat')", theme: 'Diphthong' },
	{ ipa: 'oʊ', titleSuffix: "Diphthong 'oh' sound (as in 'goat')", theme: 'Diphthong' },
    { ipa: 'aʊ', titleSuffix: "Diphthong 'ow' sound (as in 'mouth')", theme: 'Diphthong' },
	{ ipa: 'ɪəʳ', titleSuffix: "Diphthong 'ear' sound (as in 'near')rhotic!", theme: 'Diphthong' },
	{ ipa: 'eəʳ', titleSuffix: "Diphthong 'air' sound (as in 'square')rhotic!", theme: 'Diphthong' },
	{ ipa: 'ʊəʳ', titleSuffix: "Diphthong 'ure' sound (as in 'cure')rhotic!", theme: 'Diphthong' },
	{ ipa: 'ɪə', titleSuffix: "Diphthong 'ear' sound (as in 'near')", theme: 'Diphthong' },
	{ ipa: 'eə', titleSuffix: "Diphthong 'air' sound (as in 'square')", theme: 'Diphthong' },
	{ ipa: 'ʊə', titleSuffix: "Diphthong 'ure' sound (as in 'cure')", theme: 'Diphthong' },
        // --- Consonants (Affricates) ---
    { ipa: 'tʃ', titleSuffix: "Voiceless 'ch' sound (as in 'church')", theme: 'Consonant' },
	{ ipa: 'dʒ', titleSuffix: "Voiced 'j' sound (as in 'judge')", theme: 'Consonant' },

    
	
	//THE FULL MONTY PHONEMES. ADDED TO FROM PHONEMES > 1 CHARACTER LONG (ABOVE)

  { "ipa": "p", "titleSuffix": "Voiceless bilabial plosive", "theme": "Consonant" },
  { "ipa": "t", "titleSuffix": "Voiceless alveolar plosive", "theme": "Consonant" },
  { "ipa": "b", "titleSuffix": "Voiced bilabial plosive", "theme": "Consonant" },
  { "ipa": "d", "titleSuffix": "Voiced alveolar plosive", "theme": "Consonant" },
  { "ipa": "ʈ", "titleSuffix": "Voiceless retroflex plosive", "theme": "Consonant" },
  { "ipa": "ɖ", "titleSuffix": "Voiced retroflex plosive", "theme": "Consonant" },
  { "ipa": "c", "titleSuffix": "Voiceless palatal plosive", "theme": "Consonant" },
  { "ipa": "ɟ", "titleSuffix": "Voiced palatal plosive", "theme": "Consonant" },
  { "ipa": "k", "titleSuffix": "Voiceless velar plosive", "theme": "Consonant" },
  { "ipa": "ɡ", "titleSuffix": "Voiced velar plosive", "theme": "Consonant" },
  { "ipa": "q", "titleSuffix": "Voiceless uvular plosive", "theme": "Consonant" },
  { "ipa": "ɢ", "titleSuffix": "Voiced uvular plosive", "theme": "Consonant" },
  { "ipa": "ʔ", "titleSuffix": "Glottal stop", "theme": "Consonant" },
  { "ipa": "m", "titleSuffix": "Bilabial nasal", "theme": "Consonant" },
  { "ipa": "ɱ", "titleSuffix": "Labiodental nasal", "theme": "Consonant" },
  { "ipa": "n", "titleSuffix": "Alveolar nasal", "theme": "Consonant" },
  { "ipa": "ɳ", "titleSuffix": "Retroflex nasal", "theme": "Consonant" },
  { "ipa": "ɲ", "titleSuffix": "Palatal nasal", "theme": "Consonant" },
  { "ipa": "ŋ", "titleSuffix": "Velar nasal", "theme": "Consonant" },
  { "ipa": "ɴ", "titleSuffix": "Uvular nasal", "theme": "Consonant" },
  { "ipa": "ʙ", "titleSuffix": "Bilabial trill", "theme": "Consonant" },
  { "ipa": "r", "titleSuffix": "Alveolar trill", "theme": "Consonant" },
  { "ipa": "ʀ", "titleSuffix": "Uvular trill", "theme": "Consonant" },
  { "ipa": "ⱱ", "titleSuffix": "Labiodental flap", "theme": "Consonant" },
  { "ipa": "ɾ", "titleSuffix": "Alveolar tap", "theme": "Consonant" },
  { "ipa": "ɽ", "titleSuffix": "Retroflex flap", "theme": "Consonant" },
  { "ipa": "ɸ", "titleSuffix": "Voiceless bilabial fricative", "theme": "Consonant" },
  { "ipa": "β", "titleSuffix": "Voiced bilabial fricative", "theme": "Consonant" },
  { "ipa": "f", "titleSuffix": "Voiceless labiodental fricative", "theme": "Consonant" },
  { "ipa": "v", "titleSuffix": "Voiced labiodental fricative", "theme": "Consonant" },
  { "ipa": "θ", "titleSuffix": "Voiceless dental fricative", "theme": "Consonant" },
  { "ipa": "ð", "titleSuffix": "Voiced dental fricative", "theme": "Consonant" },
  { "ipa": "s", "titleSuffix": "Voiceless alveolar sibilant", "theme": "Consonant" },
  { "ipa": "z", "titleSuffix": "Voiced alveolar sibilant", "theme": "Consonant" },
  { "ipa": "ʃ", "titleSuffix": "Voiceless postalveolar sibilant", "theme": "Consonant" },
  { "ipa": "ʒ", "titleSuffix": "Voiced postalveolar sibilant", "theme": "Consonant" },
  { "ipa": "ʂ", "titleSuffix": "Voiceless retroflex sibilant", "theme": "Consonant" },
  { "ipa": "ʐ", "titleSuffix": "Voiced retroflex sibilant", "theme": "Consonant" },
  { "ipa": "ç", "titleSuffix": "Voiceless palatal fricative", "theme": "Consonant" },
  { "ipa": "ʝ", "titleSuffix": "Voiced palatal fricative", "theme": "Consonant" },
  { "ipa": "x", "titleSuffix": "Voiceless velar fricative", "theme": "Consonant" },
  { "ipa": "ɣ", "titleSuffix": "Voiced velar fricative", "theme": "Consonant" },
  { "ipa": "χ", "titleSuffix": "Voiceless uvular fricative", "theme": "Consonant" },
  { "ipa": "ʁ", "titleSuffix": "Voiced uvular fricative", "theme": "Consonant" },
  { "ipa": "ħ", "titleSuffix": "Voiceless pharyngeal fricative", "theme": "Consonant" },
  { "ipa": "ʕ", "titleSuffix": "Voiced pharyngeal fricative", "theme": "Consonant" },
  { "ipa": "h", "titleSuffix": "Voiceless glottal fricative", "theme": "Consonant" },
  { "ipa": "ɦ", "titleSuffix": "Voiced glottal fricative", "theme": "Consonant" },
  { "ipa": "ɬ", "titleSuffix": "Voiceless lateral alveolar fricative", "theme": "Consonant" },
  { "ipa": "ɮ", "titleSuffix": "Voiced lateral alveolar fricative", "theme": "Consonant" },
  { "ipa": "ʋ", "titleSuffix": "Labiodental approximant", "theme": "Consonant" },
  { "ipa": "ɹ", "titleSuffix": "Alveolar approximant", "theme": "Consonant" },
  { "ipa": "ɻ", "titleSuffix": "Retroflex approximant", "theme": "Consonant" },
  { "ipa": "j", "titleSuffix": "Palatal approximant", "theme": "Consonant" },
  { "ipa": "ɰ", "titleSuffix": "Velar approximant", "theme": "Consonant" },
  { "ipa": "l", "titleSuffix": "Alveolar lateral approximant", "theme": "Consonant" },
  { "ipa": "ɭ", "titleSuffix": "Retroflex lateral approximant", "theme": "Consonant" },
  { "ipa": "ʎ", "titleSuffix": "Palatal lateral approximant", "theme": "Consonant" },
  { "ipa": "ʟ", "titleSuffix": "Velar lateral approximant", "theme": "Consonant" },
  { "ipa": "ʘ", "titleSuffix": "Bilabial click", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ǀ", "titleSuffix": "Dental click", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ǃ", "titleSuffix": "Alveolar click", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ǂ", "titleSuffix": "Palatal click", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ǁ", "titleSuffix": "Alveolar lateral click", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ɓ", "titleSuffix": "Voiced bilabial implosive", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ɗ", "titleSuffix": "Voiced dental/alveolar implosive", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ʄ", "titleSuffix": "Voiced palatal implosive", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ɠ", "titleSuffix": "Voiced velar implosive", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "ʛ", "titleSuffix": "Voiced uvular implosive", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "pʼ", "titleSuffix": "Bilabial ejective", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "tʼ", "titleSuffix": "Alveolar ejective", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "kʼ", "titleSuffix": "Velar ejective", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "sʼ", "titleSuffix": "Alveolar ejective fricative", "theme": "Non-Pulmonic Consonant" },
  { "ipa": "i", "titleSuffix": "Close front unrounded vowel", "theme": "Vowel" },
  { "ipa": "y", "titleSuffix": "Close front rounded vowel", "theme": "Vowel" },
  { "ipa": "ɨ", "titleSuffix": "Close central unrounded vowel", "theme": "Vowel" },
  { "ipa": "ʉ", "titleSuffix": "Close central rounded vowel", "theme": "Vowel" },
  { "ipa": "ɯ", "titleSuffix": "Close back unrounded vowel", "theme": "Vowel" },
  { "ipa": "u", "titleSuffix": "Close back rounded vowel", "theme": "Vowel" },
  { "ipa": "ɪ", "titleSuffix": "Near-close near-front unrounded vowel", "theme": "Vowel" },
  { "ipa": "ʏ", "titleSuffix": "Near-close near-front rounded vowel", "theme": "Vowel" },
  { "ipa": "ʊ", "titleSuffix": "Near-close near-back rounded vowel", "theme": "Vowel" },
  { "ipa": "e", "titleSuffix": "Close-mid front unrounded vowel", "theme": "Vowel" },
  { "ipa": "ø", "titleSuffix": "Close-mid front rounded vowel", "theme": "Vowel" },
  { "ipa": "ɘ", "titleSuffix": "Close-mid central unrounded vowel", "theme": "Vowel" },
  { "ipa": "ɵ", "titleSuffix": "Close-mid central rounded vowel", "theme": "Vowel" },
  { "ipa": "ɤ", "titleSuffix": "Close-mid back unrounded vowel", "theme": "Vowel" },
  { "ipa": "o", "titleSuffix": "Close-mid back rounded vowel", "theme": "Vowel" },
  { "ipa": "ɛ", "titleSuffix": "Open-mid front unrounded vowel", "theme": "Vowel" },
  { "ipa": "œ", "titleSuffix": "Open-mid front rounded vowel", "theme": "Vowel" },
  { "ipa": "ɜ", "titleSuffix": "Open-mid central unrounded vowel", "theme": "Vowel" },
  { "ipa": "ɞ", "titleSuffix": "Open-mid central rounded vowel", "theme": "Vowel" },
  { "ipa": "ʌ", "titleSuffix": "Open-mid back unrounded vowel", "theme": "Vowel" },
  { "ipa": "ɔ", "titleSuffix": "Open-mid back rounded vowel", "theme": "Vowel" },
  { "ipa": "æ", "titleSuffix": "Near-open front unrounded vowel", "theme": "Vowel" },
  { "ipa": "ɐ", "titleSuffix": "Near-open central vowel", "theme": "Vowel" },
  { "ipa": "a", "titleSuffix": "Open front unrounded vowel", "theme": "Vowel" },
  { "ipa": "ɶ", "titleSuffix": "Open front rounded vowel", "theme": "Vowel" },
  { "ipa": "ɑ", "titleSuffix": "Open back unrounded vowel", "theme": "Vowel" },
  { "ipa": "ɒ", "titleSuffix": "Open back rounded vowel", "theme": "Vowel" },
  { "ipa": "ʍ", "titleSuffix": "Voiceless labial-velar fricative", "theme": "Consonant" },
  { "ipa": "w", "titleSuffix": "Voiced labial-velar approximant", "theme": "Consonant" },
  { "ipa": "ɥ", "titleSuffix": "Voiced labial-palatal approximant", "theme": "Consonant" },
  { "ipa": "ʜ", "titleSuffix": "Voiceless epiglottal fricative", "theme": "Consonant" },
  { "ipa": "ʢ", "titleSuffix": "Voiced epiglottal fricative", "theme": "Consonant" },
  { "ipa": "ʡ", "titleSuffix": "Epiglottal stop", "theme": "Consonant" },
  { "ipa": "ɕ", "titleSuffix": "Voiceless alveolo-palatal sibilant", "theme": "Consonant" },
  { "ipa": "ʑ", "titleSuffix": "Voiced alveolo-palatal sibilant", "theme": "Consonant" },
  { "ipa": "ɺ", "titleSuffix": "Alveolar lateral flap", "theme": "Consonant" },
  { "ipa": "ɧ", "titleSuffix": "Velar-palatal fricative", "theme": "Consonant" },
  { "ipa": "ə", "titleSuffix": "Schwa sound (as in 'about', unstressed)", "theme": 'Vowel' }

]

// Pre-sort for efficient parsing: try longest phonemes first.
// Filter and map all phonemes based on their length.
const knownThreeCharPhonemes = allRpPhonemes.filter(p => p.ipa.length === 3).map(p => p.ipa).sort((a, b) => b.length - a.length);
const knownTwoCharPhonemes = allRpPhonemes.filter(p => p.ipa.length === 2).map(p => p.ipa).sort((a, b) => b.length - a.length);
const knownSingleCharPhonemes = allRpPhonemes.filter(p => p.ipa.length === 1).map(p => p.ipa);

/**
 * Parses an IPA syllable string into an array of its constituent phoneme IPA symbols.
 * This function handles 1, 2, and 3-character IPA phonemes.
 * It relies on globally defined 'knownThreeCharPhonemes', 'knownTwoCharPhonemes', and 'knownSingleCharPhonemes'.
 * It will log and skip unrecognized characters, rather than stopping parsing.
 * @param {string} ipaSyllable - The IPA string of the syllable (e.g., 'dʒɪt', 'ɜːʳ').
 * @returns {string[]} An array of phoneme IPA symbols (e.g., ['dʒ', 'ɪ', 't'], ['ɜːʳ']).
 */
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

/**
 * Splits an IPA string into an array of syllables based on '.' delimiters.
 * Removes stress marks (ˈ, ˌ) and ensures consistency.
 * @param {string} ipaWord - The IPA string of the word (e.g., 'ˈɛk.skə.veɪt').
 * @returns {string[]} An array of IPA syllables (e.g., ['ɛk', 'skə', 'veɪt']).
 */
function splitIpaIntoSyllables(ipaWord) {
    if (!ipaWord) {
        return [];
    }
    // Remove primary and secondary stress marks before splitting
    const cleanedIpa = ipaWord.replace(/[ˈˌ]/g, '');
    return cleanedIpa.split('.').filter(s => s.length > 0);
}

// 

/** --- New Helper Function ---
 * Purpose: To interact with an external dictionary API to get the IPA and syllable breakdown for a given English word.
 * Implementation Note: This is a placeholder. You'll need to replace this with actual API integration.
 * Consider installing 'node-fetch' or 'axios' if you haven't already: npm install node-fetch
 * @param {string} word - The English word to fetch phonetics for.
 * @returns {Promise<{fullIpa: string, syllables: Array<{ipa: string, text: string}>}|null>} Phonetics data or null if not found.
 */

/**--- 2md New Helper Function ---
 * Purpose: A reusable function to synthesize speech using Google Cloud Text-to-Speech and upload the resulting MP3 to Cloud Storage.
 * @param {string} text - The actual word/syllable string for audio synthesis.
 * @param {string} ipaForSsml - The IPA string to be used in the SSML <phoneme> tag's ph attribute for precise pronunciation.
 * @param {string} fileNamePrefix - The base for the MP3 filename (e.g., 'word_title', 'syllable_ipa').
 * @param {string} storagePathPrefix - The folder in Cloud Storage (e.g., 'word_audio/', 'syllable_audio/').
 * @returns {Promise<string|null>} The publicly accessible URL of the uploaded audio, or null if an error occurred.
 */
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



// Helper function to get or create the Gemini text generation model instance
function getTextGenModel() {
    if (!_textGenModel) {
        const GEMINI_API_KEY = functions.config().gemini.api_key;
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is not configured. Run 'firebase functions:config:set gemini.api_key=\"YOUR_KEY\"' and redeploy.");
        }
        _genAIClient = new GoogleGenerativeAI(GEMINI_API_KEY);
        _textGenModel = _genAIClient.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: vocabularySchema,
                maxOutputTokens: 20000, // <--- ADD THIS LINE (Line 67)
            }
        });
    }
    return _textGenModel;
}

// Helper function to get or create the Gemini image generation model instance
function getImageGenModel() {
    if (!_imageGenModel) {
        const GEMINI_API_KEY = functions.config().gemini.api_key;
        if (!GEMINI_API_KEY) {
            throw new Error("Gemini API Key is not configured for image generation. Run 'firebase functions:config:set gemini.api_key=\"YOUR_KEY\"' and redeploy.");
        }
        // Ensure _genAIClient is initialized before getting the model
        _genAIClient = _genAIClient || new GoogleGenerativeAI(GEMINI_API_KEY);
        _imageGenModel = _genAIClient.getGenerativeModel({
            model: "gemini-2.0-flash-preview-image-generation", // Use the new image generation model
            // ADD THIS CONFIGURATION BLOCK:
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"]

            },
        });
    }
    return _imageGenModel;
}

// This is the last line of section 1
// This is the beginning of section 2

// --- 2. Helper Functions, User Deletion Handler, and Vocabulary Content Generation ---

// Helper Function to generate new, unique Firestore Document IDs
// --- CHANGE: Updated to use admin.firestore() directly. ---
const generateUniqueFirestoreId = () => admin.firestore().collection('learningContent').doc().id;

// Helper Function to normalize titles for consistent lookup (e.g., for deduplication)
const normalizeTitle = (title) => {
    return title.toLowerCase().trim();
};
// --- Existing: Mark User as Deleted Function ---
// This function is triggered when a user is deleted from Firebase Authentication.
// It marks their corresponding Firestore document as deleted rather than removing it.
const handleUserDeletion = async (userRecord) => {
    // --- CHANGE: Updated to use admin.firestore() directly. ---
    const db = admin.firestore();
    const userId = userRecord.uid;
    const userEmail = userRecord.email;

    functions.logger.log(`Auth user deletion detected for UID: ${userId}, Email: ${userEmail || 'N/A'}.`);

    const userDocRef = db.collection("users").doc(userId);

    try {
        const docSnapshot = await userDocRef.get();

        if (docSnapshot.exists) {
            // --- CHANGE: Fixed typo (removed 'f' before await). ---
            await userDocRef.update({
                isDeleted: true,
                deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            functions.logger.log(`Firestore document for user ${userId} successfully marked as deleted. All data retained.`);
            return { status: "success", message: `Document for ${userId} marked as deleted, data retained.` };
        } else {
            functions.logger.log(`Firestore document for UID ${userId} not found. No marking needed as no data exists to retain.`);
            return { status: "success", message: `No document found for ${userId}.` };
        }
    } catch (error) {
        functions.logger.error(`Error marking user ${userId} as deleted in Firestore:`, error);
        throw new Error(`Failed to mark user as deleted: ${error.message}`);
    }
};
exports.markUserAsDeletedInFirestore = functions.region('asia-southeast1').auth.user().onDelete(handleUserDeletion);

// --- generateVocabularyContent Callable Function ---
// This function is called from your AdminSystem webpage to generate new vocabulary content using Gemini.

exports.generateVocabularyContent = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    // --- Security Check (Crucial for Admin Functions) ---
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    if (!context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Only authorized administrators can perform this action.');
    }
    // --- End Security Check ---

    const { cefrLevel, numWords, theme } = data;

    if (!cefrLevel || !numWords || !theme || numWords <= 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Words, and Theme are required and must be valid.'
        );
    }

    functions.logger.info(`AdminSystem: Starting content generation for CEFR: ${cefrLevel}, Words: ${numWords}, Theme: ${theme}`);

    const textGenModel = getTextGenModel(); // Get the Gemini text generation model instance
    const firestore = admin.firestore(); 
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
	const skippedWords = [];
	let geminiReturnedItemCount = 0;
    let topLevelVocabCount = 0;
    let vocabGroupCount = 0;
    let nestedVocabCount = 0;
    try {
        // --- 1. Construct the sophisticated prompt for Gemini ---
        const geminiPrompt = `
        Generate a JSON array of ${numWords} vocabulary items for CEFR ${cefrLevel} level, themed around "${theme}".
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **VOCABULARY_GROUP** (for words with multiple distinct meanings ):
            - "MODULETYPE": "VOCABULARY_GROUP"
            - "TITLE": The word (or phrase)
            - "CEFR": This must be "A1"
            - "DESCRIPTION": This must be empty
            - "THEME":This must be ${theme}
            - "WORD_TYPE": This must be empty
            - "MEANING_ORIGIN": This must contain ONLY details of the group's origin, etymology, common prefixes, infixes, or suffixes relevant to the group, NOT it's meaning.
            - "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": This must be empty
            - "SIMPLE_PAST": This must be empty
            - "PAST_PARTICIPLE": This must be empty
			- "items": An array of nested "VOCABULARY" modules, each defining a unique meaning of the word.

        2.  **VOCABULARY** (for single-meaning words, or individual meanings within a VOCABULARY_GROUP):
            - "MODULETYPE": "VOCABULARY"
            - "TITLE": The word (or phrase)
			- "IPA": String. The British English (RP) IPA transcription of the word. This MUST include:
                - Primary stress marks (ˈ)
                - Secondary stress marks (ˌ)
                - **Syllable delimiters (.), accurately placed between syllables.**
                For example:
                - "music" should be "ˈmjuː.zɪk" 
                - "apple" should be "ˈæp.əl"
                - "elephant" should be "ˈel.ɪ.fənt"
                - "important" should be "ɪmˈpɔː.tənt"
			- "CEFR": This must be "A1"
            - "DESCRIPTION": Must be 3 numbered sentences (e.g., "1. Sentence one. 2. Sentence two. 3. Sentence three.") that use the word in the context of its specific meaning
            - "THEME":This must be ${theme}
            - "WORD_TYPE": This must be one of the following: "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "article", "determiner"
            - "MEANING_ORIGIN": This must contain the meaning of the specific instance of the word. This must be followed by details of the word's origin, etymology, common prefixes, infixes, or suffixes relevant to the group.
            - "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": This has a value only when WORD_TYPE = "verb". Provide the 3rd person singular simple present tense form, e.g., "eats" for "eat"
            - "SIMPLE_PAST": This has a value only when WORD_TYPE = "verb". Provide the simple past tense form, e.g., "ate" for "eat"
            - "PAST_PARTICIPLE": This has a value only when WORD_TYPE = "verb". Provide the past participle form, e.g., "eaten" for "eat"
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on one of the sentences in the DESCRIPTION field. (Only for MODULETYPE "VOCABULARY")

        **Crucial Rules for Generation:**
        - ALWAYS check first if a word has more than one meaning. You MUST create a document with VOCABULARY_GROUP MODULETYPE for a word when there is more than one possible meaning of that word. That VOCABULARY_GROUP document must have a null WORD_TYPE.Create a VOCABULARY_GROUP record if there is more than 1 meaning of the word eg. 'present' can be a verb or a noun each with different pronunciation.
		- **MODULETYPE:** You MUST create a unique VOCABULARY MODULETYPE document for EACH and EVERY POSSIBLE meaning of any given word. For example 'set' has more than 10 separarate meanings, so it MUST cause the creation of a VOCABULARY_GROUP MODULETYPE document, and at least 10 documents for that word with a MODULETYPE of VOCABULARY, each with their specific values for the other relevant fields described here.      
		- **CEFR Hierarchy:** For All VOCABULARY AND VOCABULARY_GROUP modules, their 'CEFR' level MUST be set to "A1").
        - **Polysemy:** If a word has multiple *distinct* meanings or functions including as different parts of speech (e.g., "book" as a noun and "book" as a verb; "like" as a verb and as an adjective, and as a preposition, and as a conjunction ), you MUST create a "VOCABULARY_GROUP" for it. This "VOCABULARY_GROUP" must contain individual "VOCABULARY" entries for *each* distinct meaning and/or part of speech. If a word has only one primary meaning, create only a single "VOCABULARY" entry directly.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output. These will be generated by the Cloud Function.
        - **Number of Items:** Aim to generate exactly ${numWords} top-level vocabulary items (including VOCABULARY_GROUPs).
        - **WORD_TYPE:** Values for 'WORD_TYPE' may only exist for modules with a MODULETYPE of 'VOCABULARY'.That is because a word could have more than one 'WORD_TYPE'.**This field MUST ONLY be provided for modules with "MODULETYPE": "VOCABULARY".
        - **TITLE:** This field must contain the word exclusively.
        - **MEANING_ORIGIN:** You MUST include a description of the particular meaning of that instance of a VOCABULARY MODULETYPE document AND you must add to that a description of the etymology of that instance of the word also.
		- **IPA**: This field MUST contain the British English (RP) IPA transcription, including primary (ˈ) and secondary (ˌ) stress marks, and syllable delimiters (.). Ensure accurate syllable breakdown.**This field MUST ONLY be provided for modules with "MODULETYPE": "VOCABULARY". For "VOCABULARY_GROUP" modules, this field MUST be omitted or be an empty string.**
		
		Example structure for output (simplified, real output will have more fields per module as per rules):
        [
          {
            "TITLE": "cat",
			"IPA": "kæt",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. The cat sat. 2. The cat purred. 3. I like cats.",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "A carnivorous mammal of the Genus 'Felis'.originates from the Old English word "catt" (masculine) and "catte" (feminine), which themselves are derived from the Proto-West Germanic *kattu. This Germanic form likely comes from the Late Latin *cattus, first appearing around the 6th century.  ",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",
			"imagePrompt": "A fluffy cat sitting."
          },
          {
            "TITLE": "set",
            "MODULETYPE": "VOCABULARY_GROUP",
            "CEFR": "A1",
            "DESCRIPTION": "",
            "THEME":"General English",
            "WORD_TYPE": "",
            "MEANING_ORIGIN": "Old English settan, of Germanic origin; related to Dutch zetten, German setzen, also to sit."
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",

		 },
          {
            "TITLE": "set", 
            "IPA": "sɛt",
			"MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. He set the scene. 2. Have you set the table? 3. Let me set the record straight.",
            "THEME": "General English",
            "WORD_TYPE": "verb",
            "MEANING_ORIGIN": "1. put or bring into a specified state.2. put, lay, or stand (something) in a specified place or position. Old English 'settan', of Germanic origin; related to Dutch zetten, German 'setzen', also 'to sit'.",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "sets",
            "SIMPLE_PAST": "set",
            "PAST_PARTICIPLE": "set",
			"imagePrompt": "A person setting a table for a meal."
			},
          {
            "TITLE": "set",
			"IPA": "sɛt",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. Do you have a set of golf clubs? 2. I would like the whole album set. 3. Is this the complete set?",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "a group of similar things that belong together in some way. The most common meaning of "set" as a noun refers to a group of related items. This sense is related to the Old English word "set" meaning "seat" or "place," and also the Middle English "set" referring to a group or sequence. ",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",
			"imagePrompt": "A golfer holding a set of clubs."
		  },
		  {
            "TITLE": "music", 
			"IPA": "ˈmjuː.zɪk", 
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. I love to listen to music. 2. The music filled the room. 3. She studies music theory.",
            "THEME": "General English",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "The art of combining vocal or instrumental sounds in a harmonious or expressive way. From Old French musique, from Latin musica, from Greek mousikē (tekhnē) 'art of the Muses'.",
            "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": "",
            "SIMPLE_PAST": "",
            "PAST_PARTICIPLE": "",
            "imagePrompt": "People enjoying live music at a concert.",
        }
			
			]
        `; // This closes the backtick for the geminiPrompt multiline string.

        const result = await textGenModel.generateContent(geminiPrompt);
        const response = await result.response;
        const text = response.text();

		functions.logger.info(`Received text from Gemini. Length: ${text.length}`);
        functions.logger.info(`Raw text (first 500 chars): ${text.substring(0, 500)}`);
        functions.logger.info(`Raw text (last 500 chars): ${text.length > 500 ? text.substring(text.length - 500) : text}`);


        let generatedContent;
        try {
            generatedContent = JSON.parse(text);
			geminiReturnedItemCount = generatedContent.length; //  SET THE COUNT HERE 
            functions.logger.info(`Gemini returned ${geminiReturnedItemCount} top-level JSON items.`);
	   } catch (parseError) {
            functions.logger.error("Failed to parse Gemini output as JSON:", { rawText: text, error: parseError });
            throw new functions.https.HttpsError('internal', 'AI generation failed: Invalid JSON output from Gemini.', { rawResponse: text, parseError: parseError.message });
        }

        // --- 2. Process Generated Content and Write to Firestore (with Deduplication) ---
        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'VOCABULARY';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['VOCABULARY', 'VOCABULARY_GROUP'])
                .where('normalizedTitle', '==', itemNormalizedTitle)
                .limit(1)
                .get();

            if (!existingContentSnapshot.empty) {
                functions.logger.info(`Skipping "${item.TITLE}" (${itemModuleType}) as a record with this title already exists.`);
                numSkipped++;
                skippedWords.push(item.TITLE);
				continue;
            }

            // --- If the item is NOT skipped, process it and add to the Firestore batch ---
            if (itemModuleType === "VOCABULARY_GROUP") {
                vocabGroupCount++;
				functions.logger.info(`Processing VOCABULARY_GROUP: "${item.TITLE}".`);
				const groupId = generateUniqueFirestoreId();
                const groupRef = firestore.collection('learningContent').doc(groupId);
                const meaningIds = [];

                if (Array.isArray(item.items)) {
                    for (const meaning of item.items) {
                        if (meaning.MODULETYPE === "VOCABULARY") {
                            nestedVocabCount++;
							functions.logger.info(`  - Processing nested VOCABULARY item: "${meaning.TITLE}".`);
							const vocabId = generateUniqueFirestoreId();
                            const vocabRef = firestore.collection('learningContent').doc(vocabId);
                            //new bit below
							const verbFields = (meaning.WORD_TYPE === 'verb') ? {
							PRESENT_SIMPLE_3RD_PERSON_SINGULAR: meaning.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || null,
							SIMPLE_PAST: meaning.SIMPLE_PAST || null,
							PAST_PARTICIPLE: meaning.PAST_PARTICIPLE || null,
								} : {};
							//
						   batch.set(vocabRef, {
                                MODULEID: vocabId,
                                MODULETYPE: "VOCABULARY",
                                TITLE: meaning.TITLE,
                                normalizedTitle: normalizeTitle(meaning.TITLE),
								IPA: meaning.IPA,
                                CEFR: meaning.CEFR,
                                DESCRIPTION: meaning.DESCRIPTION,
                                imagePrompt: meaning.imagePrompt,
                                THEME: meaning.THEME,
                                WORD_TYPE: meaning.WORD_TYPE,
                                MEANING_ORIGIN: meaning.MEANING_ORIGIN,
								PRESENT_SIMPLE_3RD_PERSON_SINGULAR: meaning.PRESENT_SIMPLE_3RD_PERSON_SINGULAR,
								SIMPLE_PAST: meaning.SIMPLE_PAST,
								PAST_PARTICIPLE: meaning.PAST_PARTICIPLE,
								IMAGEURL: "", // Placeholder for image URL
                                imageStatus: "pending", // Mark for batch image generation
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            meaningIds.push(vocabId);
                        } else {
                            functions.logger.warn(`Unexpected module type found in VOCABULARY_GROUP items: ${meaning.MODULETYPE}. Skipping nested item.`);
                        }
                    }
                }

                batch.set(groupRef, {
                    MODULEID: groupId,
                    MODULETYPE: "VOCABULARY_GROUP",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    THEME: item.THEME,
                    WORD_TYPE: item.WORD_TYPE,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR,
					SIMPLE_PAST: item.SIMPLE_PAST,
					PAST_PARTICIPLE: item.PAST_PARTICIPLE,
					MODULEID_ARRAY: meaningIds,
                    IMAGEURL: "",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(groupId);

            } else if (itemModuleType === "VOCABULARY") {
                 topLevelVocabCount++; 
                functions.logger.info(`Processing top-level VOCABULARY: "${item.TITLE}".`); 
				const vocabId = generateUniqueFirestoreId();
                const vocabRef = firestore.collection('learningContent').doc(vocabId);
				// --- NEW: Conditionally add verb conjugation fields ---
							const verbFields = (item.WORD_TYPE === 'verb') ? {
							PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || null,
							SIMPLE_PAST: item.SIMPLE_PAST || null,
							PAST_PARTICIPLE: item.PAST_PARTICIPLE || null,
						} : {};

                batch.set(vocabRef, {
                    MODULEID: vocabId,
                    MODULETYPE: "VOCABULARY",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
					IPA: item.IPA,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    WORD_TYPE: item.WORD_TYPE,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR,
					SIMPLE_PAST: item.SIMPLE_PAST,
					PAST_PARTICIPLE: item.PAST_PARTICIPLE,
					IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                createdModuleIds.push(vocabId);

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } // End of for (const item of generatedContent) loop

        await batch.commit();

 functions.logger.info(`Content generation summary: Requested ${numWords}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelVocabCount} top-level VOCABULARY, ${vocabGroupCount} VOCABULARY_GROUPs (containing ${nestedVocabCount} nested VOCABULARY items). Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`);//        // --- CHANGE: Trigger batchGenerateVocabularyImages (cleaned up and restored) ---
//        try {
//            // Get the functions client directly from the initialized admin object.
//            const functionsClient = admin.functions('asia-southeast1');
//            const callBatchImageGeneration = functionsClient.httpsCallable('batchGenerateVocabularyImages');
//            await callBatchImageGeneration({});
//            functions.logger.info('Successfully triggered batchGenerateVocabularyImages after content creation.');
//        } catch (callError) {
//            // Log the error but don't re-throw, as content creation was already successful.
//            functions.logger.error('Failed to trigger batchGenerateVocabularyImages (callable function):', callError);
//        }
        // --- END CHANGE: Trigger batchGenerateVocabularyImages ---

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
			skippedWords: skippedWords,
			geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelVocabCount: topLevelVocabCount,
            vocabGroupCount: vocabGroupCount,
            nestedVocabCount: nestedVocabCount
		};

    } catch (error) {
        functions.logger.error("Error generating or saving content:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}) // This closes the exports.generateVocabularyContent function definition


// --- NEW: Scheduled Function to populate the initial RP Phonemes Collection ---
// This function can be triggered manually from the GCP Console (Functions -> 'populatePhonemesScheduled' -> Trigger Now)
// It will also run automatically once a year, though that's a side result. We dont want to use that.
exports.populatePhonemesScheduled = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).pubsub.schedule('0 0 1 1 *')
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


// --- NEW: Scheduled Function to populate the Syllables Collection ---
// This function can be triggered manually from the Firebase Console (Functions -> 'populateSyllablesScheduled' -> Trigger Now)
// It will run automatically once a year (Jan 1st), but you'll primarily trigger it manually for one-time setup.
exports.populateSyllablesScheduled = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).pubsub.schedule('0 0 1 1 *') // Runs Jan 1st (manual trigger is primary use)
    .onRun(async (context) => {
        const firestore = admin.firestore();
        const bucket = admin.storage().bucket();
        const ttsClient = new TextToSpeechClient();
        const collectionName = 'syllables';
        const batch = firestore.batch();
        const now = admin.firestore.FieldValue.serverTimestamp();

        // --- IMPORTANT: PASTE YOUR GENERATED 3000 SYLLABLES ARRAY HERE! ---
        // This array will be generated by the separate Node.js script described below.
        // It should look like: [{ ipa: 'li', title: "Syllable: li" }, { ipa: 'ʌ', title: "Syllable: ʌ" }, ...]
        const commonEnglishSyllables = 

    functions.logger.info(`[populateSyllablesScheduled] Starting to create ${commonEnglishSyllables.length} English syllable documents...`);

        try {
            for (const s of commonEnglishSyllables) {
                // *** MODIFICATION: Use raw IPA as the Document ID ***
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

                    // *** MODIFICATION: Audio file name uses raw IPA ***
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

                // --- NEW ADDITION: CALL THE NEW HELPER FUNCTION HERE TO POPULATE MODULEID_ARRAY ---
                const phonemeModuleIDsForSyllable = getPhonemeIDsFromSyllableIPA(s.ipa);
                functions.logger.info(`Syllable '${s.ipa}' decomposed into phonemes: ${JSON.stringify(phonemeModuleIDsForSyllable)}`);

                const baseDocData = {
                    MODULEID: moduleID, // This field now matches the Document ID directly (the raw IPA)
                    MODULETYPE: 'SYLLABLE',
                    TITLE: `Syllable: ${s.ipa}`, // *** MODIFICATION: Updated title format to use raw IPA ***
                    IPA: s.ipa,
                    DESCRIPTION: `Audio and details for the English syllable "${s.ipa}".`,
                    normalizedTitle: s.ipa.toLowerCase(),
                    audioUrl: newAudioUrl,
                    MODULEID_ARRAY: phonemeModuleIDsForSyllable, // *** MODIFICATION: Populate with the parsed phoneme IDs ***
                    createdAt: now,
                    updatedAt: now,
                };

                if (docSnapshot.exists) {
                    batch.update(syllableDocRef, {
                        ...baseDocData,
                        createdAt: docSnapshot.data().createdAt,
                        // Ensure MODULEID_ARRAY is updated with the new parsing logic
                        MODULEID_ARRAY: phonemeModuleIDsForSyllable, // *** MODIFICATION: Ensure update applies the new array ***
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
// This is the beginning of section 3

// --- 3. Image Generation Logic and Cloud Function Triggers (Firestore and PubSub) ---

/**
 * Helper function to process image generation and upload for a single vocabulary item.
 * This function is designed to be reusable by both the Firestore onCreate trigger
 * and the scheduled batch function.
 * @param {admin.firestore.DocumentSnapshot} doc - The Firestore DocumentSnapshot of the vocabulary item.
 */
async function processVocabularyImageGeneration(doc) {
    // --- CHANGE: Updated to use admin.firestore() and admin.storage() directly. ---
    const firestore = admin.firestore();
    const storage = admin.storage();
    const bucket = storage.bucket(admin.app().options.storageBucket); // admin.app() here is okay as it gets the default app instance.

    const vocabData = doc.data();
    const vocabRef = doc.ref;
    const imagePrompt = vocabData.imagePrompt;
    const vocabId = vocabData.MODULEID;

    // Skip if there's no image prompt or if it's not a VOCABULARY type (though this should be filtered by query/trigger)
    if (!imagePrompt || vocabData.MODULETYPE !== "VOCABULARY") {
        functions.logger.info(`Skipping image generation for ${vocabId}: No image prompt or wrong MODULETYPE.`);
        return { id: vocabId, status: 'skipped', reason: 'No image prompt or wrong MODULETYPE' };
    }

    try { // <-- This 'try' block starts here
        // Mark status as 'generating' immediately.
        // This prevents other concurrent invocations from trying to process the same image.
        await vocabRef.update({ imageStatus: 'generating' });
        functions.logger.info(`Processing image for ${vocabId} with prompt: "${imagePrompt}"`);

        const imageGenModel = getImageGenModel(); // Get the Gemini image generation model

        // Generate content (image) using Gemini
        const result = await imageGenModel.generateContent({
            contents: [{ parts: [{ text: imagePrompt }] }],
            generationConfig: {
                responseModalities: ["TEXT", "IMAGE"] // Explicitly pass it here too, matching the error message order
                // responseMimeType: "image/png" // Any other settings you might need
            }
        });

        // The image data is usually found within the `candidates` array.
        // It's typically base64 encoded and needs to be decoded.
        // Refer to Gemini API documentation for exact response structure of image generation.
        const response = result.response;

        // 🟦 BEGIN CHANGE: Update log sanitization to dynamically find the image part
        const loggableResponse = JSON.parse(JSON.stringify(response)); // Deep copy
        if (loggableResponse.candidates && loggableResponse.candidates[0] &&
            loggableResponse.candidates[0].content && loggableResponse.candidates[0].content.parts) {
            // Find the image part and sanitize its data for logging
            const imagePartForLogging = loggableResponse.candidates[0].content.parts.find(
                p => p.inlineData && p.inlineData.data
            );
            if (imagePartForLogging) {
                imagePartForLogging.inlineData.data = '[IMAGE_DATA_OMITTED_FOR_LOGGING_SIZE]';
            }
        }
        // 🟦 END CHANGE: Update log sanitization to dynamically find the image part
        functions.logger.info('Gemini Image Gen Raw Response (Sanitized):', JSON.stringify(loggableResponse, null, 2));
        const candidates = response.candidates;

        if (!candidates || candidates.length === 0 || !candidates[0].content || !candidates[0].content.parts || candidates[0].content.parts.length === 0) {
            throw new Error("No candidates or content parts found in Gemini response.");
        }

        const imagePart = candidates[0].content.parts.find(part => part.inlineData && part.inlineData.data);

        if (!imagePart) { // 🟦 Moved this check directly after finding the imagePart
            throw new Error("No image data (inlineData) part found in Gemini response.");
        }

        const mimeType = imagePart.inlineData.mimeType;
        const imageDataBase64 = imagePart.inlineData.data;
        const imageDataBuffer = Buffer.from(imageDataBase64, 'base64'); // Decode base64 to buffer

        const fileExtension = mimeType.split('/')[1] || 'png'; // e.g., 'image/png' -> 'png'
        const filePath = `vocabulary_images/${vocabId}.${fileExtension}`; // Path in Cloud Storage bucket
        const file = bucket.file(filePath);

        // Upload the generated image data to Cloud Storage
        await file.save(imageDataBuffer, {
            metadata: {
                contentType: mimeType, // Use the detected MIME type
            },
        });

        // Make the file publicly accessible.
        await file.makePublic();
        const publicUrl = file.publicUrl();

        // Update the Firestore document with the image URL and mark as completed
        await vocabRef.update({
            IMAGEURL: publicUrl,
            imageStatus: 'completed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.info(`Successfully generated and uploaded image for ${vocabId}. URL: ${publicUrl}`);
        return { id: vocabId, status: 'completed', url: publicUrl };
    } // <-- This is the missing closing brace for the 'try' block!
    catch (imgError) {
        // If image generation or upload fails for this item, mark its status as 'failed'
        await vocabRef.update({
            imageStatus: 'failed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        functions.logger.error(`Failed to generate or upload image for ${vocabId}:`, imgError);
        return { id: vocabId, status: 'failed', error: imgError.message };
    }
}
// --- Cloud Firestore onCreate Trigger for New Vocabulary Content ---
// This function is triggered when a new document is created in the 'learningContent' collection.
// It is responsible for enriching vocabulary content with phonetics, audio, and syllable breakdowns,
// and then triggering image generation.

exports.onNewVocabularyContentCreate = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 }).firestore
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

                    functions.logger.warn(`Document ${docId} has no TITLE. Cannot fetch phonetics.`);
                

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
// --- batchGenerateVocabularyImages NOW a Callable Function ---
// This function will be triggered upon successful completion of generateVocabularyContent
// to catch any remaining pending vocabulary items for image generation.
// --- CHANGE: Changed from pubsub.schedule to https.onCall, and added .runWith() for timeout. ---
exports.batchGenerateVocabularyImages = functions.region('asia-southeast1').runWith({ timeoutSeconds: 540 })
    .pubsub.schedule('every 24 hours') // This sets the schedule!
    .onRun(async (context) => {
	const firestore = admin.firestore();

    functions.logger.info('Starting batch image generation for pending vocabulary items via explicit call.'); // UPDATED LOG MESSAGE

    try {
        // Query for VOCABULARY items that are pending image generation
        // --- CHANGE: Limit increased to 100 as per discussion. ---
        const pendingVocabSnapshot = await firestore.collection('learningContent')
            .where('MODULETYPE', '==', 'VOCABULARY')
            .where('imageStatus', '==', 'pending')
            .limit(100) // Process a manageable batch at a time
            .get();

        if (pendingVocabSnapshot.empty) {
            functions.logger.info('No pending vocabulary items found for batch image generation.');
            return null;
        }

        const imageGenerationPromises = [];

        for (const doc of pendingVocabSnapshot.docs) {
            // Add the image generation process to a list of promises, using the reusable helper
            imageGenerationPromises.push(processVocabularyImageGeneration(doc));
        }

        // Run all image generation and upload promises concurrently
        const results = await Promise.all(imageGenerationPromises);

        functions.logger.info('Batch image generation completed. Results:', results);
        return null;

    } catch (error) {
        functions.logger.error("Error in batch image generation process:", error);
        // --- CHANGE: For callable functions, throw an HttpsError on failure. ---
        throw error;
    }
}) // This closes the exports.batchGenerateVocabularyImages function definition
// --- 8. Freeze Exports ---
// This prevents accidental modifications to the exports object during runtime,
// ensuring a stable execution environment for all exported functions.
// This line should be the very last line in your functions/index.js file.
Object.freeze(exports);

// This is the END
