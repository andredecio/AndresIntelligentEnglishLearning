// js/ModuleContent_Classroom.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles Google Classroom export functionalities for Module Content.

// Removed: import { auth, functions, GOOGLE_CLIENT_ID } from './firebase-services.js';
// Version 1.006x

// Removed this line from top-level:
// const generateCourseForClassroomCloudFunction = functions.httpsCallable('generateCourseForClassroom');
const GOOGLE_CLIENT_ID = "190391960875-o8digh9sqso6hrju89o8nmuullvbh2b4.apps.googleusercontent.com";

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
function initiateGoogleClassroomExport(
    selectedCourseId,
    selectedCourseTitle,
    generateClassroomBtn,
    statusMessageSpan,
    statusAlert
) {
    const currentUser = window.auth.currentUser; // Accessing global 'auth' object

    if (!currentUser) {
        window.showAlert(statusMessageSpan, statusAlert, "You must be signed in to generate content to Classroom.", true);
        return;
    }

    if (!selectedCourseId) {
        window.showAlert(statusMessageSpan, statusAlert, "Please select a valid COURSE record to generate (ID not found).", true);
        return;
    }

    try {
        // google.accounts.oauth2.initCodeClient is assumed to be globally available from Google's GSI library.
        const client = google.accounts.oauth2.initCodeClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_SCOPES,
            ux_mode: 'popup',
            callback: async (response) => {
                if (response.error) {
                    console.error('OAuth Error:', response.error);
                    window.showAlert(statusMessageSpan, statusAlert, 'Google OAuth permission denied or error: ' + response.error, true);
                    return;
                }

                const authorizationCode = response.code;
                console.log('Received Google authorization code:', authorizationCode);

                try {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = true;
                    window.showAlert(statusMessageSpan, statusAlert, `Attempting to generate Course: "${selectedCourseTitle || selectedCourseId}" to Google Classroom...`, false);

                    // --- CRITICAL FIX: Directly use fetch to the rewritten endpoint ---
                    const url = '/api/classroom-generator'; // Use the new rewrite endpoint from firebase.json

                    // Get the Firebase Authentication ID token to send to the Cloud Function
                    // This is crucial if your function is secured (e.g., uses auth.verifyIdToken)
                    const idToken = await window.auth.currentUser.getIdToken();

                    const fetchResponse = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            // Pass the Firebase ID token in the Authorization header
                            'Authorization': `Bearer ${idToken}`
                        },
                        // Callable Functions expect the payload wrapped in a 'data' property
                        body: JSON.stringify({
                            data: {
                                courseId: selectedCourseId,
                                authorizationCode: authorizationCode,
                                firebaseAuthUid: window.auth.currentUser.uid
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
                    console.log('Cloud Function response:', result.data); // Callable-like functions return result.data

                    window.showAlert(statusMessageSpan, statusAlert, result.data.message, false);

                } catch (cfError) {
                    console.error('Error calling Cloud Function via rewrite:', cfError);
                    window.showAlert(statusMessageSpan, statusAlert, `Failed to integrate with Google Classroom: ${cfError.message}`, true);
                } finally {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = false;
                }
            },
        });
        client.requestCode();
    } catch (oauthInitError) {
        console.error('Error initiating OAuth client:', oauthInitError);
        window.showAlert(statusMessageSpan, statusAlert, 'Could not start Google OAuth process. Check console for details.', true);
    }
}

/**
 * Manages the visibility and enabled state of the Google Classroom button.
 * @param {string} currentModuleType - The MODULETYPE of the currently active record.
 * @param {HTMLElement} generateClassroomBtn - The button element.
 * @param {HTMLElement} activeRecordTypeSelect - The select element for active record type.
 */
function updateClassroomButtonState(currentModuleType, generateClassroomBtn, activeRecordTypeSelect) {
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

// Make functions accessible globally via the window object
window.initiateGoogleClassroomExport = initiateGoogleClassroomExport;
window.updateClassroomButtonState = updateClassroomButtonState;
