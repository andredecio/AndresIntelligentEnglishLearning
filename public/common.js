// common.js

// This script expects firebase-app-compat.js, firebase-auth-compat.js
// to be loaded before it in your HTML files.

document.addEventListener('DOMContentLoaded', () => {
    // Get references to the initialized Firebase service instances
    const auth = firebase.auth();
    // const analytics = firebase.analytics(); // Uncomment if you are actually using Firebase Analytics

    // Get references to common UI elements that might appear on multiple pages.
    // We check if they exist before trying to use them, as not all pages will have all elements.
    const statusMessageSpan = document.getElementById('statusMessage');
    const loggedInUserEmailP = document.getElementById('loggedInUserEmail');
    const authSection = document.querySelector('.auth-section'); // The login form container
    const loginInfoDiv = document.getElementById('login-info'); // Assumed user info display

    // Handle any global sign-out buttons.
    // Assuming 'signOutButton' for index.html and 'signOutButtonMain' for main.html (or other pages)
    const signOutButtonIndex = document.getElementById('signOutButton');
    const signOutButtonMain = document.getElementById('signOutButtonMain'); // Example for a button on main.html

    const handleSignOut = async (button) => {
        if (button) {
            button.addEventListener('click', async () => {
                try {
                    await auth.signOut();
                    console.log("User signed out.");
                    // The onAuthStateChanged listener below will handle the redirection after sign-out.
                } catch (error) {
                    console.error('Sign out error:', error.message);
                    alert('Error signing out: ' + error.message);
                }
            });
        }
    };

    handleSignOut(signOutButtonIndex);
    handleSignOut(signOutButtonMain); // This will add listener to the button on main.html too


    // --- Central Authentication State Observer and Navigator ---
    auth.onAuthStateChanged((user) => {
        // --- 1. Update UI Elements ---
        // This part updates messages and button visibility on the current page.
        if (user) {
            console.log('User logged in:', user.uid);
            if (statusMessageSpan) statusMessageSpan.textContent = `Logged in as: ${user.email || 'Anonymous'}`;
            if (loggedInUserEmailP) loggedInUserEmailP.textContent = user.email || 'N/A';

            // Show user info section, hide auth section
            if (authSection) authSection.style.display = 'none'; // Assuming 'display: block' in CSS default
            if (loginInfoDiv) {
                // Populate detailed user info if elements exist
                const userUid = document.getElementById('userUid');
                const userEmail = document.getElementById('userEmail');
                const userName = document.getElementById('userName');
                const userProvider = document.getElementById('userProvider');
                if (userUid) userUid.textContent = user.uid;
                if (userEmail) userEmail.textContent = user.email || 'N/A';
                if (userName) userName.textContent = user.displayName || 'N/A';
                if (userProvider) userProvider.textContent = user.providerData && user.providerData.length > 0 ? user.providerData[0].providerId : 'Anonymous';
                loginInfoDiv.style.display = 'block';
            }
            if (signOutButtonIndex) signOutButtonIndex.style.display = 'block';
            if (signOutButtonMain) signOutButtonMain.style.display = 'block';

        } else {
            // No user is signed in.
            console.log('No user logged in.');
            if (statusMessageSpan) statusMessageSpan.textContent = 'Not logged in.';
            if (loggedInUserEmailP) loggedInUserEmailP.textContent = '';

            // Hide user info section, show auth section
            if (authSection) authSection.style.display = 'block'; // Assuming 'display: block' in CSS default
            if (loginInfoDiv) loginInfoDiv.style.display = 'none';
            if (signOutButtonIndex) signOutButtonIndex.style.display = 'none';
            if (signOutButtonMain) signOutButtonMain.style.display = 'none';
        }

        // --- 2. Navigation Logic ---
        const currentPath = window.location.pathname;
        const rootPath = '/'; // Represents your website's root
        const indexPage = '/index.html'; // Your login/signup page
        const onboardingPage = '/onboarding.html'; // Where anonymous users provide details
        const verifyEmailPage = '/verify_email_notice.html'; // Where users land for email verification
        const conversationPage = '/conversation.html'; // Your AI conversation demo page (accessible to unverified)
        const mainPage = '/main.html'; // Your main application dashboard/hub (requires verification)

        // Helper to check if current path is one of the given paths
        const isOnPage = (pageToCheck) => {
            // Normalize path to exclude trailing slashes for root, and .html extension
            const normalizedCurrentPath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath.replace('.html', '');
            const normalizedPageToCheck = pageToCheck.endsWith('/') ? pageToCheck.slice(0, -1) : pageToCheck.replace('.html', '');
            
            // Special handling for root as '' after slicing, if pageToCheck is '/'
            if (normalizedCurrentPath === '' && normalizedPageToCheck === '') return true;

            return normalizedCurrentPath === normalizedPageToCheck;
        };

//        if (user) {
            // --- A. User is signed in ---
//            console.log("Auth State: User signed in. Email Verified:", user.emailVerified, "Anonymous:", user.isAnonymous);

//
//
//            if (user.isAnonymous) {
                // Anonymous user: Must complete onboarding to provide details and potentially convert.
                // If they are NOT on the onboarding page, redirect them there.
//                if (!isOnPage(onboardingPage)) {
//                    console.log("Anonymous user, redirecting to onboarding page.");
//                    window.location.href = onboardingPage;
//                }
//            } else {
                // Non-anonymous user (Email/Password, Google, Facebook, etc.)
//                if (user.email && !user.emailVerified) {
                    // This user has an email, but it's not verified.
                    // IMPORTANT: The 'conversation.html' is an exception and does NOT require verification
                    // All other main app pages (like 'main.html') DO require verification.

//                    if (isOnPage(conversationPage)) {
                        // User is on conversation.html (demo page) and email is not verified.
                        // Allow them to stay here for the demo. No redirection needed from here.
//                        console.log("User on conversation.html. Email not verified, but allowed for demo.");
//                    } else if (!isOnPage(verifyEmailPage)) {
                        // User is on any other page (e.g., main.html, index.html, root)
                        // and their email is NOT verified. Redirect them to the verification notice.
//                        console.log("Email not verified, redirecting to verification notice page.");
//                        window.location.href = verifyEmailPage;
//                    }
                    // If they ARE on the verifyEmailPage, they should stay there until verified.

//                } else {
                    // Email is verified (or they don't have an email to verify, e.g., some social logins).
                    // This means they are fully authenticated and can access core app content.
                    // If they are on the login/onboarding/verification/conversation pages, or the root path, redirect them to the main content.
//                   if (isOnPage(indexPage) || isOnPage(onboardingPage) || isOnPage(verifyEmailPage) || isOnPage(rootPath) || isOnPage(conversationPage)) { 
//                        console.log("User fully authenticated, redirecting to main content page (main.html).");
                       window.location.href = mainPage; // <-- Redirect to main.html for verified users
//                    }
                    // If they are already on mainPage or another permitted app page, do nothing.
//               }
//            }
//        } else {
            // --- B. No user signed in ---
            // Unauthenticated users should only be on the index.html (login/signup) page.
            // If they are on any other page that requires authentication, redirect them to index.html.
            // Exception: If they are on the onboarding page (for anonymous start) or verification notice page.
//            if (!isOnPage(indexPage) && !isOnPage(rootPath) && !isOnPage(onboardingPage) && !isOnPage(verifyEmailPage)) { 
//                console.log("No user signed in, redirecting to index page.");
//                window.location.href = indexPage;
//            }
            // If they are on the indexPage, root, onboardingPage, or verifyEmailPage, do nothing (they should be there).
//       }
    });
});
