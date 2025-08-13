// js/main.js
// This script contains logic specific to main.html.

// Removed: import { auth } from './firebase-services.js'; // No imports when using standard script tags

document.addEventListener('DOMContentLoaded', () => {
    // Get references to the new buttons and the FirebaseUI container
    const deleteAccountButton = document.getElementById('deleteAccountButtonMain');
    const firebaseUiContainer = document.getElementById('firebaseui-auth-container');
    // Get references to elements that might need to be hidden/shown during re-auth
    const optionsGrid = document.querySelector('.options-grid');
    const actionButtonsDiv = document.querySelector('.action-buttons'); // Assuming this wraps your signOut and delete buttons

    // Access 'auth' directly from the global scope, assuming firebase-services.js has run
    // and made it available (e.g., by making `auth` a global variable or attaching to `window`).
    // Based on the last firebase-services.js, it defines 'const auth = firebase.auth();'
    // and then exports it. Since we're removing 'type="module"', `export` won't work,
    // so we assume `firebase-services.js` will make `auth` globally available,
    // or you can explicitly use `window.auth` if needed.
    // For now, let's assume `auth` is globally available.
    // The previous `const auth = auth;` (which wasn't in main.js) was an error in my part.
    // Your code correctly uses 'auth' directly.

    // Declare ui variable here so it's accessible in callbacks
    let ui;

    // --- Firebase Auth State Listener for specific main.html elements ---
    // The 'auth' object here should now be the globally available one.
    auth.onAuthStateChanged((user) => { // This 'auth' variable is expected to be global
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
            const user = auth.currentUser; // This 'auth' variable is expected to be global

            if (!user) {
                alert('No user is currently signed in to delete.');
                return;
            }

            const confirmDeletion = confirm('Are you sure you want to delete your account? This action cannot be undone. You will be signed out.');
            if (!confirmDeletion) {
                return; // User cancelled
            }

            try {
                // --- STEP 2: DELETE AUTHENTICATION RECORD ---
                await user.delete();
                console.log(`Auth user ${user.uid} deletion initiated successfully.`);

                alert('Your account has been successfully deleted. Your data will be marked for retention per policy.');
                window.location.href = '/';

            } catch (error) {
                // --- CATCH BLOCK FOR AUTH DELETION FAILURE ---
                if (error.code === 'auth/requires-recent-login') {
                    console.warn('Recent login required for account deletion. Prompting re-authentication.');
                    alert('For security, please sign in again to confirm account deletion.');

                    firebaseUiContainer.style.display = 'block';
                    // FirebaseUI uses the global 'firebase' object, which is available
                    // through the compat SDKs and firebase-services.js.
                    // The 'auth' object here is the global one.
                    ui = new firebaseui.auth.AuthUI(auth); // This 'auth' variable is expected to be global

                    const uiConfig = {
                        signInSuccessUrl: '/',
                        signInOptions: [
                            'google.com', 'password', 'facebook.com', 'apple.com'
                        ],
                        callbacks: {
                            signInSuccessWithAuthResult: (authResult, redirectUrl) => {
                                const reauthenticatedUser = authResult.user;
                                console.log('User re-authenticated. Attempting final Auth delete...');

                                if (ui) { ui.reset(); }
                                firebaseUiContainer.style.display = 'none';

                                reauthenticatedUser.delete()
                                    .then(() => {
                                        console.log(`Auth user ${reauthenticatedUser.uid} deleted successfully after re-auth.`);
                                        alert('Your account has been successfully deleted. Your data will be marked for retention per policy.');
                                        window.location.href = '/';
                                    })
                                    .catch((finalDeleteError) => {
                                        console.error('Error deleting account after re-authentication:', finalDeleteError);
                                        alert('Error completing account deletion: ' + finalDeleteError.message + '. Your account was NOT deleted.');

                                        if (optionsGrid) optionsGrid.style.display = 'grid';
                                        if (actionButtonsDiv) actionButtonsDiv.style.display = 'block';
                                    });
                                return false;
                            },
                            uiShown: function() {
                                if (optionsGrid) optionsGrid.style.display = 'none';
                                if (actionButtonsDiv) actionButtonsDiv.style.display = 'none';
                            }
                        }
                    };
                    ui.start('#firebaseui-auth-container', uiConfig);

                } else {
                    console.error('Error deleting account:', error);
                    alert('Error deleting account: ' + error.message + '. Your account was NOT deleted.');

                    if (optionsGrid) optionsGrid.style.display = 'grid';
                    if (actionButtonsDiv) actionButtonsDiv.style.display = 'block';
                }
            }
        });
    }
});
