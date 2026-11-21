// functions/index.js Modified today (ESM & firebase-admin v14 Migration)

// --- 1. Module Imports, Firebase Admin SDK Initialization, Gemini Model Initialization, and Schema Definition ---

// Use ES Module imports
import * as functions from "firebase-functions/v1"; // Still importing v1, but as an ES Module
import { initializeApp, getApps } from 'firebase-admin/app'; // Modern modular import

//import { TextToSpeechClient } from '@google-cloud/text-to-speech'; DON'T NEED?
//const textToSpeechClient = new TextToSpeechClient(); 

functions.logger.info('Firebase Functions code deployed: v1.008 (ESM Migration)'); 

// Direct initialization of Firebase Admin SDK. Only initialize if not already done by helper imports.
if (getApps().length === 0) {
    initializeApp();
}

//********************************************************************************************

// --- Exporting Functions from their respective files using ES Module syntax ---

// ONE OFF PHONEME AND SYLLABLE BUILD
// One off load of phonemes to collection
export { populatePhonemesScheduled } from './Scheduled/populatePhonemesScheduled.js';

// One off load of syllables from external file to collection
export { populateSyllablesScheduled } from './Scheduled/populateSyllablesScheduled.js';

//********************************************************************************************

// MAIN LOGIC AND BUILD OF VOCABULARY/VOCABULARY_GROUP
// Main builder of vocabulary document using Gemini to provide the values (from AdminSystem page)
export { generateVocabularyContent } from './logic/generateVocabularyContent.js';

// Main builder of Grammar document using Gemini to provide the values (from AdminSystem page)
export { generateGrammarContent } from './logic/generateGrammarContent.js';

// Main builder of Conversation document using Gemini to provide the values (from AdminSystem page)
export { generateConversationContent } from './logic/generateConversationContent.js';

// Main builder of Reading-Writing document using Gemini to provide the values (from AdminSystem page)
export { generateReadingWritingContent } from './logic/generateReadingWritingContent.js';

// Main builder of ListeninSpeaking document using Gemini to provide the values (from AdminSystem page)
export { generateListeningSpeakingContent } from './logic/generateListeningSpeakingContent.js';

// Trigger: enriching module content with phonetics, audio, and syllable breakdowns (for vocab), and image for vocab and others
export { onNewModuleContentCreate } from './triggers/onNewModuleContentCreate.js';

// Manual: enriching module content with image for relevant moduletypes
export { batchGenerateModuleImages } from './Scheduled/batchGenerateModuleImages.js';

// For multi-module generation and bundling into a LESSON called from AdminSystem
export { createLesson } from './logic/createLesson.js';

// For Export of Courses into Google Classroom
export { generateCourseForClassroom } from './Classroom/generateCourseForClassroom.js';

// --- NEW: Custom Claims Admin Function ---
export { setAdminClaims } from './helpers/setAdminClaims.js';

// --- Your generateModulePdf Function ---
export { generateModulePdf } from './logic/generateModulePdf.js';

// --- generateModuleHtml Function ---
export { generateModuleHtml } from './Export HTML/generateModuleHtml.js';


// TRIGGER FROM USER DELETE ACCOUNT
// Set to 'deleted' in user record triggered by delete action by User
export { markUserAsDeletedInFirestore } from './triggers/markUserAsDeletedInFirestore.js';

// Recalculate the tokens' cost price for customer
export { recalculateCustomerPrices  } from './triggers/recalculateCustomerPrices.js';

// Trigger: recursively cleans up child modules and storage media when a parent is deleted
export { cleanupModuleTree } from './triggers/cleanupModuleTree.js';

// Scheduled job to clean up syllables collection (maybe run only one time needed)
export { CleanUpsyllables } from './Scheduled/CleanUpsyllables.js';

// 'Scheduled' (but actually a one off) job to clean up mp3 and image orphans from failed CleanUpsyllables
export { CleanupIMAGEandMP3orphans } from './Scheduled/CleanupIMAGEandMP3orphans.js';

// This is the END
