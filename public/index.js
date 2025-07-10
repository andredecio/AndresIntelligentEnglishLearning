// index.js — Version 1.01 for webpage logic

document.addEventListener('DOMContentLoaded', () => {
    const app = firebase.app();
    const auth = firebase.auth();
    const db = firebase.firestore();

    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const signInEmailButton = document.getElementById('signInEmailButton');
    const signUpEmailButton = document.getElementById('signUpEmailButton');
    const signInAnonymousButton = document.getElementById('signInAnonymousButton');
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

    // 🔹 Sign-Up Flow
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
            sessionStorage.setItem("signingUp", "true");

            console.log("🔧 Creating Firebase Auth user...");
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log("✅ User created:", user.uid);

            if (user.email) {
                console.log("📄 Creating Firestore user document...");
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
            displayError(`Sign-up failed: ${getAuthErrorMessage(error.code)}`);
            sessionStorage.removeItem("signingUp");
        }
    });

    // 🔹 Sign-In Flow
    signInEmailButton.addEventListener('click', async () => {
        clearError();
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        console.log("🔵 Sign-in button clicked");

        if (!email || !password) {
            console.log("⚠️ Missing email or password");
            displayError('Please enter both email and password.');
            return;
        }

        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            console.log("✅ Signed in:", user.uid);

            if (!user.emailVerified) {
                console.warn("⚠️ Email not verified");
                await auth.signOut();
                displayError('Please verify your email before signing in.');
                return;
            }

            window.location.href = 'main.html';

        } catch (error) {
            console.error("❌ Sign-in failed:", error);
            displayError(`Sign-in failed: ${getAuthErrorMessage(error.code)}`);
        }
    });

    // 🔹 Anonymous Sign-In
    if (signInAnonymousButton) {
        signInAnonymousButton.addEventListener('click', async () => {
            clearError();
            console.log("🟢 Continue as Guest clicked");

            try {
                const userCredential = await auth.signInAnonymously();
                const user = userCredential.user;
                console.log("✅ Signed in anonymously:", user.uid);

                window.location.href = 'main.html';

            } catch (error) {
                console.error("❌ Anonymous sign-in failed:", error);
                displayError(`Guest sign-in failed: ${getAuthErrorMessage(error.code)}`);
            }
        });
    }
});
