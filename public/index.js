// js/index.js — Version 1.01 for webpage logic (now using global scope)

// Removed: import { auth, db } from './firebase-services.js';
// Removed: import { displayError, clearError } from './ui-utilities.js';

document.addEventListener('DOMContentLoaded', () => {
    // auth and db are now globally available from firebase-services.js.
    // displayError and clearError are now globally available from ui-utilities.js.

    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const signInEmailButton = document.getElementById('signInEmailButton');
    const signUpEmailButton = document.getElementById('signUpEmailButton');
    const signInAnonymousButton = document.getElementById('signInAnonymousButton');
    const errorMessageDiv = document.getElementById('error-message');

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
        // Using globally available clearError
        clearError(errorMessageDiv);
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        console.log("🔵 Sign-up button clicked");

        if (!email || !password) {
            console.log("⚠️ Missing email or password");
            // Using globally available displayError
            displayError(errorMessageDiv, 'Please enter both email and password.');
            return;
        }

        if (password.length < 6) {
            console.log("⚠️ Password too short");
            // Using globally available displayError
            displayError(errorMessageDiv, 'Password must be at least 6 characters long.');
            return;
        }

        try {
            sessionStorage.setItem("signingUp", "true");

            console.log("🔧 Creating Firebase Auth user...");
            // Accessing global 'auth' object
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log("✅ User created:", user.uid);

            if (user.email) {
                console.log("📄 Creating Firestore user document...");
                // Accessing global 'db' object and global 'firebase' for FieldValue
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
            // Accessing global 'auth' object
            await auth.signOut();
            console.log("👋 User signed out after registration.");

            window.location.href = 'verify_email_notice.html';

        } catch (error) {
            console.error("❌ Sign-up failed:", error);
            // Using globally available displayError
            displayError(errorMessageDiv, `Sign-up failed: ${getAuthErrorMessage(error.code)}`);
            sessionStorage.removeItem("signingUp");
        }
    });

    // 🔹 Sign-In Flow
    signInEmailButton.addEventListener('click', async () => {
        // Using globally available clearError
        clearError(errorMessageDiv);
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        console.log("🔵 Sign-in button clicked");

        if (!email || !password) {
            console.log("⚠️ Missing email or password");
            // Using globally available displayError
            displayError(errorMessageDiv, 'Please enter both email and password.');
            return;
        }

        try {
            // Accessing global 'auth' object
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log("✅ Signed in:", user.uid);

            if (!user.emailVerified) {
                console.warn("⚠️ Email not verified");
                // Accessing global 'auth' object
                await auth.signOut();
                // Using globally available displayError
                displayError(errorMessageDiv, 'Please verify your email before signing in.');
                return;
            }

            window.location.href = 'main.html';

        } catch (error) {
            console.error("❌ Sign-in failed:", error);
            // Using globally available displayError
            displayError(errorMessageDiv, `Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });

    // 🔹 Anonymous Sign-In
    if (signInAnonymousButton) {
        signInAnonymousButton.addEventListener('click', async () => {
            // Using globally available clearError
            clearError(errorMessageDiv);
            console.log("🟢 Continue as Guest clicked");

            try {
                // Accessing global 'auth' object
                const userCredential = await auth.signInAnonymously();
                const user = userCredential.user;
                console.log("✅ Signed in anonymously:", user.uid);

                window.location.href = 'main.html';

            } catch (error) {
                console.error("❌ Anonymous sign-in failed:", error);
                // Using globally available displayError
                displayError(errorMessageDiv, `Guest sign-in failed: ${getAuthErrorMessage(error.code)}`);
            }
        });
    }
});
