// index.js  I'M NEW TODAY Thursday 3pm

document.addEventListener('DOMContentLoaded', () => {
    const app = firebase.app();
    const auth = firebase.auth();
    const db = firebase.firestore();

    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const signInEmailButton = document.getElementById('signInEmailButton');
    const signUpEmailButton = document.getElementById('signUpEmailButton');
    const errorMessageDiv = document.getElementById('error-message');

    const displayError = (message) => {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = message;
            errorMessageDiv.style.display = 'block';
        }
    };

    const clearError = () => {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = '';
            errorMessageDiv.style.display = 'none';
        }
    };

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

    signUpEmailButton.addEventListener('click', async () => {
        clearError();
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        console.log("🔵 Sign-up button clicked");

        if (!email || !password) {
            console.log("⚠️ Missing email or password");
            displayError('Please enter both email and password.');
            return;
        }

        if (password.length < 6) {
            console.log("⚠️ Password too short");
            displayError('Password must be at least 6 characters long.');
            return;
        }

        try {
            // Set flag to prevent early redirect in common.js
            sessionStorage.setItem("signingUp", "true");

            console.log("🔧 Creating Firebase Auth user...");
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log("✅ User created:", user.uid);

            // Create Firestore user document
            try {
                console.log("📄 Creating Firestore user document...");
                await db.collection("users").doc(user.uid).set({
                    email: user.email,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    authProvider: 'emailpassword',
                });
                console.log("✅ Firestore user document created.");
            } catch (firestoreError) {
                console.error("❌ Error writing to Firestore:", firestoreError);
            }

            // Send email verification
            try {
                console.log("📤 Sending verification email...");
                await user.sendEmailVerification();
                console.log("✅ Verification email sent to:", user.email);
            } catch (emailError) {
                console.error("❌ Failed to send verification email:", emailError);
            }

            // Clear the signing up flag so common.js can resume normal redirects
            sessionStorage.removeItem("signingUp");

            await auth.signOut();
            console.log("👋 User signed out after registration.");

            // Redirect to verification notice
            window.location.href = 'verify_email_notice.html';

        } catch (error) {
            console.error("❌ Sign-up failed:", error);
            displayError(`Sign-up failed: ${getAuthErrorMessage(error.code)}`);
            // Clear flag on failure as well
            sessionStorage.removeItem("signingUp");
        }
    });
});

