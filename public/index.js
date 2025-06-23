// index.js

// This script expects 'auth' to be defined globally by the inline script in index.html.
// (Or more robustly, you'd ensure Firebase is initialized and getAuth() is called here
// if common.js doesn't expose `auth` globally).

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase services if not already done globally
    // This is safer than relying on a global 'auth' if common.js isn't guaranteed
    // to run first or expose it in the global scope.
    // Assuming you have firebase-app-compat.js loaded.
    const app = firebase.app(); // Gets the default Firebase app instance
    const auth = firebase.auth(); // Gets the auth service for that app

    // Element references specific to index.html
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const signInEmailButton = document.getElementById('signInEmailButton');
    const signUpEmailButton = document.getElementById('signUpEmailButton');
    const signInGoogleButton = document.getElementById('signInGoogleButton');
    const signInFacebookButton = document.getElementById('signInFacebookButton');
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
            // Attempt to sign in
            await auth.signInWithEmailAndPassword(email, password);
            // Redirection based on email verification status for existing users
            // is now handled by common.js's onAuthStateChanged (which should
            // check if user.emailVerified is true or redirect to verify_email_notice.html)

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
            // 1. Create the user account
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // 2. Immediately send email verification
            if (user) {
                await user.sendEmailVerification();
                console.log("Verification email sent to:", user.email);
            }

            // 3. Inform the user and redirect to the email verification notice page
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
            await auth.signInWithPopup(provider);
            // Redirection is now handled by common.js's onAuthStateChanged,
            // which will also check for email verification if provided by Google.
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
            await auth.signInWithPopup(provider);
            // Redirection is now handled by common.js's onAuthStateChanged,
            // which will also check for email verification if provided by Facebook.
        } catch (error) {
            console.error("Facebook Sign-in failed:", error);
            displayError(`Facebook Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });

    // --- Anonymous Sign-In ---
    signInAnonymousButton.addEventListener('click', async () => {
        clearError();
        try {
            await auth.signInAnonymously();
            // Redirection for anonymous users is handled by common.js's onAuthStateChanged
            // (likely to onboarding.html as they need to provide info and possibly link account)
        } catch (error) {
            console.error("Anonymous Sign-in failed:", error);
            displayError(`Anonymous Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });
});
