// js/index.js — Version 1.01 for webpage logic (now modularized)

// Import necessary Firebase services from our centralized setup.
import { auth, db } from './firebase-services.js';
// Import reusable UI utility functions for displaying/clearing errors.
import { displayError, clearError } from './ui-utilities.js';


document.addEventListener('DOMContentLoaded', () => {
    // We no longer need to declare app, auth, and db here
    // as they are imported from './firebase-services.js'.
    // const app = firebase.app();
    // const auth = firebase.auth(); // <-- Now imported
    // const db = firebase.firestore(); // <-- Now imported

    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const signInEmailButton = document.getElementById('signInEmailButton');
    const signUpEmailButton = document.getElementById('signUpEmailButton');
    const signInAnonymousButton = document.getElementById('signInAnonymousButton');
    const errorMessageDiv = document.getElementById('error-message');

    // The displayError and clearError functions are now imported from 'ui-utilities.js'.
    // Their local definitions have been removed to avoid duplication.
    // const displayError = (message) => { /* ... */ };
    // const clearError = () => { /* ... */ };

    // This is a local helper function specific to index.js, so it remains here.
    const getAuthErrorMessage = (errorCode) => {
        switch (errorCode) {
            case 'auth/invalid-email': return 'Please enter a valid email address.';
            case 'auth/user-disabled': return 'This account has been disabled.';
            case 'auth/user-not-found': return 'No account found with this email.';
            case 'auth/wrong-password': return 'Incorrect password.';
            case 'auth/email-already-in-use': return 'Email already in use.';
            case 'auth/weak-password': return 'Password must be at least 6 characters.';
            case 'auth/network-request-failed': return 'Network error. Check your connection.';
            default: return `Unknown error: ${errorCode}`;
        }
    };

    // 🔹 Sign-Up Flow
    signUpEmailButton.addEventListener('click', async () => {
        clearError(errorMessageDiv); // Now using the imported clearError
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        console.log("🔵 Sign-up button clicked");

        if (!email || !password) {
            console.log("⚠️ Missing email or password");
            displayError(errorMessageDiv, 'Please enter both email and password.'); // Now using the imported displayError
            return;
        }

        if (password.length < 6) {
            console.log("⚠️ Password too short");
            displayError(errorMessageDiv, 'Password must be at least 6 characters long.'); // Now using the imported displayError
            return;
        }

        try {
            sessionStorage.setItem("signingUp", "true");

            console.log("🔧 Creating Firebase Auth user...");
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log("✅ User created:", user.uid);

            if (user.email) {
                console.log("📄 Creating Firestore user document...");
                // Note: firebase.firestore.FieldValue is used here. Since `db` is imported
                // from `firebase-services.js` which gets it from the global `firebase` object,
                // this usage is correct for the compat SDK.
                await db.collection("users").doc(user.uid).set({
                    email: user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    authProvider: 'emailpassword',
                });
                console.log("✅ Firestore user document created.");
            }

            try {
                console.log("📤 Sending verification email...");
                await user.sendEmailVerification();
                console.log("✅ Verification email sent to:", user.email);
            } catch (emailError) {
                console.error("❌ Failed to send verification email:", emailError);
            }

            sessionStorage.removeItem("signingUp");
            await auth.signOut();
            console.log("👋 User signed out after registration.");

            window.location.href = 'verify_email_notice.html';

        } catch (error) {
            console.error("❌ Sign-up failed:", error);
            displayError(errorMessageDiv, `Sign-up failed: ${getAuthErrorMessage(error.code)}`); // Now using the imported displayError
            sessionStorage.removeItem("signingUp");
        }
    });

    // 🔹 Sign-In Flow
    signInEmailButton.addEventListener('click', async () => {
        clearError(errorMessageDiv); // Now using the imported clearError
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        console.log("🔵 Sign-in button clicked");

        if (!email || !password) {
            console.log("⚠️ Missing email or password");
            displayError(errorMessageDiv, 'Please enter both email and password.'); // Now using the imported displayError
            return;
        }

        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log("✅ Signed in:", user.uid);

            if (!user.emailVerified) {
                console.warn("⚠️ Email not verified");
                await auth.signOut();
                displayError(errorMessageDiv, 'Please verify your email before signing in.'); // Now using the imported displayError
                return;
            }

            // The common.js module's onAuthStateChanged listener will handle redirection to main.html
            // if the user is verified, so this specific window.location.href might be redundant
            // or trigger a double redirect depending on timing. You can test and adjust.
            window.location.href = 'main.html';

        } catch (error) {
            console.error("❌ Sign-in failed:", error);
            displayError(errorMessageDiv, `Sign-in failed: ${getAuthErrorMessage(error.code)}`); // Now using the imported displayError
        }
    });

    // 🔹 Anonymous Sign-In
    if (signInAnonymousButton) {
        signInAnonymousButton.addEventListener('click', async () => {
            clearError(errorMessageDiv); // Now using the imported clearError
            console.log("🟢 Continue as Guest clicked");

            try {
                const userCredential = await auth.signInAnonymously();
                const user = userCredential.user;
                console.log("✅ Signed in anonymously:", user.uid);

                // As with email/password sign-in, common.js will likely handle this redirect.
                window.location.href = 'main.html';

            } catch (error) {
                console.error("❌ Anonymous sign-in failed:", error);
                displayError(errorMessageDiv, `Guest sign-in failed: ${getAuthErrorMessage(error.code)}`); // Now using the imported displayError
            }
        });
    }
});
