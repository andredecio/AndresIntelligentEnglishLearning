// js/main.js (MODULARIZED VERSION)
// This script contains logic specific to main.html, now using Modular ES Modules.

// --- Import necessary Firebase modules ---
// Import the initialized 'auth' instance from your central Firebase services file.
import { auth } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// Import specific functions from the Firebase Authentication SDK.
// IMPORTANT: Using Firebase SDK v12.3.0 from CDN.
import { onAuthStateChanged, deleteUser } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';

// No direct imports for FirebaseUI as it's typically loaded as a global via CDN,
// but it will consume our modular 'auth' instance.


document.addEventListener('DOMContentLoaded', () => {
    // Get references to the new buttons and the FirebaseUI container
    const deleteAccountButton = document.getElementById('deleteAccountButtonMain');
    const firebaseUiContainer = document.getElementById('firebaseui-auth-container');
    // Get references to elements that might need to be hidden/shown during re-auth
    const optionsGrid = document.querySelector('.options-grid');
    const actionButtonsDiv = document.querySelector('.action-buttons'); // Assuming this wraps your signOut and delete buttons

    // Declare ui variable here so it's accessible in callbacks
    let ui;

    // --- Firebase Auth State Listener for specific main.html elements ---
    // Use the modular 'onAuthStateChanged' function, passing the imported 'auth' instance.
    onAuthStateChanged(auth, (user) => {
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
            // Access 'currentUser' directly from the imported 'auth' instance.
            const user = auth.currentUser;

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
                // Use the modular 'deleteUser' function.
                await deleteUser(user);
                console.log(`Auth user ${user.uid} deletion initiated successfully.`);

                alert('Your account has been successfully deleted. Your data will be marked for retention per policy.');
                window.location.href = '/';

            } catch (error) {
                // --- CATCH BLOCK FOR AUTH DELETION FAILURE ---
                if (error.code === 'auth/requires-recent-login') {
                    console.warn('Recent login required for account deletion. Prompting re-authentication.');
                    alert('For security, please sign in again to confirm account deletion.');

                    firebaseUiContainer.style.display = 'block';
                    // Initialize FirebaseUI AuthUI, passing our modular 'auth' instance.
                    // 'firebaseui' is assumed to be globally available from its CDN script.
                    ui = new firebaseui.auth.AuthUI(auth);

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

                                // Use the modular 'deleteUser' function for the re-authenticated user.
                                deleteUser(reauthenticatedUser)
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
