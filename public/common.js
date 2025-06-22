// common.js

// This script expects 'app' and 'auth' to be defined globally by the inline script in HTML.

document.addEventListener('DOMContentLoaded', () => {
    // Get references to elements that might appear on multiple pages
    // We check if they exist before trying to use them, as not all pages will have all elements.
    const statusMessage = document.getElementById('statusMessage');
    const loggedInUserEmail = document.getElementById('loggedInUserEmail');
    const authSection = document.querySelector('.auth-section'); // The login form container

    // Handle any global sign-out buttons.
    // Assuming 'signOutButton' for index.html and 'signOutButtonMain' for main.html
    const signOutButtonIndex = document.getElementById('signOutButton');
    const signOutButtonMain = document.getElementById('signOutButtonMain'); // For main.html

    const handleSignOut = async (button) => {
        if (button) {
            button.addEventListener('click', async () => {
                try {
                    await auth.signOut();
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


    // --- Listen for Auth State Changes (Global Authentication Gate) ---
    auth.onAuthStateChanged((user) => {
        const currentPath = window.location.pathname;

        if (user) {
            // User is signed in.
            console.log('User logged in:', user.uid);

            // Update status messages if elements exist on the current page
            if (statusMessage) statusMessage.textContent = 'Logged in!';
            if (loggedInUserEmail) loggedInUserEmail.textContent = user.isAnonymous ? 'Guest User' : `Email: ${user.email || 'N/A'}`;

            // Hide the login form if it's visible on the current page
            if (authSection) authSection.hidden = true;

            // Show sign-out button if it exists
            if (signOutButtonIndex) signOutButtonIndex.hidden = false;
            if (signOutButtonMain) signOutButtonMain.hidden = false; // For main.html's button

            // Redirect logic: If logged in, and on the login page (index.html), go to main.html
            // Adjust this condition if your root '/' should also redirect to main.html
            if (currentPath.endsWith('index.html') || currentPath === '/') {
                window.location.href = 'main.html';
            }

        } else {
            // User is signed out.
            console.log('No user logged in.');

            // Update status messages if elements exist on the current page
            if (statusMessage) statusMessage.textContent = 'Not logged in.';
            if (loggedInUserEmail) loggedInUserEmail.textContent = '';

            // Show the login form if it's on the current page
            if (authSection) authSection.hidden = false;

            // Hide sign-out button if it exists
            if (signOutButtonIndex) signOutButtonIndex.hidden = true;
            if (signOutButtonMain) signOutButtonMain.hidden = true; // For main.html's button

            // Redirect logic: If logged out, and NOT on the login page (index.html), go to index.html
            // This protects your other pages.
            if (!currentPath.endsWith('index.html') && currentPath !== '/') {
                alert("You have been signed out or are not authenticated. Redirecting to login page.");
                window.location.href = 'index.html';
            }
        }
    });
});
