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
        
		// ✅ NEW: Redirect from index.html to main.html after login
        const currentPage = window.location.pathname;
			if (currentPage.endsWith('index.html') || currentPage === '/' || currentPage === '') {
            window.location.href = 'main.html';
			}
		
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

      }
    });
});
