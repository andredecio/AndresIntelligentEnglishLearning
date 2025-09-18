// js/AdminSystem_Auth.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles authentication, authorization (admin claims, payment plan, credit), and UI state for the Admin System.

document.addEventListener('DOMContentLoaded', () => {
    // 'auth', 'app', 'functions' are now globally available from firebase-services.js.
    // 'displayError', 'showErrorPopup', 'showAlert' are now globally available from ui-utilities.js.

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
    // The callback now receives the augmentedUser from firebase-services.js
    observeAuthState(async (augmentedUser) => { // Use observeAuthState which now provides augmentedUser
        if (augmentedUser) {
            try {
                const customClaims = augmentedUser.customClaims;
                const userProfile = augmentedUser.profile; // The user's Firestore profile data

                // --- NEW PAYMENT SYSTEM LOGIC ---
                // Rule: Adminsystem requires sign in for participating userids whose accounts are in credit.
                //       Users in payment option 5 (G0 plans) will have to sign in directly to ModuleContent page rather than via AdminSystem.

                const isAdmin = customClaims.admin;
                const paymentPlanId = userProfile ? userProfile.paymentPlanId : null;
                const currentBalance = userProfile ? userProfile.currentBalance : 0; // Assume 0 if no profile or balance

                // Determine if user has a G0 plan (no module creation/update allowed)
                const isG0Plan = paymentPlanId && paymentPlanId.endsWith('G0');

                // Determine if user is in credit (a simplified check for now)
                // You might define "in credit" as currentBalance > 0, or above a minimum threshold.
                const isInCredit = currentBalance > 0; // Assuming a positive balance means "in credit"

                if (isAdmin) {
                    // Admin users always have full access to AdminSystem
                    authSection.style.display = 'none';
                    generatorSection.style.display = 'block';
                    loginErrorDiv.textContent = '';
                    console.log("Admin user logged in and authorized.");
                } else if (isG0Plan) {
                    // Users on G0 plans are explicitly denied AdminSystem access
                    console.warn(`User (${augmentedUser.email}) is on a G0 plan (${paymentPlanId}) and cannot access AdminSystem.`);
                    showErrorPopup('Users on G0 plans cannot access this Admin System. Please navigate to Module Content directly.');
                    await signOutCurrentUser(); // Use global signOutCurrentUser
                } else if (!isInCredit) {
                    // Users not in credit (and not G0 plan) are denied AdminSystem access
                    console.warn(`User (${augmentedUser.email}) is out of credit and cannot access AdminSystem.`);
                    showErrorPopup('Your account is out of credit. Please top up to access the Admin System.');
                    await signOutCurrentUser(); // Use global signOutCurrentUser
                } else {
                    // Regular participating user in credit
                    authSection.style.display = 'none';
                    generatorSection.style.display = 'block';
                    loginErrorDiv.textContent = '';
                    console.log(`Participating user (${augmentedUser.email}) logged in, in credit, and authorized.`);
                }

            } catch (error) {
                console.error("Error processing user data or custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`;
                await signOutCurrentUser(); // Use global signOutCurrentUser
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
        }
    });


    // --- Login Form Submission Handler ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        loginErrorDiv.textContent = ''; // Clear error before new attempt

        try {
            // Accessing global 'signInUserWithEmailAndPassword' function
            await signInUserWithEmailAndPassword(email, password);
            console.log("Login attempt successful. Waiting for auth state change to process.");
        } catch (error) {
            console.error("Login Error:", error);
            // Using global 'displayError'
            displayError(loginErrorDiv, `Login failed: ${error.message}`);
        }
    });


    // --- Logout Button Handler ---
    logoutButton.addEventListener('click', async () => {
        try {
            // Accessing global 'signOutCurrentUser' function
            await signOutCurrentUser();
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
