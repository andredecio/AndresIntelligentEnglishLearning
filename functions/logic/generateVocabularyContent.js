// generateVocabularyContent.js

// --- ES Module Imports ---
import * as functions from "firebase-functions/v1"; // just incase it's needed for other utilities than setting region
// Import your custom regional builder instead of the raw SDK
import { regionalFunctions } from "../config.js"; // new region set in one place
import { parseAndLinkSyllables } from '../helpers/syllableService.js';
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getTextGenModel } from "../helpers/gemini.js"; 
import { normalizeTitle, generateUniqueFirestoreId } from "../helpers/ipaUtils.js"; 


// --- Initialize Firebase Admin Safely ---
if (getApps().length === 0) {
    initializeApp();
}

// --- Configuration Constants ---
const ADMIN_UID = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; 

// Base cost for Gemini API interactions
const COST_PER_1000_GEMINI_INPUT_TOKENS = 0.0005; 
const COST_PER_1000_GEMINI_OUTPUT_TOKENS = 0.0015; 

// Estimated fixed costs for Firestore writes and Cloud Function execution per module generated
const FIRESTORE_WRITE_COST_PER_MODULE = 0.00005; 
const CLOUD_FUNCTION_BASE_COST = 0.00001; 

// --- Helper Functions for Cost Estimation ---

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

function calculateEstimatedCost(numWords, geminiPrompt) {
    if (numWords <= 0) return 0;

    const inputTokens = estimateTokens(geminiPrompt);
    const estimatedOutputTokens = numWords * 800; 
    const geminiCost = (inputTokens / 1000 * COST_PER_1000_GEMINI_INPUT_TOKENS) +
                       (estimatedOutputTokens / 1000 * COST_PER_1000_GEMINI_OUTPUT_TOKENS);

    const firestoreCost = numWords * 1.5 * FIRESTORE_WRITE_COST_PER_MODULE; 
    const functionCost = CLOUD_FUNCTION_BASE_COST; 

    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;
    functions.logger.debug(`Estimated cost for ${numWords} words (prompt length ${geminiPrompt.length}): ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- generateVocabularyContent Callable Function ---
export const generateVocabularyContent = regionalFunctions
  .runWith({ timeoutSeconds: 540 })
  .https.onCall(async (data, context) => {
      const firestore = getFirestore();
      const currentUserUid = context.auth?.uid;

    // --- Security Check (Auth and Custom Claims) ---
    if (!currentUserUid) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const customClaims = context.auth.token;
    const canCreateModule = customClaims.canCreateModule || customClaims.admin; 

    if (!canCreateModule) {
        throw new functions.https.HttpsError('permission-denied', 'Your payment plan does not permit module creation.');
    }

    const { cefrLevel, numWords, theme, lessonModuleId } = data;

    if (numWords <= 0) {
        functions.logger.info(`User ${currentUserUid} requested 0 words. Skipping generation.`);
        return {
            status: "success",
            message: `Requested 0 words. No content generated.`,
            moduleIds: [],
            skippedWords: [],
            geminiReturnedItemCount: 0,
            topLevelVocabCount: 0,
            vocabGroupCount: 0,
            nestedVocabCount: 0
        };
    }

    if (!cefrLevel || !theme || typeof numWords !== 'number' || numWords < 0) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Words (must be an integer > 0), and Theme are required and must be valid.'
        );
    }

    functions.logger.info(`User ${currentUserUid}: Starting content generation for CEFR: ${cefrLevel}, Words: ${numWords}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`);

    const textGenModel = getTextGenModel();
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
    const skippedWords = [];
    let geminiReturnedItemCount = 0;
    let topLevelVocabCount = 0;
    let vocabGroupCount = 0;
    let nestedVocabCount = 0;

    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {};

    const geminiPrompt = `
        Generate a JSON array of ${numWords} vocabulary items for CEFR ${cefrLevel} level, themed around "${theme}".
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
        - "MODULETYPE": String (e.g. VOCABULARY_GROUP, VOCABULARY).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **VOCABULARY_GROUP** (each single VOCABULARY_GROUP is made when there is a word with multiple distinct meanings. For single meaning words  no VOCABULARY_GROUP will be created ):
            - "MODULETYPE": "VOCABULARY_GROUP"
            - "TITLE": The word (or phrase)
            - "CEFR": This must be "A1"
            - "THEME":This must be ${theme}
            - "MEANING_ORIGIN": This must contain ONLY details of the multi-meaning word's origin, etymology, common prefixes, infixes, or suffixes relevant to the multi-meaning word, NOT one of the meanings of the mulit-meaning word.
            - "items": An array of AT LEAST 2 nested "VOCABULARY" modules, each defining a unique meaning of the multi-meaning word (eg. 'set' can be a verb or a noun, 'like' has at least 8 separate meanings so that would result in one VOCABULARY_GROUP record, and at least 8 separate VOCABULARY records for 'like').

        2.  **VOCABULARY** (for single-meaning words, or for individual meanings within a VOCABULARY_GROUP):
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
                - "important" should be "ɪmˈɔː.tənt"
			- "conviction" should be "kənˈvɪk.ʃən" (strictly 3 syllables, NEVER "kənvɪk.ʃən" or "kən.vɪkʃən")
            - "CEFR": This must be "A1"
            - "DESCRIPTION": MUST be 3 numbered sentences (e.g., "1. Sentence one. 2. Sentence two. 3. Sentence three.") that MUST include and be an example of the use of the word in the context of its specific meaning
            - "THEME":This must be ${theme}
			- "ttsRespelling": String. A clean, phonetic English-friendly respelling of the word or syllable to guide the text-to-speech engine safely, preventing literal spelling-out errors (e.g. "ree-dun-duhn-see" for "redundancy", "al-guh-ri-thuhm" for "algorithm").
            - "WORD_TYPE": This must be one of the following: "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "article", "determiner"
            - "MEANING_ORIGIN": This must contain the meaning of the specific instance of the word. This must be followed by details of the word's origin, etymology, common prefixes, infixes, or suffixes relevant to the group.
            - "PRESENT_SIMPLE_3RD_PERSON_SINGULAR": This should exist only when WORD_TYPE = "verb". Provide the 3rd person singular simple present tense form, e.g., "eats" for "eat"
            - "SIMPLE_PAST": This should exist only when WORD_TYPE = "verb". Provide the simple past tense form, e.g., "ate" for "eat"
            - "PAST_PARTICIPLE": This should exist only when WORD_TYPE = "verb". Provide the past participle form, e.g., "eaten" for "eat"
            - "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on one of the sentences in the DESCRIPTION field. (Only for MODULETYPE "VOCABULARY")

        **Crucial Rules for Generation:**
        - The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax.
        - ALWAYS check first if a word has more than one meaning. You MUST create a document with VOCABULARY_GROUP MODULETYPE for a word when there is more than one possible meaning of that word.
        - Once you have generated a VOCABULARY_GROUP record, you MUST then create at least 2 new VOCABULARY records.
        - **MODULETYPE:** You MUST create a unique VOCABULARY MODULETYPE document for EACH and EVERY POSSIBLE meaning of any given word.
        - **CEFR Hierarchy:** For All VOCABULARY AND VOCABULARY_GROUP modules, their 'CEFR' level MUST be set to "A1").
        - **Polysemy:** If a word has multiple *distinct* meanings or functions, you MUST create a "VOCABULARY_GROUP" for it.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output.
        - **Number of Items:** Aim to generate exactly ${numWords} top-level vocabulary items (including VOCABULARY_GROUPs).
        - **WORD_TYPE:** Values for 'WORD_TYPE' may only exist for modules with a MODULETYPE of 'VOCABULARY'.
        - **TITLE:** This field must contain the word exclusively.
        - **MEANING_ORIGIN:** You MUST include a description of the particular meaning of that instance of a VOCABULARY MODULETYPE document AND you must add to that a description of the etymology.
        - **IPA**: This field MUST contain the British English (RP) IPA transcription.
        - **Single-Beat Syllables:** You must strictly divide words in the "IPA" field into individual, single-beat syllables using dot (.) delimiters. Do NOT group morphological roots, prefixes, or multi-beat blocks together into a single syllable (e.g., "conviction" must split into exactly three single-beat parts "kən", "vɪk", "ʃən"—never "kənvɪk" or "vɪkʃən"). Every split unit must contain exactly one vowel sound.

        Example structure for output:
        [
          {
            "TITLE": "cat",
            "IPA": "kæt",
            "MODULETYPE": "VOCABULARY",
            "CEFR": "A1",
            "DESCRIPTION": "1. The cat sat. 2. The cat purred. 3. I like cats.",
            "THEME": "General English",
			"ttsRespelling": "kat",
            "WORD_TYPE": "noun",
            "MEANING_ORIGIN": "A carnivorous mammal of the Genus 'Felis'...",
            "imagePrompt": "A fluffy cat sitting."
          }
        ]
        `;

    const estimatedCost = calculateEstimatedCost(numWords, geminiPrompt);

    // --- TRANSACTIONAL CREDIT & LIMIT CHECK (Firestore Transaction) ---
    await firestore.runTransaction(async (transaction) => {
        const userRef = firestore.collection('users').doc(currentUserUid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found. Please log in again.');
        }
        const userProfile = userDoc.data();

        const paymentPlanRef = firestore.collection('paymentPlans').doc(userProfile.planid);
        const paymentPlanDoc = await transaction.get(paymentPlanRef);

        if (!paymentPlanDoc.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'Invalid payment plan assigned to user.');
        }
        const paymentPlan = paymentPlanDoc.data();

        let currentBalance = userProfile.currentBalance || 0;

        if (currentBalance < estimatedCost) {
            throw new functions.https.HttpsError('resource-exhausted', `Insufficient funds. Current balance: ${currentBalance.toFixed(2)}. Estimated cost for this operation: ${estimatedCost.toFixed(2)}.`);
        }

        if (paymentPlan.type !== 'PayAsYouGo' && paymentPlan.moduleCreationLimit !== null) {
            let modulesCreatedThisMonth = userProfile.modulesCreatedThisMonth || 0;
            let lastBillingCycleReset = userProfile.lastBillingCycleReset ? userProfile.lastBillingCycleReset.toDate() : null;
            const now = new Date();

            let shouldReset = false;
            if (!lastBillingCycleReset) {
                shouldReset = true;
            } else if (paymentPlan.type === 'Monthly' && (now.getMonth() !== lastBillingCycleReset.getMonth() || now.getFullYear() !== lastBillingCycleReset.getFullYear())) {
                shouldReset = true;
            } else if (paymentPlan.type === 'Yearly' && (now.getFullYear() !== lastBillingCycleReset.getFullYear())) {
                shouldReset = true;
            }

            if (shouldReset) {
                modulesCreatedThisMonth = 0; 
                lastBillingCycleReset = Timestamp.fromDate(now); 
                functions.logger.info(`User ${currentUserUid}: Monthly module count reset for new billing cycle.`);
            }

            if (modulesCreatedThisMonth + numWords > paymentPlan.moduleCreationLimit) {
                throw new functions.https.HttpsError('resource-exhausted', `Monthly module creation limit reached. You have created ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} modules.`);
            }

            userProfile.modulesCreatedThisMonth = modulesCreatedThisMonth + numWords; 
            userProfile.lastBillingCycleReset = lastBillingCycleReset;
        }

        transaction.update(userRef, {
            currentBalance: currentBalance - estimatedCost,
            modulesCreatedThisMonth: userProfile.modulesCreatedThisMonth, 
            lastBillingCycleReset: userProfile.lastBillingCycleReset 
        });
        functions.logger.info(`User ${currentUserUid}: Deducted ${estimatedCost.toFixed(6)}. New balance: ${(currentBalance - estimatedCost).toFixed(2)}.`);
    });

    try {
        functions.logger.debug(`User ${currentUserUid}: Gemini Prompt: ${geminiPrompt.substring(0, 1000)}...`);

        const geminiResult = await textGenModel.generateContent(geminiPrompt);
        const rawText = geminiResult.text;

        if (!rawText) {
            throw new Error("Gemini response did not return any text.");
        }

        const cleanedText = rawText
            .trim() 
            .replace(/^```json/, '')
            .replace(/```$/, '');

        let generatedContent;
        try {
            const parsedOutput = JSON.parse(cleanedText);

            if (Array.isArray(parsedOutput)) {
                generatedContent = parsedOutput;
            } else if (typeof parsedOutput === 'object' && parsedOutput !== null) {
                if (parsedOutput.vocabulary && Array.isArray(parsedOutput.vocabulary)) {
                    generatedContent = parsedOutput.vocabulary;
                } else if (parsedOutput.items && Array.isArray(parsedOutput.items)) {
                    generatedContent = parsedOutput.items;
                } else if (parsedOutput.VOCABULARY && Array.isArray(parsedOutput.VOCABULARY)) {
                    generatedContent = parsedOutput.VOCABULARY;
                } else if (parsedOutput.VOCABULARY_GROUP && Array.isArray(parsedOutput.VOCABULARY_GROUP)) {
                    generatedContent = parsedOutput.VOCABULARY_GROUP;
                }
            }

            if (!Array.isArray(generatedContent)) {
                throw new Error("Gemini output is not a JSON array.");
            }

            geminiReturnedItemCount = generatedContent.length;
        } catch (e) {
            throw new functions.https.HttpsError('internal', "Failed to parse or process Gemini output as JSON.", e.message); 
        }

        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'VOCABULARY';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['VOCABULARY', 'VOCABULARY_GROUP'])
                .where('normalizedTitle', '==', itemNormalizedTitle)
                .limit(1)
                .get();

            // Locate this block (around line 255) and replace it:
            if (!existingContentSnapshot.empty) {
                const existingId = existingContentSnapshot.docs[0].id;
                createdModuleIds.push(existingId); // Push existing ID to link it to the lesson!
                numSkipped++;
                skippedWords.push(item.TITLE);
                continue; 
            }

            const ownerUid = ADMIN_UID;
            const status = 'shared';

            if (itemModuleType === "VOCABULARY_GROUP") {
                vocabGroupCount++;
                const groupId = generateUniqueFirestoreId();
                const groupRef = firestore.collection('learningContent').doc(groupId);
                const meaningIds = []; 

                if (Array.isArray(item.items)) {
                     for (const meaning of item.items) {
                        if (meaning.MODULETYPE === "VOCABULARY") {
                            nestedVocabCount++;
                            const vocabId = generateUniqueFirestoreId();
                            const vocabRef = firestore.collection('learningContent').doc(vocabId);

                            // NEW: Dynamically parse and get syllable IDs [users/docId]
							const syllableIds = await parseAndLinkSyllables(meaning.IPA, meaning.ttsRespelling);

                            const verbFields = (meaning.WORD_TYPE === 'verb') ? {
                                PRESENT_SIMPLE_3RD_PERSON_SINGULAR: meaning.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || '',
                                SIMPLE_PAST: meaning.SIMPLE_PAST || '',
                                PAST_PARTICIPLE: meaning.PAST_PARTICIPLE || '',
                            } : {};

                            batch.set(vocabRef, {
                                MODULEID: vocabId,
                                MODULETYPE: "VOCABULARY",
								isNested: true,             // 👈 Added
                                parentGroupId: groupId,     // 👈 Added
                                TITLE: meaning.TITLE,
                                normalizedTitle: normalizeTitle(meaning.TITLE),
                                IPA: meaning.IPA,
                                ttsRespelling: meaning.ttsRespelling || "",
                                CEFR: meaning.CEFR,
                                DESCRIPTION: meaning.DESCRIPTION,
                                imagePrompt: meaning.imagePrompt,
                                THEME: meaning.THEME,
                                WORD_TYPE: meaning.WORD_TYPE,
                                MEANING_ORIGIN: meaning.MEANING_ORIGIN,
                                ...verbFields,
                                IMAGEURL: "",
                                imageStatus: "pending",
                                MODULEID_ARRAY: syllableIds, // NEW: Link the resolved syllables!
                                createdAt: FieldValue.serverTimestamp(),
                                updatedAt: FieldValue.serverTimestamp(),
                                ownerUid: ownerUid, 
                                status: status,     
                                ...lessonDataToMerge
                            });
                            meaningIds.push(vocabId);
                        }
                    }
                }

                batch.set(groupRef, {
                    MODULEID: groupId,
                    MODULETYPE: "VOCABULARY_GROUP",
					isNested: false,            // 👈 Added
                    parentGroupId: null,        // 👈 Added
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    THEME: item.THEME,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    MODULEID_ARRAY: meaningIds,
                    IMAGEURL: "",
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    ownerUid: ownerUid, 
                    status: status,     
                    ...lessonDataToMerge
                });
                createdModuleIds.push(groupId);

            } else if (itemModuleType === "VOCABULARY") {
                topLevelVocabCount++;
                const vocabId = generateUniqueFirestoreId();
                const vocabRef = firestore.collection('learningContent').doc(vocabId);

                // NEW: Dynamically parse and get syllable IDs [users/docId]
 				const syllableIds = await parseAndLinkSyllables(item.IPA, item.ttsRespelling);
                const verbFields = (item.WORD_TYPE === 'verb') ? {
                    PRESENT_SIMPLE_3RD_PERSON_SINGULAR: item.PRESENT_SIMPLE_3RD_PERSON_SINGULAR || '',
                    SIMPLE_PAST: item.SIMPLE_PAST || '',
                    PAST_PARTICIPLE: item.PAST_PARTICIPLE || '',
                } : {};

                batch.set(vocabRef, {
                    MODULEID: vocabId,
                    MODULETYPE: "VOCABULARY",
					isNested: false,            // 👈 Added
                    parentGroupId: null,        // 👈 Added
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    IPA: item.IPA,
                    ttsRespelling: item.ttsRespelling || "",
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    WORD_TYPE: item.WORD_TYPE,
                    MEANING_ORIGIN: item.MEANING_ORIGIN,
                    ...verbFields,
                    IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: syllableIds, // NEW: Link the resolved syllables!
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    ownerUid: ownerUid, 
                    status: status,     
                    ...lessonDataToMerge
                });
                createdModuleIds.push(vocabId);
            }
        }
        await batch.commit();

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
        functions.logger.error(`User ${currentUserUid}: Error generating or saving content.`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
});
