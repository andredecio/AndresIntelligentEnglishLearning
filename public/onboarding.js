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

    // --- Functions to manage startDemoButton state (No change here) ---

    const requiredOnboardingFields = [
        'first-name',
        'last-name',
        'dob',
        'native-language',
        'learning-goal'
    ];
    const sexRadioGroupName = 'sex';

    function checkRequiredFieldsForDemoButton() {
        let allCoreFieldsFilled = true;

        for (const fieldId of requiredOnboardingFields) {
            const element = document.getElementById(fieldId);
            if (!element || element.value.trim() === '') {
                allCoreFieldsFilled = false;
                break;
            }
        }

        if (allCoreFieldsFilled) {
            const sexRadios = document.querySelectorAll(`input[name="${sexRadioGroupName}"]:checked`);
            if (sexRadios.length === 0) {
                allCoreFieldsFilled = false;
            }
        }

        if (startDemoButton) {
            startDemoButton.disabled = !allCoreFieldsFilled;
            if (allCoreFieldsFilled) {
                startDemoButton.classList.remove('disabled-button');
            } else {
                startDemoButton.classList.add('disabled-button');
            }
        }
    }

    // --- Event Listeners for enabling/disabling the startDemoButton (No change here) ---

    requiredOnboardingFields.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.addEventListener('input', checkRequiredFieldsForDemoButton);
            element.addEventListener('change', checkRequiredFieldsForDemoButton);
        }
    });

    const sexRadios = document.querySelectorAll(`input[name="${sexRadioGroupName}"]`);
    sexRadios.forEach(radio => {
        radio.addEventListener('change', checkRequiredFieldsForDemoButton);
    });

    // --- Pre-populate form if user data exists (Modified to also call checkRequiredFields) ---
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            checkRequiredFieldsForDemoButton();
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
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            showError("Failed to load your saved data.");
        } finally {
            checkRequiredFieldsForDemoButton();
        }
    });

    // --- MODIFIED: startDemoButton click handler ---
    if (startDemoButton) {
        startDemoButton.addEventListener('click', async () => {
            // Prevent accidental double clicks and show loading
            startDemoButton.disabled = true; // Temporarily disable while processing
            loading.style.display = 'block';

            // Collect all form data (similar to your form submit)
            const firstName = document.getElementById('first-name').value.trim();
            const lastName = document.getElementById('last-name').value.trim();
            const dob = document.getElementById('dob').value;
            const language = document.getElementById('native-language').value.trim();
            const goal = document.getElementById('learning-goal').value;
            const goalNotes = document.getElementById('other-goal-notes').value.trim();
            const sex = document.querySelector('input[name="sex"]:checked')?.value;
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            // Basic validation for the fields needed for the demo button (already checked by button state, but good for safety)
            if (!firstName || !lastName || !dob || !language || !goal || !sex) {
                showError("Please fill in all required fields before proceeding.");
                loading.style.display = 'none';
                startDemoButton.disabled = false;
                checkRequiredFieldsForDemoButton();
                return;
            }

            try {
                let user = auth.currentUser;
                let emailVerificationNeeded = false; // Flag to control verification flow

                // Scenario: Anonymous user provides email/password to upgrade
                if (user?.isAnonymous && email && password) {
                    // Check if email is valid before linking
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

                    try {
                        // Link the anonymous account with the provided email/password
                        await user.linkWithCredential(firebase.auth.EmailAuthProvider.credential(email, password));
                        console.log("Anonymous account upgraded and linked with email/password.");

                        // Crucial: Check if email is already verified. If not, initiate verification flow.
                        if (!auth.currentUser.emailVerified) { // Use auth.currentUser after linking as 'user' might be outdated
                            await auth.currentUser.sendEmailVerification();
                            emailVerificationNeeded = true;
                            console.log("Email verification sent.");
                        }

                    } catch (linkError) {
                        // Handle specific link errors (e.g., email already in use)
                        if (linkError.code === 'auth/email-already-in-use') {
                            showError("This email is already in use. Please sign in with that email or use a different one.");
                        } else {
                            showError("Failed to link account: " + linkError.message);
                        }
                        loading.style.display = 'none';
                        startDemoButton.disabled = false;
                        return; // Stop execution if linking fails
                    }
                }

                // Prepare user data to save (use auth.currentUser.uid as it's the stable UID)
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

                // Save onboarding data to Firestore for the current user (which might now be linked)
                await db.collection('users').doc(auth.currentUser.uid).set(userData, { merge: true });
                console.log("Onboarding data saved for user:", auth.currentUser.uid);


                // --- Conditional Redirection Logic ---
                if (emailVerificationNeeded) {
                    // Sign out the user immediately after sending verification email
                    // This forces them to use the verification link to re-enter
                    await auth.signOut();
                    console.log("User signed out for email verification process.");
                    window.location.href = 'verify_email_notice.html';
                } else {
                    // If no email verification was needed, proceed to conversation
                    window.location.href = 'conversation.html';
                }

            } catch (error) {
                console.error("Error processing demo flow:", error);
                showError("An error occurred: " + error.message);
            } finally {
                loading.style.display = 'none';
                startDemoButton.disabled = false;
                checkRequiredFieldsForDemoButton();
            }
        });
    } else {
        console.warn("Element with ID 'startDemoButton' not found. Demo button functionality will not work.");
    }


    // --- ORIGINAL: form.addEventListener('submit') (No functional change, keep as is) ---
    // If you intend for the 'startDemoButton' to be the ONLY way to save and proceed,
    // you might consider removing or modifying this 'submit' listener for the form.
    // However, if there's another "Save" button for the form, keep this.
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        const dob = document.getElementById('dob').value;
        const language = document.getElementById('native-language').value.trim();
        const goal = document.getElementById('learning-goal').value;
        const goalNotes = document.getElementById('other-goal-notes').value.trim();
        const sex = document.querySelector('input[name="sex"]:checked')?.value;
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!firstName || !lastName || !dob || !language || !goal || !sex) {
            showError("Please fill in all required fields.");
            return;
        }

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
