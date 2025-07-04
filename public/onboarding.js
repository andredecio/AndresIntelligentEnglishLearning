document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const db = firebase.firestore();

    const form = document.getElementById('onboarding-form');
    const loading = document.getElementById('loading');

    // 🔔 Local popup-style error display function
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

        // If one of email/password is filled in, both must be filled in
        if ((email && !password) || (!email && password)) {
            showError("To create a permanent account, both email and password are required.");
            return;
        }

        loading.style.display = 'block';

        try {
            let user = auth.currentUser;

            // Create permanent account if email/password provided and current user is anonymous
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
            window.location.href = 'main.html';

        } catch (error) {
            console.error("Error saving user data or redirecting:", error);
            showError("An error occurred: " + error.message);
        } finally {
            loading.style.display = 'none';
        }
    });

    // Handle showing "other" goal notes field
    document.getElementById('learning-goal').addEventListener('change', function () {
        const notesField = document.getElementById('other-goal-notes');
        notesField.style.display = this.value === 'other' ? 'block' : 'none';
    });

    // Show email/password fields if user is anonymous
    auth.onAuthStateChanged((user) => {
        if (user?.isAnonymous) {
            document.getElementById('email-field-container').style.display = 'block';
        }
    });
});
