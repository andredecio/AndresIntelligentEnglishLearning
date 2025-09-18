// js/AdminSystem_Generator.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles content generation forms and Cloud Function calls for the Admin System.

document.addEventListener('DOMContentLoaded', () => {
    // 'functions' is now globally available from firebase-services.js.
    // 'displayError', 'showAlert', 'showSpinner', 'hideSpinner', 'showErrorPopup' are globally available from ui-utilities.js.

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
    const loadingDiv = document.getElementById('loading'); // Assumed element for loading overlay
    const skippedWordsDisplay = document.getElementById('skippedWordsDisplay');
    const loadingSpinner = document.getElementById('loadingSpinner'); // Assumed spinner element

    // NEW UI elements for payment info
    const userPaymentStatusDiv = document.getElementById('userPaymentStatus'); // A div to display user's plan/balance
    const generateButton = contentGeneratorForm.querySelector('button[type="submit"]'); // Assuming the submit button for generation

    // --- Firebase Callable Cloud Function References ---
    // Accessing global 'functions' object
    const createLesson = functions.httpsCallable('createLesson');
    const generateVocabularyContent = functions.httpsCallable('generateVocabularyContent');
    const generateGrammarContent = functions.httpsCallable('generateGrammarContent');
    const generateConversationContent = functions.httpsCallable('generateConversationContent');
    const generateReadingWritingContent = functions.httpsCallable('generateReadingWritingContent');
    const generateListeningSpeakingContent = functions.httpsCallable('generateListeningSpeakingContent');

    // Store the current authenticated user's augmented data
    let currentUser = null;

    // --- Auth State Listener to update UI and set current user ---
    // The callback now receives the augmentedUser from firebase-services.js
    observeAuthState(async (augmentedUser) => {
        currentUser = augmentedUser;
        updateGeneratorUI(); // Update UI based on current user's state
    });

    // --- Function to update the Generator UI based on user's payment plan and credit ---
    function updateGeneratorUI() {
        if (!currentUser || !generateButton) {
            // No user or essential UI elements missing, disable everything
            if (generateButton) generateButton.disabled = true;
            if (contentGeneratorForm) contentGeneratorForm.querySelectorAll('input, select').forEach(el => el.disabled = true);
            userPaymentStatusDiv.innerHTML = 'Please log in.';
            return;
        }

        const customClaims = currentUser.customClaims;
        const userProfile = currentUser.profile;

        const isAdmin = customClaims.admin;
        const canCreateModule = customClaims.canCreateModule || isAdmin; // Admins can always create
        const paymentPlanId = userProfile ? userProfile.paymentPlanId : 'N/A';
        const currentBalance = userProfile ? userProfile.currentBalance : 0;
        const userCurrency = userProfile ? userProfile.Currency || 'USD' : 'USD'; // Default to USD

        // Display user's payment info
        userPaymentStatusDiv.innerHTML = `
            <strong>Payment Plan:</strong> ${paymentPlanId} <br>
            <strong>Current Balance:</strong> ${currentBalance.toFixed(2)} ${userCurrency}
        `;

        // Disable/Enable the form elements and generate button
        let disableForm = false;
        let reason = '';

        if (!canCreateModule) {
            disableForm = true;
            reason = 'Your current plan does not allow module creation.';
        } else if (currentBalance <= 0) { // Assuming 0 or negative means out of credit for creation
            disableForm = true;
            reason = `Your balance (${currentBalance.toFixed(2)} ${userCurrency}) is insufficient to create modules.`;
        }

        generateButton.disabled = disableForm;
        contentGeneratorForm.querySelectorAll('input, select, textarea').forEach(el => {
            // Keep the logout button enabled if it's part of the form and not other elements
            if (el !== generateButton) { // Ensure generateButton is not disabled twice.
                el.disabled = disableForm;
            }
        });

        if (disableForm) {
            showAlert(responseDiv, loadingDiv, `Module generation is disabled: ${reason}`, true);
        } else {
            clearError(responseDiv); // Clear any previous errors if enabled
            // You might want to display an estimated cost dynamically here as inputs change
        }
    }


    // --- Content Generator Form Submission Handler ---
    contentGeneratorForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // --- PRE-SUBMIT PAYMENT/PERMISSION CHECK ---
        if (!currentUser) {
            showErrorPopup('You must be logged in to generate content.');
            return;
        }

        const customClaims = currentUser.customClaims;
        const userProfile = currentUser.profile;

        const isAdmin = customClaims.admin;
        const canCreateModule = customClaims.canCreateModule || isAdmin;
        const currentBalance = userProfile ? userProfile.currentBalance : 0;

        if (!canCreateModule) {
            showErrorPopup('Your payment plan does not permit module creation.');
            return;
        }
        if (currentBalance <= 0) { // Again, a client-side check
            showErrorPopup(`Your balance (${currentBalance.toFixed(2)} ${userProfile.Currency || 'USD'}) is too low to create modules. Please top up.`);
            return;
        }
        // At this point, you might also check moduleCreationLimits from customClaims
        // e.g., if(numVItems > customClaims.moduleCreationLimits.vocabulary) { showErrorPopup(...) }
        // For simplicity, we'll let the Cloud Function enforce fine-grained limits.
        // --- END PRE-SUBMIT PAYMENT/PERMISSION CHECK ---


        let numVItems, numGItems, numCItems, numRWItems, numLSItems;

        const ModuleType = ModuleTypeSelect.value;
        const cefrLevel = cefrLevelSelect.value;

        // --- MODIFIED VALIDATION: Allow 0 for all counts ---
        numVItems = parseInt(numVItemsInput.value, 10);
        if (isNaN(numVItems) || numVItems < 0 || numVItems > 100) {
            showAlert(responseDiv, loadingDiv, 'Please enter a number of Vocab items between 0 and 100.', true);
            return;
        }
        numGItems = parseInt(numGItemsInput.value, 10);
        if (isNaN(numGItems) || numGItems < 0 || numGItems > 100) {
            showAlert(responseDiv, loadingDiv, 'Please enter a number of Grammar items between 0 and 100.', true);
            return;
        }
        numCItems = parseInt(numCItemsInput.value, 10);
        if (isNaN(numCItems) || numCItems < 0 || numCItems > 100) {
            showAlert(responseDiv, loadingDiv, 'Please enter a number of Conversation items between 0 and 100.', true);
            return;
        }
        numRWItems = parseInt(numRWItemsInput.value, 10);
        if (isNaN(numRWItems) || numRWItems < 0 || numRWItems > 100) {
            showAlert(responseDiv, loadingDiv, 'Please enter a number of Reading-Writing items between 0 and 100.', true);
            return;
        }
        numLSItems = parseInt(numLSItemsInput.value, 10);
        if (isNaN(numLSItems) || numLSItems < 0 || numLSItems > 100) {
            showAlert(responseDiv, loadingDiv, 'Please enter a number of Listening-Speaking items between 0 and 100.', true);
            return;
        }
        // --- END MODIFIED VALIDATION ---

        const theme = themeInput.value;

        responseDiv.textContent = '';
        showAlert(responseDiv, loadingDiv, 'Generating content...', false); // Use showAlert for consistent messaging
        showSpinner(loadingDiv, loadingSpinner); // Assuming loadingDiv is the container and loadingSpinner is the global spinner

        try {
            console.log("cefrLevel:", cefrLevel);

            let lessonModuleId = null;

            if (ModuleType === 'LESSON') {
                const excount = numVItems + numGItems + numCItems + numLSItems + numRWItems;

                if (excount === 0) {
                    showAlert(responseDiv, loadingDiv, "Cannot create a LESSON with 0 expected modules. Please specify at least one module count greater than 0.", true);
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

                    // If the Cloud Function throws an error (e.g., insufficient funds),
                    // it will be caught by the outer catch block.
                    // If the function returns an error object as data, handle it here.
                    if (resultl.data && resultl.data.success === false) {
                         // Specific error from Cloud Function, e.g., credit check failed
                        const errorMsg = resultl.data.error || "Unknown error creating LESSON document.";
                        showAlert(responseDiv, loadingDiv, `Error creating LESSON document: ${errorMsg}`, true);
                        return;
                    }
                    const { success, MODULEID, error } = resultl.data; // Destructure after checking for internal errors

                    if (success) {
                        console.log("Lesson created successfully! MODULEID:", MODULEID);
                        lessonModuleId = MODULEID;
                    } else {
                        console.error("Failed to create LESSON document:", error);
                        showAlert(responseDiv, loadingDiv, `Error creating LESSON document: ${error}`, true);
                        return;
                    }
                } catch (error) {
                    console.error("Error calling createLesson Cloud Function:", error);
                    const errorMessage = error.details?.message || error.message; // Firebase Functions errors have .details
                    showAlert(responseDiv, loadingDiv, `An unexpected error occurred during LESSON creation: ${errorMessage}`, true);
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
            let allSkippedWords = [];

            if (ModuleType === 'LESSON') {
                for (const [type, moduleData] of Object.entries(moduleGenerators)) {
                    if (moduleData.count > 0) {
                        console.log(`Generating ${type} modules...`);
                        const res = await moduleData.generator();
                        result[type] = res; // Store full result
                        if (res.data && res.data.success === false) {
                            showAlert(responseDiv, loadingDiv, `Error generating ${type}: ${res.data.error}`, true);
                            // Decide if you want to stop processing other modules or continue
                            // For now, we'll continue but log the error
                            console.error(`Error generating ${type}: ${res.data.error}`);
                        }
                        const skipped = res?.data?.skippedWords || [];
                        if (skipped.length > 0) {
                            allSkippedWords.push(...skipped);
                        }
                        console.log(`${type} modules complete.`);
                    } else {
                        console.log(`Skipping ${type} modules as count is zero.`);
                        result[type] = { data: { message: `Skipped: count was 0` } };
                    }
                }
            } else if (Object.prototype.hasOwnProperty.call(moduleGenerators, ModuleType)) {
                const selectedModuleData = moduleGenerators[ModuleType];
                if (selectedModuleData.count > 0) {
                    const res = await selectedModuleData.generator();
                    result = res; // Store full result
                    if (res.data && res.data.success === false) {
                        showAlert(responseDiv, loadingDiv, `Error generating ${ModuleType}: ${res.data.error}`, true);
                        return; // Stop on single module generation error
                    }
                    const skipped = res?.data?.skippedWords || [];
                    if (skipped.length > 0) {
                        allSkippedWords.push(...skipped);
                    }
                } else {
                    showAlert(responseDiv, loadingDiv, `Cannot generate ${ModuleType} modules if count is 0. Please specify a count greater than 0.`, true);
                    return;
                }
            } else {
                throw new Error(`Unsupported ModuleType: ${ModuleType}`);
            }

            // --- Display Results and Skipped Words ---
            if (Object.values(result).some(res => res.data && res.data.success === false)) {
                // If any generation failed, show a general failure message
                showAlert(responseDiv, loadingDiv, 'Some modules failed to generate. Check console for details.', true);
            } else {
                // Otherwise, show success
                showAlert(responseDiv, loadingDiv, 'Success! Content generation complete.', false);
            }

            if (allSkippedWords.length > 0) {
                const skippedWordsList = allSkippedWords.join(', ');
                skippedWordsDisplay.textContent = `The following items were skipped as duplicates: ${skippedWordsList}.`;
                skippedWordsDisplay.style.color = 'orange'; // Keep this style if you like
            } else {
                skippedWordsDisplay.textContent = '';
            }

            // After successful generation, the user's balance might have changed.
            // Force a refresh of the auth token to get updated profile data (including balance)
            // This assumes your custom claims function updates custom claims AND your profile document.
            if (currentUser && currentUser.getIdTokenResult) {
                 await currentUser.getIdTokenResult(true); // Force token refresh
                 // Re-fetch profile to ensure latest balance if it's not in claims
                 currentUser.profile = await getDocument('users', currentUser.uid);
                 updateGeneratorUI(); // Update UI with new balance
            }

        } catch (error) {
            console.error("Error calling Cloud Function:", error);
            // Firebase Callable Functions can return specific error details in `error.details`
            const errorMessage = error.details?.message || error.message || "An unknown error occurred.";
            showAlert(responseDiv, loadingDiv, `Error generating content: ${errorMessage}`, true);
        } finally {
            hideSpinner(loadingDiv, loadingSpinner);
        }
    });

    // Initial UI update on load (before user is observed, it might show "Please log in.")
    updateGeneratorUI();
});
