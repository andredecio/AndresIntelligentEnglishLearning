// js/onboarding.js (MODULARIZED VERSION)
// This module handles the onboarding form logic, including user data persistence and account upgrades.

// --- Import necessary Firebase modules ---
// Import the initialized 'auth' and 'db' instances from your central Firebase services file.
import { auth, db } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// Import specific functions from the Firebase Authentication SDK.
import {
    onAuthStateChanged,
    linkWithCredential, // For linking anonymous accounts
    EmailAuthProvider,  // For creating email/password credentials
    sendEmailVerification,
    // signOut, // signOut is not directly used in this file for final sign out, it's used elsewhere
    updateEmail // Might be useful if upgrading email of anonymous user (though linkWithCredential handles it)
} from 'firebase/auth';

// Import specific functions from the Firebase Firestore SDK.
import {
    collection,
    doc,
    getDoc, // For fetching user data
    setDoc, // For saving user data
    serverTimestamp // For timestamping data
} from 'firebase/firestore';

// Import UI utility functions from ui-utilities.js.
import { showErrorPopup } from './ui-utilities.js';


document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('onboarding-form');
    const loading = document.getElementById('loading');
    const startDemoButton = document.getElementById('startDemoButton');


    // --- Function to toggle the 'non-clickable' class ---
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

    // --- Event Listeners for toggling the 'non-clickable' class ---
    // Listen to input/change events on the form to update the button's appearance
    form.addEventListener('input', toggleNonClickableClass);
    form.addEventListener('change', toggleNonClickableClass);


    // --- Pre-populate form if user data exists ---
    // Use the modular 'onAuthStateChanged' function, passing the imported 'auth' instance.
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            toggleNonClickableClass(); // Initial appearance check if no user is logged in
            return;
        }

        if (user.isAnonymous) {
            document.getElementById('email-field-container').style.display = 'block';
        }

        try {
            // Use modular Firestore functions: doc and getDoc
            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef); // Renamed `doc` to `docSnap` to avoid conflict with imported `doc`
            if (docSnap.exists()) {
                const data = docSnap.data();
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
            // Using imported showErrorPopup
            showErrorPopup("Failed to load your saved data.");
        } finally {
            toggleNonClickableClass(); // After pre-populating, update button appearance
        }
    });

    // --- All core logic now in the form's submit handler ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (startDemoButton) {
            startDemoButton.disabled = true;
            startDemoButton.classList.remove('non-clickable');
        }
        loading.style.display = 'block';

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
        // Access 'currentUser' directly from the imported 'auth' instance.
        if (auth.currentUser?.isAnonymous && (email || password)) {
            if (!email || !password) {
                // Using imported showErrorPopup
                showErrorPopup("To create a permanent account, both email and password are required.");
                loading.style.display = 'none';
                if (startDemoButton) startDemoButton.disabled = false;
                toggleNonClickableClass();
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                // Using imported showErrorPopup
                showErrorPopup("Please enter a valid email address.");
                loading.style.display = 'none';
                if (startDemoButton) startDemoButton.disabled = false;
                toggleNonClickableClass();
                return;
            }
            if (password.length < 6) {
                // Using imported showErrorPopup
                showErrorPopup("Password must be at least 6 characters long.");
                loading.style.display = 'none';
                if (startDemoButton) startDemoButton.disabled = false;
                toggleNonClickableClass();
                return;
            }
        }


        try {
            // Access 'currentUser' directly from the imported 'auth' instance.
            let user = auth.currentUser;
            let emailVerificationNeeded = false;

            if (user?.isAnonymous && email && password) {
                try {
                    // Use the modular 'linkWithCredential' function
                    await linkWithCredential(user, EmailAuthProvider.credential(email, password));
                    console.log("Anonymous account upgraded and linked with email/password.");

                    // Access 'currentUser' from the imported 'auth' instance and use modular 'sendEmailVerification'
                    if (!auth.currentUser.emailVerified) {
                        await sendEmailVerification(auth.currentUser);
                        emailVerificationNeeded = true;
                        console.log("Email verification sent.");
                    }

                } catch (linkError) {
                    if (linkError.code === 'auth/email-already-in-use') {
                        // Using imported showErrorPopup
                        showErrorPopup("This email is already in use. Please sign in with that email or use a different one.");
                    } else {
                        // Using imported showErrorPopup
                        showErrorPopup("Failed to link account: " + linkError.message);
                    }
                    loading.style.display = 'none';
                    if (startDemoButton) startDemoButton.disabled = false;
                    toggleNonClickableClass();
                    return;
                }
            }

            // Prepare user data to save
            const userData = {
                firstName,
                lastName,
                dob,
                language,
                goal,
                goalNotes: goal === 'other' ? goalNotes : '',
                sex,
                // Use the imported 'serverTimestamp' function
                timestamp: serverTimestamp(),
                email: auth.currentUser?.email || email || null
            };

            // Save onboarding data to Firestore
            // Use modular Firestore functions: doc and setDoc
            const userDocRef = doc(db, 'users', auth.currentUser.uid);
            await setDoc(userDocRef, userData, { merge: true });
            console.log("Onboarding data saved for user:", auth.currentUser.uid);


            // --- Conditional Redirection Logic ---
            if (emailVerificationNeeded) {
                // The `signOut` function is imported from 'firebase/auth', passing the 'auth' instance.
                await signOut(auth); // Note: signOut also needs to be imported if it's used here
                console.log("User signed out for email verification process.");
                window.location.href = 'verify_email_notice.html';
            } else {
                window.location.href = 'conversation.html';
            }

        } catch (error) {
            console.error("Error processing demo flow:", error);
            // Using imported showErrorPopup
            showErrorPopup("An error occurred: " + error.message);
        } finally {
            loading.style.display = 'none';
            if (startDemoButton) startDemoButton.disabled = false;
            toggleNonClickableClass();
        }
    });

    // Handle showing "other" goal notes field
    document.getElementById('learning-goal').addEventListener('change', function () {
        const notesField = document.getElementById('other-goal-notes');
        notesField.style.display = this.value === 'other' ? 'block' : 'none';
    });
});
