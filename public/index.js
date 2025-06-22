// index.js

// This script expects 'auth' to be defined globally by the inline script in index.html.

document.addEventListener('DOMContentLoaded', () => {
    // Element references specific to index.html
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const signInEmailButton = document.getElementById('signInEmailButton');
    const signUpEmailButton = document.getElementById('signUpEmailButton');
    const signInGoogleButton = document.getElementById('signInGoogleButton');
    const signInFacebookButton = document.getElementById('signInFacebookButton');
    const signInAnonymousButton = document.getElementById('signInAnonymousButton');
    // signOutButton is now handled by common.js, no need to reference it here.

    const errorMessageDiv = document.getElementById('error-message'); // Specific to index.html

    // Function to display errors (specific to index.html's error div)
    const displayError = (message) => {
        if (errorMessageDiv) { // Always good to check if element exists
            errorMessageDiv.textContent = message;
            errorMessageDiv.style.display = 'block';
        }
    };

    // Function to clear errors (specific to index.html's error div)
    const clearError = () => {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = '';
            errorMessageDiv.style.display = 'none';
        }
    };

    // --- Email/Password Sign-In/Sign-Up ---
    signInEmailButton.addEventListener('click', async () => {
        clearError();
        const email = emailInput.value;
        const password = passwordInput.value;
        try {
            await auth.signInWithEmailAndPassword(email, password);
            // Redirection is now handled by common.js's onAuthStateChanged
        } catch (error) {
            displayError(`Email Sign-in failed: ${error.message}`);
        }
    });

    signUpEmailButton.addEventListener('click', async () => {
        clearError();
        const email = emailInput.value;
        const password = passwordInput.value;
        try {
            await auth.createUserWithEmailAndPassword(email, password);
            // Optional: send email verification after sign-up
            // if (auth.currentUser) {
            //    await auth.currentUser.sendEmailVerification();
            //    alert("Verification email sent! Please check your inbox.");
            // }
            // Redirection is now handled by common.js's onAuthStateChanged
        } catch (error) {
            displayError(`Email Sign-up failed: ${error.message}`);
        }
    });

    // --- Google Sign-In ---
    signInGoogleButton.addEventListener('click', async () => {
        clearError();
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await auth.signInWithPopup(provider);
            // Redirection is now handled by common.js's onAuthStateChanged
        } catch (error) {
            displayError(`Google Sign-in failed: ${error.message}`);
        }
    });

    // --- Facebook Sign-In ---
    signInFacebookButton.addEventListener('click', async () => {
        clearError();
        const provider = new firebase.auth.FacebookAuthProvider();
        // Optional: request additional permissions
        // provider.addScope('public_profile,email');
        try {
            await auth.signInWithPopup(provider);
            // Redirection is now handled by common.js's onAuthStateChanged
        } catch (error) {
            displayError(`Facebook Sign-in failed: ${error.message}`);
        }
    });

    // --- Anonymous Sign-In ---
    signInAnonymousButton.addEventListener('click', async () => {
        clearError();
        try {
            await auth.signInAnonymously();
            // Redirection is now handled by common.js's onAuthStateChanged
        } catch (error) {
            displayError(`Anonymous Sign-in failed: ${error.message}`);
        }
    });
});
