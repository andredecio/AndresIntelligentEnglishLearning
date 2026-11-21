import * as functions from "firebase-functions/v1";
import { regionalFunctions } from "../config.js"; // <--- ADD THIS LINE!
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

import { getReadingWritingTextGenModel } from "../helpers/gemini.js";
import { normalizeTitle, generateUniqueFirestoreId } from "../helpers/ipaUtils.js"; 

// --- Initialize Firebase Admin Safely ---
if (getApps().length === 0) {
    initializeApp();
}

// --- Configuration Constants ---
const ADMIN_UID = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; 

const COST_PER_1000_GEMINI_INPUT_TOKENS = 0.0005; 
const COST_PER_1000_GEMINI_OUTPUT_TOKENS = 0.0015; 

const FIRESTORE_WRITE_COST_PER_MODULE = 0.00005; 
const CLOUD_FUNCTION_BASE_COST = 0.00001; 

// --- Helper Functions for Cost Estimation ---

function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

function calculateEstimatedReadingWritingCost(numItems, geminiPrompt) {
    if (numItems <= 0) return 0;

    const inputTokens = estimateTokens(geminiPrompt);
    const estimatedOutputTokens = numItems * 2500; 
    const geminiCost = (inputTokens / 1000 * COST_PER_1000_GEMINI_INPUT_TOKENS) +
                       (estimatedOutputTokens / 1000 * COST_PER_1000_GEMINI_OUTPUT_TOKENS);

    const firestoreCost = numItems * FIRESTORE_WRITE_COST_PER_MODULE;
    const functionCost = CLOUD_FUNCTION_BASE_COST; 

    const totalEstimatedCost = geminiCost + firestoreCost + functionCost;
    functions.logger.debug(`Estimated cost for ${numItems} reading/writing items (prompt length ${geminiPrompt.length}): ${totalEstimatedCost.toFixed(6)}`);

    return totalEstimatedCost;
}

// --- generate Reading-WritingContent Callable Function ---
const generateReadingWritingContent = regionalFunctions.runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
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

    const { cefrLevel, numItems, theme, lessonModuleId } = data; 

    if (!cefrLevel || !theme || typeof numItems !== 'number' || numItems < 0) { 
        throw new functions.https.HttpsError(
            'invalid-argument',
            'CEFR Level, Number of Items (must be a number >= 0), and Theme are required and must be valid.'
        );
    }

    if (numItems <= 0) {
        functions.logger.info(`User ${currentUserUid}: Requested 0 items. Skipping generation.`);
        return {
            status: "success",
            message: `Requested 0 items. No content generated.`,
            moduleIds: [],
            skippedWords: [],
            geminiReturnedItemCount: 0,
            topLevelReadingWritingCount: 0,
        };
    }

    functions.logger.info(`User ${currentUserUid}: Starting Reading-Writing content generation for CEFR: ${cefrLevel}, Items: ${numItems}, Theme: ${theme}${lessonModuleId ? `, Lesson: ${lessonModuleId}` : ''}`); 

    const textGenModel = getReadingWritingTextGenModel(); 
    const batch = firestore.batch();
    const createdModuleIds = [];
    let numSkipped = 0;
    const skippedWords = [];
    let geminiReturnedItemCount = 0;
    let topLevelReadingWritingCount = 0;

    const lessonDataToMerge = lessonModuleId ? { LESSON_ID: lessonModuleId } : {}; 

    const geminiPrompt = `
Generate a JSON array of ${numItems} ReadingWriting  exercises for CEFR ${cefrLevel} level, concerning the subject of "${theme}" and with reference to  the teaching points of "${theme} if it is a grammatical subject (eg. Past Tense).
        Each item in the array MUST comprise an interesting and topical reading passage of between 100 and 200 words, and it MUST BE followed by 5 numbered questions that require a written answer, concerning comprehension of the points of the passage.
        Each item in the array MUST represent a module and adhere to the following strict JSON schema and rules:

        **Primary Module Fields (all modules will have these):**
		- "MODULETYPE": String (e.g. READING-WRITING ).
        - "TITLE": String.
        - "CEFR": String (e.g., "A1", "B2").
        - "DESCRIPTION": String.
        - "THEME": String.

        **Module Types and Their Specific Fields:**

        1.  **READING-WRITING** (for comprehension reading and writing practice of the student):
            - "MODULETYPE": "READING-WRITING"
            - "TITLE": The title of the Reading-Writing subject
			- "CEFR": This must be ${cefrLevel}
            - "DESCRIPTION": Must be about 100 to 200 word long passage on a subject related to the TITLE...
			- "THEME":This MUST have the literal value  ${theme} exclusively
			- "imagePrompt": String. A concise, descriptive instruction for an AI image generator to create an image based on the subject of the passage in the DESCRIPTION field, and/or the theme.

        **Crucial Rules for Generation:**
		- The entire response MUST be a single, perfectly valid JSON array, strictly conforming to JSON syntax.
		- **MODULETYPE:** You MUST create a unique READING-WRITING MODULETYPE document for EACH distinct and complete Reading-Writing passage.
		- **DESCRIPTION** You MUST create an interesting and topical passage.
		- **CEFR Hierarchy:** For All READING-WRITING modules, their 'CEFR' level MUST be used to decide on the degree of sophistication.
        - **Output Format:** Provide ONLY the JSON array. Do not include any introductory or concluding text.
        - **No IDs/URLs:** Do NOT include "MODULEID" or "IMAGEURL" fields in your output.
        - **Number of Items:** Aim to generate exactly ${numItems} top-level complete Reading-Writing items.
        - **TITLE:** This field must contain the title of the Reading-Writing subject and/or theme.

		Example structure for output:
        [
          {
            "TITLE": "Regular Verbs",
            "MODULETYPE": "Reading-Writing",
            "CEFR": "A2",
            "DESCRIPTION": "Stonehenge stands in the south of England. People visit it every year... Write your answers in full sentences...",
            "THEME": "Verb Rules",
			"imagePrompt": "A beautiful view of Ancient Stonehenge in its prime with ancient people"
          }
        ]
        `;

    const estimatedCost = calculateEstimatedReadingWritingCost(numItems, geminiPrompt);

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

            if (modulesCreatedThisMonth + numItems > paymentPlan.moduleCreationLimit) {
                throw new functions.https.HttpsError('resource-exhausted', `Monthly module creation limit reached. You have created ${modulesCreatedThisMonth} out of ${paymentPlan.moduleCreationLimit} modules.`);
            }

            userProfile.modulesCreatedThisMonth = modulesCreatedThisMonth + numItems; 
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
        const geminiRawResponse = await textGenModel.generateContent(geminiPrompt);
        functions.logger.info(`User ${currentUserUid}: Generated reading/writing response with Gemini.`);

        const rawText = geminiRawResponse.text; 

        if (!rawText) {
            throw new Error("Gemini response did not return any text.");
        }

        const cleanedText = rawText
            .trim()
            .replace(/^```json/, '')
            .replace(/```$/, '');

        functions.logger.info(`Cleaned text from Gemini. Length: ${cleanedText.length}`);

        let generatedContent;
        try {
            const parsedOutput = JSON.parse(cleanedText);

            if (Array.isArray(parsedOutput)) {
                generatedContent = parsedOutput; 
            } else if (typeof parsedOutput === 'object' && parsedOutput !== null) {
                if (parsedOutput.readingWriting && Array.isArray(parsedOutput.readingWriting)) {
                    generatedContent = parsedOutput.readingWriting;
                } else if (parsedOutput.items && Array.isArray(parsedOutput.items)) {
                    generatedContent = parsedOutput.items;
                } else if (parsedOutput['READING-WRITING'] && Array.isArray(parsedOutput['READING-WRITING'])) { 
                    generatedContent = parsedOutput['READING-WRITING'];
                }
            }

            if (!Array.isArray(generatedContent)) {
                throw new Error("Gemini output is not a JSON array.");
            }

            geminiReturnedItemCount = generatedContent.length; 
            functions.logger.info(`Gemini returned ${geminiReturnedItemCount} top-level JSON items.`);
        } catch (e) {
            functions.logger.error(`User ${currentUserUid}: Failed to parse or process Gemini JSON:`, cleanedText, e); 
            throw new functions.https.HttpsError('internal', "Failed to parse or process Gemini output as JSON/expected format.", e.message); 
        }

        for (const item of generatedContent) {
            const itemModuleType = item.MODULETYPE || 'READING-WRITING';
            const itemNormalizedTitle = normalizeTitle(item.TITLE);

            const existingContentSnapshot = await firestore.collection('learningContent')
                .where('MODULETYPE', 'in', ['READING-WRITING'])
                .where('normalizedTitle', '==', itemNormalizedTitle)
                .limit(1)
                .get();

            if (!existingContentSnapshot.empty) {
                functions.logger.info(`Skipping "${item.TITLE}" (${itemModuleType}) as a record with this title already exists.`);
                numSkipped++;
                skippedWords.push(item.TITLE);
                continue;
            }

            const ownerUid = currentUserUid; 
            const status = 'private';       

            if (itemModuleType === "READING-WRITING") {
                topLevelReadingWritingCount++;
                functions.logger.info(`Processing  READING-WRITING: "${item.TITLE}".`);
                const readingWritingId = generateUniqueFirestoreId(); 
                const readingWritingRef = firestore.collection('learningContent').doc(readingWritingId); 

                batch.set(readingWritingRef, { 
                    MODULEID: readingWritingId, 
                    MODULETYPE: "READING-WRITING",
                    TITLE: item.TITLE,
                    normalizedTitle: itemNormalizedTitle,
                    CEFR: item.CEFR,
                    DESCRIPTION: item.DESCRIPTION,
                    imagePrompt: item.imagePrompt,
                    THEME: item.THEME,
                    IMAGEURL: "",
                    imageStatus: "pending",
                    MODULEID_ARRAY: [], 
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    ownerUid: ownerUid,     
                    status: status,         
                    ...lessonDataToMerge 
                });
                createdModuleIds.push(readingWritingId); 

            } else {
                functions.logger.warn(`Skipping unexpected top-level module type generated by Gemini: ${itemModuleType} for item with title "${item.TITLE}".`);
            }
        } 

        await batch.commit();

        functions.logger.info(`User ${currentUserUid}: Content generation summary: Requested ${numItems}, Gemini returned ${geminiReturnedItemCount} top-level items. Processed ${topLevelReadingWritingCount} READING-WRITING modules. Successfully created ${createdModuleIds.length} new modules. Skipped ${numSkipped} duplicates.`); 

        return {
            status: "success",
            message: `Successfully generated and saved ${createdModuleIds.length} new modules to Firestore. Skipped ${numSkipped} duplicates.`,
            moduleIds: createdModuleIds,
            skippedWords: skippedWords,
            geminiReturnedItemCount: geminiReturnedItemCount,
            topLevelReadingWritingCount: topLevelReadingWritingCount,
        };

    } catch (error) { 
        functions.logger.error(`User ${currentUserUid}: Error generating or saving content:`, error); 
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred during content generation.', error.message);
    }
}); 

export { generateReadingWritingContent };
