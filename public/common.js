// common.js  UPDATED FIXED VERSION 4.20 — now with popup error support

document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();

    const statusMessageSpan = document.getElementById('statusMessage');
    const loggedInUserEmailP = document.getElementById('loggedInUserEmail');
    const currentUserEmailSpan = document.getElementById('currentUserEmail');

    const authSection = document.querySelector('.auth-section');
    const loginInfoDiv = document.getElementById('login-info');

    const signOutButtonIndex = document.getElementById('signOutButton');
    const signOutButtonMain = document.getElementById('signOutButtonMain');

    const handleSignOut = async (button) => {
        if (button) {
            button.addEventListener('click', async () => {
                try {
                    await auth.signOut();
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

    auth.onAuthStateChanged((user) => {
        const currentPage = window.location.pathname;
        const isIndexPage = currentPage.endsWith('index.html') || currentPage === '/';
        const isVerifyPage = currentPage.endsWith('verify_email_notice.html');
        const isSigningUp = sessionStorage.getItem("signingUp");

        if (user) {
            const isVerified = user.emailVerified || user.isAnonymous;

            if (!isVerified) {
                if (!isVerifyPage && !isSigningUp) {
                    console.log("User not verified. Redirecting to verify_email_notice.html");
                    window.location.href = "verify_email_notice.html";
                    return;
                }
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

    // ✅ Inject common.html (popup container etc.)
    const placeholder = document.getElementById('common-html-placeholder');
    if (placeholder) {
        fetch('common.html')
            .then(response => response.text())
            .then(html => {
                placeholder.innerHTML = html;

                // After injection, wire up close button event
                const closeBtn = document.querySelector('.popup-close-button');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        const popup = document.getElementById('popup-error');
                        if (popup) popup.style.display = 'none';
                    });
                }
            })
            .catch(error => {
                console.error('Failed to load common.html:', error);
            });
    }

    // ✅ Popup display function (make globally available)
    window.showError = function(message, duration = 10000) {
        const popup = document.getElementById('popup-error');
        const popupMessage = document.getElementById('popup-error-message');

        if (popup && popupMessage) {
            popupMessage.textContent = message;
            popup.style.display = 'block';

            // Auto-dismiss after [duration] ms
            setTimeout(() => {
                popup.style.display = 'none';
            }, duration);
        } else {
            console.warn("Popup element(s) not found.");
        }
    };
});
