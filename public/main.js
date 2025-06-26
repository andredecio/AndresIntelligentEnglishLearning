// main.js
// This script contains logic specific to main.html.

document.addEventListener('DOMContentLoaded', () => {
    // Get references to the new buttons and the FirebaseUI container
    const deleteAccountButton = document.getElementById('deleteAccountButtonMain');
    const firebaseUiContainer = document.getElementById('firebaseui-auth-container');
    // Get references to elements that might need to be hidden/shown during re-auth
    const optionsGrid = document.querySelector('.options-grid');
    const actionButtonsDiv = document.querySelector('.action-buttons'); // Assuming this wraps your signOut and delete buttons

    // Get a reference to the Firebase Auth and Firestore instances
    const auth = firebase.auth();
    const db = firebase.firestore();

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

            // Store the user's UID to use consistently
            const currentUserUID = user.uid;

            // Confirm with the user before proceeding
            const confirmDeletion = confirm('Are you sure you want to delete your account? This action cannot be undone and will permanently erase all your data. You will be signed out.');
            if (!confirmDeletion) {
                return; // User cancelled
            }

            try {
                // --- STEP 1: MARK FIRESTORE RECORD AS DELETED ---
                try {
                    await db.collection("users").doc(currentUserUID).update({
                        isDeleted: true,
                        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`Firestore record for ${currentUserUID} marked as deleted.`);
                } catch (firestoreMarkError) {
                    console.error(`ERROR: Failed to mark Firestore record for ${currentUserUID} as deleted.`, firestoreMarkError);
                    alert(`Warning: Could not mark your data record as deleted: ${firestoreMarkError.message}. Proceeding with account deletion.`);
                    // Even if this fails, we try to delete the Auth account.
                }

                // --- STEP 2: DELETE AUTHENTICATION RECORD ---
                await user.delete();
                console.log(`Auth user ${currentUserUID} deleted successfully.`);

                alert('Your account has been successfully deleted.');
                window.location.href = '/'; // Redirect after successful deletion

            } catch (error) {
                // --- CATCH BLOCK FOR AUTH DELETION FAILURE ---
                // If user.delete() fails for ANY reason (except requires-recent-login handled below)
                // or if it's the final catch after re-auth and delete fails.

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
                                console.log('User re-authenticated. Attempting final steps...');

                                if (ui) { ui.reset(); }
                                firebaseUiContainer.style.display = 'none';

                                // --- Attempt final Auth delete ---
                                reauthenticatedUser.delete()
                                    .then(async () => {
                                        console.log(`Auth user ${reauthenticatedUser.uid} deleted successfully after re-auth.`);
                                        alert('Your account has been successfully deleted.');
                                        window.location.href = '/';
                                    })
                                    .catch(async (finalDeleteError) => { // Catch if reauthenticatedUser.delete() fails
                                        console.error('Error deleting account after re-authentication:', finalDeleteError);
                                        alert('Error completing account deletion: ' + finalDeleteError.message + '. Your account was NOT deleted.');

                                        // --- REVERSAL: UNMARK FIRESTORE RECORD ---
                                        try {
                                            await db.collection("users").doc(currentUserUID).update({
                                                isDeleted: false, // Set back to false
                                                deletedAt: firebase.firestore.FieldValue.delete(), // Remove the timestamp field
                                            });
                                            console.log(`Firestore record for ${currentUserUID} successfully unmarked.`);
                                        } catch (reversalError) {
                                            console.error(`ERROR: Failed to unmark Firestore record for ${currentUserUID}:`, reversalError);
                                            alert(`Warning: Account not deleted, and failed to unmark your data record. Please contact support.`);
                                        }
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
                    // --- REVERSAL: UNMARK FIRESTORE RECORD IF INITIAL DELETE FAILS FOR OTHER REASONS ---
                    // This catches errors like network errors for the *initial* user.delete() call.
                    console.error('Error deleting account:', error);
                    alert('Error deleting account: ' + error.message + '. Your account was NOT deleted.');

                    try {
                        await db.collection("users").doc(currentUserUID).update({
                            isDeleted: false, // Set back to false
                            deletedAt: firebase.firestore.FieldValue.delete(), // Remove the timestamp field
                        });
                        console.log(`Firestore record for ${currentUserUID} successfully unmarked.`);
                    } catch (reversalError) {
                        console.error(`ERROR: Failed to unmark Firestore record for ${currentUserUID}:`, reversalError);
                        alert(`Warning: Account not deleted, and failed to unmark your data record. Please contact support.`);
                    }

                    // Keep user on the page, they are still logged in
                    if (optionsGrid) optionsGrid.style.display = 'grid';
                    if (actionButtonsDiv) actionButtonsDiv.style.display = 'block';
                }
            }
        });
    }
});
