// js/AdminSystem_Generator.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles content generation forms and Cloud Function calls for the Admin System.

// IMPORTANT: updateGeneratorUI and clearGeneratorUI must be globally accessible.
// We are explicitly attaching them to the window object because 'type="module"' prevents
// automatic global scope exposure.

/**
 * Stores the current authenticated user's augmented data, including profile and custom claims.
 * This is populated by AdminSystem_Auth.js.
 */
let currentAuthenticatedUserData = null;

/**
 * Updates the Generator UI based on the user's payment plan and credit status.
 * This function is called by AdminSystem_Auth.js after authentication and authorization.
 *
 * @param {object} augmentedUser The augmented user object containing firebaseUser, profile, and customClaims.
 */
window.updateGeneratorUI = function(augmentedUser) { // <--- CHANGE: Attached to window
    // Update the global reference
    currentAuthenticatedUserData = augmentedUser;

    const contentGeneratorForm = document.getElementById('contentGeneratorForm');
    const generateButton = contentGeneratorForm ? contentGeneratorForm.querySelector('button[type="submit"]') : null;
    const userPaymentStatusDiv = document.getElementById('userPaymentStatus');

    if (!currentAuthenticatedUserData || !generateButton) {
        // No user data or essential UI elements missing, disable everything
        window.clearGeneratorUI(); // <--- CHANGE: Call via window
        if (userPaymentStatusDiv) userPaymentStatusDiv.innerHTML = 'Please log in to use the generator.';
        return;
    }

    const customClaims = currentAuthenticatedUserData.customClaims;
    const userProfile = currentAuthenticatedUserData.profile;

    const isAdmin = customClaims.admin;
    const canCreateModule = customClaims.canCreateModule || isAdmin; // Admins can always create
    const paymentPlanId = userProfile ? userProfile.paymentPlanId : 'N/A';
    // Safely get currentBalance, defaulting to 0 for display if not found or not a number
    const currentBalance = userProfile && typeof userProfile.currentBalance === 'number' ? userProfile.currentBalance : 0;
    const userCurrency = userProfile ? userProfile.currency || 'USD' : 'USD'; // Default to USD

    // Display user's payment info
    if (userPaymentStatusDiv) {
        userPaymentStatusDiv.innerHTML = `
            <strong>Payment Plan:</strong> ${paymentPlanId} <br>
            <strong>Current Balance:</strong> ${currentBalance.toFixed(2)} ${userCurrency}
        `;
    }

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

    if (generateButton) generateButton.disabled = disableForm;
    if (contentGeneratorForm) {
        contentGeneratorForm.querySelectorAll('input, select, textarea').forEach(el => {
            // Only disable content generation inputs, not buttons like logout (if it were part of this form)
            if (el !== generateButton) {
                el.disabled = disableForm;
            }
        });
    }

    const responseDiv = document.getElementById('response');
    if (disableForm) {
        showAlert(responseDiv, loadingDiv, `Module generation is disabled: ${reason}`, true);
    } else {
        if (responseDiv) responseDiv.textContent = '';
    }
}; // <--- CHANGE: Use semicolon here for window attachment

/**
 * Resets the Generator UI to a default (logged-out or unauthorized) state.
 * This function is called by AdminSystem_Auth.js when no user is logged in or they are unauthorized.
 */
window.clearGeneratorUI = function() { // <--- CHANGE: Attached to window
    currentAuthenticatedUserData = null; // Clear the stored user data

    const contentGeneratorForm = document.getElementById('contentGeneratorForm');
    const generateButton = contentGeneratorForm ? contentGeneratorForm.querySelector('button[type="submit"]') : null;
    const userPaymentStatusDiv = document.getElementById('userPaymentStatus');
    const responseDiv = document.getElementById('response');
    const skippedWordsDisplay = document.getElementById('skippedWordsDisplay');

    if (generateButton) generateButton.disabled = true;
    if (contentGeneratorForm) {
        contentGeneratorForm.querySelectorAll('input, select, textarea').forEach(el => {
            el.disabled = true;
        });
        contentGeneratorForm.reset();
    }

    if (userPaymentStatusDiv) userPaymentStatusDiv.innerHTML = 'No user logged in.';
    if (responseDiv) responseDiv.textContent = '';
    if (skippedWordsDisplay) skippedWordsDisplay.textContent = '';
}; // <--- CHANGE: Use semicolon here for window attachment


document.addEventListener('DOMContentLoaded', () => {
    // 'functions' is now globally available from firebase-services.js.
    // 'displayError', 'showAlert', 'showSpinner', 'hideSpinner', 'showErrorPopup' are globally available from ui-utilities.js.
    // 'getDocument' is assumed to be globally available from firebase-services.js as well.

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
    const createLesson = functions.httpsCallable('createLesson');
    const generateVocabularyContent = functions.httpsCallable('generateVocabularyContent');
    const generateGrammarContent = functions.httpsCallable('generateGrammarContent');
    const generateConversationContent = functions.httpsCallable('generateConversationContent');
    const generateReadingWritingContent = functions.httpsCallable('generateReadingWritingContent');
    const generateListeningSpeakingContent = functions.httpsCallable('generateListeningSpeakingContent');

    // --- contentGeneratorForm Event Listener ---
    contentGeneratorForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // --- PRE-SUBMIT PAYMENT/PERMISSION CHECK ---
        if (!currentAuthenticatedUserData) {
            showErrorPopup('You must be logged in to generate content.');
            return;
        }

        const customClaims = currentAuthenticatedUserData.customClaims;
        const userProfile = currentAuthenticatedUserData.profile;

        const isAdmin = customClaims.admin;
        const canCreateModule = customClaims.canCreateModule || isAdmin;
        const currentBalance = userProfile && typeof userProfile.currentBalance === 'number' ? userProfile.currentBalance : 0;
        const userCurrency = userProfile ? userProfile.currency || 'USD' : 'USD';

        if (!canCreateModule) {
            showErrorPopup('Your payment plan does not permit module creation.');
            return;
        }
        if (currentBalance <= 0) {
            showErrorPopup(`Your balance (${currentBalance.toFixed(2)} ${userCurrency}) is too low to create modules. Please top up.`);
            return;
        }
        // ... rest of pre-submit check
        // --- END PRE-SUBMIT PAYMENT/PERMISSION CHECK ---

        let numVItems, numGItems, numCItems, numRWItems, numLSItems;

        const ModuleType = ModuleTypeSelect.value;
        const cefrLevel = cefrLevelSelect.value;

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

        const theme = themeInput.value;

        responseDiv.textContent = '';
        showAlert(responseDiv, loadingDiv, 'Generating content...', false);
        showSpinner(loadingDiv, loadingSpinner);

        try {
            console.log("cefrLevel:", cefrLevel);

            let lessonModuleId = null;

            if (ModuleType === 'LESSON') {
                const excount = numVItems + numGItems + numCItems + numLSItems + numRWItems;

                if (excount === 0) {
                    showAlert(responseDiv, loadingDiv, "Cannot create a LESSON with 0 expected modules. Please specify at least one module count greater than 0.", true);
                    hideSpinner(loadingDiv, loadingSpinner);
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

                    if (resultl.data && resultl.data.success === false) {
                        const errorMsg = resultl.data.error || "Unknown error creating LESSON document.";
                        showAlert(responseDiv, loadingDiv, `Error creating LESSON document: ${errorMsg}`, true);
                        hideSpinner(loadingDiv, loadingSpinner);
                        return;
                    }
                    const { success, MODULEID, error } = resultl.data;

                    if (success) {
                        console.log("Lesson created successfully! MODULEID:", MODULEID);
                        lessonModuleId = MODULEID;
                    } else {
                        console.error("Failed to create LESSON document:", error);
                        showAlert(responseDiv, loadingDiv, `Error creating LESSON document: ${error}`, true);
                        hideSpinner(loadingDiv, loadingSpinner);
                        return;
                    }
                } catch (error) {
                    console.error("Error calling createLesson Cloud Function:", error);
                    const errorMessage = error.details?.message || error.message;
                    showAlert(responseDiv, loadingDiv, `An unexpected error occurred during LESSON creation: ${errorMessage}`, true);
                    hideSpinner(loadingDiv, loadingSpinner);
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
                        result[type] = res;
                        if (res.data && res.data.success === false) {
                            showAlert(responseDiv, loadingDiv, `Error generating ${type}: ${res.data.error}`, true);
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
                    result = res;
                    if (res.data && res.data.success === false) {
                        showAlert(responseDiv, loadingDiv, `Error generating ${ModuleType}: ${res.data.error}`, true);
                        hideSpinner(loadingDiv, loadingSpinner);
                        return;
                    }
                    const skipped = res?.data?.skippedWords || [];
                    if (skipped.length > 0) {
                        allSkippedWords.push(...skipped);
                    }
                } else {
                    showAlert(responseDiv, loadingDiv, `Cannot generate ${ModuleType} modules if count is 0. Please specify a count greater than 0.`, true);
                    hideSpinner(loadingDiv, loadingSpinner);
                    return;
                }
            } else {
                const errorMessage = `Unsupported ModuleType: ${ModuleType}`;
                showAlert(responseDiv, loadingDiv, errorMessage, true);
                hideSpinner(loadingDiv, loadingSpinner);
                throw new Error(errorMessage);
            }

            // --- Display Results and Skipped Words ---
            if (Object.values(result).some(res => res.data && res.data.success === false)) {
                showAlert(responseDiv, loadingDiv, 'Some modules failed to generate. Check console for details.', true);
            } else {
                showAlert(responseDiv, loadingDiv, 'Success! Content generation complete.', false);
            }

            if (allSkippedWords.length > 0) {
                const skippedWordsList = allSkippedWords.join(', ');
                skippedWordsDisplay.textContent = `The following items were skipped as duplicates: ${skippedWordsList}.`;
                skippedWordsDisplay.style.color = 'orange';
            } else {
                skippedWordsDisplay.textContent = '';
            }

            // After successful generation, the user's balance might have changed.
            if (currentAuthenticatedUserData && currentAuthenticatedUserData.firebaseUser) {
                 await currentAuthenticatedUserData.firebaseUser.getIdTokenResult(true);
                 const updatedProfile = await getDocument('userProfiles', currentAuthenticatedUserData.firebaseUser.uid);
                 if (updatedProfile) {
                     currentAuthenticatedUserData.profile = updatedProfile;
                     window.updateGeneratorUI(currentAuthenticatedUserData); // <--- CHANGE: Call via window
                 } else {
                     console.warn("Could not re-fetch user profile after content generation. Balance display might be outdated.");
                     window.updateGeneratorUI(currentAuthenticatedUserData); // <--- CHANGE: Call via window
                 }
            }
        } catch (error) {
            console.error("Error during content generation process:", error);
            const errorMessage = error.details?.message || error.message || "An unknown error occurred.";
            showErrorPopup(`Error generating content: ${errorMessage}`);
        } finally {
            hideSpinner(loadingDiv, loadingSpinner);
        }
    });
});
