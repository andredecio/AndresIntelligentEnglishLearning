        // --- Event Listeners and Authentication Logic ---
        document.addEventListener('DOMContentLoaded', () => {
            const emailInput = document.getElementById('emailInput');
            const passwordInput = document.getElementById('passwordInput');
            const signInEmailButton = document.getElementById('signInEmailButton');
            const signUpEmailButton = document.getElementById('signUpEmailButton');
            const signInGoogleButton = document.getElementById('signInGoogleButton');
            const signInFacebookButton = document.getElementById('signInFacebookButton');
            const signInAnonymousButton = document.getElementById('signInAnonymousButton');
            const signOutButton = document.getElementById('signOutButton');

            const statusMessage = document.getElementById('statusMessage');
            const loggedInUserEmail = document.getElementById('loggedInUserEmail');
            const errorMessageDiv = document.getElementById('error-message');

            // Function to display errors
            const displayError = (message) => {
                errorMessageDiv.textContent = message;
                errorMessageDiv.style.display = 'block';
            };

            // Function to clear errors
            const clearError = () => {
                errorMessageDiv.textContent = '';
                errorMessageDiv.style.display = 'none';
            };

            // --- Email/Password Sign-In/Sign-Up ---
            signInEmailButton.addEventListener('click', async () => {
                clearError();
                const email = emailInput.value;
                const password = passwordInput.value;
                try {
                    await auth.signInWithEmailAndPassword(email, password);
                } catch (error) {
                    displayError(`Email Sign-in failed: ${error.message}`);
                }
            });

            signUpEmailButton.addEventListener('click', async () => {
                clearError();
                const email = emailInput.value;
                const password = passwordInput.value;
                try {
                    await auth.createUserWithEmailAndPassword(email, password);
                    // Optional: send email verification after sign-up
                    // if (auth.currentUser) {
                    //    await auth.currentUser.sendEmailVerification();
                    //    alert("Verification email sent! Please check your inbox.");
                    // }
                } catch (error) {
                    displayError(`Email Sign-up failed: ${error.message}`);
                }
            });

            // --- Google Sign-In ---
            signInGoogleButton.addEventListener('click', async () => {
                clearError();
                const provider = new firebase.auth.GoogleAuthProvider();
                try {
                    await auth.signInWithPopup(provider);
                } catch (error) {
                    displayError(`Google Sign-in failed: ${error.message}`);
                }
            });

            // --- Facebook Sign-In ---
            signInFacebookButton.addEventListener('click', async () => {
                clearError();
                const provider = new firebase.auth.FacebookAuthProvider();
                // Optional: request additional permissions
                // provider.addScope('public_profile,email'); // Already default but good for clarity
                try {
                    await auth.signInWithPopup(provider);
                } catch (error) {
                    displayError(`Facebook Sign-in failed: ${error.message}`);
                }
            });

            // --- Anonymous Sign-In ---
            signInAnonymousButton.addEventListener('click', async () => {
                clearError();
                try {
                    await auth.signInAnonymously();
                } catch (error) {
                    displayError(`Anonymous Sign-in failed: ${error.message}`);
                }
            });

            // --- Sign Out ---
            signOutButton.addEventListener('click', async () => {
                clearError();
                try {
                    await auth.signOut();
                } catch (error) {
                    displayError(`Sign out failed: ${error.message}`);
                }
            });

            // --- Listen for Auth State Changes ---
            auth.onAuthStateChanged((user) => {
                if (user) {
                    // User is signed in.
                    statusMessage.textContent = 'Logged in!';
                    loggedInUserEmail.textContent = user.isAnonymous ? 'Guest User' : `Email: ${user.email || 'N/A'}`;
                    signOutButton.hidden = false;
                    // You might want to hide the sign-in forms here
                    document.querySelector('.auth-section').hidden = true;
                } else {
                    // User is signed out.
                    statusMessage.textContent = 'Not logged in.';
                    loggedInUserEmail.textContent = '';
                    signOutButton.hidden = true;
                    // Show the sign-in forms
                    document.querySelector('.auth-section').hidden = false;
                }
            });
		});
  