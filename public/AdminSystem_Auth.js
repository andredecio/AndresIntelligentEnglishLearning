// js/AdminSystem_Auth.js (MODULARIZED VERSION)
// This module handles authentication, authorization (admin claims, payment plan, credit),
// and UI state for the Admin System, using Firebase Modular SDK.

// --- Import necessary Firebase modules ---
// Import the initialized 'auth' instance and helper functions from your central Firebase services file.
import { auth, observeAuthState, signInUserWithEmailAndPassword, signOutCurrentUser } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// Import UI utility functions.
import { displayError, showErrorPopup } from './ui-utilities.js'; // Adjust path if ui-utilities.js is elsewhere

// Import functions from AdminSystem_Generator.js (assuming it will be modularized and export these)
import { updateGeneratorUI, clearGeneratorUI } from './AdminSystem_Generator.js'; // Adjust path as needed


document.addEventListener('DOMContentLoaded', () => {
    // --- References to HTML Elements ---
    const authSection = document.getElementById('authSection');
    const loginForm = document.getElementById('loginForm');
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginErrorDiv = document.getElementById('loginError');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const generatorSection = document.getElementById('generatorSection');
    const logoutButton = document.getElementById('logoutButton');
    const manageContentBtn = document.getElementById('manageContentBtn');

    // Flag to prevent multiple UI updates if observeAuthState fires rapidly or during initial load
    let isProcessingAuth = false;

    // --- Firebase Authentication State Listener ---
    // Use the modular 'observeAuthState' helper function from firebase-services.js.
    observeAuthState(async (augmentedUser) => {
        if (isProcessingAuth) return;
        isProcessingAuth = true;

        if (augmentedUser) {
            try {
                const customClaims = augmentedUser.customClaims;
                const userProfile = augmentedUser.profile;

                const isAdmin = customClaims.admin;
                const paymentPlanId = userProfile ? userProfile.paymentPlanId : null;
                const currentBalance = userProfile && typeof userProfile.currentBalance === 'number' ? userProfile.currentBalance : 0;
                const isG0Plan = paymentPlanId && paymentPlanId.endsWith('G0');
                const isInCredit = currentBalance > 0;

                let authorizedForAdminSystem = false;

                if (isAdmin) {
                    authorizedForAdminSystem = true;
                    console.log("Admin user logged in and authorized.");
                } else if (isG0Plan) {
                    console.warn(`User (${augmentedUser.email}) is on a G0 plan (${paymentPlanId}) and cannot access AdminSystem.`);
                    showErrorPopup('Users on G0 plans cannot access this Admin System. Please navigate to Module Content directly.');
                    // Use the modular 'signOutCurrentUser' helper function
                    await signOutCurrentUser();
                } else if (!isInCredit) {
                    console.warn(`User (${augmentedUser.email}) is out of credit and cannot access AdminSystem.`);
                    showErrorPopup('Your account is out of credit. Please top up to access the Admin System.');
                    // Use the modular 'signOutCurrentUser' helper function
                    await signOutCurrentUser();
                } else {
                    authorizedForAdminSystem = true;
                    console.log(`Participating user (${augmentedUser.email}) logged in, in credit, and authorized.`);
                }

                // --- UI UPDATE AFTER AUTHORIZATION ---
                if (authorizedForAdminSystem) {
                    authSection.style.display = 'none';
                    generatorSection.style.display = 'block';
                    loginErrorDiv.textContent = '';
                    // Call the imported 'updateGeneratorUI' function
                    if (typeof updateGeneratorUI === 'function') { // Defensive check still useful for initial integration
                        updateGeneratorUI(augmentedUser);
                    } else {
                        console.error("updateGeneratorUI function not found or not imported correctly.");
                    }
                } else {
                    authSection.style.display = 'block';
                    generatorSection.style.display = 'none';
                    // Call the imported 'clearGeneratorUI' function
                    if (typeof clearGeneratorUI === 'function') { // Defensive check still useful for initial integration
                        clearGeneratorUI();
                    }
                }

            } catch (error) {
                console.error("Error processing user data or custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`;
                // Use the modular 'signOutCurrentUser' helper function
                await signOutCurrentUser();
            } finally {
                if (loadingSpinner) {
                   loadingSpinner.classList.add('hidden');
                }
                isProcessingAuth = false;
            }
        } else {
            // User signed out or no user found
            const responseDiv = document.getElementById('response'); // This element belongs to generator UI, not auth
            const skippedWordsDisplay = document.getElementById('skippedWordsDisplay'); // Also generator UI
            if (responseDiv) responseDiv.textContent = '';
            if (skippedWordsDisplay) skippedWordsDisplay.textContent = '';

            authSection.style.display = 'block';
            generatorSection.style.display = 'none';
            if (loadingSpinner) {
                loadingSpinner.classList.add('hidden');
            }
            console.log("User signed out or no user found.");
            // Call the imported 'clearGeneratorUI' function
            if (typeof clearGeneratorUI === 'function') { // Defensive check
                clearGeneratorUI();
            }
            isProcessingAuth = false;
        }
    });


    // --- Login Form Submission Handler ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        loginErrorDiv.textContent = '';
        loadingSpinner.classList.remove('hidden');

        try {
            // Use the modular 'signInUserWithEmailAndPassword' helper function
            await signInUserWithEmailAndPassword(email, password);
            console.log("Login attempt successful. Waiting for auth state change to process.");
        } catch (error) {
            console.error("Login Error:", error);
            // Use the imported 'displayError' utility
            displayError(loginErrorDiv, `Login failed: ${error.message}`);
            loadingSpinner.classList.add('hidden');
        }
    });


    // --- Logout Button Handler ---
    logoutButton.addEventListener('click', async () => {
        try {
            // Use the modular 'signOutCurrentUser' helper function
            await signOutCurrentUser();
            console.log("User logged out successfully.");
        } catch (error) {
            console.error("Logout Error:", error);
        }
    });

    // Event listener for the "Manage Module Content" button
    if (manageContentBtn) {
        manageContentBtn.addEventListener('click', () => {
            window.location.href = 'ModuleContent.html'; // Standard browser global
        });
    }

    // Initial check for loading spinner display if auth state is still resolving
    // This check should use the imported 'auth' instance directly
    if (auth && auth.currentUser === null) {
        loadingSpinner.classList.remove('hidden');
    }
});
