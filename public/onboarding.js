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

    // --- MODIFIED: Functions to manage startDemoButton state ---

    // Define the core required fields for enabling the demo button.
    // These should also have the 'required' attribute in your HTML for native validation.
    const requiredOnboardingFieldIds = [
        'first-name',
        'last-name',
        'dob',
        'native-language',
        'learning-goal'
    ];
    const sexRadioGroupName = 'sex';

    /**
     * Checks if all HTML 'required' fields have values to enable/disable the startDemoButton.
     * It relies on HTML's 'required' attribute for actual field-level validation messages.
     */
    function checkRequiredFieldsForDemoButton() {
        let allRequiredFieldsHaveValues = true;

        // Check general input fields that should be 'required' in HTML
        for (const fieldId of requiredOnboardingFieldIds) {
            const element = document.getElementById(fieldId);
            // If the element exists, is marked 'required', AND its value is empty after trimming, then not all fields have values
            if (element && element.hasAttribute('required') && element.value.trim() === '') {
                allRequiredFieldsHaveValues = false;
                break;
            }
        }

        // Check 'sex' radio button selection (if the group is marked as required)
        const sexRadios = document.querySelectorAll(`input[name="${sexRadioGroupName}"]`);
        // We'll check the first radio button in the group for the 'required' attribute.
        // This assumes if one radio in a group is required, the group itself is.
        const isSexGroupRequired = sexRadios.length > 0 && sexRadios[0].hasAttribute('required');

        if (allRequiredFieldsHaveValues && isSexGroupRequired) {
            const checkedSexRadios = document.querySelectorAll(`input[name="${sexRadioGroupName}"]:checked`);
            if (checkedSexRadios.length === 0) {
                allRequiredFieldsHaveValues = false;
            }
        }


        // Enable/disable the startDemoButton based on the check
        if (startDemoButton) {
            startDemoButton.disabled = !allRequiredFieldsHaveValues;
            // Add/remove a CSS class for visual feedback (e.g., dimming)
            if (allRequiredFieldsHaveValues) {
                startDemoButton.classList.remove('disabled-button');
            } else {
                startDemoButton.classList.add('disabled-button');
            }
        }
    }

    // --- Event Listeners for enabling/disabling the startDemoButton ---
    // Listen to changes on the required fields to update the button's state dynamically
    requiredOnboardingFieldIds.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.addEventListener('input', checkRequiredFieldsForDemoButton);
            element.addEventListener('change', checkRequiredFieldsForDemoButton);
        }
    });

    // Listen to changes on the 'sex' radio buttons
    const sexRadios = document.querySelectorAll(`input[name="${sexRadioGroupName}"]`);
    sexRadios.forEach(radio => {
        radio.addEventListener('change', checkRequiredFieldsForDemoButton);
    });

    // Also listen to email/password fields to ensure button state reflects them if they are filled
    // (though their complex validation is handled separately on click)
    const emailField = document.getElementById('email');
    const passwordField = document.getElementById('password');
    if (emailField) emailField.addEventListener('input', checkRequiredFieldsForDemoButton);
    if (passwordField) passwordField.addEventListener('input', checkRequiredFieldsForDemoButton);


    // --- Pre-populate form if user data exists ---
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            checkRequiredFieldsForDemoButton(); // Initial check if no user is logged in
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
                // If email and password were previously saved (e.g., after verification but before sign out), populate them
                if (data.email) document.getElementById('email').value = data.email;
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            showError("Failed to load your saved data.");
        } finally {
            checkRequiredFieldsForDemoButton(); // After pre-populating, check the fields to enable/disable button
        }
    });

    // --- MODIFIED: startDemoButton click handler ---
    if (startDemoButton) {
        startDemoButton.addEventListener('click', async () => {
            // Prevent accidental double clicks and show loading
            startDemoButton.disabled = true;
            loading.style.display = 'block';

            // Collect all form data
            const firstName = document.getElementById('first-name').value.trim();
            const lastName = document.getElementById('last-name').value.trim();
            const dob = document.getElementById('dob'); // Get element for value (not just value for form check)
            const language = document.getElementById('native-language').value.trim();
            const goal = document.getElementById('learning-goal').value;
            const goalNotes = document.getElementById('other-goal-notes').value.trim();
            const sex = document.querySelector('input[name="sex"]:checked')?.value;
            const email = document.getElementById('email').value.trim();
            const passwordElement = document.getElementById('password'); // Get element for value and validity checks
            const password = passwordElement.value; // Get the password value


            // 1. Validate form using native HTML5 validation
            // This will show browser's default messages for missing 'required' fields
            // The checkValidity() method must be called on the form element.
            if (!form.checkValidity()) {
                // If the form is not valid, the browser will display its native validation messages.
                // We just need to stop the JS execution and reset button state.
                showError("Please fill in all highlighted required fields."); // Generic custom error message
                loading.style.display = 'none';
                startDemoButton.disabled = false;
                checkRequiredFieldsForDemoButton(); // Re-check state just in case
                return;
            }


            // 2. Custom Validation for email/password combination and format
            // This runs IF the user is anonymous AND has attempted to provide either an email OR a password.
            if (auth.currentUser?.isAnonymous && (email || password)) {
                // If one is present but the other is missing
                if (!email || !password) {
                    showError("To create a permanent account, both email and password are required.");
                    loading.style.display = 'none';
                    startDemoButton.disabled = false;
                    return;
                }
                // If both are present, validate their format/length
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    showError("Please enter a valid email address.");
                    loading.style.display = 'none';
                    startDemoButton.disabled = false;
                    return;
                }
                if (password.length < 6) { // Firebase default minimum password length
                    showError("Password must be at least 6 characters long.");
                    loading.style.display = 'none';
                    startDemoButton.disabled = false;
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
                        // Use auth.currentUser after linking as 'user' reference might be stale.
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
                        startDemoButton.disabled = false;
                        return;
                    }
                }

                // Prepare user data to save (use auth.currentUser.uid as it's the stable UID after any linking)
                const userData = {
                    firstName,
                    lastName,
                    dob: dob.value, // Get value from the element
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
                startDemoButton.disabled = false;
                checkRequiredFieldsForDemoButton(); // Re-check the state in case anything changed
            }
        });
    } else {
        console.warn("Element with ID 'startDemoButton' not found. Demo button functionality will not work.");
    }


    // --- ORIGINAL: form.addEventListener('submit') (No functional change, keep as is for explicit form submission) ---
    // If you intend for the 'startDemoButton' to be the ONLY way to save and proceed,
    // you might consider removing or modifying this 'submit' listener for the form.
    // However, if there's another "Save" button for the form, keep this as is.
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // NOTE: This form submission handler will also benefit from the native HTML5 validation
        // if your form has a 'submit' button. You might want to add 'if (!form.checkValidity()) { return; }' here too.

        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        const dob = document.getElementById('dob').value;
        const language = document.getElementById('native-language').value.trim();
        const goal = document.getElementById('learning-goal').value;
        const goalNotes = document.getElementById('other-goal-notes').value.trim();
        const sex = document.querySelector('input[name="sex"]:checked')?.value;
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        // Basic validation for this specific submit event
        if (!firstName || !lastName || !dob || !language || !goal || !sex) {
            showError("Please fill in all required fields for form submission."); // Different error message for clarity
            return;
        }

        // Email/password validation for this specific submit event
        if ((email && !password) || (!email && password)) {
            showError("To create a permanent account, both email and password are required.");
            return;
        }

        loading.style.display = 'block';

        try {
            let user = auth.currentUser;

            if (email && password && user?.isAnonymous) {
                const credential = firebase.auth.EmailAuthProvider.credential(email, password);
                user = await user.linkWithCredential(credential);
                console.log("Anonymous account upgraded:", user.uid);
            }

            const userData = {
                firstName,
                lastName,
                dob,
                language,
                goal,
                goalNotes: goal === 'other' ? goalNotes : '',
                sex,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('users').doc(auth.currentUser.uid).set(userData, { merge: true });
            window.location.href = 'main.html'; // This redirects to main.html after form submission

        } catch (error) {
            console.error("Error saving user data or redirecting:", error);
            showError("An error occurred: " + error.message);
        } finally {
            loading.style.display = 'none';
        }
    });

    // Handle showing "other" goal notes field (No change here)
    document.getElementById('learning-goal').addEventListener('change', function () {
        const notesField = document.getElementById('other-goal-notes');
        notesField.style.display = this.value === 'other' ? 'block' : 'none';
    });
});
