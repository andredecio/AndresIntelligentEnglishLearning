// js/ModuleContent_Classroom.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles Google Classroom export functionalities for Module Content.

// Removed: import { auth, functions, GOOGLE_CLIENT_ID } from './firebase-services.js';
// Removed: import { showAlert } from './ui-utilities.js';


// Removed this line from top-level:
// const generateCourseForClassroomCloudFunction = functions.httpsCallable('generateCourseForClassroom');

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
    // --- CRITICAL FIX START ---
    // Define the callable function here to ensure window.functions is ready.
    // This function will be created each time initiateGoogleClassroomExport is called.
    // While slightly less efficient than defining it once, it guarantees correct initialization.
    // A more advanced approach would be to define it in a DOMContentLoaded block in ModuleContent.js
    // and pass it down, but this is a quick and effective fix for the current structure.
    const generateCourseForClassroomCloudFunction = window.functions.httpsCallable('generateCourseForClassroom');
    // --- CRITICAL FIX END ---

    // Accessing global 'auth' object
    const currentUser = window.auth.currentUser; // Changed to window.auth

    if (!currentUser) {
        // Accessing global 'showAlert' function
        window.showAlert(statusMessageSpan, statusAlert, "You must be signed in to generate content to Classroom.", true); // Changed to window.showAlert
        return;
    }

    if (!selectedCourseId) {
        // Accessing global 'showAlert' function
        window.showAlert(statusMessageSpan, statusAlert, "Please select a valid COURSE record to generate (ID not found).", true); // Changed to window.showAlert
        return;
    }

    try {
        // google.accounts.oauth2.initCodeClient is assumed to be globally available from Google's GSI library.
        // Accessing global 'GOOGLE_CLIENT_ID'
        const client = google.accounts.oauth2.initCodeClient({
            client_id: window.GOOGLE_CLIENT_ID, // Changed to window.GOOGLE_CLIENT_ID
            scope: GOOGLE_SCOPES,
            ux_mode: 'popup',
            callback: async (response) => {
                if (response.error) {
                    console.error('OAuth Error:', response.error);
                    // Accessing global 'showAlert' function
                    window.showAlert(statusMessageSpan, statusAlert, 'Google OAuth permission denied or error: ' + response.error, true); // Changed to window.showAlert
                    return;
                }

                const authorizationCode = response.code;
                console.log('Received Google authorization code:', authorizationCode);

                try {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = true;
                    // Accessing global 'showAlert' function
                    window.showAlert(statusMessageSpan, statusAlert, `Attempting to generate Course: "${selectedCourseTitle || selectedCourseId}" to Google Classroom...`, false); // Changed to window.showAlert

                    // 'generateCourseForClassroomCloudFunction' is now defined within this scope
                    const result = await generateCourseForClassroomCloudFunction({
                        courseId: selectedCourseId,
                        authorizationCode: authorizationCode,
                        firebaseAuthUid: currentUser.uid
                    });

                    console.log('Cloud Function response:', result.data);
                    // Accessing global 'showAlert' function
                    window.showAlert(statusMessageSpan, statusAlert, result.data.message, false); // Changed to window.showAlert
                } catch (cfError) {
                    console.error('Error calling Cloud Function:', cfError.code, cfError.message, cfError.details);
                    // Accessing global 'showAlert' function
                    window.showAlert(statusMessageSpan, statusAlert, `Failed to integrate with Google Classroom: ${cfError.message}`, true); // Changed to window.showAlert
                } finally {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = false;
                }
            },
        });
        client.requestCode();
    } catch (oauthInitError) {
        console.error('Error initiating OAuth client:', oauthInitError);
        // Accessing global 'showAlert' function
        window.showAlert(statusMessageSpan, statusAlert, 'Could not start Google OAuth process. Check console for details.', true); // Changed to window.showAlert
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
