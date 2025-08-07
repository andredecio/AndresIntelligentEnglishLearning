document.addEventListener('DOMContentLoaded', () => {
    // Modified today 29/7/25 code deployed: v1.006s
    // Firebase is initialized by /__/firebase/init.js via AdminSystem.html
    // So we can directly get references to the Firebase services here.
    const auth = firebase.auth(); // Get Auth instance

    // Explicitly get the default Firebase App instance
    const app = firebase.app(); 
    // IMPORTANT: Ensure firebase.app() and firebase.functions() are correctly imported and available.
    // If you're using modular SDK (v9+), this part would look different (e.g., getFunctions(app)).
    // Given your use of 'firebase.auth()', 'firebase.app()', and 'app.functions()', this appears to be v8 syntax.

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
	const numLSItemsInput = document.getElementById('numLSItems');
 	const numRWItemsInput = document = document.getElementById('numRWItems'); // Corrected typo here
	const themeInput = document.getElementById('theme');
    const ModuleTypeSelect = document.getElementById('ModuleType');	
    const responseDiv = document.getElementById('response');
    const loadingDiv = document.getElementById('loading');
	const skippedWordsDisplay = document.getElementById('skippedWordsDisplay');

    // --- Firebase Callable Cloud Function References ---
    // Make sure createLesson is also referenced here!
    const createLesson = functions.httpsCallable('createLesson');
    const generateVocabularyContent = functions.httpsCallable('generateVocabularyContent');
    const generateGrammarContent = functions.httpsCallable('generateGrammarContent');
    const generateConversationContent = functions.httpsCallable('generateConversationContent');
    const generateReadingWritingContent = functions.httpsCallable('generateReadingWritingContent');
    const generateListeningSpeakingContent = functions.httpsCallable('generateListeningSpeakingContent');


    // --- Firebase Authentication State Listener ---
    // (Your existing authentication logic)
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const idTokenResult = await user.getIdTokenResult();
                if (idTokenResult.claims.admin) {
                    authSection.style.display = 'none';
                    generatorSection.style.display = 'block';
                    loginErrorDiv.textContent = '';
                    console.log("Admin user logged in and authorized.");
                } else {
                    console.warn("User logged in but is not authorized as admin. Logging out.");
                    loginErrorDiv.textContent = 'You do not have administrative access. Logging out.';
                    await auth.signOut();
                }
            } catch (error) {
                console.error("Error checking custom claims:", error);
                loginErrorDiv.textContent = `Error during authorization check: ${error.message}`;
                await auth.signOut();
            }
        } else {
            responseDiv.textContent = ''; 
            skippedWordsDisplay.textContent = '';
			authSection.style.display = 'block';
            generatorSection.style.display = 'none';
			loadingSpinner.classList.add('hidden');
            console.log("User signed out or no user found.");
        }
    });


    // --- Login Form Submission Handler ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        loginErrorDiv.textContent = '';

        try {
            await auth.signInWithEmailAndPassword(email, password);
            console.log("Login successful.");
        } catch (error) {
            console.error("Login Error:", error);
            loginErrorDiv.textContent = `Login failed: ${error.message}`;
        }
    });


    // --- Logout Button Handler ---
    logoutButton.addEventListener('click', async () => {
        try {
            await auth.signOut();
            console.log("User logged out successfully.");
        } catch (error) {
            console.error("Logout Error:", error);
        }
    });
	
 // NEW: Event listener for the "Manage Module Content" button
    if (manageContentBtn) {
        manageContentBtn.addEventListener('click', () => {
            window.location.href = 'ModuleContent.html'; // Navigate to the new page
        });
    }

    // --- Content Generator Form Submission Handler (Your original logic, now secured) ---
    contentGeneratorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
		// Declare all number variables with `let`
		let numVItems, numGItems, numCItems, numRWItems, numLSItems; 

        const ModuleType = ModuleTypeSelect.value; 
        const cefrLevel = cefrLevelSelect.value; 
		
        // --- MODIFIED VALIDATION: Allow 0 for all counts ---
        numVItems = parseInt(numVItemsInput.value, 10);
        if (isNaN(numVItems) || numVItems < 0 || numVItems > 100) {
            responseDiv.textContent = 'Please enter a number of Vocab items between 0 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        numGItems = parseInt(numGItemsInput.value, 10);
        if (isNaN(numGItems) || numGItems < 0 || numGItems > 100) {
            responseDiv.textContent = 'Please enter a number of Grammar items between 0 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        numCItems = parseInt(numCItemsInput.value, 10);
        if (isNaN(numCItems) || numCItems < 0 || numCItems > 100) {
            responseDiv.textContent = 'Please enter a number of Conversation items between 0 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        numRWItems = parseInt(numRWItemsInput.value, 10);
        if (isNaN(numRWItems) || numRWItems < 0 || numRWItems > 100) {
            responseDiv.textContent = 'Please enter a number of Reading-Writing items between 0 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        numLSItems = parseInt(numLSItemsInput.value, 10);
        if (isNaN(numLSItems) || numLSItems < 0 || numLSItems > 100) {
            responseDiv.textContent = 'Please enter a number of Listening-Speaking items between 0 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        // --- END MODIFIED VALIDATION ---
		
        const theme = themeInput.value;

        responseDiv.textContent = '';
        loadingDiv.style.display = 'block';
        responseDiv.style.color = 'initial';
		skippedWordsDisplay.textContent = '';
		loadingSpinner.classList.remove('hidden');
       
	    try {
            console.log("cefrLevel:", cefrLevel);

            let lessonModuleId = null; // Variable to store the MODULEID from the LESSON document

            if (ModuleType === 'LESSON') {
                const excount = numVItems + numGItems + numCItems + numLSItems + numRWItems;
                
                // Only create the LESSON document if there's at least one module expected
                if (excount === 0) {
                    alert("Cannot create a LESSON with 0 expected modules. Please specify at least one module count greater than 0.");
                    loadingDiv.style.display = 'none';
                    loadingSpinner.classList.add('hidden');
                    return;
                }

                const lessonCreationData = { 
                    title: `Lesson - ${theme} - ${cefrLevel}`, 
                    theme: theme,
                    cefr: cefrLevel,
                    expectedModuleCount: excount
                };

                console.log("Attempting to call createLesson with data:", lessonCreationData);

                try {
                    const resultl = await createLesson(lessonCreationData);

                    const { success, MODULEID, error } = resultl.data;

                    if (success) {
                        console.log("Lesson created successfully! MODULEID:", MODULEID);
                        lessonModuleId = MODULEID; 
                    } else {
                        console.error("Failed to create LESSON document:", error);
                        alert(`Error creating LESSON document: ${error}`);
                        loadingDiv.style.display = 'none'; 
                        loadingSpinner.classList.add('hidden');
                        return; 
                    }
                } catch (error) {
                    console.error("Error calling createLesson Cloud Function:", error);
                    alert(`An unexpected error occurred during LESSON creation: ${error.message}`);
                    loadingDiv.style.display = 'none';
                    loadingSpinner.classList.add('hidden');
                    return;
                }
            }
            
            // Define the module generators.
            // They will now conditionally include lessonModuleId in their payload.
            const moduleGenerators = {
                'VOCABULARY': {
                    count: numVItems,
                    generator: () => generateVocabularyContent({
                        cefrLevel,
                        numWords: numVItems,
                        theme,
                        lessonModuleId: lessonModuleId
                    })
                },
                'GRAMMAR': {
                    count: numGItems,
                    generator: () => generateGrammarContent({
                        cefrLevel,
                        numItems: numGItems,
                        theme,
                        lessonModuleId: lessonModuleId
                    })
                },
                'CONVERSATION': {
                    count: numCItems,
                    generator: () => generateConversationContent({
                        cefrLevel,
                        numItems: numCItems,
                        theme,
                        lessonModuleId: lessonModuleId
                    })
                },
                'LISTENINGSPEAKING': {
                    count: numLSItems,
                    generator: () => generateListeningSpeakingContent({
                        cefrLevel,
                        numItems: numLSItems,
                        theme,
                        lessonModuleId: lessonModuleId
                    })
                },
                'READING-WRITING': {
                    count: numRWItems,
                    generator: () => generateReadingWritingContent({
                        cefrLevel,
                        numItems: numRWItems,
                        theme,
                        lessonModuleId: lessonModuleId
                    })
                }
            };

            let result = {}; // This will hold the aggregated results of module generation

            if (ModuleType === 'LESSON') {
                // If we are creating a LESSON, iterate through all module types
                for (const [type, moduleData] of Object.entries(moduleGenerators)) {
                    if (moduleData.count > 0) { // <--- CONDITIONAL CALLING BASED ON COUNT
                        console.log(`Generating ${type} modules...`);
                        result[type] = await moduleData.generator();  // Call the actual generator function
                        console.log(`${type} modules complete.`);
                    } else {
                        console.log(`Skipping ${type} modules as count is zero.`);
                        // Provide a consistent placeholder result for skipped modules
                        result[type] = { data: { message: `Skipped: count was 0` } }; 
                    }
                }
            } else if (moduleGenerators[ModuleType]) {
                // If a specific module type is selected (not LESSON)
                const selectedModuleData = moduleGenerators[ModuleType];
                if (selectedModuleData.count > 0) { // Also check count for single module type generation
                    result = await selectedModuleData.generator();
                } else {
                    alert(`Cannot generate ${ModuleType} modules if count is 0. Please specify a count greater than 0.`);
                    loadingDiv.style.display = 'none';
                    loadingSpinner.classList.add('hidden');
                    return;
                }
            } else {
                throw new Error(`Unsupported ModuleType: ${ModuleType}`);
            }

            // --- Display Results and Skipped Words ---
            if (ModuleType === 'LESSON') {
                const messages = Object.entries(result).map(
                    ([type, res]) => `${type}: ${res?.data?.message || 'OK'}` // Use optional chaining for message
                );
                responseDiv.textContent = 'Success! Modules created:\n' + messages.join('\n');
            } else {
                responseDiv.textContent = 'Success!\n' + (result?.data?.message || 'Modules created.');
            }
            
            let allSkippedWords = [];

            if (ModuleType === 'LESSON') {
                for (const res of Object.values(result)) {
                    const skipped = res?.data?.skippedWords || [];
                    if (skipped.length > 0) {
                        allSkippedWords.push(...skipped);
                    }
                }
            } else {
                const skipped = result?.data?.skippedWords || [];
                if (skipped.length > 0) {
                    allSkippedWords.push(...skipped);
                }
            }

            if (allSkippedWords.length > 0) {
                const skippedWordsList = allSkippedWords.join(', ');
                skippedWordsDisplay.textContent = `The following items were skipped as duplicates: ${skippedWordsList}.`;
                skippedWordsDisplay.style.color = 'orange';
            } else {
                skippedWordsDisplay.textContent = '';
            }
		
		} catch (error) {
            console.error("Error calling Cloud Function:", error);
            responseDiv.textContent = `Error: ${error.message}\n${JSON.stringify(error.details || {}, null, 2)}`;
            responseDiv.style.color = 'red';
			skippedWordsDisplay.textContent = '';
		} finally {
            loadingDiv.style.display = 'none';
			loadingSpinner.classList.add('hidden');
        }
    });
});
