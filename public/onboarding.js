document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    const form = document.getElementById('onboarding-form');
    const loading = document.getElementById('loading');
    const startDemoButton = document.getElementById('startDemoButton');


    // 🔔 Local popup-style error display function (No change here)
    function showError(message) {
        const popup = document.getElementById('popup-error');
        const text = document.getElementById('popup-error-text');
        const closeButton = document.getElementById('popup-error-close');

        if (!popup || !text || !closeButton) {
            console.warn("Popup element(s) not found.");
            return;
        }

        text.textContent = message;
        popup.style.display = 'flex';

        closeButton.onclick = () => {
            popup.style.display = 'none';
        };

        setTimeout(() => {
            popup.style.display = 'none';
        }, 10000);
    }

    // --- NEW: Function to toggle the 'non-clickable' class ---
    /**
     * Checks form validity and toggles a 'non-clickable' CSS class on the button.
     * This *only* affects appearance, not actual clickability or the 'disabled' attribute.
     */
    function toggleNonClickableClass() {
        if (startDemoButton) {
            const isValid = form.checkValidity(); // Checks all HTML 'required' fields
            if (isValid) {
                startDemoButton.classList.remove('non-clickable');
            } else {
                startDemoButton.classList.add('non-clickable');
            }
        }
    }

    // --- NEW: Event Listeners for toggling the 'non-clickable' class ---
    // Listen to input/change events on the form to update the button's appearance
    form.addEventListener('input', toggleNonClickableClass);
    form.addEventListener('change', toggleNonClickableClass);


    // --- Pre-populate form if user data exists ---
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            toggleNonClickableClass(); // Initial appearance check if no user is logged in
            return;
        }

        if (user.isAnonymous) {
            document.getElementById('email-field-container').style.display = 'block';
        }

        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                if (data.firstName) document.getElementById('first-name').value = data.firstName;
                if (data.lastName) document.getElementById('last-name').value = data.lastName;
                if (data.dob) document.getElementById('dob').value = data.dob;
                if (data.language) document.getElementById('native-language').value = data.language;
                if (data.goal) document.getElementById('learning-goal').value = data.goal;
                if (data.goal === 'other' && data.goalNotes) {
                    document.getElementById('other-goal-notes').value = data.goalNotes;
                    document.getElementById('other-goal-notes').style.display = 'block';
                }
                if (data.sex) {
                    const sexRadio = document.querySelector(`input[name="sex"][value="${data.sex}"]`);
                    if (sexRadio) sexRadio.checked = true;
                }
                if (data.email) document.getElementById('email').value = data.email;
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            showError("Failed to load your saved data.");
        } finally {
            toggleNonClickableClass(); // After pre-populating, update button appearance
        }
    });

    // --- All core logic now in the form's submit handler ---
    // This listener will ONLY fire IF native HTML5 validation passes when the startDemoButton is clicked.
    form.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent default full page reload *after* native validation (if any) passes

        // At this point, native browser validation messages for 'required' fields would have already appeared
        // if anything was missing. So, we are safe to proceed with our custom logic.

        // Disable the button and show loading indicator *during* the asynchronous processing
        if (startDemoButton) {
            startDemoButton.disabled = true; // This is a *true* disable for processing time
            startDemoButton.classList.remove('non-clickable'); // Ensure it doesn't look like an input error now
        }
        loading.style.display = 'block';

        // Collect all form data (these values are now guaranteed to be present for 'required' fields)
        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        const dob = document.getElementById('dob').value;
        const language = document.getElementById('native-language').value.trim();
        const goal = document.getElementById('learning-goal').value;
        const goalNotes = document.getElementById('other-goal-notes').value.trim();
        const sex = document.querySelector('input[name="sex"]:checked')?.value;
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;


        // Custom Validation for email/password combination and format
        // This runs IF the user is anonymous AND has attempted to provide either an email OR a password.
        if (auth.currentUser?.isAnonymous && (email || password)) {
            // If one is present but the other is missing
            if (!email || !password) {
                showError("To create a permanent account, both email and password are required.");
                loading.style.display = 'none';
                if (startDemoButton) startDemoButton.disabled = false; // Re-enable if validation fails
                toggleNonClickableClass(); // Reset visual state
                return;
            }
            // If both are present, validate their format/length
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showError("Please enter a valid email address.");
                loading.style.display = 'none';
                if (startDemoButton) startDemoButton.disabled = false;
                toggleNonClickableClass();
                return;
            }
            if (password.length < 6) { // Firebase default minimum password length
                showError("Password must be at least 6 characters long.");
                loading.style.display = 'none';
                if (startDemoButton) startDemoButton.disabled = false;
                toggleNonClickableClass();
                return;
            }
        }


        try {
            let user = auth.currentUser;
            let emailVerificationNeeded = false;

            // Attempt linking ONLY if user is anonymous AND both email and password are provided (and valid)
            if (user?.isAnonymous && email && password) {
                try {
                    await user.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email, password));
                    console.log("Anonymous account upgraded and linked with email/password.");

                    // Crucial: Check if email is already verified. If not, initiate verification flow.
                    if (!auth.currentUser.emailVerified) {
                        await auth.currentUser.sendEmailVerification();
                        emailVerificationNeeded = true;
                        console.log("Email verification sent.");
                    }

                } catch (linkError) {
                    if (linkError.code === 'auth/email-already-in-use') {
                        showError("This email is already in use. Please sign in with that email or use a different one.");
                    } else {
                        showError("Failed to link account: " + linkError.message);
                    }
                    loading.style.display = 'none';
                    if (startDemoButton) startDemoButton.disabled = false;
                    toggleNonClickableClass();
                    return;
                }
            }

            // Prepare user data to save (use auth.currentUser.uid as it's the stable UID after any linking)
            const userData = {
                firstName,
                lastName,
                dob,
                language,
                goal,
                goalNotes: goal === 'other' ? goalNotes : '',
                sex,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                email: auth.currentUser?.email || email || null // Ensure we save the email if it was linked/provided
            };

            // Save onboarding data to Firestore for the current user
            await db.collection('users').doc(auth.currentUser.uid).set(userData, { merge: true });
            console.log("Onboarding data saved for user:", auth.currentUser.uid);


            // --- Conditional Redirection Logic ---
            if (emailVerificationNeeded) {
                await auth.signOut();
                console.log("User signed out for email verification process.");
                window.location.href = 'verify_email_notice.html';
            } else {
                window.location.href = 'conversation.html';
            }

        } catch (error) {
            console.error("Error processing demo flow:", error);
            showError("An error occurred: " + error.message);
        } finally {
            loading.style.display = 'none';
            if (startDemoButton) startDemoButton.disabled = false; // Re-enable button after processing
            toggleNonClickableClass(); // Re-evaluate visual state after processing
        }
    });

    // Handle showing "other" goal notes field (No change here)
    document.getElementById('learning-goal').addEventListener('change', function () {
        const notesField = document.getElementById('other-goal-notes');
        notesField.style.display = this.value === 'other' ? 'block' : 'none';
    });
});
