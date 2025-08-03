document.addEventListener('DOMContentLoaded', () => {
    // Modified today 29/7/25 code deployed: v1.006r - Create and attach modules to lesson
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
 	const numRWItemsInput = document.getElementById('numRWItems');
	const themeInput = document.getElementById('theme');
    const ModuleTypeSelect = document.getElementById('ModuleType');	
    const responseDiv = document.getElementById('response');
    const loadingDiv = document.getElementById('loading');
	const skippedWordsDisplay = document.getElementById('skippedWordsDisplay');

    // --- Firebase Callable Cloud Function References ---
    // Make sure createLesson is also referenced here!
    const createLesson = functions.httpsCallable('createLesson'); // <--- ADD THIS LINE!
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


    // --- Content Generator Form Submission Handler (Your original logic, now secured) ---
    contentGeneratorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
		let numVItems, numGItems, numCItems, numRWItems, numLSItems; // Declare all variables
        const ModuleType = ModuleTypeSelect.value; 
        const cefrLevel = cefrLevelSelect.value; 
		
        numVItems = parseInt(numVItemsInput.value, 10);
        if (isNaN(numVItems) || numVItems < 1 || numVItems > 100) {
            responseDiv.textContent = 'Please enter a number of Vocab items between 1 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        numGItems = parseInt(numGItemsInput.value, 10);
        if (isNaN(numGItems) || numGItems < 1 || numGItems > 100) {
            responseDiv.textContent = 'Please enter a number of Grammar items between 1 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        numCItems = parseInt(numCItemsInput.value, 10);
        if (isNaN(numCItems) || numCItems < 1 || numCItems > 100) {
            responseDiv.textContent = 'Please enter a number of Conversation items between 1 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        numRWItems = parseInt(numRWItemsInput.value, 10);
        if (isNaN(numRWItems) || numRWItems < 1 || numRWItems > 100) {
            responseDiv.textContent = 'Please enter a number of Reading-Writing items between 1 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
        numLSItems = parseInt(numLSItemsInput.value, 10);
        if (isNaN(numLSItems) || numLSItems < 1 || numLSItems > 100) {
            responseDiv.textContent = 'Please enter a number of ListeningSpeaking items between 1 and 100.';
            skippedWordsDisplay.textContent = ''; return;
        }
		
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
                const lessonCreationData = { // Renamed to avoid conflict with 'lessonData' inside catch
                    title: `Lesson - ${theme} - ${cefrLevel}`, // You might want a more specific title
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
                        lessonModuleId = MODULEID; // Store the MODULEID here!
                    } else {
                        console.error("Failed to create LESSON document:", error);
                        alert(`Error creating LESSON document: ${error}`);
                        loadingDiv.style.display = 'none'; // Hide loading on error
                        loadingSpinner.classList.add('hidden');
                        return; // Stop execution if LESSON creation fails
                    }
                } catch (error) {
                    console.error("Error calling createLesson Cloud Function:", error);
                    // Differentiate between function execution error and Firebase callable error
                    alert(`An unexpected error occurred during LESSON creation: ${error.message}`);
                    loadingDiv.style.display = 'none';
                    loadingSpinner.classList.add('hidden');
                    return;
                }
            }
            
            // Define the module generators.
            // They will now conditionally include lessonModuleId in their payload.
            const moduleGenerators = {
                'VOCABULARY': () => generateVocabularyContent({
                    cefrLevel,
                    numWords: numVItems,
                    theme,
                    lessonModuleId: lessonModuleId // <--- Pass the MODULEID here!
                }),
                'GRAMMAR': () => generateGrammarContent({
                    cefrLevel,
                    numItems: numGItems,
                    theme,
                    lessonModuleId: lessonModuleId // <--- Pass the MODULEID here!
                }),
                'CONVERSATION': () => generateConversationContent({
                    cefrLevel,
                    numItems: numCItems,
                    theme,
                    lessonModuleId: lessonModuleId // <--- Pass the MODULEID here!
                }),
                'LISTENINGSPEAKING': () => generateListeningSpeakingContent({
                    cefrLevel,
                    numItems: numLSItems,
                    theme,
                    lessonModuleId: lessonModuleId // <--- Pass the MODULEID here!
                }),
                'READING-WRITING': () => generateReadingWritingContent({
                    cefrLevel,
                    numItems: numRWItems,
                    theme,
                    lessonModuleId: lessonModuleId // <--- Pass the MODULEID here!
                })
            };

            let result; // This will hold the aggregated results of module generation

            if (ModuleType === 'LESSON') {
                // If we are creating a LESSON, iterate through all module types
                result = {}; // Initialize result object to store responses from each module type
                for (const [type, generator] of Object.entries(moduleGenerators)) {
                    console.log(`Generating ${type} modules...`);
                    // Call the generator, which now includes lessonModuleId in its payload
                    result[type] = await generator();
                    console.log(`${type} modules complete.`);
                }
            } else if (moduleGenerators[ModuleType]) {
                // If a specific module type is selected, call only that generator
                result = await moduleGenerators[ModuleType]();
            } else {
                throw new Error(`Unsupported ModuleType: ${ModuleType}`);
            }

            // --- Display Results and Skipped Words ---
            if (ModuleType === 'LESSON') {
                const messages = Object.entries(result).map(
                    ([type, res]) => `${type}: ${res?.data?.message || 'OK'}`
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
