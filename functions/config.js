// config.js
import * as functions from "firebase-functions/v1";
// 1. 👈 NEW: Import the secret param helper
import { defineJsonSecret } from "firebase-functions/params"; 

// Define your regions
export const REGION = 'asia-east2';               // Main database region
export const IMAGE_REGION = 'us-central1';        // Special region for image generation

// Export two different builders
export const regionalFunctions = functions.region(REGION);
export const imageRegionalFunctions = functions.region(IMAGE_REGION);

// 2. 👈 NEW: Declare the secret and the shared runtime configuration
export const appConfigSecret = defineJsonSecret("FUNCTIONS_CONFIG_EXPORT");

export const MAIN_FUNCTION_OPTS = {
  timeoutSeconds: 540,
  secrets: [appConfigSecret]
};
