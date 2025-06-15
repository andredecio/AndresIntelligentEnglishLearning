// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {

    // --- Firebase Initialization (Handled by init.js script) ---
    // The script /__/firebase/init.js (included in index.html)
    // automatically initializes the Firebase app and connects to emulators
    // if you are serving from the emulator.
    // We can get the initialized app and auth instance directly.

    let firebaseApp;
    let firebaseAuth;
    let firebaseUi; // Declare FirebaseUI instance here

    try {
        // Get the default Firebase app instance
        firebaseApp = firebase.app();
        console.log('Firebase app initialized successfully.');

        // Get the Auth service instance using the compat syntax
        // This requires firebase-auth-compat.js to be loaded
        firebaseAuth = firebaseApp.auth();
        console.log('Firebase Auth service obtained.');

        // --- Initialize FirebaseUI Widget ---
        // This requires firebaseui.js to be loaded AFTER firebase-auth-compat.js
        // We check if firebaseui is defined before using it
        if (typeof firebaseui !== 'undefined' && firebaseui.auth && firebaseui.auth.AuthUI) {
             firebaseUi = new firebaseui.auth.AuthUI(firebaseAuth);
             console.log('FirebaseUI AuthUI instance created.');
        } else {
             console.error('FirebaseUI library not loaded. Check firebaseui.js script tag in index.html.');
             // You might want to display a user-friendly message on the page here
             document.getElementById('auth-container').innerHTML = '<p>Error loading authentication UI. Please try again later.</p>';
             return; // Stop execution if FirebaseUI isn't available
        }


    } catch (e) {
        console.error('Error initializing Firebase or obtaining Auth service:', e);
         document.getElementById('auth-container').innerHTML = '<p>Error initializing Firebase. Check Firebase SDK script tags and configuration.</p>';
        return; // Stop execution if Firebase core or Auth isn't available
    }


    // --- Get references to UI elements ---
    const authContainer = document.getElementById('auth-container');
    const firebaseUiContainer = document.getElementById('firebaseui-auth-container'); // The div FirebaseUI renders into
    const appContent = document.getElementById('app-content');
    const userEmailSpan = document.getElementById('user-email');
    const userUidSpan = document.getElementById('user-uid');
    const signOutButton = document.getElementById('signOutButton');

    // --- FirebaseUI Configuration ---
    // This object defines how FirebaseUI behaves
    const uiConfig = {
        callbacks: {
            // Triggered on successful sign-in or sign-up
            signInSuccessWithAuthResult: (authResult, redirectUrl) => {
                // User successfully signed in or signed up.
                // The onAuthStateChanged listener will handle UI updates.
                console.log("Sign-in/Sign-up successful via FirebaseUI.", authResult.user);

                 // Prevent default redirect
                return false; // Prevents FirebaseUI from redirecting
            },
            // Triggered when FirebaseUI widget is rendered
            uiShown: function() {
              console.log("FirebaseUI widget shown.");
              // Hide any loaders you might have
            },
            // Triggered on sign-in failure
            signInFailure: function(error) {
                console.error('FirebaseUI sign-in failed:', error);
                // Handle specific errors if needed
                alert(`Sign-in failed: ${error.message}`); // Simple alert for now
                // The onAuthStateChanged listener will still be active to reflect auth state
            }
        },
        // Set this to true to automatically upgrade anonymous users
        autoUpgradeAnonymousUsers: true,
        // List of authentication providers to offer
        signInOptions: [
            // Email / Password Provider
            firebase.auth.EmailAuthProvider.PROVIDER_ID,
            // Google Provider
            firebase.auth.GoogleAuthProvider.PROVIDER_ID,
            // Add other providers you have enabled in Firebase Auth
            // firebase.auth.FacebookAuthProvider.PROVIDER_ID,
            // firebase.auth.AppleAuthProvider.PROVIDER_ID,
            // etc.
        ],
         // Required to enable email link sign-in
         // If you enable Email Link provider in signInOptions, you MUST provide actionCodeSettings
         // actionCodeSettings: {
         //   url: window.location.href, // URL to redirect back to after sign in
         //   handleCodeInApp: true, // Must be true
         //   // Add other settings for iOS/Android apps if needed
         // },
        // Terms of Service and Privacy Policy URLs (replace with yours)
        // termsOfServiceUrl: '<your-terms-of-service-url>',
        // privacyPolicyUrl: '<your-privacy-policy-url>'
    };


    // --- Authentication State Listener ---
    // This is the core logic that updates your UI based on the user's auth state
    firebaseAuth.onAuthStateChanged((user) => {
        console.log("Auth State Changed. Current user:", user ? user.uid : 'null (signed out)');

        if (user) {
            // User is signed in.
            console.log("User is signed in:", user);

            // Hide the auth container and show the app content
            if (authContainer) authContainer.style.display = 'none';
            if (appContent) appContent.style.display = 'block'; // Or 'flex', 'grid', etc.

            // Display user info
            if (userEmailSpan) userEmailSpan.textContent = user.email || 'N/A'; // Handle users without email (e.g., anonymous)
            if (userUidSpan) userUidSpan.textContent = user.uid;

             // Hide FirebaseUI widget if it was shown
             if (firebaseUi && firebaseUiContainer) {
                 // Important: Reset/stop FirebaseUI when user signs in
                 // This cleans up listeners and prevents rendering issues
                 firebaseUi.reset();
                 firebaseUiContainer.style.display = 'none'; // Explicitly hide container just in case
                 firebaseUiContainer.innerHTML = ''; // Clear content just in case
                 console.log("FirebaseUI widget reset and container cleared.");
             }


        } else {
            // User is signed out.
            console.log("No user is signed in.");

            // Hide the app content and show the auth container
            if (appContent) appContent.style.display = 'none';
            if (authContainer) authContainer.style.display = 'block'; // Or 'flex', 'grid', etc.

            // Clear user info display
            if (userEmailSpan) userEmailSpan.textContent = '';
            if (userUidSpan) userUidSpan.textContent = '';

             // Ensure FirebaseUI container is visible and start the widget
                          if (firebaseUiContainer) {
                 firebaseUiContainer.style.display = 'block'; // Ensure container is visible
                 // Start FirebaseUI only if it's not already handling a redirect
                 // Note: firebaseUi.reset() in the 'if (user)' block ensures it's ready to start again after sign-out
                 if (!firebaseUi.isPendingRedirect()) { // <-- REMOVED the && !firebaseUi.isLoaded() part
                     firebaseUi.start('#firebaseui-auth-container', uiConfig);
                     console.log("FirebaseUI widget started.");
                 } else {
                      console.log("FirebaseUI is pending redirect, skipping start call.");
                      // The pending redirect flow will likely eventually trigger onAuthStateChanged again
                      // after the redirect completes.
                 }
             

    };

    // --- Sign Out Button Handler ---
    if (signOutButton) {
        signOutButton.addEventListener('click', () => {
            console.log("Sign Out button clicked.");
            firebaseAuth.signOut().then(() => {
                // Sign-out successful.
                console.log("User signed out successfully.");
                // onAuthStateChanged listener will handle UI updates after sign out
            }).catch((error) => {
                // An error happened during sign-out.
                console.error("Error signing out:", error);
                alert(`Sign out failed: ${error.message}`); // Simple alert for now
            });
        });
    } else {
         console.warn("Sign Out button element (#signOutButton) not found in index.html!");
    }


    // --- Handle Email Link Sign-in Completion (if applicable) ---
    // This code block is essential if you enable EMAIL_LINK_SIGN_IN_METHOD in uiConfig
    // It must run when the page loads, *before* ui.start() if possible,
    // to check if the current URL is an email sign-in link.

    // Check if the current URL is an email link sign-in
    if (firebaseAuth.isSignInWithEmailLink(window.location.href)) {
        console.log("Detected email sign-in link in URL. Attempting to sign in...");

        // Get email from storage. You MUST save the user's email to storage
        // (e.g., localStorage) before sending the link if you use the email link flow.
        let email = localStorage.getItem('emailForSignIn');

        if (!email) {
            // Email not found in storage, prompt the user.
            email = window.prompt('Please provide your email for confirmation:');
        }

        if (email) {
            // Complete the sign-in with the email and the link from the URL.
            firebaseAuth.signInWithEmailLink(email, window.location.href)
                .then((result) => {
                    console.log("Email link sign-in successful!", result);
                    localStorage.removeItem('emailForSignIn'); // Clear stored email

                    // Optional: Remove the email link parameters from the URL
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                    // onAuthStateChanged listener will handle UI update

                })
                .catch((error) => {
                    console.error("Error signing in with email link:", error);
                    alert(`Error completing sign-in: ${error.message}. Please try signing in again.`);
                     // Show auth UI again so user can try another method if email link failed
                     if (authContainer) authContainer.style.display = 'block';
                      if (firebaseUi && firebaseUiContainer) {
                          firebaseUiContainer.style.display = 'block';
                          firebaseUi.start('#firebaseui-auth-container', uiConfig);
                           console.log("FirebaseUI widget started after email link sign-in failure.");
                       }
                });
        } else {
            console.warn("No email provided by user to complete sign-in link.");
            alert("Could not complete sign-in. Email address is required.");
             // Show auth UI again
             if (authContainer) authContainer.style.display = 'block';
             if (firebaseUi && firebaseUiContainer) {
                 firebaseUiContainer.style.display = 'block';
                 firebaseUi.start('#firebaseui-auth-container', uiConfig);
                  console.log("FirebaseUI widget started after no email for link completion.");
              }
        }
    } // <-- End of email link handler block

}; // <-- End of DOMContentLoaded listener

