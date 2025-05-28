// script.js

// Wait for the DOM to be ready and Firebase (including FirebaseUI) to be loaded
document.addEventListener('DOMContentLoaded', () => {

    // Get the Auth service instance from the initialized Firebase app
    const auth = firebase.auth(); // Using the compat syntax

    // Get references to the UI elements
    const loadEl = document.getElementById('load');
    const messageEl = document.getElementById('message'); // The default welcome message
    const uiContainer = document.getElementById('firebaseui-auth-container'); // The FirebaseUI container

    // Hide initial loaders/messages while determining auth state
    if (loadEl) {
        loadEl.style.display = 'none'; // We'll update this based on auth state
    }
    if (messageEl) {
         messageEl.style.display = 'none'; // Hide the default hosting message
     }
    // Initially hide the FirebaseUI container until we know if we need to show it
    if (uiContainer) {
        uiContainer.style.display = 'none';
    }


    // FirebaseUI configuration (we define this even if we don't start it immediately)
    const uiConfig = {
        // Configure supported providers for *registered* sign-in/sign-up
        signInOptions: [
            firebase.auth.EmailAuthProvider.PROVIDER_ID,
            firebase.auth.GoogleAuthProvider.PROVIDER_ID,
			firebase.auth.FacebookAuthProvider.PROVIDER_ID,
			firebase.auth.AppleAuthProvider.PROVIDER_ID,
            // Add other providers you've enabled in the Firebase console
        ],
        // You can configure redirects or callbacks here
        signInSuccessUrl: '/', // Redirect to the root or main app page on success
        callbacks: {
            // This callback is triggered on successful sign-in/sign-up using FirebaseUI.
            // This happens when an anonymous user upgrades or a new/existing user signs in.
            signInSuccessWithAuthResult: (authResult, redirectUrl) => {
                const user = authResult.user;
                console.log("User signed in or signed up successfully via FirebaseUI:", user);
                console.log("Is Anonymous:", user.isAnonymous); // Check if they were anonymous and just upgraded

                // **IMPORTANT:** This is where you'd trigger saving or updating user data in your Cloud SQL DB!
                // Get user.uid, user.email, user.displayName, etc.
                // Send this info securely to your backend to interact with Cloud SQL.
                // Remember this requires a secure backend endpoint, e.g., using Cloud Functions or App Engine.

                // After successful sign-in/sign-up, onAuthStateChanged will also be triggered,
                // and our listener below will handle showing the main app content and hiding the form.

                // Return true to let FirebaseUI handle the redirect (if signInSuccessUrl is set),
                // or return false to prevent redirect and handle it yourself (e.g., update UI directly).
                // If you return false, make sure you hide the FirebaseUI container and show your app content.
                // For now, let's return true to let it redirect if signInSuccessUrl is set.
                return true;
            },
            // Optional: This callback is triggered when the FirebaseUI widget is fully rendered.
            uiShown: function() {
              // Now FirebaseUI is visible, you could ensure any other loaders are hidden
              if (loadEl) {
                  loadEl.style.display = 'none';
              }
            }
        },
        // Add Terms of Service/Privacy Policy links if you have them
        // termsOfServiceUrl: '<your-terms-url>',
        // privacyPolicyUrl: '<your-privacy-url>'
    };

    // Initialize the FirebaseUI Widget using Firebase Auth instance.
    // We initialize it here, but only call ui.start() later if needed.
    const ui = new firebaseui.auth.AuthUI(auth);

    // --- Handling Authentication State Changes ---
    // This listener runs when the auth state changes (sign in, sign out, page load)
    auth.onAuthStateChanged((user) => {
        const mainAppContent = document.getElementById('main-app-content'); // Assume you'll have a div for your main app content

        if (user) {
            // User is signed in (either registered or anonymous)
            console.log("User is signed in with UID:", user.uid, "Anonymous:", user.isAnonymous);

            // Hide the FirebaseUI container since a user is authenticated
            if (uiContainer) {
                 uiContainer.style.display = 'none';
                 // If FirebaseUI was running, stop it to clean up listeners/state
                 if (ui.isSignInFlowActive()) {
                    ui.reset(); // Stop the FirebaseUI flow
                    console.log("FirebaseUI flow reset.");
                 }
            }
            // Show your main application content
            if (mainAppContent) {
                 mainAppContent.style.display = 'block'; // Or 'flex', 'grid', etc.
                 console.log("Main app content shown.");
            }

            // Here, you might check user.isAnonymous to tailor the UI
            // e.g., show a "Sign Up" prompt for anonymous users
            if (user.isAnonymous) {
                console.log("Currently signed in anonymously.");
                // You could show a message or button prompting them to sign up
            } else {
                console.log("Currently signed in with a registered account.");
                // User is fully registered
            }

        } else {
            // No user is signed in (neither registered nor anonymous)
            console.log("No user signed in.");

            // Attempt to sign in anonymously
            auth.signInAnonymously()
                .then(() => {
                    console.log("Attempted anonymous sign-in.");
                    // If successful, the onAuthStateChanged listener will fire again
                    // with the new anonymous user object, which will trigger the 'if (user)' block above.

                    // While anonymous sign-in is in progress, maybe show a loader
                     if (loadEl) {
                        loadEl.style.display = 'block';
                        loadEl.textContent = 'Signing in anonymously...';
                    }

                })
                .catch((error) => {
                    console.error("Error signing in anonymously:", error);
                    // If anonymous sign-in fails, then show the FirebaseUI widget
                    // so the user can sign up or sign in with a registered account.
                    if (uiContainer) {
                        uiContainer.style.display = 'block'; // Show the sign-in form
                        console.log("Anonymous sign-in failed, starting FirebaseUI widget.");

                         // Only start FirebaseUI if the container exists and it's not already active
                         if (!ui.isSignInFlowActive()) {
                            ui.start('#firebaseui-auth-container', uiConfig);
                         } else {
                             console.log("FirebaseUI was already active.");
                         }
                    } else {
                         console.error("FirebaseUI container element not found after anonymous sign-in failed!");
                    }

                    // Hide the loader if anonymous sign-in failed
                    if (loadEl) {
                        loadEl.style.display = 'none';
                    }
                });
        }
    });

}); // End of DOMContentLoaded listener
