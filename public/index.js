// index.js

// This script expects 'firebase-app-compat.js', 'firebase-auth-compat.js'
// and 'firebase-firestore-compat.js' to be loaded before it in your HTML files.

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase services
    const app = firebase.app(); // Gets the default Firebase app instance
    const auth = firebase.auth(); // Gets the auth service for that app
    const db = firebase.firestore(); // ADDED: Initialize Firestore

    // Element references specific to index.html
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const signInEmailButton = document.getElementById('signInEmailButton');
    const signUpEmailButton = document.getElementById('signUpEmailButton');
    const signInGoogleButton = document.getElementById('signInGoogleButton');
    const signInFacebookButton = document = document.getElementById('signInFacebookButton'); // Corrected typo
    const signInAnonymousButton = document.getElementById('signInAnonymousButton');

    const errorMessageDiv = document.getElementById('error-message'); // Specific to index.html

    // Function to display errors (specific to index.html's error div)
    const displayError = (message) => {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = message;
            errorMessageDiv.style.display = 'block'; // Make sure it's visible
        }
    };

    // Function to clear errors (specific to index.html's error div)
    const clearError = () => {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = '';
            errorMessageDiv.style.display = 'none'; // Hide it
        }
    };

    // Helper function to map Firebase Auth error codes to user-friendly messages
    const getAuthErrorMessage = (errorCode) => {
        switch (errorCode) {
            case 'auth/invalid-email':
                return 'Please enter a valid email address.';
            case 'auth/user-disabled':
                return 'This account has been disabled. Please contact support.';
            case 'auth/user-not-found':
                return 'No account found with this email. Please sign up or check your email.';
            case 'auth/wrong-password':
                return 'Incorrect password. Please try again.';
            case 'auth/email-already-in-use':
                return 'This email address is already in use. Please sign in or use a different email.';
            case 'auth/weak-password':
                return 'The password is too weak. Please choose a stronger password (at least 6 characters).';
            case 'auth/operation-not-allowed':
                return 'Email/password authentication is not enabled. Please contact support.';
            case 'auth/popup-blocked':
                return 'Popup blocked by browser. Please allow popups for this site.';
            case 'auth/cancelled-popup-request':
                return 'Another popup sign-in request was in progress. Please try again.';
            case 'auth/account-exists-with-different-credential':
                return 'An account with this email already exists but with a different sign-in method. Try signing in with Google/Facebook or reset your password.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your internet connection and try again.';
            default:
                return `An unknown authentication error occurred: ${errorCode}`;
        }
    };

    // --- Email/Password Sign-In ---
    signInEmailButton.addEventListener('click', async () => {
        clearError();
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            displayError('Please enter both email and password.');
            return;
        }

        try {
            await auth.signInWithEmailAndPassword(email, password);
            // Redirection is now handled by common.js's onAuthStateChanged
        } catch (error) {
            console.error("Email Sign-in failed:", error);
            displayError(`Email Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });

    // --- Email/Password Sign-Up ---
    signUpEmailButton.addEventListener('click', async () => {
        clearError();
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            displayError('Please enter both email and password.');
            return;
        }

        if (password.length < 6) {
            displayError('Password must be at least 6 characters long.');
            return;
        }

        try {
            // 1. Create the user account in Firebase Authentication
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // 2. Create the initial user record in Firestore
            try {
                await db.collection("users").doc(user.uid).set({
                    email: user.email, // Store the user's email
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Timestamp of creation
                    authProvider: 'emailpassword', // To track the initial authentication method
                    // Add any other initial fields you want
                });
                console.log("Initial user document created in Firestore for new email/password signup:", user.uid);
            } catch (firestoreError) {
                console.error("Error creating initial user document in Firestore:", firestoreError);
                // Decide how to handle this:
                // - You could still proceed with signup but log the error.
                // - You could roll back the auth creation (more complex).
                // For now, we'll log but let the user proceed.
            }

            // 3. Immediately send email verification
            if (user) {
                await user.sendEmailVerification();
                console.log("Verification email sent to:", user.email);
            }

            // 4. Inform the user and redirect to the email verification notice page
            alert("Account created successfully! A verification email has been sent to your inbox. Please check your email (and spam folder) to verify your account.");
            window.location.href = 'verify_email_notice.html';

        } catch (error) {
            console.error("Email Sign-up failed:", error);
            displayError(`Email Sign-up failed: ${getAuthErrorMessage(error.code)}`);
        }
    });

    // --- Google Sign-In ---
    signInGoogleButton.addEventListener('click', async () => {
        clearError();
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            const result = await auth.signInWithPopup(provider);
            const user = result.user;
            const isNewUser = result.additionalUserInfo.isNewUser;

            if (isNewUser) {
                // This is a new user signing up with Google
                try {
                    await db.collection("users").doc(user.uid).set({
                        email: user.email,
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        authProvider: 'google.com',
                    });
                    console.log("Initial user document created in Firestore for new Google signup:", user.uid);
                } catch (firestoreError) {
                    console.error("Error creating initial user document in Firestore for Google signup:", firestoreError);
                }
            }
            // Redirection is now handled by common.js's onAuthStateChanged
        } catch (error) {
            console.error("Google Sign-in failed:", error);
            displayError(`Google Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });

    // --- Facebook Sign-In ---
    signInFacebookButton.addEventListener('click', async () => {
        clearError();
        const provider = new firebase.auth.FacebookAuthProvider();
        // Optional: request additional permissions if needed for your app (e.g., 'email')
        // provider.addScope('email');
        try {
            const result = await auth.signInWithPopup(provider);
            const user = result.user;
            const isNewUser = result.additionalUserInfo.isNewUser;

            if (isNewUser) {
                // This is a new user signing up with Facebook
                try {
                    await db.collection("users").doc(user.uid).set({
                        email: user.email, // Facebook might not always provide email without additional scope
                        displayName: user.displayName,
                        photoURL: user.photoURL,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        authProvider: 'facebook.com',
                    });
                    console.log("Initial user document created in Firestore for new Facebook signup:", user.uid);
                } catch (firestoreError) {
                    console.error("Error creating initial user document in Firestore for Facebook signup:", firestoreError);
                }
            }
            // Redirection is now handled by common.js's onAuthStateChanged
        } catch (error) {
            console.error("Facebook Sign-in failed:", error);
            displayError(`Facebook Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });

    // --- Anonymous Sign-In ---
    signInAnonymousButton.addEventListener('click', async () => {
        clearError();
        try {
            const result = await auth.signInAnonymously();
            const user = result.user;

            // This is always a "new" anonymous user session, so create a Firestore record.
            // Email will be empty as requested.
            try {
                await db.collection("users").doc(user.uid).set({
                    email: null, // As requested: empty email for anonymous
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    authProvider: 'anonymous',
                });
                console.log("Initial user document created in Firestore for new anonymous signup:", user.uid);
            } catch (firestoreError) {
                console.error("Error creating initial user document in Firestore for anonymous signup:", firestoreError);
            }

            // Redirection for anonymous users is handled by common.js's onAuthStateChanged
            // (which likely leads to onboarding.html for data collection and optional linking)
        } catch (error) {
            console.error("Anonymous Sign-in failed:", error);
            displayError(`Anonymous Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });
});
