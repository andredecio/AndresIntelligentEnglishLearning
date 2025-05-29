// script.js

// Wait for the DOM to be ready and Firebase (including FirebaseUI) to be loaded
document.addEventListener('DOMContentLoaded', () => {

    // Check if Firebase is initialized
     try {
        let app = firebase.app();
        console.log('Firebase app initialized successfully.');
      } catch (e) {
        console.error('Error loading the Firebase SDK. Check console and script tags.', e);
        const loadEl = document.getElementById('load');
         if (loadEl) {
             loadEl.textContent = 'Error loading the Firebase SDK, check console and script tags.';
             loadEl.style.display = 'block';
         }
         return; // Stop execution
      }

    // Get the Auth service instance
    const auth = firebase.auth();

    // Get references to the UI elements
    const loadEl = document.getElementById('load');
    const messageEl = document.getElementById('message'); // Default message
    const authOptionsContainer = document.getElementById('auth-options-container'); // Container for sign-in options
    const uiContainer = document.getElementById('firebaseui-auth-container'); // FirebaseUI specific container
    const signInAnonymouslyButton = document.getElementById('signInAnonymouslyButton'); // Anonymous sign-in button
    const mainAppContent = document.getElementById('main-app-content'); // Main app content
    const anonymousPrompt = document.getElementById('anonymous-prompt'); // Prompt for anonymous users in main content
    const createAccountButton = document.getElementById('createAccountButton'); // Button to create account from anonymous
    const signOutButton = document.getElementById('signOutButton'); // Sign Out button

    // Initially hide UI elements controlled by auth state
    if (loadEl) loadEl.style.display = 'none';
    if (messageEl) messageEl.style.display = 'none';
    if (authOptionsContainer) authOptionsContainer.style.display = 'none';
    if (mainAppContent) mainAppContent.style.display = 'none';
    if (anonymousPrompt) anonymousPrompt.style.display = 'none'; // Hide anonymous prompt initially
    if (signOutButton) signOutButton.style.display = 'none'; // Hide sign out button initially


    // FirebaseUI configuration
    const uiConfig = {
        callbacks: {
            signInSuccessWithAuthResult: (authResult, redirectUrl) => {
                const user = authResult.user;
			console.log("User signed in or signed up successfully via FirebaseUI});
