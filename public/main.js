// main.js
// This script contains logic specific to main.html.

document.addEventListener('DOMContentLoaded', () => {
    // Reference to the element that displays the current user's email
    // This is handled by common.js now.
    // const currentUserEmailSpan = document.getElementById('currentUserEmail'); // No longer directly needed here for display

    // Get references to the new buttons and the FirebaseUI container
    const deleteAccountButton = document.getElementById('deleteAccountButtonMain');
    const firebaseUiContainer = document.getElementById('firebaseui-auth-container');
    // Get references to elements that might need to be hidden/shown during re-auth
    const optionsGrid = document.querySelector('.options-grid');
    const actionButtonsDiv = document.querySelector('.action-buttons'); // Assuming this wraps your signOut and delete buttons

    // Get a reference to the Firebase Auth instance
    const auth = firebase.auth();

    // Declare ui variable here so it's accessible in callbacks
    let ui;

    // --- Firebase Auth State Listener for specific main.html elements ---
    // This listener is specifically for controlling the visibility of the Delete Account button
    // based on the user's authentication state. Common.js handles the general user info display.
    auth.onAuthStateChanged((user) => {
        if (user && !user.isAnonymous) {
            // Only show delete button for actual signed-in users (not anonymous)
            if (deleteAccountButton) {
                deleteAccountButton.style.display = 'inline-block';
            }
        } else {
            // Hide if no user or if user is anonymous
            if (deleteAccountButton) {
                deleteAccountButton.style.display = 'none';
            }
        }
    });

    // --- Click handlers for in-page functions ---

    // AI Pronunciation Practice
    const pronunciationPractice = document.getElementById('pronunciationPractice');
    if (pronunciationPractice) { // Check if element exists before adding listener
        pronunciationPractice.addEventListener('click', () => {
            alert('Launching AI Pronunciation Coach! (This would open a microphone modal or start a new in-app experience)');
            // Here, you would typically:
            // 1. Open a modal for microphone access.
            // 2. Start a Web Speech API session.
            // 3. Begin an interactive pronunciation exercise.
        });
    }

    // AI Listening Skills
    const listeningSkills = document.getElementById('listeningSkills');
    if (listeningSkills) { // Check if element exists before adding listener
        listeningSkills.addEventListener('click', () => {
            alert('Starting AI Listening Practice! (This would play audio and show interactive transcriptions)');
            // Here, you would typically:
            // 1. Load an audio player.
            // 2. Display an interactive transcript.
            // 3. Initiate a listening comprehension quiz.
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

            // Confirm with the user before proceeding
            const confirmDeletion = confirm('Are you sure you want to delete your account? This action cannot be undone and will permanently erase all your data. You will be signed out.');
            if (!confirmDeletion) {
                return; // User cancelled
            }

            try {
                // Attempt to delete the user
                await user.delete();
                alert('Your account has been successfully deleted.');
                // Redirect to a login page or home page after deletion
                window.location.href = '/'; // Or your specific login page URL, e.g., 'index.html'
            } catch (error) {
                if (error.code === 'auth/requires-recent-login') {
                    console.warn('Recent login required for account deletion. Prompting re-authentication.');
                    alert('For security, please sign in again to confirm account deletion.');

                    // Display the FirebaseUI container and start the UI
                    firebaseUiContainer.style.display = 'block';
                    ui = new firebaseui.auth.AuthUI(auth); // Assign to the 'ui' variable declared outside

                    const uiConfig = {
                        signInSuccessUrl: '/', // This will be overridden by signInSuccessWithAuthResult callback
                        signInOptions: [
                            // These should match the providers enabled in your Firebase project
                            firebase.auth.GoogleAuthProvider.PROVIDER_ID,
                            firebase.auth.EmailAuthProvider.PROVIDER_ID,
                            firebase.auth.FacebookAuthProvider.PROVIDER_ID,
                            firebase.auth.AppleAuthProvider.PROVIDER_ID
                            // Add other providers like PhoneAuthProvider.PROVIDER_ID if enabled
                        ],
                        callbacks: {
                            signInSuccessWithAuthResult: (authResult, redirectUrl) => {
                                // User has successfully re-authenticated. Now, try deleting again.
                                const reauthenticatedUser = authResult.user;
                                console.log('User re-authenticated. Attempting deletion again...');

                                // Ensure FirebaseUI is stopped and hidden before re-attempting deletion
                                // to clean up the UI, then handle redirect or error.
                                if (ui) { // Corrected: simply check if ui object exists
                                    ui.reset(); // Stop FirebaseUI
                                }
                                firebaseUiContainer.style.display = 'none';

                                reauthenticatedUser.delete().then(() => {
                                    alert('Your account has been successfully deleted.');
                                    window.location.href = '/'; // Redirect after successful deletion
                                }).catch((deleteError) => {
                                    console.error('Error deleting account after re-authentication:', deleteError);
                                    alert('Error deleting account after re-authentication: ' + deleteError.message);
                                    // If deletion fails, show main content again
                                    if (optionsGrid) optionsGrid.style.display = 'grid';
                                    if (actionButtonsDiv) actionButtonsDiv.style.display = 'block';
                                });
                                // Return false to prevent FirebaseUI from redirecting immediately
                                return false;
                            },
                            uiShown: function() {
                                // The FirebaseUI widget is rendered.
                                // Hide other UI elements to focus on re-authentication.
                                if (optionsGrid) optionsGrid.style.display = 'none';
                                if (actionButtonsDiv) actionButtonsDiv.style.display = 'none';
                            }
                        }
                    };
                    ui.start('#firebaseui-auth-container', uiConfig);

                } else {
                    console.error('Error deleting account:', error);
                    alert('Error deleting account: ' + error.message);
                }
            }
        });
    }
});
