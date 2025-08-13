// js/ModuleContent_Classroom.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles Google Classroom export functionalities for Module Content.

// Removed: import { auth, functions, GOOGLE_CLIENT_ID } from './firebase-services.js';
// Removed: import { showAlert } from './ui-utilities.js';


// --- Google Classroom Specific Constants and Cloud Function ---
// Accessing global 'functions' object
const generateCourseForClassroomCloudFunction = functions.httpsCallable('generateCourseForClassroom');

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
function initiateGoogleClassroomExport( // Removed 'export'
    selectedCourseId,
    selectedCourseTitle,
    generateClassroomBtn,
    statusMessageSpan,
    statusAlert
) {
    // Accessing global 'auth' object
    const currentUser = auth.currentUser;

    if (!currentUser) {
        // Accessing global 'showAlert' function
        showAlert(statusMessageSpan, statusAlert, "You must be signed in to generate content to Classroom.", true);
        return;
    }

    if (!selectedCourseId) {
        // Accessing global 'showAlert' function
        showAlert(statusMessageSpan, statusAlert, "Please select a valid COURSE record to generate (ID not found).", true);
        return;
    }

    try {
        // google.accounts.oauth2.initCodeClient is assumed to be globally available from Google's GSI library.
        // Accessing global 'GOOGLE_CLIENT_ID'
        const client = google.accounts.oauth2.initCodeClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_SCOPES,
            ux_mode: 'popup',
            callback: async (response) => {
                if (response.error) {
                    console.error('OAuth Error:', response.error);
                    // Accessing global 'showAlert' function
                    showAlert(statusMessageSpan, statusAlert, 'Google OAuth permission denied or error: ' + response.error, true);
                    return;
                }

                const authorizationCode = response.code;
                console.log('Received Google authorization code:', authorizationCode);

                try {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = true;
                    // Accessing global 'showAlert' function
                    showAlert(statusMessageSpan, statusAlert, `Attempting to generate Course: "${selectedCourseTitle || selectedCourseId}" to Google Classroom...`, false);

                    // 'generateCourseForClassroomCloudFunction' is a callable function object, already derived from global 'functions'
                    const result = await generateCourseForClassroomCloudFunction({
                        courseId: selectedCourseId,
                        authorizationCode: authorizationCode,
                        firebaseAuthUid: currentUser.uid
                    });

                    console.log('Cloud Function response:', result.data);
                    // Accessing global 'showAlert' function
                    showAlert(statusMessageSpan, statusAlert, result.data.message, false);
                } catch (cfError) {
                    console.error('Error calling Cloud Function:', cfError.code, cfError.message, cfError.details);
                    // Accessing global 'showAlert' function
                    showAlert(statusMessageSpan, statusAlert, `Failed to integrate with Google Classroom: ${cfError.message}`, true);
                } finally {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = false;
                }
            },
        });
        client.requestCode();
    } catch (oauthInitError) {
        console.error('Error initiating OAuth client:', oauthInitError);
        // Accessing global 'showAlert' function
        showAlert(statusMessageSpan, statusAlert, 'Could not start Google OAuth process. Check console for details.', true);
    }
}

/**
 * Manages the visibility and enabled state of the Google Classroom button.
 * @param {string} currentModuleType - The MODULETYPE of the currently active record.
 * @param {HTMLElement} generateClassroomBtn - The button element.
 * @param {HTMLElement} activeRecordTypeSelect - The select element for active record type.
 */
function updateClassroomButtonState(currentModuleType, generateClassroomBtn, activeRecordTypeSelect) { // Removed 'export'
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
