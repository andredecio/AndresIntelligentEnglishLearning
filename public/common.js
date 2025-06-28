// common.js

// This script expects firebase-app-compat.js, firebase-auth-compat.js
// to be loaded before it in your HTML files.

document.addEventListener('DOMContentLoaded', () => {
    // Get references to the initialized Firebase service instances
    const auth = firebase.auth();
    // const analytics = firebase.analytics(); // Uncomment if you are actually using Firebase Analytics

    // Get references to common UI elements that might appear on multiple pages.
    // We check if they exist before trying to use them, as nottherners (e.g. main.html).
    const statusMessageSpan = document.getElementById('statusMessage');
    const loggedInUserEmailP = document.getElementById('loggedInUserEmail'); // For general use
    const currentUserEmailSpan = document.getElementById('currentUserEmail'); // Specific to main.html

    const authSection = document.querySelector('.auth-section'); // The login form container (likely on index.html)
    const loginInfoDiv = document.getElementById('login-info'); // Assumed user info display (likely on main.html)

    // Handle any global sign-out buttons.
    const signOutButtonIndex = document.getElementById('signOutButton'); // If on index.html
    const signOutButtonMain = document.getElementById('signOutButtonMain'); // If on main.html

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
        // Use window.location.pathname for more reliable path comparison
        const currentPage = window.location.pathname;

        if (user) {
            // User is signed in.
            console.log('User logged in:', user.uid, 'Email:', user.email || 'Anonymous');
            if (statusMessageSpan) statusMessageSpan.textContent = `Logged in as: ${user.email || 'Anonymous'}`;

            // Update user email displays regardless of specific ID
            if (loggedInUserEmailP) loggedInUserEmailP.textContent = user.isAnonymous ? 'Guest User' : user.email || 'N/A';
            if (currentUserEmailSpan) currentUserEmailSpan.textContent = user.isAnonymous ? 'Guest User' : user.email || 'N/A';


            // Show user info section, hide auth section
            // These elements might be on different pages, so we check if they exist.
            if (authSection) authSection.style.display = 'none'; // Hide login form if user is logged in
            if (loginInfoDiv) {
                const userUid = document.getElementById('userUid');
                const userEmail = document.getElementById('userEmail');
                const userName = document.getElementById('userName');
                const userProvider = document.getElementById('userProvider');
                if (userUid) userUid.textContent = user.uid;
                if (userEmail) userEmail.textContent = user.email || 'N/A';
                if (userName) userName.textContent = user.displayName || 'N/A';
                if (userProvider) userProvider.textContent = user.providerData && user.providerData.length > 0 ? user.providerData[0].providerId : 'Anonymous';
                loginInfoDiv.style.display = 'block'; // Show user info if user is logged in
            }

            // Ensure sign-out button is visible for authenticated users
            if (signOutButtonIndex) signOutButtonIndex.style.display = 'block';
            if (signOutButtonMain) signOutButtonMain.style.display = 'block';
            // IMPORTANT: The deleteAccountButtonMain visibility will be handled by main.js (or other specific scripts)

            // *** IMPORTANT NAVIGATION LOGIC FOR AUTHENTICATED USERS ***
            // If the user is logged in and they are currently on the index.html (login/landing) page,
            // redirect them to the main application page.
            // Check for common variations like '/index.html', 'index.html', or just '/' for the root.
            const isIndexPage = currentPage.endsWith('index.html') || currentPage === '/';
            if (isIndexPage) {
                console.log("Authenticated user on index.html, redirecting to main.html");
                window.location.assign('main.html'); // Redirect using assign for a clean history state
            }
            // If they are already on main.html or another protected page, they stay there.

        } else {
            // No user is signed in.
            console.log('No user logged in.');
            if (statusMessageSpan) statusMessageSpan.textContent = 'Not logged in.';

            if (loggedInUserEmailP) loggedInUserEmailP.textContent = '';
            if (currentUserEmailSpan) currentUserEmailSpan.textContent = ''; // Clear for main.html as well


            // Hide user info section, show auth section
            // These elements might be on different pages, so we check if they exist.
            if (authSection) authSection.style.display = 'block'; // Show login form if user is logged out
            if (loginInfoDiv) loginInfoDiv.style.display = 'none'; // Hide user info if user is logged out

            // Ensure sign-out button is hidden for logged-out users
            if (signOutButtonIndex) signOutButtonIndex.style.display = 'none';
            if (signOutButtonMain) signOutButtonMain.style.display = 'none';
            // IMPORTANT: The deleteAccountButtonMain visibility will also be handled by main.js
            // or implicitly hidden if its current user check fails.

            // *** IMPORTANT NAVIGATION LOGIC FOR UNAUTHENTICATED USERS ***
            // If no user is signed in, ensure they are on the index.html page.
            // Only redirect if they are NOT ALREADY on index.html or the root path.
            const isIndexPage = currentPage.endsWith('index.html') || currentPage === '/';
            if (!isIndexPage) {
                console.log("Unauthenticated user not on index.html, redirecting to index.html");
                window.location.assign('index.html'); // Redirect to your main login/landing page
            }
            // If they ARE on index.html, let them stay there and see the login form.
        }
    });
});
