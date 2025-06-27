// main.js
// This script contains logic specific to main.html.

document.addEventListener('DOMContentLoaded', () => {
    // Get references to the new buttons and the FirebaseUI container
    const deleteAccountButton = document.getElementById('deleteAccountButtonMain');
    const firebaseUiContainer = document.getElementById('firebaseui-auth-container');
    // Get references to elements that might need to be hidden/shown during re-auth
    const optionsGrid = document.querySelector('.options-grid');
    const actionButtonsDiv = document.querySelector('.action-buttons'); // Assuming this wraps your signOut and delete buttons

    // Get a reference to the Firebase Auth instance
    const auth = firebase.auth();
    // Removed: const db = firebase.firestore(); // No longer needed here as Cloud Function handles Firestore update

    // Declare ui variable here so it's accessible in callbacks
    let ui;

    // --- Firebase Auth State Listener for specific main.html elements ---
    auth.onAuthStateChanged((user) => {
        if (user && !user.isAnonymous) {
            if (deleteAccountButton) {
                deleteAccountButton.style.display = 'inline-block';
            }
        } else {
            if (deleteAccountButton) {
                deleteAccountButton.style.display = 'none';
            }
        }
    });

    // --- Click handlers for in-page functions ---
    const pronunciationPractice = document.getElementById('pronunciationPractice');
    if (pronunciationPractice) {
        pronunciationPractice.addEventListener('click', () => {
            alert('Launching AI Pronunciation Coach! (This would open a microphone modal or start a new in-app experience)');
        });
    }

    const listeningSkills = document.getElementById('listeningSkills');
    if (listeningSkills) {
        listeningSkills.addEventListener('click', () => {
            alert('Starting AI Listening Practice! (This would play audio and show interactive transcriptions)');
        });
    }

    // --- Delete Account Functionality ---
    if (deleteAccountButton) {
        deleteAccountButton.addEventListener('click', async () => {
            const user = auth.currentUser;

            if (!user) {
                alert('No user is currently signed in to delete.');
                return;
            }

            // We no longer need currentUserUID for client-side Firestore operations
            // const currentUserUID = user.uid; // Still useful for logging if needed

            // Confirm with the user before proceeding
            const confirmDeletion = confirm('Are you sure you want to delete your account? This action cannot be undone. You will be signed out.');
            if (!confirmDeletion) {
                return; // User cancelled
            }

            try {
                // --- STEP 1: Removed client-side Firestore marking. The Cloud Function handles this now! ---
                // Original code block that was here:
                /*
                try {
                    await db.collection("users").doc(currentUserUID).update({
                        isDeleted: true,
                        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`Firestore record for ${currentUserUID} marked as deleted.`);
                } catch (firestoreMarkError) {
                    console.error(`ERROR: Failed to mark Firestore record for ${currentUserUID} as deleted.`, firestoreMarkError);
                    alert(`Warning: Could not mark your data record as deleted: ${firestoreMarkError.message}. Proceeding with account deletion.`);
                }
                */

                // --- STEP 2: DELETE AUTHENTICATION RECORD ---
                // This is the core action on the client side.
                await user.delete();
                console.log(`Auth user ${user.uid} deletion initiated successfully.`); // Use user.uid directly for logging

                // If user.delete() succeeds, the on-delete Cloud Function will trigger
                // and update Firestore.
                alert('Your account has been successfully deleted. Your data will be marked for retention per policy.'); // Updated message
                window.location.href = '/'; // Redirect after successful deletion

            } catch (error) {
                // --- CATCH BLOCK FOR AUTH DELETION FAILURE ---
                if (error.code === 'auth/requires-recent-login') {
                    console.warn('Recent login required for account deletion. Prompting re-authentication.');
                    alert('For security, please sign in again to confirm account deletion.');

                    // --- INITIATE RE-AUTHENTICATION ---
                    firebaseUiContainer.style.display = 'block';
                    ui = new firebaseui.auth.AuthUI(auth);

                    const uiConfig = {
                        signInSuccessUrl: '/',
                        signInOptions: [
                            'google.com', 'password', 'facebook.com', 'apple.com'
                        ],
                        callbacks: {
                            signInSuccessWithAuthResult: (authResult, redirectUrl) => {
                                // User re-authenticated.
                                const reauthenticatedUser = authResult.user;
                                console.log('User re-authenticated. Attempting final Auth delete...');

                                if (ui) { ui.reset(); }
                                firebaseUiContainer.style.display = 'none';

                                // --- Attempt final Auth delete ---
                                reauthenticatedUser.delete()
                                    .then(() => {
                                        console.log(`Auth user ${reauthenticatedUser.uid} deleted successfully after re-auth.`);
                                        alert('Your account has been successfully deleted. Your data will be marked for retention per policy.'); // Updated message
                                        window.location.href = '/';
                                    })
                                    .catch((finalDeleteError) => { // Catch if reauthenticatedUser.delete() fails
                                        console.error('Error deleting account after re-authentication:', finalDeleteError);
                                        alert('Error completing account deletion: ' + finalDeleteError.message + '. Your account was NOT deleted.');

                                        // --- REVERSAL: Removed client-side Firestore unmarking ---
                                        // The Cloud Function was never triggered, so no marking happened on server-side.

                                        // Re-show UI if process fails (user is still logged in at this point)
                                        if (optionsGrid) optionsGrid.style.display = 'grid';
                                        if (actionButtonsDiv) actionButtonsDiv.style.display = 'block';
                                    });
                                return false; // Prevent FirebaseUI redirect
                            },
                            uiShown: function() {
                                if (optionsGrid) optionsGrid.style.display = 'none';
                                if (actionButtonsDiv) actionButtonsDiv.style.display = 'none';
                            }
                        }
                    };
                    ui.start('#firebaseui-auth-container', uiConfig);

                } else {
                    // --- Handle other deletion failures (e.g., network issues) ---
                    console.error('Error deleting account:', error);
                    alert('Error deleting account: ' + error.message + '. Your account was NOT deleted.');

                    // --- REVERSAL: Removed client-side Firestore unmarking ---
                    // The Cloud Function was never triggered, so no marking happened on server-side.

                    // Keep user on the page, they are still logged in
                    if (optionsGrid) optionsGrid.style.display = 'grid';
                    if (actionButtonsDiv) actionButtonsDiv.style.display = 'block';
                }
            }
        });
    }
});
