// script.js

// Wait for the DOM to be ready and Firebase (including FirebaseUI) to be loaded
// Using 'DOMContentLoaded' ensures the HTML elements are available before we try to access them.
document.addEventListener('DOMContentLoaded', () => {

    // Check if Firebase is initialized.
    // This helps catch issues if the Firebase SDK scripts in index.html aren't loading correctly.
     try {
        let app = firebase.app();
        console.log('Firebase app initialized successfully.');
        // Optional: Log loaded Firebase features for debugging
        // let features = [
        //     'auth',
        //     'database',
        //     'firestore',
        //     'functions',
        //     'messaging',
        //     'storage',
        //     'analytics',
        //     'remoteConfig',
        //     'performance',
        // ].filter(feature => typeof app[feature] === 'function');
        // console.log(`Firebase SDK loaded with ${features.join(', ')}`);

      } catch (e) {
        // If Firebase app initialization fails, log the error and show it to the user via the loader element.
        console.error('Error loading the Firebase SDK. Check console and script tags in index.html.', e);
        const loadEl = document.getElementById('load');
         if (loadEl) {
             loadEl.textContent = 'Error loading the Firebase SDK, check console and script tags.';
             loadEl.style.display = 'block'; // Ensure loader is visible to show the error message
         }
         return; // Stop execution of the rest of the script if Firebase isn't available.
      }

    // Get the Auth service instance from the initialized Firebase app.
    const auth = firebase.auth(); // Using the compat syntax as per index.html includes

    // Get references to the UI elements we'll be showing/hiding.
    const loadEl = document.getElementById('load'); // For showing loading messages
    const messageEl = document.getElementById('message'); // The default welcome message (we'll hide it)
    const authOptionsContainer = document.getElementById('auth-options-container'); // The container for all auth options (FirebaseUI + anonymous button)
    const uiContainer = document.getElementById('firebaseui-auth-container'); // The container specifically for the FirebaseUI widget
    const signInAnonymouslyButton = document.getElementById('signInAnonymouslyButton'); // The "Just Look Around" button
    const mainAppContent = document.getElementById('main-app-content'); // The container for your main application content
    const anonymousPrompt = document.getElementById('anonymous-prompt'); // The prompt for anonymous users within mainAppContent
    const createAccountButton = document.getElementById('createAccountButton'); // Button to trigger account linking for anonymous users
    const signOutButton = document.getElementById('signOutButton'); // Sign Out button

    // Initially hide UI elements controlled by auth state.
    // The onAuthStateChanged listener will show the correct elements.
    if (loadEl) loadEl.style.display = 'none'; // Initial loader is managed by the script.
    if (messageEl) messageEl.style.display = 'none'; // Hide the default hosting message div.
    if (authOptionsContainer) authOptionsContainer.style.display = 'none'; // Hide the entire auth section.
    if (mainAppContent) mainAppContent.style.display = 'none'; // Hide the main app content.
    if (anonymousPrompt) anonymousPrompt.style.display = 'none'; // Hide the anonymous prompt.
    if (signOutButton) signOutButton.style.display = 'none'; // Hide the sign out button.


    // --- FirebaseUI configuration ---
    // Defines how FirebaseUI behaves and which providers it offers.
    const uiConfig = {
        callbacks: {
            // This callback is triggered on successful sign-in or sign-up using the FirebaseUI widget.
            // This includes new sign-ups and users signing in with existing registered accounts.
            // If autoUpgradeAnonymousUsers is true, this also fires when an anonymous user links an account.
            signInSuccessWithAuthResult: (authResult, redirectUrl) => {
                const user = authResult.user;
				console.log("User signed in or signed up successfully via FirebaseUI:", user);
                console.log("Is Anonymous (should be false after successful sign-in via UI):", user.isAnonymous);

                // *** START: ADDED CODE FOR EMAIL VERIFICATION ***
                // Check if the user just signed up (creationTime === lastSignInTime)
                // AND they signed in with email/password
                // AND their email is not already verified.
                // This prevents sending verification emails to returning users or users
                // who signed up with other providers like Google or Facebook (which handle verification themselves).
                if (user &&
                    user.email && // Make sure user object and email exist
                    !user.emailVerified && // Check if email is NOT verified
                    user.metadata && // Check if metadata exists
                    user.metadata.creationTime === user.metadata.lastSignInTime && // Check if it's a new user session
                    user.providerData.some(provider => provider.providerId === firebase.auth.EmailAuthProvider.PROVIDER_ID) // Check if email/password provider was used
                ) {
                    console.log("New email/password user detected. Email not verified. Sending verification email...");

                    user.sendEmailVerification()
                        .then(() => {
                            // Email verification sent successfully.
                            console.log('Email verification link sent!');
                            // You might want to display a message to the user on the page
                            // instructing them to check their email.
                            // For example: messageEl.textContent = "Please check your email to verify your account.";
                            // You would need to make your messageEl visible and possibly hide other content.
                            alert("A verification email has been sent to your address. Please check your inbox!"); // Using alert for simplicity, replace with better UI
                        })
                        .catch((error) => {
                            // Handle errors, e.g., if the user is offline or quota exceeded
                            console.error('Error sending email verification:', error);
                            // Display an error message to the user.
                             alert(`Error sending verification email: ${error.message}`); // Using alert for simplicity
                        });
                } else {
                    console.log("User is either not new, email is already verified, or signed in with a different provider. No verification email sent.");
                }
                 // *** END: ADDED CODE FOR EMAIL VERIFICATION ***

				// *** Reset FirebaseUI here after a successful sign-in via the UI ***
				// We know 'ui' exists and was active if this callback fired.
				if (ui) { // Added safety check for ui existence
				ui.reset(); // Stop the FirebaseUI flow to clean up listeners/state.
				console.log("FirebaseUI flow reset upon successful sign-in via callback.");
				}

                // The onAuthStateChanged listener (defined below) is the central place
                // to handle UI updates and redirects after *any* auth state change (sign-in, sign-out, link, unlink).
                // Returning false here prevents FirebaseUI from performing a default redirect
                // and allows our onAuthStateChanged listener to fully control the user flow.
                return false;
            }, // <--- Correctly placed comma
            // This callback is triggered when the FirebaseUI widget is fully rendered and ready
// --- START OF PART 2 ---

            . uiShown: function() {
              console.log("FirebaseUI widget shown.");
              // Ensure the loader is hidden once the UI form is visible.
              if (loadEl) {
                  loadEl.style.display = 'none';
              }
            },
            // This callback is triggered when FirebaseUI encounters an error
            signInFailure: function(error) {
                console.error('FirebaseUI sign-in failed:', error);
                // Hide loader on failure
                 if (loadEl) {
                    loadEl.style.display = 'none';
                 }
                // You might want to display a user-friendly error message on the page here.
                // error.code can give more specific details (e.g., 'firebaseui/anonymous-upgrade-merge-conflict').

                // *** Handle Anonymous Upgrade Merge Conflict if needed ***
                if (error.code === 'firebaseui/anonymous-upgrade-merge-conflict') {
                     console.warn("Anonymous upgrade merge conflict detected!");
                     // Here you would implement the logic to handle the conflict:
                     // 1. Save the anonymous user's data.
                     // 2. Delete the anonymous user.
                     // 3. Sign in the permanent user using the credential from error.credential.
                     // 4. Copy the saved data from step 1 to the permanent user.
                     // The FirebaseUI fact sheet provides an example code snippet for this.
                     alert("Account conflict detected. Please handle merge conflict logic."); // Replace with actual logic
                } else {
                    // Display other sign-in failure errors to the user
                     alert(`Sign-in failed: ${error.message}`); // Using alert, replace with better UI
                }
            }
        }, // <--- Correctly placed comma ending the callbacks object
        // Adding autoUpgradeAnonymousUsers: true as discussed
        autoUpgradeAnonymousUsers: true,

        // Configure the list of authentication providers to offer in the FirebaseUI widget.
        // Make sure these providers are enabled in your Firebase project's Authentication settings!
        signInOptions: [
            // *** Make sure Email/Password is enabled in Firebase Console -> Authentication -> Sign-in method ***
            firebase.auth.EmailAuthProvider.PROVIDER_ID, // Email/Password sign-in
            firebase.auth.GoogleAuthProvider.PROVIDER_ID,
			firebase.auth.FacebookAuthProvider.PROVIDER_ID,
			// firebase.auth.AppleAuthProvider.PROVIDER_ID, removed because Apple not set up yet
            // Add other providers you've enabled (e.g., firebase.auth.PhoneAuthProvider.PROVIDER_ID)

            // *** OPTIONAL: If you want to offer Email Link sign-in, uncomment/add this ***
            // {
            //     provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
            //     signInMethod: firebase.auth.EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD,
            //     // You might need to configure ActionCodeSettings if you want cross-device sign-in
            //     // or custom redirects. See the facts I remembered for details.
            // }
        ],

        // Add Terms of Service and Privacy Policy links if you have them. Highly recommended for production apps.
        // termsOfServiceUrl: '<your-terms-of-service-url>',
        // privacyPolicyUrl: '<your-privacy-policy-url>'
    }; // <--- Correctly placed closing brace for uiConfig

    // --- END OF PART 2 ---
    // --- COPY THE TEXT BELOW AND PASTE IT IMMEDIATELY AFTER THE TEXT ABOVE ---
    // --- START OF PART 3 ---

    // Initialize the FirebaseUI Widget instance using the Firebase Auth instance.
    // We initialize it here, but only call ui.start() when we need to display the UI widget.
    const ui = new firebaseui.auth.AuthUI(auth);


    // --- Anonymous Sign-in Button Handler ---
    // This listener handles the click event on the "Just Look Around" button.
    if (signInAnonymouslyButton) { // Check if the button element exists in the HTML
        signInAnonymouslyButton.addEventListener('click', () => {
            console.log("Attempting anonymous sign-in...");
            // Optional: Show a loader while signing in anonymously.
            if (loadEl) {
                 loadEl.style.display = 'block';
                 loadEl.textContent = 'Signing in anonymously...';
             }
            // Hide the authentication options container temporarily while signing in.
            if (authOptionsContainer) {
                 authOptionsContainer.style.display = 'none';
                 // If FirebaseUI was active, stop it before attempting anonymous sign-in.
                 // This prevents odd states if a user clicks "Just Look Around" while the UI is rendering.
                 if (ui) {
                     ui.reset(); // Stop and reset the FirebaseUI flow.
                     console.log("FirebaseUI flow reset before anonymous sign-in attempt.");
                  }
            }

            // Perform the anonymous sign-in using the Firebase Auth SDK.
            auth.signInAnonymously()
                .then(() => {
                    console.log("Anonymous sign-in initiated. The onAuthStateChanged listener will handle UI updates.");
                    // If successful, the onAuthStateChanged listener will automatically fire
                    // with the new anonymous user object, which will trigger the 'if (user)' block below.
                })
                .catch((error) => {
                    // Handle errors during anonymous sign-in.
                    console.error("Anonymous sign-in failed:", error);
                    // Hide loader on failure and show the error message.
                     if (loadEl) {
                        loadEl.style.display = 'none';
                        loadEl.textContent = `Anonymous sign-in failed: ${error.message}`;
                     }
                    // If anonymous sign-in fails, show the authentication options again
                    // so the user can sign up or sign in with a registered account using FirebaseUI.
                    if (authOptionsContainer) {
                        authOptionsContainer.style.display = 'block'; // Show the sign-in form area
                        console.log("Anonymous sign-in failed, displaying FirebaseUI options.");

                         // Restart FirebaseUI so user can try other sign-in methods.
                         // Ensure the container exists and FirebaseUI isn't already active before starting.
                         if (uiContainer) {
                              ui.start('#firebaseui-auth-container', uiConfig);
                              console.log("FirebaseUI widget started after anonymous sign-in failure.");
                          } else if (uiContainer) {
                             console.log("FirebaseUI was already active."); // Log if UI was active but didn't need restarting
                          } else {
                              console.error("FirebaseUI container element not found when trying to start UI after anonymous sign-in failure!");
                          }
                    } else {
                         console.error("Auth options container element not found after anonymous sign-in failed!");
                    }
                });
        });
    } else {
        console.warn("Anonymous sign-in button element (#signInAnonymouslyButton) not found in index.html!");
    }

    // --- Create Account Button Handler (for anonymous users) ---
    // This listener handles the click event on the "Create Permanent Account" button, shown to anonymous users.
    if (createAccountButton) { // Check if the button element exists
         createAccountButton.addEventListener('click', () => {
             console.log("Create Account button clicked. Displaying FirebaseUI for account linking.");

             // Hide the main app content and anonymous prompt
             if (mainAppContent) mainAppContent.style.display = 'none';
             if (anonymousPrompt) anonymousPrompt.style.display = 'none';
             if (signOutButton) signOutButton.style.display = 'none'; // Hide sign out during linking flow

             // Show the authentication options container again.
             if (authOptionsContainer) {
                 authOptionsContainer.style.display = 'block';
                 console.log("Authentication options container shown for account linking.");

                 // Start FirebaseUI to allow the anonymous user to link their current session to a provider.
                 // Since autoUpgradeAnonymousUsers: true is set in uiConfig, FirebaseUI will handle the linking process.
                  if (uiContainer) {
                       ui.start('#firebaseui-auth-container', uiConfig);
                       console.log("FirebaseUI widget started for account linking.");
                   } else if (uiContainer) {
                       console.log("FirebaseUI was already active when linking was attempted (unexpected)."); // Should ideally not happen if reset works
                   } else {
                       console.error("FirebaseUI container element not found when trying to start UI for linking!");
                   }
             } else {
                  console.error("Auth options container element not found when trying to display for linking!");
             }
         });
     } else {
         console.warn("Create Account button element (#createAccountButton) not found in index.html!");
     }

     // --- Sign Out Button Handler ---
     // This listener handles the click event on the "Sign Out" button.
      if (signOutButton) { // Check if the button element exists
          signOutButton.addEventListener('click', () => {
              console.log("Sign Out button clicked.");
              auth.signOut().then(() => {
                  // Sign-out successful.
                  console.log("User signed out successfully.");
                  // The onAuthStateChanged listener will automatically fire after successful sign out,
                  // detecting that there is no user and updating the UI to show the auth options.
              }).catch((error) => {
                  // An error happened during sign-out.
                  console.error("Error signing out:", error);
                  // Optionally display a user-friendly error message here.
              });
          });
      } else {
          console.warn("Sign Out button element (#signOutButton) not found in index.html!");
      }


    // --- Handling Authentication State Changes ---
    // This is the core listener that runs whenever the user's authentication state changes.
    // This includes:
    // 1. When the page loads (it checks if a user is already signed in).
    // 2. When a user successfully signs in (via FirebaseUI or anonymous).
    // 3. When a user signs out.
    // 4. When an anonymous user upgrades to a registered account.
    auth.onAuthStateChanged((user) => {
        console.log("Auth State Changed. Current user:", user ? user.uid : 'null (signed out)');

        if (user) {
            // A user is signed in. This could be a registered user or an anonymous user.
            console.log("User is signed in with UID:", user.uid, "Anonymous:", user.isAnonymous);

            // Hide the authentication options container since a user is authenticated.
            if (authOptionsContainer) {
                 authOptionsContainer.style.display = 'none';

            }
            // Show your main application content.
            if (mainAppContent) {
                 mainAppContent.style.display = 'block'; // Or 'flex', 'grid', etc., matching your CSS display property for this div.
                 console.log("Main app content shown.");
            }
             // Hide any loading text that might still be visible.
            if (loadEl) loadEl.style.display = 'none';
             // Show the sign out button, as a user is currently signed in.
             if (signOutButton) signOutButton.style.display = 'inline-block'; // Use 'inline-block' or 'block' based on desired layout.


            // Show or Hide the "Create Account" prompt and button specifically for anonymous users.
            if (anonymousPrompt) { // Check if the prompt element exists
                if (user.isAnonymous) {
                    anonymousPrompt.style.display = 'block'; // Show the prompt if the user is anonymous.
                    console.log("User is anonymous, showing create account prompt.");
                } else {
                    anonymousPrompt.style.display = 'none'; // Hide the prompt if the user is registered.
                    console.log("User is registered, hiding create account prompt.");
                }
            }

            // *** OPTIONAL: You could add logic here based on user.emailVerified ***
            // For example, you could hide certain features or show a banner if !user.emailVerified
            // and encourage them to check their email or resend the verification link.
            if (user.email && !user.emailVerified && !user.isAnonymous) {
                 console.log("Registered user with unverified email.");
                 // Example: Display a message like "Please verify your email address."
                 // You might show a specific div: document.getElementById('email-verification-prompt').style.display = 'block';
            }


        } else {
            // No user is signed in (neither registered nor anonymous).
            console.log("Auth State Changed: No user signed in.");

            // Hide the main content.
            if (mainAppContent) {
                 mainAppContent.style.display = 'none';
                 console.log("Main app content hidden.");
            }
             // Hide the sign out button.
            if (signOutButton) signOutButton.style.display = 'none';
             // Hide anonymous prompt if it was visible somehow (shouldn't be, but good practice).
             if (anonymousPrompt) anonymousPrompt.style.display = 'none';


            // Show the authentication options container.
            if (authOptionsContainer) {
                authOptionsContainer.style.display = 'block';
                console.log("Authentication options container shown.");

                 // Start FirebaseUI to render the social/email sign-in options.
                 // Only start FirebaseUI if its container exists and it's not already active.
                 if (uiContainer) {
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

            // Hide any loading text.
             if (loadEl) loadEl.style.display = 'none';

        }
    }); // <-- This closes the onAuthStateChanged listener.
}); // <-- This closes the DOMContentLoaded listener.

// --- END OF PART 3 ---
