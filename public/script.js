// script.js

// Wait for the DOM to be ready and Firebase (including FirebaseUI) to be loaded
document.addEventListener('DOMContentLoaded', () => {

    // Check if Firebase is initialized, if not, it means the init.js didn't run
    // This can happen if the script is run outside of Firebase Hosting or Firebase Emulators
     try {
        let app = firebase.app();
        console.log('Firebase app initialized successfully.');
        // You might want to list features as in your old inline script if helpful for debugging
        // let features = [ /* ... */ ]; console.log(`Firebase SDK loaded with ${features.join(', ')}`);
      } catch (e) {
        console.error('Error loading the Firebase SDK. Make sure firebase-app-compat.js and firebase/init.js are correctly loaded.', e);
        const loadEl = document.getElementById('load');
         if (loadEl) {
             loadEl.textContent = 'Error loading the Firebase SDK, check console and script tags.';
             loadEl.style.display = 'block'; // Make sure loader is visible to show error
         }
         // Stop execution if Firebase app isn't available
         return;
      }


    // Get the Auth service instance from the initialized Firebase app
    const auth = firebase.auth(); // Using the compat syntax

    // Get references to the UI elements
    const loadEl = document.getElementById('load'); // For showing loading messages
    const messageEl = document.getElementById('message'); // The default welcome message (we'll hide it)
    const authOptionsContainer = document.getElementById('auth-options-container'); // The new container for all auth options
    const uiContainer = document.getElementById('firebaseui-auth-container'); // The FirebaseUI specific container
    const signInAnonymouslyButton = document.getElementById('signInAnonymouslyButton'); // The new anonymous sign-in button
    const mainAppContent = document.getElementById('main-app-content'); // Your main app content container


    // Hide initial loaders/messages while determining auth state
    if (loadEl) loadEl.style.display = 'none'; // We'll manage this based on state
    if (messageEl) messageEl.style.display = 'none'; // Hide the default hosting message
    // Initially hide both auth options and main content, listener will show one
    if (authOptionsContainer) authOptionsContainer.style.display = 'none';
    if (mainAppContent) mainAppContent.style.display = 'none';


    // FirebaseUI configuration
    const uiConfig = {
        signInOptions: [
            firebase.auth.EmailAuthProvider.PROVIDER_ID,
            firebase.auth.GoogleAuthProvider.PROVIDER_ID,
			      firebase.auth.FacebookAuthProvider.PROVIDER_ID,
			      firebase.auth.AppleAuthProvider.PROVIDER_ID,
            // Add other providers you've enabled in the Firebase console
        ],
        // Redirect or callbacks after successful FirebaseUI sign-in/sign-up
        // Since onAuthStateChanged handles UI switching, returning false is often better
        // if you want to control the UI flow completely in onAuthStateChanged.
        signInSuccessUrl: '/', // You could set this, but our listener will handle UI
        callbacks: {
            signInSuccessWithAuthResult: (authResult, redirectUrl) => {
                const user = authResult.user;
                console.log("User signed in or signed up successfully via FirebaseUI:", user);
                // The onAuthStateChanged listener will now handle showing the main app content
                // Return false to prevent FirebaseUI from doing a redirect itself,
                // allowing onAuthStateChanged to fully control the flow.
                return false;
            },
            uiShown: function() {
              // The FirebaseUI widget is rendered. Ensure the loader is hidden if it was shown.
              if (loadEl) loadEl.style.display = 'none';
              console.log("FirebaseUI widget shown.");
            },
            // Optional: Handle sign-in flow errors
            signInFailure: function(error) {
                console.error('FirebaseUI sign-in failed:', error);
                 if (loadEl) { // Hide loader on failure
                    loadEl.style.display = 'none';
                 }
                 // You might want to display an error message to the user here
            }
        },
        // Add Terms of Service/Privacy Policy links if you have them
        // termsOfServiceUrl: '<your-terms-url>',
        // privacyPolicyUrl: '<your-privacy-url>'
    };

    // Initialize the FirebaseUI Widget using Firebase Auth instance.
    const ui = new firebaseui.auth.AuthUI(auth);


    // --- Anonymous Sign-in Button Handler ---
    if (signInAnonymouslyButton) {
        signInAnonymouslyButton.addEventListener('click', () => {
            console.log("Attempting anonymous sign-in...");
            // Optional: Show a loader while signing in anonymously
            if (loadEl) {
                 loadEl.style.display = 'block';
                 loadEl.textContent = 'Signing in anonymously...';
             }
            // Hide the auth options container temporarily
            if (authOptionsContainer) {
                 authOptionsContainer.style.display = 'none';
                 // If FirebaseUI was active, stop it before attempting anonymous sign-in
                 if (ui.isSignInFlowActive()) {
                     ui.reset(); // Stop the FirebaseUI flow
                     console.log("FirebaseUI flow reset before anonymous sign-in attempt.");
                  }
            }


            // Perform the anonymous sign-in
            auth.signInAnonymously()
                .then(() => {
                    console.log("Anonymous sign-in initiated. onAuthStateChanged will handle UI.");
                    // The onAuthStateChanged listener will automatically fire
                    // when the anonymous sign-in is successful.
                })
                .catch((error) => {
                    console.error("Anonymous sign-in failed:", error);
                    // Hide loader on failure
                     if (loadEl) {
                        loadEl.style.display = 'none';
                        loadEl.textContent = `Anonymous sign-in failed: ${error.message}`;
                     }
                    // If anonymous sign-in fails, show the auth options again
                    if (authOptionsContainer) {
                        authOptionsContainer.style.display = 'block';
                         // Restart FirebaseUI so user can try other sign-in methods
                         if (uiContainer && !ui.isSignInFlowActive()) {
                              ui.start('#firebaseui-auth-container', uiConfig);
                              console.log("Restarted FirebaseUI after anonymous sign-in failure.");
                          }
                    }
                });
        });
    } else {
        console.warn("Anonymous sign-in button element not found!");
    }


    // --- Handling Authentication State Changes ---
    // This listener runs when the auth state changes (sign in, sign out, page load)
    auth.onAuthStateChanged((user) => {

        if (user) {
            // User is signed in (either registered or anonymous)
            console.log("User is signed in with UID:", user.uid, "Anonymous:", user.isAnonymous);

            // Hide the authentication options container
            if (authOptionsContainer) {
                 authOptionsContainer.style.display = 'none';
                 // If FirebaseUI was active, stop it now that user is signed in
                  if (ui.isSignInFlowActive()) {
                     ui.reset(); // Stop the FirebaseUI flow
                     console.log("FirebaseUI flow reset upon successful sign-in.");
                  }
            }
            // Show your main application content
            if (mainAppContent) {
                 mainAppContent.style.display = 'block'; // Or 'flex', 'grid', etc.
                 console.log("Main app content shown.");
            }
             // Hide any loading text
            if (loadEl) loadEl.style.display = 'none';


            // Optional: Tailor UI based on user.isAnonymous
            if (user.isAnonymous) {
                console.log("Currently signed in anonymously. Consider prompting user to sign up.");
                // You might show a message or button prompting them to sign up/link account
                // You can use `user.linkWithCredential()` to link anonymous to another provider later
            } else {
                console.log("Currently signed in with a registered account.");
            }

        } else {
            // No user is signed in (neither registered nor anonymous)
            console.log("No user signed in. Displaying authentication options.");

            // Hide main content
            if (mainAppContent) {
                 mainAppContent.style.display = 'none';
                 console.log("Main app content hidden.");
            }
            // Show the authentication options container
            if (authOptionsContainer) {
                authOptionsContainer.style.display = 'block';
                console.log("Authentication options container shown.");

                 // Start FirebaseUI to render the social/email options
                 // Only start if the container exists and FirebaseUI isn't already active
                 if (uiContainer && !ui.isSignInFlowActive()) {
                      ui.start('#firebaseui-auth-container', uiConfig);
                      console.log("FirebaseUI widget started.");
                  } else if (uiContainer) {
                      console.log("FirebaseUI was already active.");
                  } else {
                      console.error("FirebaseUI container element not found when trying to start UI!");
                  }
            } else {
                 console.error("Auth options container element not found!");
            }

            // Hide any loading text
             if (loadEl) loadEl.style.display = 'none';

        }
    });

}); // End of DOMContentLoaded listener
