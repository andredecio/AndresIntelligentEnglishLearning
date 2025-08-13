// js/AdminSystem_Generator.js
// Handles content generation forms and Cloud Function calls for the Admin System.

// Import necessary Firebase services from our centralized setup.
import { app, functions } from './firebase-services.js'; // 'app' is imported for context, 'functions' for callable functions.

document.addEventListener('DOMContentLoaded', () => { // Retained from original AdminSystem.js.
    // --- References to HTML Elements (Content Generator) ---
    const contentGeneratorForm = document.getElementById('contentGeneratorForm');
    const cefrLevelSelect = document.getElementById('cefrLevel');
    const numVItemsInput = document.getElementById('numVItems');
    const numGItemsInput = document.getElementById('numGItems');
    const numCItemsInput = document.getElementById('numCItems');
    const numLSItemsInput = document.getElementById('numLSItems');
    const numRWItemsInput = document.getElementById('numRWItems'); // Corrected typo here
    const themeInput = document.getElementById('theme');
    const ModuleTypeSelect = document.getElementById('ModuleType');
    const responseDiv = document.getElementById('response');
    const loadingDiv = document.getElementById('loading'); // For content generation process
    const skippedWordsDisplay = document.getElementById('skippedWordsDisplay');
    const loadingSpinner = document.getElementById('loadingSpinner'); // Spinner is on the page, shared with auth.

    // --- Firebase Callable Cloud Function References ---
    // Make sure createLesson is also referenced here!
    const createLesson = functions.httpsCallable('createLesson');
    const generateVocabularyContent = functions.httpsCallable('generateVocabularyContent');
    const generateGrammarContent = functions.httpsCallable('generateGrammarContent');
    const generateConversationContent = functions.httpsCallable('generateConversationContent');
    const generateReadingWritingContent = functions.httpsCallable('generateReadingWritingContent');
    const generateListeningSpeakingContent = functions.httpsCallable('generateListeningSpeakingContent');

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
            } else if (Object.prototype.hasOwnProperty.call(moduleGenerators, ModuleType)) { // More robust check
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
            // Check if error has details, as is common with callable functions
            const errorMessage = error.details ?
                                `Error: ${error.message}\nDetails: ${JSON.stringify(error.details, null, 2)}` :
                                `Error: ${error.message}`;
            responseDiv.textContent = errorMessage;
            responseDiv.style.color = 'red';
            skippedWordsDisplay.textContent = '';
        } finally {
            loadingDiv.style.display = 'none';
            loadingSpinner.classList.add('hidden');
        }
    });
});
