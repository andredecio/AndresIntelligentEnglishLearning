// js/AdminSystem_Generator.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles content generation forms and Cloud Function calls for the Admin System.

// Removed: import { app, functions } from './firebase-services.js'; // 'app' and 'functions' are now globally accessible

document.addEventListener('DOMContentLoaded', () => { // Retained from original AdminSystem.js.
    // 'functions' is now globally available from firebase-services.js.
    // 'app' is also globally available via `firebase.app()` if needed, but not directly used in this script.

    // --- References to HTML Elements (Content Generator) ---
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
    const loadingSpinner = document.getElementById('loadingSpinner');

    // --- Firebase Callable Cloud Function References ---
    // Accessing global 'functions' object
    const createLesson = functions.httpsCallable('createLesson');
    const generateVocabularyContent = functions.httpsCallable('generateVocabularyContent');
    const generateGrammarContent = functions.httpsCallable('generateGrammarContent');
    const generateConversationContent = functions.httpsCallable('generateConversationContent');
    const generateReadingWritingContent = functions.httpsCallable('generateReadingWritingContent');
    const generateListeningSpeakingContent = functions.httpsCallable('generateListeningSpeakingContent');

    // --- Content Generator Form Submission Handler ---
    contentGeneratorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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
        loadingSpinner.classList.add('hidden');

        try {
            console.log("cefrLevel:", cefrLevel);

            let lessonModuleId = null;

            if (ModuleType === 'LESSON') {
                const excount = numVItems + numGItems + numCItems + numLSItems + numRWItems;

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

            let result = {};

            if (ModuleType === 'LESSON') {
                for (const [type, moduleData] of Object.entries(moduleGenerators)) {
                    if (moduleData.count > 0) {
                        console.log(`Generating ${type} modules...`);
                        result[type] = await moduleData.generator();
                        console.log(`${type} modules complete.`);
                    } else {
                        console.log(`Skipping ${type} modules as count is zero.`);
                        result[type] = { data: { message: `Skipped: count was 0` } };
                    }
                }
            } else if (Object.prototype.hasOwnProperty.call(moduleGenerators, ModuleType)) {
                const selectedModuleData = moduleGenerators[ModuleType];
                if (selectedModuleData.count > 0) {
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
