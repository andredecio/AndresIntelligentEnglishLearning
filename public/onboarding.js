// onboarding.js

document.addEventListener('DOMContentLoaded', () => {
    // Get references to HTML elements
    const onboardingForm = document.getElementById('onboarding-form');
    const firstNameInput = document.getElementById('first-name');
    const lastNameInput = document.getElementById('last-name');
    const dobInput = document.getElementById('dob');
    const nativeLanguageInput = document.getElementById('native-language');
    const emailFieldContainer = document.getElementById('email-field-container');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password'); // Get password input
    const sexMaleRadio = document.getElementById('sex-male');
    const sexFemaleRadio = document.getElementById('sex-female');
    const learningGoalSelect = document.getElementById('learning-goal');
    const otherGoalNotes = document.getElementById('other-goal-notes'); // For "Other" learning goal
    const startDemoButton = document.getElementById('startDemoButton');
    const loadingMessage = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');

    // Initialize Firebase services
    // Assuming firebase-app-compat, firebase-auth-compat, firebase-firestore-compat are loaded in HTML
    const auth = firebase.auth();
    const db = firebase.firestore();

    let currentUser = null; // To hold the authenticated user object

    // Add event listener for "Other" learning goal
    learningGoalSelect.addEventListener('change', () => {
        if (learningGoalSelect.value === 'other') {
            otherGoalNotes.style.display = 'block';
            otherGoalNotes.setAttribute('required', 'true'); // Make it required if "Other" is chosen
        } else {
            otherGoalNotes.style.display = 'none';
            otherGoalNotes.removeAttribute('required');
            otherGoalNotes.value = ''; // Clear its value if not "Other"
        }
    });

    // Listen for authentication state changes
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            console.log("Current user:", currentUser.uid, "Is Anonymous:", currentUser.isAnonymous);

            // Enable the button once we know who the user is
            startDemoButton.disabled = false;

            // If user is anonymous, show the email/password fields to offer linking
            if (currentUser.isAnonymous) {
                emailFieldContainer.style.display = 'block';
                // Make email and password required if anonymous and fields are shown
                emailInput.setAttribute('required', 'true');
                passwordInput.setAttribute('required', 'true');
            } else {
                // If not anonymous, hide the email/password fields
                emailFieldContainer.style.display = 'none';
                emailInput.removeAttribute('required');
                passwordInput.removeAttribute('required');
                // You might pre-fill the email field if available from user.email
                if (currentUser.email) {
                    emailInput.value = currentUser.email;
                }
            }

            // Optional: Pre-fill form if user data already exists in Firestore
            db.collection("users").doc(currentUser.uid).get().then(docSnapshot => {
                if (docSnapshot.exists) {
                    const userData = docSnapshot.data();
                    firstNameInput.value = userData.firstName || '';
                    lastNameInput.value = userData.lastName || '';
                    // Convert stored date string back to input type="date" format (YYYY-MM-DD)
                    dobInput.value = userData.dateOfBirth ? new Date(userData.dateOfBirth).toISOString().split('T')[0] : '';
                    nativeLanguageInput.value = userData.nativeLanguage || '';
                    
                    if (userData.sex === 'male') sexMaleRadio.checked = true;
                    if (userData.sex === 'female') sexFemaleRadio.checked = true;
                    
                    if (userData.learningGoal) {
                        learningGoalSelect.value = userData.learningGoal;
                        if (learningGoalSelect.value === 'other') {
                            otherGoalNotes.style.display = 'block';
                            otherGoalNotes.setAttribute('required', 'true');
                            otherGoalNotes.value = userData.otherGoalNotes || '';
                        }
                    }
                }
            }).catch(error => {
                console.error("Error loading user data for pre-fill:", error);
                errorMessage.textContent = `Error loading your saved preferences: ${error.message}`;
                errorMessage.style.display = 'block';
            });

        } else {
            // No user is signed in. This onboarding process assumes an existing session
            // (even an anonymous one).
            errorMessage.textContent = "Please ensure you are signed in to personalize your experience. Redirecting...";
            errorMessage.style.display = 'block';
            startDemoButton.disabled = true; // Keep button disabled
            console.log("No user signed in. Redirecting to sign-in or initial page.");
            // In a real app, you might redirect to your main entry or sign-in page here
            // setTimeout(() => { window.location.href = 'index.html'; }, 3000); // Example redirect
        }
    });

    // Handle form submission
    onboardingForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent default form submission

        // Reset messages
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
        loadingMessage.style.display = 'block';

        if (!currentUser) {
            errorMessage.textContent = "No user logged in. Please refresh or sign in.";
            errorMessage.style.display = 'block';
            loadingMessage.style.display = 'none';
            return;
        }

        try {
            const userData = {
                firstName: firstNameInput.value.trim(),
                lastName: lastNameInput.value.trim(),
                dateOfBirth: dobInput.value ? new Date(dobInput.value).toISOString() : null,
                nativeLanguage: nativeLanguageInput.value.trim(),
                sex: document.querySelector('input[name="sex"]:checked')?.value || null,
                learningGoal: learningGoalSelect.value,
                onboardingComplete: true,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (userData.learningGoal === 'other') {
                userData.otherGoalNotes = otherGoalNotes.value.trim();
            }

            // --- ACCOUNT LINKING LOGIC ---
            if (currentUser.isAnonymous) {
                const email = emailInput.value.trim();
                const password = passwordInput.value; // Get the password

                if (email && password) { // Only attempt linking if both are provided
                    try {
                        const credential = firebase.auth.EmailAuthProvider.credential(email, password);
                        
                        // This is the core step: linking the credential
                        await currentUser.linkWithCredential(credential);
                        console.log("Anonymous account successfully linked with Email/Password!");
                        // At this point, currentUser.isAnonymous will be false and
                        // the user object will reflect the new linked provider.
                        userData.email = email; // Store email in Firestore for completeness
                        userData.isAnonymous = false; // Explicitly update in Firestore to reflect change
                        
                    } catch (error) {
                        // Handle errors during linking
                        if (error.code === 'auth/credential-already-in-use') {
                            errorMessage.textContent = "This email is already associated with another account. Please sign in with that account instead, or use a different email.";
                            // In a real app, you might offer to sign them in with the existing account and merge data.
                        } else if (error.code === 'auth/email-already-in-use') {
                             errorMessage.textContent = "This email is already in use by another account. Please use a different email.";
                        } else if (error.code === 'auth/invalid-email') {
                            errorMessage.textContent = "The email address is not valid.";
                        } else if (error.code === 'auth/weak-password') {
                            errorMessage.textContent = "The password is too weak (must be at least 6 characters).";
                        } else {
                            errorMessage.textContent = `Error linking account: ${error.message}`;
                        }
                        console.error("Error linking anonymous account:", error);
                        loadingMessage.style.display = 'none';
                        return; // Stop execution if linking fails
                    }
                } else if (email || password) { // If only one is provided
                    errorMessage.textContent = "To create a permanent account, both email and password are required. If you don't want to create one now, leave both fields blank.";
                    loadingMessage.style.display = 'none';
                    return;
                }
                // If email and password fields are left blank, proceed without linking
                // The user will remain anonymous but their data will be saved.
            }

            // Save user data to Firestore
            // Using setDoc with merge: true to avoid overwriting existing fields
            await db.collection("users").doc(currentUser.uid).set(userData, { merge: true });

            console.log("User data saved to Firestore successfully!");

            // Redirect the user to the conversation.html page
            window.location.href = 'conversation.html';

        } catch (error) {
            console.error("Error saving user data or redirecting:", error);
            loadingMessage.style.display = 'none';
            errorMessage.textContent = `Failed to start lesson: ${error.message}. Please try again.`;
            errorMessage.style.display = 'block';
        }
    });
});
