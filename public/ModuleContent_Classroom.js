// js/ModuleContent_Classroom.js (MODULARIZED VERSION - CORRECTED & FINAL)
// Handles Google Classroom export functionalities for Module Content.
// Now uses Firebase Modular SDK imports.

// --- Import necessary Firebase modules from firebase-services.js ---
// We import 'auth' and 'GOOGLE_CLIENT_ID' from firebase-services.js as they are
// our central initialized service instances and globally available constants.
import { auth, GOOGLE_CLIENT_ID } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// --- Import UI utility functions from ui-utilities.js ---
// We import the showAlert function from ui-utilities.js.
import { showAlert } from './ui-utilities.js';


const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses',
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/classroom.courseworkmaterials',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.rosters',
].join(' ');


/**
 * Initiates the Google OAuth 2.0 flow and then calls the Cloud Function
 * to generate the course in Google Classroom.
 * @param {string} selectedCourseId - The ID of the COURSE record to export.
 * @param {string} selectedCourseTitle - The title of the COURSE record to export.
 * @param {HTMLElement} generateClassroomBtn - The button to disable/enable during the process.
 * @param {HTMLElement} statusMessageSpan - The span for alert messages.
 * @param {HTMLElement} statusAlert - The container for alert messages.
 */
export function initiateGoogleClassroomExport( // Export this function for use by ModuleContent.js
    selectedCourseId,
    selectedCourseTitle,
    generateClassroomBtn,
    statusMessageSpan,
    statusAlert
) {
    // Accessing the imported 'auth' object, no longer relying on window.auth
    const currentUser = auth.currentUser;

    if (!currentUser) {
        // Now using the imported showAlert function
        showAlert(statusMessageSpan, statusAlert, "You must be signed in to generate content to Classroom.", true);
        return;
    }

    if (!selectedCourseId) {
        // Now using the imported showAlert function
        showAlert(statusMessageSpan, statusAlert, "Please select a valid COURSE record to generate (ID not found).", true);
        return;
    }

    try {
        // google.accounts.oauth2.initCodeClient is assumed to be globally available from Google's GSI library.
        // It's loaded via <script src="https://accounts.google.com/gsi/client" async defer></script> in HTML
        const client = google.accounts.oauth2.initCodeClient({
            client_id: GOOGLE_CLIENT_ID, // Using the imported GOOGLE_CLIENT_ID
            scope: GOOGLE_SCOPES,
            ux_mode: 'popup',
            callback: async (response) => {
                if (response.error) {
                    console.error('OAuth Error:', response.error);
                    // Now using the imported showAlert function
                    showAlert(statusMessageSpan, statusAlert, 'Google OAuth permission denied or error: ' + response.error, true);
                    return;
                }

                const authorizationCode = response.code;
                console.log('Received Google authorization code:', authorizationCode);

                try {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = true;
                    // Now using the imported showAlert function
                    showAlert(statusMessageSpan, statusAlert, `Attempting to generate Course: "${selectedCourseTitle || selectedCourseId}" to Google Classroom...`, false);

                    // --- CRITICAL FIX: Directly use fetch to the rewritten endpoint ---
                    const url = '/api/classroom-generator'; // Use the new rewrite endpoint from firebase.json

                    // Get the Firebase Authentication ID token from the imported 'auth' instance
                    const idToken = await auth.currentUser.getIdToken();

                    const fetchResponse = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            // Pass the Firebase ID token in the Authorization header
                            'Authorization': `Bearer ${idToken}`
                        },
                        // The Cloud Function expects this payload
                        body: JSON.stringify({
                            data: { // Wrapped in 'data' as per callable function convention, even for direct fetch
                                courseId: selectedCourseId,
                                authorizationCode: authorizationCode,
                                firebaseAuthUid: auth.currentUser.uid // Using the imported 'auth' instance
                            }
                        })
                    });

                    if (!fetchResponse.ok) {
                        // If response is not 2xx, it's an HTTP error from the function
                        const errorBody = await fetchResponse.json();
                        console.error('Cloud Function HTTP Error:', fetchResponse.status, errorBody);
                        throw new Error(errorBody.error?.message || `Cloud Function returned HTTP error ${fetchResponse.status}`);
                    }

                    const result = await fetchResponse.json(); // Parse the response JSON
                    console.log('Cloud Function response:', result.result);
                    // Now using the imported showAlert function
                    showAlert(statusMessageSpan, statusAlert, result.result.message, false);

                } catch (cfError) {
                    console.error('Error calling Cloud Function via rewrite:', cfError);
                    // Now using the imported showAlert function
                    showAlert(statusMessageSpan, statusAlert, `Failed to integrate with Google Classroom: ${cfError.message}`, true);
                } finally {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = false;
                }
            },
        });
        client.requestCode();
    } catch (oauthInitError) {
        console.error('Error initiating OAuth client:', oauthInitError);
        // Now using the imported showAlert function
        showAlert(statusMessageSpan, statusAlert, 'Could not start Google OAuth process. Check console for details.', true);
    }
}

/**
 * Manages the visibility and enabled state of the Google Classroom button.
 * @param {string} currentModuleType - The MODULETYPE of the currently active record.
 * @param {HTMLElement} generateClassroomBtn - The button element.
 * @param {HTMLElement} activeRecordTypeSelect - The select element for active record type.
 */
export function updateClassroomButtonState(currentModuleType, generateClassroomBtn, activeRecordTypeSelect) { // Export this function
    if (!activeRecordTypeSelect || !generateClassroomBtn) {
        console.warn("Required DOM elements for Classroom button state not found.");
        return;
    }

    if (currentModuleType === 'COURSE') {

        generateClassroomBtn.style.display = 'inline-block';
        generateClassroomBtn.disabled = false;
    } else {
        generateClassroomBtn.style.display = 'none';
        generateClassroomBtn.disabled = true;
    }
}
