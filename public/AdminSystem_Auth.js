// js/AdminSystem_Auth.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles authentication, authorization (admin claims, payment plan, credit), and UI state for the Admin System.

document.addEventListener('DOMContentLoaded', () => {
    // 'auth', 'app', 'functions' are now globally available from firebase-services.js.
    // 'displayError', 'showErrorPopup', 'showAlert' are now globally available from ui-utilities.js.
    // 'updateGeneratorUI' and 'clearGeneratorUI' are now globally accessible from AdminSystem_Generator.js via 'window.'

    // --- References to HTML Elements (Auth and Section Toggling) ---
    // Auth Section elements
    const authSection = document.getElementById('authSection');             // <--- RESTORED
    const loginForm = document.getElementById('loginForm');                 // <--- RESTORED
    const loginEmailInput = document.getElementById('loginEmail');          // <--- RESTORED
    const loginPasswordInput = document.getElementById('loginPassword');    // <--- RESTORED
    const loginErrorDiv = document.getElementById('loginError');            // <--- RESTORED
    const loadingSpinner = document.getElementById('loadingSpinner');       // <--- RESTORED
    // Generator Section elements (these are toggled by auth state)
    const generatorSection = document.getElementById('generatorSection');   // <--- RESTORED
    const logoutButton = document.getElementById('logoutButton');           // <--- RESTORED
    // For navigation to ModuleContent.html
    const manageContentBtn = document.getElementById('manageContentBtn');   // <--- RESTORED

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
                    loginErrorDiv.textContent = ''; // This line now has `loginErrorDiv` defined
                    // Call updateGeneratorUI only AFTER the user is authorized and all data is ready
                    if (typeof window.updateGeneratorUI === 'function') {
                        window.updateGeneratorUI(augmentedUser);
                    } else {
                        console.error("updateGeneratorUI function not found in AdminSystem_Generator.js or not globally accessible.");
                    }
                } else {
                    authSection.style.display = 'block';
                    generatorSection.style.display = 'none';
                    if (typeof window.clearGeneratorUI === 'function') {
                        window.clearGeneratorUI();
                    }
                }

            } catch (error) {
                console.error("Error processing user data or custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`; // This line now has `loginErrorDiv` defined
                await signOutCurrentUser();
            } finally {
                // Ensure loadingSpinner is defined when accessed here
                if (loadingSpinner) { // Added defensive check
                   loadingSpinner.classList.add('hidden');
                }
                isProcessingAuth = false;
            }
        } else {
            // User signed out or no user found
            const responseDiv = document.getElementById('response');
            const skippedWordsDisplay = document.getElementById('skippedWordsDisplay');
            if (responseDiv) responseDiv.textContent = '';
            if (skippedWordsDisplay) skippedWordsDisplay.textContent = '';

            authSection.style.display = 'block';
            generatorSection.style.display = 'none';
            // Ensure loadingSpinner is defined when accessed here
            if (loadingSpinner) { // Added defensive check
                loadingSpinner.classList.add('hidden');
            }
            console.log("User signed out or no user found.");
            if (typeof window.clearGeneratorUI === 'function') {
                window.clearGeneratorUI();
            }
            isProcessingAuth = false;
        }
    });


    // --- Login Form Submission Handler ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        loginErrorDiv.textContent = ''; // This line now has `loginErrorDiv` defined
        loadingSpinner.classList.remove('hidden');

        try {
            await signInUserWithEmailAndPassword(email, password);
            console.log("Login attempt successful. Waiting for auth state change to process.");
        } catch (error) {
            console.error("Login Error:", error);
            displayError(loginErrorDiv, `Login failed: ${error.message}`); // This line now has `loginErrorDiv` defined
            loadingSpinner.classList.add('hidden');
        }
    });


    // --- Logout Button Handler ---
    logoutButton.addEventListener('click', async () => {
        try {
            await signOutCurrentUser();
            console.log("User logged out successfully.");
        } catch (error) {
            console.error("Logout Error:", error);
        }
    });

    // NEW: Event listener for the "Manage Module Content" button
    if (manageContentBtn) {
        manageContentBtn.addEventListener('click', () => {
            window.location.href = 'ModuleContent.html';
        });
    }

    // Initial check for loading spinner display if auth state is still resolving
    if (auth && auth.currentUser === null) {
        loadingSpinner.classList.remove('hidden');
    }
});
