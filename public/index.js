// js/index.js — Version 1.01 for webpage logic (now using Modular ES Modules)

// --- Import necessary Firebase modules ---
// Import the initialized 'auth' and 'db' instances from your central Firebase services file.
import { auth, db } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// Import specific functions from the Firebase Authentication SDK.
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInAnonymously,
    sendEmailVerification,
    signOut
} from 'firebase/auth';

// Import specific functions from the Firebase Firestore SDK.
import {
    collection,
    doc,
    setDoc,
    serverTimestamp // Import serverTimestamp directly
} from 'firebase/firestore';

// Import UI utility functions from ui-utilities.js.
import { displayError, clearError } from './ui-utilities.js';


document.addEventListener('DOMContentLoaded', () => {
    // 'auth', 'db', 'displayError', 'clearError', and Firebase SDK functions
    // are now imported directly, so no need for global access.

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
        // Using imported clearError
        clearError(errorMessageDiv);
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        console.log("🔵 Sign-up button clicked");

        if (!email || !password) {
            console.log("⚠️ Missing email or password");
            // Using imported displayError
            displayError(errorMessageDiv, 'Please enter both email and password.');
            return;
        }

        if (password.length < 6) {
            console.log("⚠️ Password too short");
            // Using imported displayError
            displayError(errorMessageDiv, 'Password must be at least 6 characters long.');
            return;
        }

        try {
            sessionStorage.setItem("signingUp", "true");

            console.log("🔧 Creating Firebase Auth user...");
            // Use the modular 'createUserWithEmailAndPassword' function, passing the 'auth' instance
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log("✅ User created:", user.uid);

            if (user.email) {
                console.log("📄 Creating Firestore user document...");
                // Use modular Firestore functions: collection, doc, setDoc, serverTimestamp
                const userDocRef = doc(db, "users", user.uid); // Create a document reference
                await setDoc(userDocRef, { // Use setDoc with the reference
                    email: user.email,
                    createdAt: serverTimestamp(), // Use imported serverTimestamp
                    authProvider: 'emailpassword',
                });
                console.log("✅ Firestore user document created.");
            }

            try {
                console.log("📤 Sending verification email...");
                // Use the modular 'sendEmailVerification' function
                await sendEmailVerification(user);
                console.log("✅ Verification email sent to:", user.email);
            } catch (emailError) {
                console.error("❌ Failed to send verification email:", emailError);
            }

            sessionStorage.removeItem("signingUp");
            // Use the modular 'signOut' function, passing the 'auth' instance
            await signOut(auth);
            console.log("👋 User signed out after registration.");

            window.location.href = 'verify_email_notice.html';

        } catch (error) {
            console.error("❌ Sign-up failed:", error);
            // Using imported displayError
            displayError(errorMessageDiv, `Sign-up failed: ${getAuthErrorMessage(error.code)}`);
            sessionStorage.removeItem("signingUp");
        }
    });

    // 🔹 Sign-In Flow
    signInEmailButton.addEventListener('click', async () => {
        // Using imported clearError
        clearError(errorMessageDiv);
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        console.log("🔵 Sign-in button clicked");

        if (!email || !password) {
            console.log("⚠️ Missing email or password");
            // Using imported displayError
            displayError(errorMessageDiv, 'Please enter both email and password.');
            return;
        }

        try {
            // Use the modular 'signInWithEmailAndPassword' function, passing the 'auth' instance
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log("✅ Signed in:", user.uid);

            if (!user.emailVerified) {
                console.warn("⚠️ Email not verified");
                // Use the modular 'signOut' function, passing the 'auth' instance
                await signOut(auth);
                // Using imported displayError
                displayError(errorMessageDiv, 'Please verify your email before signing in.');
                return;
            }

            window.location.href = 'main.html';

        } catch (error) {
            console.error("❌ Sign-in failed:", error);
            // Using imported displayError
            displayError(errorMessageDiv, `Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });

    // 🔹 Anonymous Sign-In
    if (signInAnonymousButton) {
        signInAnonymousButton.addEventListener('click', async () => {
            // Using imported clearError
            clearError(errorMessageDiv);
            console.log("🟢 Continue as Guest clicked");

            try {
                // Use the modular 'signInAnonymously' function, passing the 'auth' instance
                const userCredential = await signInAnonymously(auth);
                const user = userCredential.user;
                console.log("✅ Signed in anonymously:", user.uid);

                window.location.href = 'main.html';

            } catch (error) {
                console.error("❌ Anonymous sign-in failed:", error);
                // Using imported displayError
                displayError(errorMessageDiv, `Guest sign-in failed: ${getAuthErrorMessage(error.code)}`);
            }
        });
    }
});
