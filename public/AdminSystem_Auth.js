// js/AdminSystem_Auth.js
// Handles authentication, authorization (admin claims), and UI state for the Admin System.

// Import necessary Firebase services from our centralized setup.
import { auth, app, functions } from './firebase-services.js'; // 'app' and 'functions' are imported for context, though 'functions' is mostly used by generator.
import { displayError } from './ui-utilities.js'; // Import reusable error display utility.

document.addEventListener('DOMContentLoaded', () => { // Retained from original AdminSystem.js.
    // --- References to HTML Elements (Auth and Section Toggling) ---
    // Auth Section elements
    const authSection = document.getElementById('authSection');
    const loginForm = document.getElementById('loginForm');
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginErrorDiv = document.getElementById('loginError');
    const loadingSpinner = document.getElementById('loadingSpinner');
    // Generator Section elements (these are toggled by auth state)
    const generatorSection = document.getElementById('generatorSection');
    const logoutButton = document.getElementById('logoutButton');
    // For navigation to ModuleContent.html
    const manageContentBtn = document.getElementById('manageContentBtn'); // This was found in your full AdminSystem.js

    // --- Firebase Authentication State Listener ---
    // (Your existing authentication logic)
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const idTokenResult = await user.getIdTokenResult();
                if (idTokenResult.claims.admin) {
                    authSection.style.display = 'none';
                    generatorSection.style.display = 'block';
                    loginErrorDiv.textContent = '';
                    console.log("Admin user logged in and authorized.");
                } else {
                    console.warn("User logged in but is not authorized as admin. Logging out.");
                    loginErrorDiv.textContent = 'You do not have administrative access. Logging out.';
                    await auth.signOut();
                }
            } catch (error) {
                console.error("Error checking custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`;
                await auth.signOut();
            }
        } else {
            // These two elements are related to the generator section,
            // but their state needs to be reset on auth state change.
            // They are declared in AdminSystem_Generator.js, so we need to get references here
            // if we want to reset them from this module.
            // Alternatively, Generator.js can handle its own reset on its DCL if it listens to auth,
            // or we could export a reset function from Generator.js and call it from here.
            // For now, mirroring original behavior where possible.
            const responseDiv = document.getElementById('response');
            const skippedWordsDisplay = document.getElementById('skippedWordsDisplay');
            if (responseDiv) responseDiv.textContent = '';
            if (skippedWordsDisplay) skippedWordsDisplay.textContent = '';

            authSection.style.display = 'block';
            generatorSection.style.display = 'none';
            loadingSpinner.classList.add('hidden');
            console.log("User signed out or no user found.");
        }
    });


    // --- Login Form Submission Handler ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        loginErrorDiv.textContent = ''; // Clear error before new attempt

        try {
            await auth.signInWithEmailAndPassword(email, password);
            console.log("Login successful.");
        } catch (error) {
            console.error("Login Error:", error);
            loginErrorDiv.textContent = `Login failed: ${error.message}`;
        }
    });


    // --- Logout Button Handler ---
    logoutButton.addEventListener('click', async () => {
        try {
            await auth.signOut();
            console.log("User logged out successfully.");
        } catch (error) {
            console.error("Logout Error:", error);
        }
    });

    // NEW: Event listener for the "Manage Module Content" button
    // This was found in your full AdminSystem.js, so including it here.
    if (manageContentBtn) {
        manageContentBtn.addEventListener('click', () => {
            window.location.href = 'ModuleContent.html'; // Navigate to the new page
        });
    }
});
