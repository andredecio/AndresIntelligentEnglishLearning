// js/ModuleContent_Classroom.js
// Handles Google Classroom export functionalities for Module Content.

// Import necessary Firebase services and constants from our centralized setup.
import { auth, functions, GOOGLE_CLIENT_ID } from './firebase-services.js';
// Import general UI utilities.
import { showAlert } from './ui-utilities.js'; // Assuming showAlert is now in ui-utilities.js

// --- Google Classroom Specific Constants and Cloud Function ---
const generateCourseForClassroomCloudFunction = functions.httpsCallable('generateCourseForClassroom');

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses',
    'https://www.googleapis.com/auth/classroom.topics',
    'https://www.googleapis.com/auth/classroom.courseworkmaterials',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.rosters',
].join(' '); // Join with spaces for the request


/**
 * Initiates the Google OAuth 2.0 flow and then calls the Cloud Function
 * to generate the course in Google Classroom.
 * @param {string} selectedCourseId - The ID of the COURSE record to export.
 * @param {string} selectedCourseTitle - The title of the COURSE record to export.
 * @param {HTMLElement} generateClassroomBtn - The button to disable/enable during the process.
 * @param {HTMLElement} statusMessageSpan - The span for alert messages.
 * @param {HTMLElement} statusAlert - The container for alert messages.
 */
export function initiateGoogleClassroomExport(
    selectedCourseId,
    selectedCourseTitle,
    generateClassroomBtn,
    statusMessageSpan,
    statusAlert
) {
    const currentUser = auth.currentUser;

    if (!currentUser) {
        showAlert(statusMessageSpan, statusAlert, "You must be signed in to generate content to Classroom.", true);
        return;
    }

    if (!selectedCourseId) {
        showAlert(statusMessageSpan, statusAlert, "Please select a valid COURSE record to generate (ID not found).", true);
        return;
    }

    try {
        // google.accounts.oauth2.initCodeClient is assumed to be globally available from Google's GSI library.
        // Make sure you've loaded: <script src="https://accounts.google.com/gsi/client" async defer></script>
        // in your ModuleContent.html BEFORE your custom scripts.
        const client = google.accounts.oauth2.initCodeClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_SCOPES,
            ux_mode: 'popup',
            callback: async (response) => {
                if (response.error) {
                    console.error('OAuth Error:', response.error);
                    showAlert(statusMessageSpan, statusAlert, 'Google OAuth permission denied or error: ' + response.error, true);
                    return;
                }

                const authorizationCode = response.code;
                console.log('Received Google authorization code:', authorizationCode);

                try {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = true; // Disable button while processing
                    showAlert(statusMessageSpan, statusAlert, `Attempting to generate Course: "${selectedCourseTitle || selectedCourseId}" to Google Classroom...`, false);

                    const result = await generateCourseForClassroomCloudFunction({
                        courseId: selectedCourseId,
                        authorizationCode: authorizationCode,
                        firebaseAuthUid: currentUser.uid
                    });

                    console.log('Cloud Function response:', result.data);
                    showAlert(statusMessageSpan, statusAlert, result.data.message, false); // Show success message from the Cloud Function
                } catch (cfError) {
                    console.error('Error calling Cloud Function:', cfError.code, cfError.message, cfError.details);
                    showAlert(statusMessageSpan, statusAlert, `Failed to integrate with Google Classroom: ${cfError.message}`, true);
                } finally {
                    if (generateClassroomBtn) generateClassroomBtn.disabled = false; // Re-enable button
                }
            },
        });
        client.requestCode();
    } catch (oauthInitError) {
        console.error('Error initiating OAuth client:', oauthInitError);
        showAlert(statusMessageSpan, statusAlert, 'Could not start Google OAuth process. Check console for details.', true);
    }
}

/**
 * Manages the visibility and enabled state of the Google Classroom button.
 * @param {string} currentModuleType - The MODULETYPE of the currently active record.
 * @param {HTMLElement} generateClassroomBtn - The button element.
 * @param {HTMLElement} activeRecordTypeSelect - The select element for active record type.
 */
export function updateClassroomButtonState(currentModuleType, generateClassroomBtn, activeRecordTypeSelect) {
    // Ensure both the activeRecordTypeSelect and generateClassroomBtn elements exist
    if (!activeRecordTypeSelect || !generateClassroomBtn) {
        console.warn("Required DOM elements for Classroom button state not found.");
        return;
    }

    if (currentModuleType === 'COURSE') {
        generateClassroomBtn.style.display = 'inline-block'; // Make it visible
        generateClassroomBtn.disabled = false; // Enable it
    } else {
        generateClassroomBtn.style.display = 'none'; // Hide it
        generateClassroomBtn.disabled = true; // Disable it
    }
}
