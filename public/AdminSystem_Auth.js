// js/AdminSystem_Auth.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles authentication, authorization (admin claims, payment plan, credit), and UI state for the Admin System.

// Assume updateGeneratorUI is a global function available from AdminSystem_Generator.js
// If it's not global, you'll need to pass it or make it accessible.
// For now, let's assume it's global and accepts the augmentedUser object.
// We also need to declare it, so the linter doesn't complain (if any)
declare function updateGeneratorUI(augmentedUser: any): void; // This is a TypeScript-style declaration, for clarity of intent. In plain JS, just know it's there.


document.addEventListener('DOMContentLoaded', () => {
    // 'auth', 'app', 'functions' are now globally available from firebase-services.js.
    // 'displayError', 'showErrorPopup', 'showAlert' are now globally available from ui-utilities.js.
    // 'updateGeneratorUI' is expected to be available from AdminSystem_Generator.js

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

    // Flag to prevent multiple UI updates if observeAuthState fires rapidly or during initial load
    let isProcessingAuth = false;

    // --- Firebase Authentication State Listener ---
    // Accessing global 'auth' object
    // The callback now receives the augmentedUser from firebase-services.js
    observeAuthState(async (augmentedUser) => {
        if (isProcessingAuth) return; // Prevent re-entry if already processing
        isProcessingAuth = true;

        if (augmentedUser) {
            try {
                const customClaims = augmentedUser.customClaims;
                const userProfile = augmentedUser.profile; // The user's Firestore profile data

                // --- NEW PAYMENT SYSTEM LOGIC ---
                // Rule: Adminsystem requires sign in for participating userids whose accounts are in credit.
                //       Users in payment option 5 (G0 plans) will have to sign in directly to ModuleContent page rather than via AdminSystem.

                const isAdmin = customClaims.admin;
                const paymentPlanId = userProfile ? userProfile.paymentPlanId : null;
                // Safely get currentBalance, defaulting to 0 for display if not found
                const currentBalance = userProfile && typeof userProfile.currentBalance === 'number' ? userProfile.currentBalance : 0; 

                // Determine if user has a G0 plan (no module creation/update allowed)
                const isG0Plan = paymentPlanId && paymentPlanId.endsWith('G0');

                // Determine if user is in credit (a simplified check for now)
                // Assuming a positive balance means "in credit"
                const isInCredit = currentBalance > 0; 

                // Temporary variable to hold if the user is authorized to use AdminSystem
                let authorizedForAdminSystem = false;

                if (isAdmin) {
                    // Admin users always have full access to AdminSystem
                    authorizedForAdminSystem = true;
                    console.log("Admin user logged in and authorized.");
                } else if (isG0Plan) {
                    // Users on G0 plans are explicitly denied AdminSystem access
                    console.warn(`User (${augmentedUser.email}) is on a G0 plan (${paymentPlanId}) and cannot access AdminSystem.`);
                    showErrorPopup('Users on G0 plans cannot access this Admin System. Please navigate to Module Content directly.');
                    await signOutCurrentUser(); 
                } else if (!isInCredit) {
                    // Users not in credit (and not G0 plan) are denied AdminSystem access
                    console.warn(`User (${augmentedUser.email}) is out of credit and cannot access AdminSystem.`);
                    showErrorPopup('Your account is out of credit. Please top up to access the Admin System.');
                    await signOutCurrentUser(); 
                } else {
                    // Regular participating user in credit
                    authorizedForAdminSystem = true;
                    console.log(`Participating user (${augmentedUser.email}) logged in, in credit, and authorized.`);
                }

                // --- UI UPDATE AFTER AUTHORIZATION ---
                if (authorizedForAdminSystem) {
                    authSection.style.display = 'none';
                    generatorSection.style.display = 'block';
                    loginErrorDiv.textContent = '';
                    // Call updateGeneratorUI only AFTER the user is authorized and all data is ready
                    // Pass the augmentedUser object so AdminSystem_Generator.js has all needed context
                    if (typeof updateGeneratorUI === 'function') {
                        updateGeneratorUI(augmentedUser); 
                    } else {
                        console.error("updateGeneratorUI function not found in AdminSystem_Generator.js or not globally accessible.");
                    }
                } else {
                    // If authorization failed and user wasn't signed out (e.g., G0 plan was handled by sign-out),
                    // ensure the UI reflects the unauthorized state. This might be redundant due to signOutCurrentUser,
                    // but good for explicit state management.
                    authSection.style.display = 'block';
                    generatorSection.style.display = 'none';
                    // Clear generator UI as well if it was previously visible
                    if (typeof clearGeneratorUI === 'function') { // Assuming a clear function exists in AdminSystem_Generator.js
                        clearGeneratorUI();
                    }
                }

            } catch (error) {
                console.error("Error processing user data or custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`;
                await signOutCurrentUser(); 
            } finally {
                loadingSpinner.classList.add('hidden'); // Always hide spinner when done processing
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
            loadingSpinner.classList.add('hidden');
            console.log("User signed out or no user found.");
            // Clear generator UI when no user is logged in
            if (typeof clearGeneratorUI === 'function') {
                clearGeneratorUI();
            }
            isProcessingAuth = false; // Reset flag
        }
    });


    // --- Login Form Submission Handler ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        loginErrorDiv.textContent = ''; // Clear error before new attempt
        loadingSpinner.classList.remove('hidden'); // Show spinner during login attempt

        try {
            await signInUserWithEmailAndPassword(email, password);
            console.log("Login attempt successful. Waiting for auth state change to process.");
            // observeAuthState will handle UI updates
        } catch (error) {
            console.error("Login Error:", error);
            displayError(loginErrorDiv, `Login failed: ${error.message}`);
            loadingSpinner.classList.add('hidden'); // Hide spinner on login error
        }
    });


    // --- Logout Button Handler ---
    logoutButton.addEventListener('click', async () => {
        try {
            await signOutCurrentUser();
            console.log("User logged out successfully.");
            // observeAuthState will handle UI updates
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

    // Initial check for loading spinner display if auth state is still resolving
    // This is useful if observeAuthState takes a moment to fire on initial load
    if (auth.currentUser === null) { // Check Firebase Auth's current user status directly
        // If no current user *yet*, show the spinner until observeAuthState resolves
        loadingSpinner.classList.remove('hidden');
    }

});

// It's highly recommended to modify AdminSystem_Generator.js to accept
// the augmentedUser object (or its relevant parts) directly.
// Example:
/*
// Inside AdminSystem_Generator.js
function updateGeneratorUI(currentUserData) {
    // Make sure currentUserData is passed and has the properties you expect
    const currentBalance = currentUserData && currentUserData.profile && typeof currentUserData.profile.currentBalance === 'number'
                           ? currentUserData.profile.currentBalance : 0;

    // Now you can safely call toFixed()
    document.getElementById('currentBalanceDisplay').textContent = `$${currentBalance.toFixed(2)}`;

    // ... rest of your UI update logic using currentUserData.customClaims, etc.
}

function clearGeneratorUI() {
    // Reset any displays when user logs out or is unauthorized
    document.getElementById('currentBalanceDisplay').textContent = '';
    // ... clear other fields as needed
}
*/
