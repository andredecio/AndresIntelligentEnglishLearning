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

            // If user is anonymous, show the email field to offer linking
            if (currentUser.isAnonymous) {
                emailFieldContainer.style.display = 'block';
                emailInput.setAttribute('required', 'true'); // Make email required for anonymous
            } else {
                // If not anonymous, hide the email field
                emailFieldContainer.style.display = 'none';
                emailInput.removeAttribute('required');
                // You might also pre-fill the email field if available from user.email
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
                        // Trigger change to show/hide otherGoalNotes if 'other' was saved
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
                // Store date of birth as an ISO string for consistent storage
                dateOfBirth: dobInput.value ? new Date(dobInput.value).toISOString() : null,
                nativeLanguage: nativeLanguageInput.value.trim(),
                sex: document.querySelector('input[name="sex"]:checked')?.value || null, // Get selected radio button value
                learningGoal: learningGoalSelect.value,
                onboardingComplete: true, // Mark onboarding as complete
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp() // Use server timestamp for accuracy
            };

            // Add otherGoalNotes if 'other' is selected for learning goal
            if (userData.learningGoal === 'other') {
                userData.otherGoalNotes = otherGoalNotes.value.trim();
            }

            // Handle email linking for anonymous users
            if (currentUser.isAnonymous && emailInput.value.trim()) {
                const email = emailInput.value.trim();
                // You'd typically prompt for a password too, but for simplicity here,
                // we'll assume the email is the primary field. A full implementation
                // would require a password input for EmailAuthProvider.
                // For a proper account creation, you'd collect a password too.
                // Example: const password = prompt("Please enter a password to secure your account:");
                // const credential = firebase.auth.EmailAuthProvider.credential(email, password);

                // This is a simplified approach, usually you'd offer to link with password,
                // or use a sign-in method if email already exists.
                // For demonstration, let's assume we want to update the profile if possible.
                // A better flow would be to convert anonymous to email/password on first full sign-up.

                // A more robust way to handle this:
                // 1. Try to fetch sign-in methods for the email.
                // 2. If email exists, ask user to sign in with existing method.
                // 3. If email doesn't exist, create email/password credential and link.

                // For a quick setup where you want to associate an email for a future account:
                // This doesn't convert the anonymous user directly to an email/password user
                // unless you also collect and use a password with `linkWithCredential`.
                // It just updates the profile with the email.
                await currentUser.updateProfile({ email: email });
                console.log("Email updated in user profile.");
                // To truly convert, you'd need:
                // await currentUser.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email, 'some_temporary_password_or_collected_one'));
                // Or you redirect them to a full signup page after collecting details.
                // Let's just save the email in Firestore for now to keep it simple,
                // and let them decide to create a password later.
                userData.emailProvided = email; // Store the email they provided in Firestore
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
