// helpers/gemini.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const functions = require('firebase-functions/v1');
const { vocabularySchema } = require('./vocabularySchema');

let _genAIClient = null;
let _imageGenModel = null;
let _textGenModel = null; // This will still be used for vocabulary generation
let _readingWritingTextGenModel = null; // New cached variable for Reading-Writing specific model

function getGenAIClient() {
  if (!_genAIClient) {
    const GEMINI_API_KEY = functions.config().gemini?.api_key;
    if (!GEMINI_API_KEY) {
      throw new Error("Gemini API Key is not configured. Run: firebase functions:config:set gemini.api_key=\"YOUR_KEY\"");
    }
    _genAIClient = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return _genAIClient;
}

function getImageGenModel() {
  if (!_imageGenModel) {
    _imageGenModel = getGenAIClient().getGenerativeModel({
      model: "gemini-pro-vision",
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    });
  }
  return _imageGenModel;
}

// This function remains for vocabulary content, accepting a specific schema
function getTextGenModel(vocabularySchema) {
  if (!_textGenModel) {
    _textGenModel = getGenAIClient().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: vocabularySchema,
        maxOutputTokens: 20000,
      }
    });
  }
  return _textGenModel;
}

// NEW: Dedicated function for Reading-Writing text generation
function getReadingWritingTextGenModel() {
  if (!_readingWritingTextGenModel) {
    const GEMINI_API_KEY = functions.config().gemini?.api_key;
    if (!GEMINI_API_KEY) {
      throw new Error("Gemini API Key is not configured. Run: firebase functions:config:set gemini.api_key=\"YOUR_KEY\"");
    }
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    _readingWritingTextGenModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        // No responseSchema here, as your prompt defines the schema for Reading-Writing
        maxOutputTokens: 20000,
      }
    });
  }
  return _readingWritingTextGenModel;
}


module.exports = {
  getImageGenModel,
  getTextGenModel, // Still exported for other uses (e.g., vocabulary)
  getReadingWritingTextGenModel // NEW: Export the Reading-Writing specific model function
};
