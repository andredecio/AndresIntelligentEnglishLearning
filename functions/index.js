// functions/index.js Modified today 12/7/25
// --- 1. Module Imports, Firebase Admin SDK Initialization, Gemini Model Initialization, and Schema Definition ---

const functions = require("firebase-functions/v1"); // Main Firebase Functions module MUST BE V1.
const admin = require('firebase-admin'); // Firebase Admin SDK
//const { GoogleGenerativeAI } = require('@google/generative-ai'); // Core Google Generative AI SDK (Gemini)
//const { Schema, ResponseModality } = require('@firebase/ai'); // IMPORT ResponseModality HERE
const { TextToSpeechClient } = require('@google-cloud/text-to-speech'); 
const textToSpeechClient = new TextToSpeechClient();

functions.logger.info('Firebase Functions code deployed: v1.006r');  //Version add ListeningSpeaking function 


// Direct initialization of Firebase Admin SDK. This is the most robust way. ---
admin.initializeApp();

//********************************************************************************************

//ONE OFF PHONEME AND SYLLABLE BUILD
// One off load of phonemes to collection
const { populatePhonemesScheduled } = require('./finite use/populatePhonemesScheduled');
exports.populatePhonemesScheduled = populatePhonemesScheduled;

// One off load of syllables from external file to collection
const { populateSyllablesScheduled } = require('./finite use/populateSyllablesScheduled');
exports.populateSyllablesScheduled = populateSyllablesScheduled;
//********************************************************************************************

//MAIN LOGIC AND BUILD OF VOCABULARY/VOCABULARY_GROUP
//Main builder of vocabulary document using Gemini to provide the values (from AdminSystem page)
const {generateVocabularyContent}= require('./logic/generateVocabularyContent');
exports.generateVocabularyContent = generateVocabularyContent;

//Main builder of Grammar document using Gemini to provide the values (from AdminSystem page)
const {generateGrammarContent}= require('./logic/generateGrammarContent');
exports.generateGrammarContent = generateGrammarContent;

//Main builder of Conversation document using Gemini to provide the values (from AdminSystem page)
const {generateConversationContent}= require('./logic/generateConversationContent');
exports.generateConversationContent = generateConversationContent;

//Main builder of Reading-Writing document using Gemini to provide the values (from AdminSystem page)
const {generateReadingWritingContent}= require('./logic/generateReadingWritingContent');
exports.generateReadingWritingContent = generateReadingWritingContent;

//Main builder of ListeninSpeaking document using Gemini to provide the values (from AdminSystem page)
const {generateListeningSpeakingContent}= require('./logic/generateListeningSpeakingContent');
exports.generateListeningSpeakingContent = generateListeningSpeakingContent;


//Trigger: enriching module content with phonetics , audio, and syllable breakdowns(for vocab), and image for vocab and others
const { onNewModuleContentCreate } = require('./triggers/onNewModuleContentCreate');
exports.onNewModuleContentCreate = onNewModuleContentCreate;

//Manual: enriching module content with image for relevant moduletypes
const { batchGenerateModuleImages } = require('./finite use/batchGenerateModuleImages');
exports.batchGenerateModuleImages = batchGenerateModuleImages;


//HELPERS
//Two helper functions that initialise Genmodel
const { getImageGenModel, getTextGenModel } = require('./helpers/gemini');

// Utility functions for IPA and unique ID generation
const { normalizeTitle, generateUniqueFirestoreId } = require('./helpers/ipaUtils');

//Vocabulary type json schema
const { vocabularySchema} = require('./helpers/vocabularySchema');

//Phoneme data and load
const { allRpPhonemes, knownThreeCharPhonemes, knownTwoCharPhonemes, knownSingleCharPhonemes} = require('./helpers/phonemeData');

//Generate and upload audio for vocabulary document
const { generateAudioAndUpload } = require('./helpers/generateAudioAndUpload');

// Generate Vocabulary Image
const { processVocabularyImageGeneration }= require('./helpers/processVocabularyImageGeneration');




//TRIGGER FROM USER DELETE ACCOUNT
//Set to 'deleted' in user record triggered by delete action by User
const { markUserAsDeletedInFirestore }= require('./triggers/markUserAsDeletedInFirestore');
exports.markUserAsDeletedInFirestore = markUserAsDeletedInFirestore;





//  Freeze Exports ---
// This prevents accidental modifications to the exports object during runtime,
// ensuring a stable execution environment for all exported functions.
// This line should be the very last line in your functions/index.js file.
Object.freeze(exports);

// This is the END
