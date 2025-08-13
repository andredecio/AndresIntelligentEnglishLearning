// js/AdminSystem_Auth.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles authentication, authorization (admin claims), and UI state for the Admin System.

// Removed: import { auth, app, functions } from './firebase-services.js';
// Removed: import { displayError } from './ui-utilities.js';

document.addEventListener('DOMContentLoaded', () => { // Retained from original AdminSystem.js.
    // 'auth', 'app', 'functions' are now globally available from firebase-services.js.
    // 'displayError' is now globally available from ui-utilities.js.

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
    const manageContentBtn = document.getElementById('manageContentBtn');

    // --- Firebase Authentication State Listener ---
    // Accessing global 'auth' object
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
                    // Accessing global 'auth' object
                    await auth.signOut();
                }
            } catch (error) {
                console.error("Error checking custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`;
                // Accessing global 'auth' object
                await auth.signOut();
            }
        } else {
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
            // Accessing global 'auth' object
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
            // Accessing global 'auth' object
            await auth.signOut();
            console.log("User logged out successfully.");
        } catch (error) {
            console.error("Logout Error:", error);
        }
    });

    // NEW: Event listener for the "Manage Module Content" button
    if (manageContentBtn) {
        manageContentBtn.addEventListener('click', () => {
            window.location.href = 'ModuleContent.html'; // Navigate to the new page
        });
    }
});
