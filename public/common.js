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
    const loggedInUserEmailP = document.getElementById('loggedInUserEmail'); // For general use
    const currentUserEmailSpan = document.getElementById('currentUserEmail'); // Specific to main.html

    const authSection = document.querySelector('.auth-section'); // The login form container
    const loginInfoDiv = document.getElementById('login-info'); // Assumed user info display

    // Handle any global sign-out buttons.
    const signOutButtonIndex = document.getElementById('signOutButton');
    const signOutButtonMain = document.getElementById('signOutButtonMain');

    const handleSignOut = async (button) => {
        if (button) {
            button.addEventListener('click', async () => {
                try {
                    await auth.signOut();
                    console.log("User signed out.");
                    alert('You have been successfully signed out!');
                    // The onAuthStateChanged listener below will handle the redirection after sign-out.
                } catch (error) {
                    console.error('Sign out error:', error.message);
                    alert('Error signing out: ' + error.message);
                }
            });
        }
    };

    handleSignOut(signOutButtonIndex);
    handleSignOut(signOutButtonMain);


    // --- Central Authentication State Observer and Navigator ---
    auth.onAuthStateChanged((user) => {
        // Get current page path to decide on redirects
        const currentPage = window.location.pathname;

        if (user) {
            // User is signed in.
            console.log('User logged in:', user.uid, 'Email:', user.email || 'Anonymous');
            if (statusMessageSpan) statusMessageSpan.textContent = `Logged in as: ${user.email || 'Anonymous'}`;

            // Update user email displays regardless of specific ID
            if (loggedInUserEmailP) loggedInUserEmailP.textContent = user.isAnonymous ? 'Guest User' : user.email || 'N/A';
            if (currentUserEmailSpan) currentUserEmailSpan.textContent = user.isAnonymous ? 'Guest User' : user.email || 'N/A';


            // Show user info section, hide auth section
            // These might be on index.html, so we conditionally hide/show based on if they exist.
            if (authSection) authSection.style.display = 'none';
            if (loginInfoDiv) {
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

            // Ensure sign-out button is visible for authenticated users
            if (signOutButtonIndex) signOutButtonIndex.style.display = 'block';
            if (signOutButtonMain) signOutButtonMain.style.display = 'block';
            // IMPORTANT: The deleteAccountButtonMain visibility will be handled by main.js

            // Redirect if the user is on the login/landing page and is now authenticated.
            // We use 'assign' for full page reload and clean history.
            // Check for both 'index.html' and root '/' for common web server setups.
            if (currentPage.endsWith('index.html') || currentPage === '/') {
                console.log("Authenticated user on index.html, redirecting to main.html");
                window.location.assign('main.html');
            }

        } else {
            // No user is signed in.
            console.log('No user logged in.');
            if (statusMessageSpan) statusMessageSpan.textContent = 'Not logged in.';

            if (loggedInUserEmailP) loggedInUserEmailP.textContent = '';
            if (currentUserEmailSpan) currentUserEmailSpan.textContent = ''; // Clear for main.html as well


            // Hide user info section, show auth section
            // These might be on index.html, so we conditionally hide/show based on if they exist.
            if (authSection) authSection.style.display = 'block';
            if (loginInfoDiv) loginInfoDiv.style.display = 'none';

            // Ensure sign-out button is hidden for logged-out users
            if (signOutButtonIndex) signOutButtonIndex.style.display = 'none';
            if (signOutButtonMain) signOutButtonMain.style.display = 'none';
            // IMPORTANT: The deleteAccountButtonMain visibility will also be handled by main.js
            // or implicitly hidden if its current user check fails.

            // If no user is signed in, ensure they are on the index.html page.
            // Only redirect if they are not ALREADY on index.html or the root path.
            if (!(currentPage.endsWith('index.html') || currentPage === '/')) {
                console.log("Unauthenticated user not on index.html, redirecting to index.html");
                window.location.assign('index.html'); // Redirect to your main login/landing page
            }
            // If they ARE on index.html, let them stay there and see the login form.
        }
    });
});
