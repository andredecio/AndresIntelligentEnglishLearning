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
    // Note: The email link handling logic below might show the loader initially.
    if (messageEl) messageEl.style.display = 'none'; // Hide the default hosting message div.
    if (authOptionsContainer) authOptionsContainer.style.display = 'none'; // Hide the entire auth section.
    if (mainAppContent) mainAppContent.style.display = 'none'; // Hide the main app content.
    if (anonymousPrompt) anonymousPrompt.style.display = 'none'; // Hide the anonymous prompt.
    if (signOutButton) signOutButton.style.display = 'none'; // Hide the sign out button.


    // *** START: NEW CODE TO HANDLE EMAIL LINK SIGN-IN COMPLETION ***

    // Check if the current URL contains a sign-in with email link
    if (auth.isSignInWithEmailLink(window.location.href)) {
        console.log("Detected email sign-in link in URL. Attempting to sign in...");

        // Show a loader while we process the sign-in link
        if (loadEl) {
            loadEl.style.display = 'block';
            loadEl.textContent = 'Completing sign-in...';
        }
        // Hide the auth options container while processing
        if (authOptionsContainer) authOptionsContainer.style.display = 'none';


        // Get the email address from storage (e.g., localStorage).
        // This is the email the user entered when they *initiated* the email link flow.
        // IMPORTANT: YOU MUST SAVE THE USER'S EMAIL TO LOCAL STORAGE *BEFORE* SENDING THE EMAIL LINK.
        // Find the part of your code where you send the email link (likely via FirebaseUI config for email link or custom code)
        // and add something like: localStorage.setItem('emailForSignIn', email_address_entered_by_user);
        let email = localStorage.getItem('emailForSignIn');
        if (!email) {
            // If email is not found in storage, prompt the user for it.
            // This can happen if the user opens the link on a different device or browser.
            console.warn("Email for sign-in link not found in local storage. Prompting user.");
            // Use a more user-friendly prompt if possible, maybe in your HTML/CSS
            email = window.prompt('Please provide your email for confirmation:');
        }

        // *** END Part 1 ***
        // Please confirm you have copied this part before asking for Part 2.
        if (email) {
            // The client SDK will parse the code from the link for you.
            auth.signInWithEmailLink(email, window.location.href)
                .then((result) => {
                    // Email link sign-in successful.
                    console.log("Email link sign-in successful!", result);
                    // Clear email from storage after successful sign-in.
                    localStorage.removeItem('emailForSignIn');

                    // The onAuthStateChanged listener will now fire with the signed-in user
                    // object, and it will handle updating the UI accordingly.

                    // You can access the user via result.user. Check result.additionalUserInfo.isNewUser
                    // to see if this was the first time they signed in with this email.

                    // Hide the loader - the onAuthStateChanged listener will show the main content.
                     if (loadEl) loadEl.style.display = 'none';

                    // Remove the email link parameters from the URL to clean it up
                    // and prevent issues if the user refreshes the page.
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }


                })
                .catch((error) => {
                    // Handle errors during sign-in.
                    console.error("Error signing in with email link:", error);
                    // Possible errors include invalid link, expired link, etc.

                    // Hide the loader
                     if (loadEl) loadEl.style.display = 'none';

                    // Display an error message to the user.
                    const errorMessage = `Error completing sign-in: ${error.message}`;
                    console.error(errorMessage);
                    // You might want to display this error in a more user-friendly way on the page.
                    // For now, let's display the auth options again so they can try signing in normally.
                    alert(errorMessage + "\nPlease try signing in again."); // Using alert for simplicity

                    // After error, show the auth options container again
                    if (authOptionsContainer) {
                         authOptionsContainer.style.display = 'block';
                         console.log("Email link sign-in failed, displaying FirebaseUI options.");

                         // Start FirebaseUI again so user can try other sign-in methods.
                         if (uiContainer) {
                              ui.start('#firebaseui-auth-container', uiConfig);
                              console.log("FirebaseUI widget started after email link sign-in failure.");
                          } else {
                              console.error("FirebaseUI container element not found when trying to start UI after email link sign-in failure!");
                          }
                    } else {
                         console.error("Auth options container element not found after email link sign-in failed!");
                    }
                });
        } else {
            // No email provided by user when prompted.
            console.warn("No email provided by user to complete sign-in link.");

            // Hide loader
            if (loadEl) loadEl.style.display = 'none';

            // Display an error or message and show auth options.
            const noEmailMessage = "Could not complete sign-in. Email address is required.";
            alert(noEmailMessage); // Using alert for simplicity

            if (authOptionsContainer) {
                 authOptionsContainer.style.display = 'block';
                 console.log("Email link sign-in completion aborted (no email), displaying FirebaseUI options.");
                  if (uiContainer) {
                       ui.start('#firebaseui-auth-container', uiConfig);
                       console.log("FirebaseUI widget started after email link completion aborted.");
                   } else {
                       console.error("FirebaseUI container element not found when trying to start UI after email link completion aborted!");
                   }
            } else {
                  console.error("Auth options container element not found after email link completion aborted!");
            }
        }

        // *** END Part 2 ***
        // Please confirm you have copied this part before asking for Part 3.
    } else {
        // No email sign-in link detected in the URL.
        // This is the normal behavior when the page loads for the first time
        // or when a user navigates to the page without an email link.
        console.log("No email sign-in link detected in URL. Proceeding with normal auth state check.");
        // The rest of the script (specifically onAuthStateChanged) will handle the UI display.
        // No need to do anything specific here other than let the script continue.
        // Ensure initial UI state is correct when no link is present (show auth options if no user is signed in).
        // This will be handled by the onAuthStateChanged listener shortly after.
    }

    // *** END: NEW CODE TO HANDLE EMAIL LINK SIGN-IN COMPLETION ***


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

                // *** Existing Code for Email Verification (for Email/Password via FirebaseUI) ***
                // This block handles sending the *initial* verification email for new email/password users
                // who sign up directly through the FirebaseUI widget (not via email link sign-in).
                if (user &&
                    user.email && // Make sure user object and email exist
                    !user.emailVerified && // Check if email is NOT verified
                    user.metadata && // Check if metadata exists
                    user.metadata.creationTime === user.metadata.lastSignInTime && // Check if it's a new user session
                    user.providerData.some(provider => provider.providerId === firebase.auth.EmailAuthProvider.PROVIDER_ID) // Check if email/password provider was used
                ) {
                    console.log("New email/password user detected via FirebaseUI. Email not verified. Sending verification email...");

                    // IMPORTANT: If you are also offering Email Link sign-in via FirebaseUI,
                    // this is where you would typically configure the ActionCodeSettings
                    // and potentially save the email to localStorage *before* calling sendSignInLinkToEmail
                    // if you were using email link directly here instead of just email verification.
                    // However, since you're using FirebaseUI's standard Email/Password provider *here*,
                    // this sends a verification email, not a sign-in link.
                    // If you *were* using FirebaseUI's EMAIL_LINK_SIGN_IN_METHOD, the configuration
                    // for saving email to localStorage would go inside the uiConfig's signInOptions
                    // object for the email link provider, potentially using the signInMethod: { ... } structure.
                    // Also, for Email Link sign-in *initiated via FirebaseUI*, you'd need actionCodeSettings
                    // defined in the uiConfig for that specific provider entry. This ActionCodeSettings
                    // must have a 'url' property pointing to the page containing the email link handling logic
                    // (the NEW CODE block I added at the top).

                    user.sendEmailVerification()
                        .then(() => {
                            // Email verification sent successfully.
                            console.log('Email verification link sent!');
                            // Display a message to the user instructing them to check their email.
                            alert("A verification email has been sent to your address. Please check your inbox!"); // Using alert for simplicity, replace with better UI
                        })
                        .catch((error) => {
                            // Handle errors, e.g., if the user is offline or quota exceeded
                            console.error('Error sending email verification:', error);
                            // Display an error message to the user.
                             alert(`Error sending verification email: ${error.message}`); // Using alert for simplicity
                        });
                } else {
                    console.log("User is either not new, email is already verified, or signed in with a different provider. No verification email sent from this FirebaseUI callback.");
                }
                 // *** END: Existing Code for Email Verification ***


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
                return false; // Prevents default redirect
            }, // <--- Correctly placed comma
            // This callback is triggered when the FirebaseUI widget is fully rendered and ready.
            uiShown: function() {
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
            // IMPORTANT: If you want FirebaseUI to handle the Email Link flow for NEW sign-ups/sign-ins,
            // you need to uncomment and configure the EMAIL_LINK_SIGN_IN_METHOD option below.
            // If you only want standard Email/Password with verification email (like your current code seems to be set up for),
            // then keep this line as it is:
            firebase.auth.EmailAuthProvider.PROVIDER_ID, // Email/Password sign-in (standard)

            // *** OPTIONAL: If you want to offer Email Link sign-in *via FirebaseUI*, uncomment/add this ***
            // Note: If you use the standard Email/Password provider above, new users signing up that way
            // will receive a verification email (handled by your existing callback logic).
            // If you ONLY offer the EMAIL_LINK_SIGN_IN_METHOD provider, users will get a sign-in link instead.
            // You can offer both, but be mindful of the user flow.
            // {
            //     provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
            //     signInMethod: firebase.auth.EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD,
            //     // ActionCodeSettings are REQUIRED for email link sign-in.
            //     actionCodeSettings: {
            //         // URL you want to redirect back to after sign in.
            //         // This URL MUST be in the list of authorized redirect origins
            //         // (usually your Firebase Hosting domain or localhost for testing).
            //         url: window.location.href, // Use the current page's URL for simplicity
            //         // This makes the link work across different devices.
            //         handleCodeInApp: true, // Set to true.

            //         // Optional: specify iOS app bundle ID and Android package name if you want
            //         // to open the link in a native app *first*.
            //         // iOS: { bundleId: 'com.Lunateq.AIEL' }, // Use your actual bundle ID
            //         // Android: {
            //         //     packageName: 'Andres.Intelligent.English.Learning', // Use your actual package name
            //         //     installApp: true, // Set to true if you want to attempt installing the app
            //         //     minimumVersion: '12', // Optional: minimum version of the app
            //         // },
            //         // Optional: Set this to true to allow the user to sign in with the link on
            //         // the same device they requested it on, even if the app is installed.
            //         // dynamicLinkDomain: 'YOUR_DYNAMIC_LINK_DOMAIN', // Required if you want deep linking to native apps
            //     }
            //     // IMPORTANT: When using EMAIL_LINK_SIGN_IN_METHOD via FirebaseUI,
            //     // FirebaseUI handles *sending* the email. You don't need separate code for that.
            //     // However, you *still* need the NEW CODE block at the top of this script
            //     // to handle the link when the user clicks it and returns to this page!
            //     // FirebaseUI doesn't automatically complete the sign-in on return.
            //     // Also, FirebaseUI doesn't automatically save the email to localStorage when
            //     // the link is sent with this method. You might need custom logic if you require
            //     // the email to be pre-filled on return across different browsers/devices.
            // }
        ],

        // Add Terms of Service and Privacy Policy links if you have them. Highly recommended for production apps.
        // termsOfServiceUrl: '<your-terms-of-service-url>',
        // privacyPolicyUrl: '<your-privacy-policy-url>'
    }; // <--- Correctly placed closing brace for uiConfig

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

    // *** END Part 3 ***
    // Please confirm you have copied this part before asking for Part 4.

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
	 // Check if the button element exists
      if (signOutButton) {
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
    // 2. When a user successfully signs in (via FirebaseUI, anonymous, or EMAIL LINK).
    // 3. When a user signs out.
    // 4. When an anonymous user upgrades to a registered account.
    // 5. Crucially, after the user verifies their email by clicking the link (if they signed in with Email/Password and weren't auto-verified)!
    auth.onAuthStateChanged((user) => {
        console.log("Auth State Changed. Current user:", user ? user.uid : 'null (signed out)');

        // Get the email verification message element (assuming you add this to index.html)
        const emailVerificationMessageEl = document.getElementById('email-verification-message');
        // Hide it by default at the start of the state change check
        if (emailVerificationMessageEl) emailVerificationMessageEl.style.display = 'none';


        if (user) {
            // A user is signed in. This could be a registered user or an anonymous user.
            console.log("User is signed in with UID:", user.uid, "Anonymous:", user.isAnonymous, "Email Verified:", user.emailVerified);

            // *** START: Logic to check for unverified email/password users ***

            // Check if the user signed in using the Email/Password provider...
            const isEmailPasswordUser = user.providerData.some(provider => provider.providerId === firebase.auth.EmailAuthProvider.PROVIDER_ID);

            // ... AND if their email is NOT verified
            if (isEmailPasswordUser && !user.emailVerified) {
                 // This user signed in with email/password but hasn't verified their email.
                 console.log("Email/Password user is signed in but email is NOT verified. Displaying verification prompt.");

                 // Hide the main app content
                 if (mainAppContent) mainAppContent.style.display = 'none';
                 // Hide the anonymous prompt (not applicable for this user type)
                 if (anonymousPrompt) anonymousPrompt.style.display = 'none';
                 // Keep the authentication options container hidden as they are signed in (but need to verify)
                 if (authOptionsContainer) authOptionsContainer.style.display = 'none';
                 // Hide loader
                 if (loadEl) loadEl.style.display = 'none';
                 // Hide sign out button for now (they can't really *use* the app yet)
                 if (signOutButton) signOutButton.style.display = 'none';


                 // Show the "please verify email" message
                 if (emailVerificationMessageEl) {
                     emailVerificationMessageEl.style.display = 'block'; // Or 'flex', etc.
                     emailVerificationMessageEl.innerHTML = `
                         <h2>Email Verification Required</h2>
                         <p>A verification email has been sent to ${user.email}. Please click the link in the email to verify your account.</p>
                         <p>Didn't receive the email? Check your spam folder or click below to resend.</p>
                         <button id="resend-verification-email">Resend Verification Email</button>
                     `; // Example message, replace with your desired HTML/text

                     // Add event listener to resend button
                     const resendButton = document.getElementById('resend-verification-email');
                     if (resendButton) {
                         resendButton.addEventListener('click', () => {
                             console.log("Resend Verification Email button clicked.");
                             // Re-fetch the current user object in case it's stale (though unlikely in this flow)
                             const currentUser = auth.currentUser;
                             if (currentUser) { // Check user is still signed in before resending
                                 currentUser.sendEmailVerification()
                                     .then(() => {
                                         console.log('Email verification link resent!');
                                         alert("Verification email resent! Please check your inbox."); // Replace with better UI
                                     })
                                     .catch((error) => {
                                         console.error('Error resending email verification:', error);
                                         alert(`Error resending verification email: ${error.message}`); // Replace with better UI
                                     });
                             } else {
                                  console.log("Cannot resend verification email, user is no longer signed in.");
                                  // Maybe prompt them to sign in again?
                                  // The onAuthStateChanged will likely handle this already by showing auth options.
                             }
                         });
                     }


                 } // <-- Closes the if (emailVerificationMessageEl) check inside the unverified block


            } else {
                // This user is signed in AND is either:
                // 1. An Email/Password user whose email is VERIFIED
                // 2. An anonymous user
                // 3. A user signed in with a social provider (Google, Facebook, etc. - their emails are usually verified by the provider or not required)
                console.log("User is signed in and authorized to view main content.");


                // Hide the authentication options container since a user is authenticated.
                if (authOptionsContainer) {
                     authOptionsContainer.style.display = 'none';
                }
                // Hide the "please verify email" message if it was visible
                if (emailVerificationMessageEl) emailVerificationMessageEl.style.display = 'none';

                // Show your main application content.
                if (mainAppContent) {
                     mainAppContent.style.display = 'block'; // Or 'flex', 'grid', etc.
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
            }
            // *** END: Logic ***


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
             // Hide the "please verify email" message if it was visible
            if (emailVerificationMessageEl) emailVerificationMessageEl.style.display = 'none';


            // Show the authentication options container.
            if (authOptionsContainer) {
                authOptionsContainer.style.display = 'block';
                console.log("Authentication options container shown.");

                 // Start FirebaseUI to render the social/email sign-in options.
                 // Only start FirebaseUI if its container exists and it's not already active.
                 // Check if there's an email link pending *before* starting FirebaseUI,
                 // to avoid showing the UI briefly when the link handler will take over.
                 // The initial check for the email link is done at the very top,
                 // so if we are in this 'else' block (no user), and *no* link was detected,
                 // *then* we should start FirebaseUI.
                 if (!auth.isSignInWithEmailLink(window.location.href)) {
                    if (uiContainer) {
                         ui.start('#firebaseui-auth-container', uiConfig);
                         console.log("FirebaseUI widget started.");
                     } else if (uiContainer) {
                         console.log("FirebaseUI was already active.");
                     } else {
                         console.error("FirebaseUI container element not found when trying to start UI!");
                     }
                 } else {
                     console.log("Email link detected, skipping FirebaseUI start. Link handler at top will process.");
                     // The loader is already shown by the email link handler in this case.
                 }

            } else {
                 console.error("Auth options container element not found!");
            }

            // Hide any loading text.
             if (loadEl) loadEl.style.display = 'none';

        }
    }); // <-- This closes the onAuthStateChanged listener.
}); // <-- This closes the DOMContentLoaded listener.

// --- END Part 4 ---
// This is the end of the script.
