document.addEventListener('DOMContentLoaded', () => {
    // Modified today 29/7/25 code deployed: v1.006m
    // Firebase is initialized by /__/firebase/init.js via AdminSystem.html
    // So we can directly get references to the Firebase services here.
    const auth = firebase.auth(); // Get Auth instance

    // Explicitly get the default Firebase App instance
    const app = firebase.app(); 

    const functions = app.functions('asia-southeast1'); // <-- This is the correct v8 way

    // --- References to HTML Elements ---
    // Auth Section elements
    const authSection = document.getElementById('authSection');
    const loginForm = document.getElementById('loginForm');
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    const loginErrorDiv = document.getElementById('loginError');
	const loadingSpinner = document.getElementById('loadingSpinner');
    // Generator Section elements
    const generatorSection = document.getElementById('generatorSection');
    const logoutButton = document.getElementById('logoutButton');
    const contentGeneratorForm = document.getElementById('contentGeneratorForm');
    const cefrLevelSelect = document.getElementById('cefrLevel');
    const numVItemsInput = document.getElementById('numVItems');
	const numGItemsInput = document.getElementById('numGItems');
 	const numCItemsInput = document.getElementById('numCItems');
 	const numRWItemsInput = document.getElementById('numRWItems');
	const themeInput = document.getElementById('theme');
    const ModuleTypeSelect = document.getElementById('ModuleType');	
    const responseDiv = document.getElementById('response');
    const loadingDiv = document.getElementById('loading');
	const skippedWordsDisplay = document.getElementById('skippedWordsDisplay');

    // --- Firebase Callable Cloud Function Reference ---
    const generateVocabularyContent = functions.httpsCallable('generateVocabularyContent');
    const generateGrammarContent = functions.httpsCallable('generateGrammarContent');
    const generateConversationContent = functions.httpsCallable('generateConversationContent');
    const generateReadingWritingContent = functions.httpsCallable('generateReadingWritingContent');


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
            responseDiv.textContent = ''; 
            skippedWordsDisplay.textContent = '';
			authSection.style.display = 'block'; // Show login form
            generatorSection.style.display = 'none'; // Hide generator form
			loadingSpinner.classList.add('hidden');
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
		let numVItems, numGItems;
        const ModuleType = ModuleTypeSelect.value; 
        const cefrLevel = cefrLevelSelect.value; // Corrected variable name
				numVItems = parseInt(numVItemsInput.value, 10); // Corrected variable name
		if (isNaN(numVItems) || numVItems < 1 || numVItems > 100) {
                responseDiv.textContent = 'Please enter a number of Vocab items between 1 and 100.';
                skippedWordsDisplay.textContent = '';
				return; // Stop execution if validation fails
            }
				numGItems = parseInt(numGItemsInput.value, 10); // Corrected variable name
		if (isNaN(numGItems) || numGItems < 1 || numGItems > 100) {
                responseDiv.textContent = 'Please enter a number of Grammar items between 1 and 100.';
                skippedWordsDisplay.textContent = '';
				return; // Stop execution if validation fails
            }
				numCItems = parseInt(numCItemsInput.value, 10); // Corrected variable name
		if (isNaN(numCItems) || numCItems < 1 || numCItems > 100) {
                responseDiv.textContent = 'Please enter a number of Conversation items between 1 and 100.';
                skippedWordsDisplay.textContent = '';
				return; // Stop execution if validation fails
            }
				numRWItems = parseInt(numRWItemsInput.value, 10); // Corrected variable name
		if (isNaN(numRWItems) || numRWItems < 1 || numRWItems > 100) {
                responseDiv.textContent = 'Please enter a number of Reading-Writing items between 1 and 100.';
                skippedWordsDisplay.textContent = '';
				return; // Stop execution if validation fails
            }
		
		
        const theme = themeInput.value; // Corrected variable name

        responseDiv.textContent = ''; // Clear previous response
        loadingDiv.style.display = 'block'; // Show loading message
        responseDiv.style.color = 'initial'; // Reset text color
		skippedWordsDisplay.textContent = '';
			loadingSpinner.classList.remove('hidden');
            // Display the result
       
	try {
		console.log("cefrLevel:", cefrLevel);
//console.log("theme:", theme);
//console.log("numVItems:", numVItems);
//console.log("numGItems:", numGItems);
//console.log("ModuleType:", ModuleType);

            // Call the Cloud Function - 
            // Choose a moduletype to be generated on AdminSystem page
           let result;
		   if ( ModuleType == 'VOCABULARY') {
			
					 result = await generateVocabularyContent({
					cefrLevel: cefrLevel,
					numWords: numVItems,
					theme: theme
				});
			} else if ( ModuleType == 'GRAMMAR') {
					 result = await generateGrammarContent({
					cefrLevel: cefrLevel,
					numItems: numGItems,
					theme: theme
				});
			} else if ( ModuleType == 'CONVERSATION') {
					 result = await generateConversationContent({
					cefrLevel: cefrLevel,
					numItems: numCItems,
					theme: theme
				});
			} else if ( ModuleType == 'READING-WRITING') {
					 result = await generateReadingWritingContent({
					cefrLevel: cefrLevel,
					numItems: numRWItems,
					theme: theme
				});


			}
				
			responseDiv.textContent = 'Success! Check your Firestore database.\n' + result.data.message;
		
		if (result.data.skippedWords && result.data.skippedWords.length > 0) {
                const skippedWordsList = result.data.skippedWords.join(', ');
                skippedWordsDisplay.textContent = `The following items were skipped as duplicates: ${skippedWordsList}.`;
                skippedWordsDisplay.style.color = 'orange'; // Make it stand out
            } else {
                skippedWordsDisplay.textContent = '';
					} 
		
		} catch (error) {
            console.error("Error calling Cloud Function:", error);
            // Display error message from Cloud Function or generic error
            responseDiv.textContent = `Error: ${error.message}\n${JSON.stringify(error.details || {}, null, 2)}`;
            responseDiv.style.color = 'red';
			skippedWordsDisplay.textContent = '';
		} finally {
            loadingDiv.style.display = 'none'; // Hide loading message
			loadingSpinner.classList.add('hidden');
        }
    });
});
