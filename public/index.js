// --- Email/Password Sign-Up ---
signUpEmailButton.addEventListener('click', async () => {
    clearError();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    console.log("Sign-up button clicked");

    if (!email || !password) {
        console.log("Missing email or password");
        displayError('Please enter both email and password.');
        return;
    }

    if (password.length < 6) {
        console.log("Password too short");
        displayError('Password must be at least 6 characters long.');
        return;
    }

    try {
        console.log("Attempting to create Firebase user...");
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        console.log("User created:", user.uid);

        // Firestore document
        console.log("Creating Firestore user document...");
        await db.collection("users").doc(user.uid).set({
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            authProvider: 'emailpassword',
        });
        console.log("Firestore user document created.");

        // Email verification
        console.log("Sending verification email...");
        await user.sendEmailVerification();
        console.log("Verification email sent to:", user.email);

        // Sign out
        await auth.signOut();
        console.log("User signed out after registration.");

        // Redirect to verification notice
        window.location.href = 'verify_email_notice.html';

    } catch (error) {
        console.error("Sign-up process failed:", error);
        displayError(`Sign-up failed: ${getAuthErrorMessage(error.code)}`);
    }
});
