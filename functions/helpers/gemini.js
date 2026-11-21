// helpers/gemini.js
import { GoogleGenAI } from '@google/genai';
import { logger } from 'firebase-functions/v1';

// Using Google's stable, high-efficiency Gemini Image model
const getImageGenModel = () => wrapModel("gemini-3.1-flash-image"); 
const getTextGenModel = () => wrapModel("gemini-2.5-flash");
const getReadingWritingTextGenModel = () => wrapModel("gemini-2.5-flash");

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
  location: 'global'
});

const wrapModel = (modelName) => ({
  generateContent: async (req) => {
    const prompt = typeof req === 'string' ? req : (req.contents || req.prompt || req);
    try {
      // For Gemini Image models, intercept and route through generateContent with responseModalities
      if (modelName.includes('image')) {
        const res = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseModalities: ["IMAGE"] // 👈 Forces the model to generate an image
          }
        });

        // Extract the base64 image data from the multimodal response candidate
        const bytes = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";

        return {
          text: () => "",
          get text() { return ""; },
          response: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: bytes } }] } }] }
        };
      }

      // Default text generation
      const res = await ai.models.generateContent({ model: modelName, contents: prompt });
      return {
        text: () => res.text || "",
        get text() { return res.text || ""; },
        response: res
      };
    } catch (e) {
      logger.error(`Error with ${modelName}:`, e);
      throw e;
    }
  }
});

export {
  getImageGenModel,
  getTextGenModel,
  getReadingWritingTextGenModel
};
