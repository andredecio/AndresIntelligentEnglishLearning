


// helpers/gemini.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const functions = require('firebase-functions/v1');
const { vocabularySchema } = require('./vocabularySchema');

let _genAIClient = null;
let _imageGenModel = null;
let _textGenModel = null;

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
      model: "gemini-2.0-flash-preview-image-generation",
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    });
  }
  return _imageGenModel;
}

function getTextGenModel(vocabularySchema) {
  if (!_textGenModel) {
    _textGenModel = getGenAIClient().getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: vocabularySchema,
        maxOutputTokens: 20000,
      }
    });
  }
  return _textGenModel;
}

module.exports = {
  getImageGenModel,
  getTextGenModel
};
