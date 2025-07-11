document.addEventListener('DOMContentLoaded', () => {
    // Modified today 12/7/25 code deployed: v1.004
    // Firebase is initialized by /__/firebase/init.js via AdminSystem.html
    // So we can directly get references to the Firebase services here.
    const auth = firebase.auth(); // Get Auth instance

    // Explicitly get the default Firebase App instance
    const app = firebase.app(); // <-- Add this line

    // --- KEY CHANGE HERE: Get the Functions service for the specific region from the app instance ---
    const functions = app.functions('asia-southeast1'); // <-- This is the correct v8 way

    // --- References to HTML Elements ---
    // Auth Section elements
    const authSection = document.getElementById('authSection');
    const loginForm = document.getElementById('loginForm');
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginErrorDiv = document.getElementById('loginError');

    // Generator Section elements
    const generatorSection = document.getElementById('generatorSection');
    const logoutButton = document.getElementById('logoutButton');
    const contentGeneratorForm = document.getElementById('contentGeneratorForm');
    const cefrLevelSelect = document.getElementById('cefrLevel');
    const numWordsInput = document.getElementById('numWords');
    const themeInput = document.getElementById('theme');
    const responseDiv = document.getElementById('response');
    const loadingDiv = document.getElementById('loading');


    // --- Firebase Callable Cloud Function Reference ---
    const generateVocabularyContent = functions.httpsCallable('generateVocabularyContent');


    // --- Firebase Authentication State Listener ---
    // This listener runs every time the user's authentication state changes (login, logout).
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // User is signed in. Now, check if they have admin privileges.
            try {
                // Get the ID token result, which contains custom claims.
                const idTokenResult = await user.getIdTokenResult();

                // Check for the 'admin' custom claim set on your user account.
                if (idTokenResult.claims.admin) {
                    // User is an authenticated admin. Show the generator section.
                    authSection.style.display = 'none'; // Hide login form
                    generatorSection.style.display = 'block'; // Show generator form
                    loginErrorDiv.textContent = ''; // Clear any previous login errors
                    console.log("Admin user logged in and authorized.");
                } else {
                    // User is authenticated but does NOT have the 'admin' claim.
                    // Log them out and display a message.
                    console.warn("User logged in but is not authorized as admin. Logging out.");
                    loginErrorDiv.textContent = 'You do not have administrative access. Logging out.';
                    await auth.signOut(); // Force sign out if not an admin
                }
            } catch (error) {
                console.error("Error checking custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`;
                await auth.signOut(); // Sign out on error
            }
        } else {
            // User is signed out. Show the login form and hide the generator.
            authSection.style.display = 'block'; // Show login form
            generatorSection.style.display = 'none'; // Hide generator form
            console.log("User signed out or no user found.");
        }
    });


    // --- Login Form Submission Handler ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent default form submission and page reload

        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        loginErrorDiv.textContent = ''; // Clear any previous error messages

        try {
            // Attempt to sign in with email and password
            await auth.signInWithEmailAndPassword(email, password);
            // If successful, onAuthStateChanged listener will handle UI update.
            console.log("Login successful.");
        } catch (error) {
            // Handle login errors (e.g., wrong password, user not found)
            console.error("Login Error:", error);
            loginErrorDiv.textContent = `Login failed: ${error.message}`;
        }
    });


    // --- Logout Button Handler ---
    logoutButton.addEventListener('click', async () => {
        try {
            // Sign out the current user
            await auth.signOut();
            // onAuthStateChanged listener will handle UI update (showing login form again).
            console.log("User logged out successfully.");
        } catch (error) {
            console.error("Logout Error:", error);
            // You might display a message to the user if logout fails unexpectedly
        }
    });


    // --- Content Generator Form Submission Handler (Your original logic, now secured) ---
    contentGeneratorForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent default form submission

        const cefrLevel = cefrLevelSelect.value; // Corrected variable name
        const numWords = parseInt(numWordsInput.value, 10); // Corrected variable name
		if (isNaN(numWords) || numWords < 1 || numWords > 100) {
                responseDiv.textContent = 'Please enter a number of words between 1 and 100.';
                return; // Stop execution if validation fails
            }
        const theme = themeInput.value; // Corrected variable name

        responseDiv.textContent = ''; // Clear previous response
        loadingDiv.style.display = 'block'; // Show loading message
        responseDiv.style.color = 'initial'; // Reset text color

        try {
            // Call the Cloud Function - this will now automatically include the user's ID token
            // The Cloud Function itself will verify the admin custom claim.
            const result = await generateVocabularyContent({
                cefrLevel: cefrLevel,
                numWords: numWords,
                theme: theme
            });

            // Display the result
            responseDiv.textContent = 'Success! Check your Firestore database.\n' + JSON.stringify(result.data, null, 2);
        } catch (error) {
            console.error("Error calling Cloud Function:", error);
            // Display error message from Cloud Function or generic error
            responseDiv.textContent = `Error: ${error.message}\n${JSON.stringify(error.details || {}, null, 2)}`;
            responseDiv.style.color = 'red';
        } finally {
            loadingDiv.style.display = 'none'; // Hide loading message
        }
    });
});
