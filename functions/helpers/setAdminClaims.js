// functions/helpers/setAdminClaims.js

import * as functions from 'firebase-functions/v1';
import { regionalFunctions } from "../config.js"; // <--- ADD THIS LINE!
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Ensure admin SDK is initialized
if (getApps().length === 0) {
  initializeApp();
}

/**
 * Cloud Function: setAdminClaims
 * Sets custom claims (specifically 'admin' and 'canGeneratepdf') for a designated user.
 * This function is intended for administrative use to grant permissions.
 *
 * It is secured to only be callable by a specific 'super admin' UID.
 *
 * @param {object} data - The data passed to the callable function.
 * @param {string} data.uid - The UID of the user whose claims are to be set.
 * @param {object} context - The context object provided by Firebase Functions.
 * @returns {Promise<object>} A promise that resolves to an object indicating success or failure.
 */
// --- IMPORTANT: Explicitly set region to asia-southeast1 ---
export const setAdminClaims = regionalFunctions.https.onCall(async (data, context) => { // <--- CHANGE THIS!
    const callingUid = context.auth?.uid;
    // IMPORTANT: Replace this with YOUR actual admin user's UID (e.g., from Firebase Auth console)
    // This is the UID that is allowed to call THIS specific function.
    const designatedSuperAdminUid = "WxGARaxfYcQCrR7YXBn6jcmf8Ix2"; // <<<<< YOUR ADMIN UID HERE!

    // Security check: Only allow the designated super admin to call this function.
    if (!callingUid || callingUid !== designatedSuperAdminUid) {
        console.warn(`Unauthorized attempt to call setAdminClaims by UID: ${callingUid}`);
        throw new functions.https.HttpsError('permission-denied', 'Only the designated super admin can set claims via this function.');
    }

    // The UID for whom to set the claims. For this temporary setup, it's usually the super admin themselves.
    const targetUid = data.uid; // This should be the same as designatedSuperAdminUid when calling from client

    // Define the custom claims to set
    const claimsToSet = {
        admin: true,
        canGeneratepdf: true, // This is the new claim you need
        // Add any other claims you want to set for this user
    };

    try {
        await getAuth().setCustomUserClaims(targetUid, claimsToSet);
        console.log(`Successfully set custom claims for UID: ${targetUid} with claims: ${JSON.stringify(claimsToSet)}`);
        return { success: true, message: `Custom claims set for ${targetUid}.` };
    } catch (error) {
        console.error(`Error setting custom claims for UID: ${targetUid}`, error);
        throw new functions.https.HttpsError('internal', 'Failed to set custom claims.', error.message);
    }
});
