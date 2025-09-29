// common.js (MODULARIZED VERSION)
// This module handles common authentication-related UI updates and sign-out logic.

// --- Import necessary Firebase modules ---
// Import the initialized 'auth' instance from your central Firebase services file.
import { auth } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// Import specific functions from the Firebase Authentication SDK.
import { onAuthStateChanged, signOut } from 'firebase/auth';


document.addEventListener('DOMContentLoaded', () => {
    const statusMessageSpan = document.getElementById('statusMessage');
    const loggedInUserEmailP = document.getElementById('loggedInUserEmail');
    const currentUserEmailSpan = document.getElementById('currentUserEmail');
    const authSection = document.querySelector('.auth-section');
    const loginInfoDiv = document.getElementById('login-info');
    const signOutButtonIndex = document.getElementById('signOutButton');
    const signOutButtonMain = document.getElementById('signOutButtonMain');

    const handleSignOut = (button) => {
        if (button) {
            button.addEventListener('click', async () => {
                try {
                    // Use the modular 'signOut' function, passing the 'auth' instance
                    await signOut(auth);
                    console.log("User signed out.");
                    alert('You have been successfully signed out!');
                } catch (error) {
                    console.error('Sign out error:', error.message);
                    alert('Error signing out: ' + error.message);
                }
            });
        }
    };

    handleSignOut(signOutButtonIndex);
    handleSignOut(signOutButtonMain);

    // Use the modular 'onAuthStateChanged' function, passing the 'auth' instance
    onAuthStateChanged(auth, (user) => {
        const currentPage = window.location.pathname;
        const isIndexPage = currentPage.endsWith('index.html') || currentPage === '/';
        const isVerifyPage = currentPage.endsWith('verify_email_notice.html');
        const isSigningUp = sessionStorage.getItem("signingUp");

        if (user) {
            const isVerified = user.emailVerified || user.isAnonymous;

            if (!isVerified && !isVerifyPage && !isSigningUp) {
                console.log("User not verified. Redirecting to verify_email_notice.html");
                window.location.href = "verify_email_notice.html";
                return;
            }

            console.log('User logged in:', user.uid, 'Email:', user.email || 'Anonymous');
            if (statusMessageSpan) statusMessageSpan.textContent = `Logged in as: ${user.email || 'Anonymous'}`;
            if (loggedInUserEmailP) loggedInUserEmailP.textContent = user.isAnonymous ? 'Guest User' : user.email || 'N/A';
            if (currentUserEmailSpan) currentUserEmailSpan.textContent = user.isAnonymous ? 'Guest User' : user.email || 'N/A';

            if (authSection) authSection.style.display = 'none';
            if (loginInfoDiv) {
                const userUid = document.getElementById('userUid');
                const userEmail = document.getElementById('userEmail');
                const userName = document.getElementById('userName');
                const userProvider = document.getElementById('userProvider');
                if (userUid) userUid.textContent = user.uid;
                if (userEmail) userEmail.textContent = user.email || 'N/A';
                if (userName) userName.textContent = user.displayName || 'N/A';
                if (userProvider) userProvider.textContent = user.providerData?.[0]?.providerId || 'Anonymous';
                loginInfoDiv.style.display = 'block';
            }

            if (signOutButtonIndex) signOutButtonIndex.style.display = 'block';
            if (signOutButtonMain) signOutButtonMain.style.display = 'block';

            if (isIndexPage && isVerified) {
                console.log("Verified user on index.html, redirecting to main.html");
                window.location.assign('main.html');
            }

        } else {
            console.log('No user logged in.');
            if (statusMessageSpan) statusMessageSpan.textContent = 'Not logged in.';
            if (loggedInUserEmailP) loggedInUserEmailP.textContent = '';
            if (currentUserEmailSpan) currentUserEmailSpan.textContent = '';
            if (authSection) authSection.style.display = 'block';
            if (loginInfoDiv) loginInfoDiv.style.display = 'none';
            if (signOutButtonIndex) signOutButtonIndex.style.display = 'none';
            if (signOutButtonMain) signOutButtonMain.style.display = 'none';

            if (!isIndexPage && !isVerifyPage) {
                console.log("Unauthenticated user not on index.html or verify_email_notice.html, redirecting to index.html");
                window.location.assign('index.html');
            }
        }
    });
});
