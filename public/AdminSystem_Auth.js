// js/AdminSystem_Auth.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles authentication, authorization (admin claims, payment plan, credit), and UI state for the Admin System.

document.addEventListener('DOMContentLoaded', () => {
    // 'auth', 'app', 'functions' are now globally available from firebase-services.js.
    // 'displayError', 'showErrorPopup', 'showAlert' are now globally available from ui-utilities.js.
    // 'updateGeneratorUI' and 'clearGeneratorUI' are now globally accessible from AdminSystem_Generator.js via 'window.'

    // --- References to HTML Elements (Auth and Section Toggling) ---
    // ... (unchanged elements) ...

    // Flag to prevent multiple UI updates if observeAuthState fires rapidly or during initial load
    let isProcessingAuth = false;

    // --- Firebase Authentication State Listener ---
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
                    await signOutCurrentUser();
                } else if (!isInCredit) {
                    console.warn(`User (${augmentedUser.email}) is out of credit and cannot access AdminSystem.`);
                    showErrorPopup('Your account is out of credit. Please top up to access the Admin System.');
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
                    // Call updateGeneratorUI only AFTER the user is authorized and all data is ready
                    if (typeof window.updateGeneratorUI === 'function') { // <--- CHANGE: Call via window
                        window.updateGeneratorUI(augmentedUser);
                    } else {
                        console.error("updateGeneratorUI function not found in AdminSystem_Generator.js or not globally accessible.");
                    }
                } else {
                    authSection.style.display = 'block';
                    generatorSection.style.display = 'none';
                    if (typeof window.clearGeneratorUI === 'function') { // <--- CHANGE: Call via window
                        window.clearGeneratorUI();
                    }
                }

            } catch (error) {
                console.error("Error processing user data or custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`;
                await signOutCurrentUser();
            } finally {
                loadingSpinner.classList.add('hidden');
                isProcessingAuth = false;
            }
        } else {
            // User signed out or no user found
            // ... (unchanged responseDiv and skippedWordsDisplay clearing) ...

            authSection.style.display = 'block';
            generatorSection.style.display = 'none';
            loadingSpinner.classList.add('hidden');
            console.log("User signed out or no user found.");
            if (typeof window.clearGeneratorUI === 'function') { // <--- CHANGE: Call via window
                window.clearGeneratorUI();
            }
            isProcessingAuth = false;
        }
    });

    // ... (login and logout handlers unchanged) ...

    // Initial check for loading spinner display if auth state is still resolving
    if (auth && auth.currentUser === null) { // Add null check for `auth` just in case firebase-services.js hasn't fully loaded
        loadingSpinner.classList.remove('hidden');
    }
});
