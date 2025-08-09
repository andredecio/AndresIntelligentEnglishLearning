// ModuleContent.js
    // Modified today 09/08/25 code deployed: v1.006v
//import firebase from "firebase/compat/app"; // Needed for firebase.app()
//import "firebase/compat/auth";             // Needed for firebase.auth()
//import "firebase/compat/functions";         // Needed for app.functions() and httpsCallable

// Firebase SDK global variables (initialized by /__/firebase/init.js)
// We are using Firebase v8 syntax based on your provided common.js and AdminSystem.js

const app = firebase.app(); 
const auth = firebase.auth();
const functions = app.functions('asia-southeast1'); // <-- This is the correct v8 way

const db = firebase.firestore(); // Get Firestore instance
const storage = firebase.storage(); // Get Storage instance
// --- NEW: Google OAuth 2.0 Configuration (add these constants near your Firebase config) ---
const GOOGLE_CLIENT_ID = "190391960875-o8digh9sqso6hrju89o8nmuullvbh2b4.apps.googleusercontent.com"; // <<< REPLACE THIS with the Client ID you just created!
// Example: 190391960875-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com

const generateCourseForClassroomCloudFunction = functions.httpsCallable('generateCourseForClassroom');

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses',
	'https://www.googleapis.com/auth/classroom.topics', // <-- ADD THIS
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.rosters', // Only if you selected this scope. If not, remove this line.
].join(' '); // Join with spaces for the request


// List of module types that can be 'parent' containers and thus selectable for inclusion
const PARENT_MODULE_TYPES = ['COURSE', 'LESSON', 'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY', 'SYLLABLE'];
// List of module types that are "leaf" nodes or part of a parent, not independently selectable for inclusion
const NON_SELECTABLE_LEAF_MODULE_TYPES = ['PHONEME'];

// --- Crucial Global State Variables ---
let topLevelModuleNavigationList = []; // Stores ALL top-level modules for main navigation
let filteredNavigationList = [];      // Stores the currently filtered list for Prev/Next buttons
let currentTopLevelModuleIndex = 0;   // Current index within filteredNavigationList
let currentActiveRecord = null;       // Stores the data of the module currently loaded in the editor

// For the larger list of *all* selectable modules (for linking as children)
let allAvailableModules = [];

// --- Global State Variables ---
const moduleTypes = { // Define module types and their corresponding collections (simplified for now)
    'COURSE': 'COURSE',
    'LESSON': 'LESSON',
    'SEMANTIC_GROUP': 'learningContent',
    'VOCABULARY_GROUP': 'learningContent',
    'VOCABULARY': 'learningContent',
    'SYLLABLE': 'syllables',
    'PHONEME': 'phonemes',
    'GRAMMAR': 'learningContent',
    'CONVERSATION': 'learningContent',
    'READING-WRITING': 'learningContent',
    'LISTENINGSPEAKING': 'learningContent', // Corrected typo here, 'LISTENINGSPEAING' -> 'LISTENINGSPEAKING'
};

// --- Global DOM Element References ---
let largerListView = null;
let activeRecordIdInput = null;
let activeRecordCollectionInput = null;
let activeRecordTypeSelect = null;
let newRecordTypeSelectorGroup = null;
let recordTitleInput = null;
let recordDescriptionTextarea = null;
let recordThemeInput = null;
let themeFields = null;
let imageStatusSelect = null;
let imageStatusFields = null;
let cefrInput = null;
let cefrFields = null;
let meaningOriginInput = null;
let meaningOriginFields = null;
let prevRecordBtn = null;
let newRecordBtn = null;
let nextRecordBtn = null;
let saveRecordBtn = null;
let deleteRecordBtn = null;
let currentChildrenDisplay = null;
let moduleTypeFilterSelect = null;
let filterModuleTypeSelect = null;
let searchModulesInput = null;
let availableModulesList = null;
let statusAlert = null;
let statusMessageSpan = null;
let loadingSpinner = null;
let singleRecordView = null;
let generateClassroomBtn = null;

// --- MODIFIED: DOMContentLoaded listener ---



document.addEventListener('DOMContentLoaded', async () => {
    // Assuming your common.js handles auth state and admin checks first

    // Main layout and view containers
    singleRecordView = document.querySelector('.single-record-view');
    largerListView = document.querySelector('.larger-list-view');

    // Single Record Editor Form Fields
    activeRecordIdInput = document.getElementById('activeRecordId');
    activeRecordCollectionInput = document.getElementById('activeRecordCollection');
    activeRecordTypeSelect = document.getElementById('activeRecordTypeSelect'); // The selector for record type
    newRecordTypeSelectorGroup = document.querySelector('.new-record-type-selector-group'); // The container for the record type selector

    recordTitleInput = document.getElementById('recordTitle');
    recordDescriptionTextarea = document.getElementById('recordDescription');

    recordThemeInput = document.getElementById('recordTheme'); // Input for Theme
    themeFields = document.querySelectorAll('.theme-fields'); // Container for Theme input/label (used for show/hide)

    imageStatusSelect = document.getElementById('imageStatus'); // Select for Image Status
    imageStatusFields = document.querySelectorAll('.image-status-fields'); // Container for Image Status select/label (used for show/hide)

    cefrInput = document.getElementById('cefrInput'); // Input for CEFR Level
    cefrFields = document.querySelectorAll('.cefr-fields'); // Container for CEFR input/label (used for show/hide)

    meaningOriginInput = document.getElementById('meaningOriginInput'); // Input for Meaning Origin
    meaningOriginFields = document.querySelectorAll('.meaning-origin-fields'); // Container for Meaning Origin input/label (used for show/hide)


    // Navigation Buttons (Prev, New, Next)
    prevRecordBtn = document.getElementById('prevRecordBtn');
    newRecordBtn = document.getElementById('newRecordBtn');
    nextRecordBtn = document.getElementById('nextRecordBtn');

    // Action Buttons (Save, Delete)
    saveRecordBtn = document.getElementById('saveRecordBtn');
    deleteRecordBtn = document.getElementById('deleteRecordBtn');
 generateClassroomBtn = document.getElementById('generateClassroomBtn');

    // LATEST FIX 7/8/5: Add event listener for the Generate to Classroom button
   // if (generateClassroomBtn) {
//generateClassroomBtn.addEventListener('click', () => {
            // Placeholder for the actual Cloud Function call
   //         const recordId = activeRecordIdInput.value;
   //         const recordTitle = recordTitleInput.value;
   //         showAlert(`Attempting to generate Course: "${recordTitle}" (ID: ${recordId}) to Google Classroom...`, false);
   //         console.log(`Initiating Google Classroom generation for Course ID: ${recordId}`);
            // In a real scenario, you'd make an API call to a Cloud Function here.
            // Example:
            // firebase.functions().httpsCallable('generateClassroomCourse')({ courseId: recordId, courseTitle: recordTitle })
            //     .then(result => {
            //         showAlert('Course successfully sent to Google Classroom!', false);
            //         console.log('Cloud Function response:', result.data);
            //     })
            //     .catch(error => {
            //         showAlert(`Error generating to Classroom: ${error.message}`, true);
            //         console.error('Error calling Cloud Function:', error);
            //     });
       // });
    //}
    // Current Children Display
    currentChildrenDisplay = document.getElementById('currentChildrenDisplay');

    // Larger Module List View (for selecting children) - Filter & Search
    moduleTypeFilterSelect = document.getElementById('moduleTypeFilter'); // The NEW main filter for top-level navigation
    filterModuleTypeSelect = document.getElementById('filterModuleType'); // The filter within the larger 'children' list
    searchModulesInput = document.getElementById('searchModules'); // Search input for the larger list
    availableModulesList = document.getElementById('availableModulesList'); // The UL/container for the larger list

    // Status/Alerts
    statusAlert = document.getElementById('statusAlert');
    statusMessageSpan = document.getElementById('statusMessage');
    // **NOTE**: `loadingSpinner` needs to be queried *after* `availableModulesList` is assigned.
    if (availableModulesList) {
        loadingSpinner = availableModulesList.querySelector('.spinner'); // Spinner specifically for the available modules list
    }

    // **CRUCIAL CHANGE: Move ALL event listeners here, AFTER elements are assigned.**
    // --- Event Listeners for Filters/Search ---
    // This one was at line 597 and causing the addEventListener error.
    if (filterModuleTypeSelect) { // Safety check
        filterModuleTypeSelect.addEventListener('change', displayFilteredModules);
    }
    // This listener is for the main filter for top-level navigation.
    // It's also defined at the end of populateModuleTypeFilter, so you have a potential duplicate.
    // Given populateModuleTypeFilter() adds this listener, we don't need a duplicate here.
    // The previous error for filterModuleTypeSelect was because it was outside DOMContentLoaded.

    if (searchModulesInput) { // Assuming you want a search event listener
        searchModulesInput.addEventListener('input', displayFilteredModules); // Or 'change' if you prefer
    }

    // --- Event Listeners for Single Record View Buttons ---
    if (newRecordBtn) {
        newRecordBtn.addEventListener('click', () => {
            loadRecordIntoEditor(null); // Load a blank form for new record
            currentTopLevelModuleIndex = -1; // Indicate no course is active in navigation
            updateNavigationButtons();
        });
    }

    if (prevRecordBtn) {
        prevRecordBtn.addEventListener('click', async () => {
            // Now, we operate on the 'filteredNavigationList'
            if (currentTopLevelModuleIndex > 0) {
                currentTopLevelModuleIndex--;
                const selectedModule = filteredNavigationList[currentTopLevelModuleIndex];
                const moduleSnap = await db.collection(selectedModule.collection).doc(selectedModule.id).get();
                if (moduleSnap.exists) {
                    loadRecordIntoEditor({ id: moduleSnap.id, ...moduleSnap.data() }, selectedModule.collection);
                } else {
                    showAlert("Selected module not found, refreshing navigation.", true);
                    // If an item is missing, re-fetch all data and re-apply the filter
                    await fetchAndPopulateTopLevelNavigation();
                    await applyModuleTypeFilter(); // This will reload the first item of the now-refr  eshed filtered list
                }
                updateNavigationButtons();
            }
        });
    }

    if (nextRecordBtn) {
        nextRecordBtn.addEventListener('click', async () => {
            // Now, we operate on the 'filteredNavigationList'
            if (currentTopLevelModuleIndex < filteredNavigationList.length - 1) {
                currentTopLevelModuleIndex++;
                const selectedModule = filteredNavigationList[currentTopLevelModuleIndex];
                const moduleSnap = await db.collection(selectedModule.collection).doc(selectedModule.id).get();
                if (moduleSnap.exists) {
                    loadRecordIntoEditor({ id: moduleSnap.id, ...moduleSnap.data() }, selectedModule.collection);
                } else {
                    showAlert("Selected module not found, refreshing navigation.", true);
                    // If an item is missing, re-fetch all data and re-apply the filter
                    await fetchAndPopulateTopLevelNavigation();
                    await applyModuleTypeFilter(); // This will reload the first item of the now-refreshed filtered list
                }
                updateNavigationButtons();
            }
        });
    }

    if (saveRecordBtn) {
        saveRecordBtn.addEventListener('click', saveRecord);
    }
    if (deleteRecordBtn) {
        deleteRecordBtn.addEventListener('click', deleteRecord);
    }

    // This listener for activeRecordTypeSelect was at the very bottom. Move it here.
    if (activeRecordTypeSelect) {
        activeRecordTypeSelect.addEventListener('change', () => {
			    if (activeRecordTypeSelect) {
        activeRecordTypeSelect.addEventListener('change', () => {
            // This listener should only act when the select is enabled (i.e., for new records)
            if (!activeRecordTypeSelect.disabled) {
                const selectedType = activeRecordTypeSelect.value;

                // Update the hidden collection input based on the selected module type
                if (activeRecordCollectionInput && moduleTypes[selectedType]) { // Added safety check
                    activeRecordCollectionInput.value = moduleTypes[selectedType];
                }

                // Adjust visibility of Theme and Image Status fields based on the newly selected type
                // Theme field logic
                const typesWithTheme = [ // This array should probably be a global constant to avoid duplication
                    'COURSE', 'LESSON', 'VOCABULARY_GROUP', 'VOCABULARY'
                ];
                const isThemeRelevant = typesWithTheme.includes(selectedType);
                if (themeFields) { // Safety check
                    if (isThemeRelevant) {
                        themeFields.forEach(el => el.classList.remove('hidden'));
                    } else {
                        themeFields.forEach(el => el.classList.add('hidden'));
                    }
                }

                // Image Status field logic
                const typesWithImageStatus = [ // This array should probably be a global constant to avoid duplication
                    'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY',
                    'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING' // Corrected typo here
                ];
                const isImageStatusRelevant = typesWithImageStatus.includes(selectedType);
                if (imageStatusFields) { // Safety check
                    if (isImageStatusRelevant) {
                        imageStatusFields.forEach(el => el.classList.remove('hidden'));
                    } else {
                        imageStatusFields.forEach(el => el.classList.add('hidden'));
                    }
                }
                // Also add CEFR and Meaning Origin fields' visibility logic here if needed for new records.
                // It looks like this logic is in loadRecordIntoEditor, but if you want it on type change for new record,
                // you'll need to duplicate that here or refactor. // <--- Insert new line AFTER this comment
				// LATEST FIX 7/8/5: Update the Classroom button state when module type changes for new records
                updateClassroomButtonState();
			}
        });
    }

            // This listener should only act when the select is enabled (i.e., for new records)
            if (!activeRecordTypeSelect.disabled) {
                const selectedType = activeRecordTypeSelect.value;

                // Update the hidden collection input based on the selected module type
                if (activeRecordCollectionInput && moduleTypes[selectedType]) { // Added safety check
                    activeRecordCollectionInput.value = moduleTypes[selectedType];
                }


                // Adjust visibility of Theme and Image Status fields based on the newly selected type
                // Theme field logic
                const typesWithTheme = [ // This array should probably be a global constant to avoid duplication
                    'COURSE', 'LESSON', 'VOCABULARY_GROUP', 'VOCABULARY'
                ];
                const isThemeRelevant = typesWithTheme.includes(selectedType);
                if (themeFields) { // Safety check
                    if (isThemeRelevant) {
                        themeFields.forEach(el => el.classList.remove('hidden'));
                    } else {
                        themeFields.forEach(el => el.classList.add('hidden'));
                    }
                }


                // Image Status field logic
                const typesWithImageStatus = [ // This array should probably be a global constant to avoid duplication
                    'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY',
                    'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING' // Corrected typo here
                ];
                const isImageStatusRelevant = typesWithImageStatus.includes(selectedType);
                if (imageStatusFields) { // Safety check
                    if (isImageStatusRelevant) {
                        imageStatusFields.forEach(el => el.classList.remove('hidden'));
                    } else {
                        imageStatusFields.forEach(el => el.classList.add('hidden'));
                    }
                }
                // Also add CEFR and Meaning Origin fields' visibility logic here if needed for new records.
                // It looks like this logic is in loadRecordIntoEditor, but if you want it on type change for new record,
                // you'll need to duplicate that here or refactor.
            }
        });
    }


    // 1. Fetch all top-level modules into our master list
    await fetchAndPopulateTopLevelNavigation();

    // 2. Populate the new module type filter dropdown
    populateModuleTypeFilter(); // This function adds an event listener to moduleTypeFilterSelect

    // 3. Apply the default filter (e.g., 'ALL') and load the first record based on that
    await applyModuleTypeFilter();

    // Your existing call to loadAllAvailableModules() (keep this as it is)
    await loadAllAvailableModules();


	 // --- NEW: Logic for the "Generate to Classroom" button ---
    // Add this entire block inside your existing DOMContentLoaded listener
        if (generateClassroomBtn) {
        generateClassroomBtn.addEventListener('click', () => {

            const currentUser = auth.currentUser;

            if (!currentUser) {
                alert("You must be signed in to generate content to Classroom.");
                return;
            }

       // Use the value from your existing input elements
        let selectedCourseId = '';
        let selectedCourseTitle = '';

        // Ensure the input elements exist and have values
        if (activeRecordIdInput && activeRecordIdInput.value) {
            selectedCourseId = activeRecordIdInput.value;
        }
        if (recordTitleInput && recordTitleInput.value) {
            selectedCourseTitle = recordTitleInput.value;
        }

        if (!selectedCourseId) { // Check if a valid ID was found
            alert("Please select a valid COURSE record to generate (ID not found).");
            return;
        }

            // Step 1: Initiate Google OAuth 2.0 flow
            try {
                const client = google.accounts.oauth2.initCodeClient({
                    client_id: GOOGLE_CLIENT_ID,
                    scope: GOOGLE_SCOPES,
                    ux_mode: 'popup',
                    callback: async (response) => {
                        if (response.error) {
                            console.error('OAuth Error:', response.error);
                            alert('Google OAuth permission denied or error: ' + response.error);
                            return;
                        }

                        const authorizationCode = response.code;
                        console.log('Received Google authorization code:', authorizationCode);

                        // Step 2: Call your Cloud Function to exchange the code for tokens and proceed
                        try {
                            generateClassroomBtn.disabled = true; // Disable button while processing
							showAlert(`Attempting to generate Course: "${selectedCourseTitle || selectedCourseId}" to Google Classroom...`, false);
                            const result = await generateCourseForClassroomCloudFunction({
                                courseId: selectedCourseId,
                                authorizationCode: authorizationCode,
                                firebaseAuthUid: currentUser.uid
                            });

                            console.log('Cloud Function response:', result.data);
                        showAlert(result.data.message, false); // Show success message from the Cloud Function
                        } catch (cfError) {
                            console.error('Error calling Cloud Function:', cfError.code, cfError.message, cfError.details);
                            alert(`Failed to integrate with Google Classroom: ${cfError.message}`);
                        } finally {
                            generateClassroomBtn.disabled = false; // Re-enable button
                        }
                    },
                });
                client.requestCode();
            } catch (oauthInitError) {
                console.error('Error initiating OAuth client:', oauthInitError);
                alert('Could not start Google OAuth process. Check console for details.');
            }
        });
    }
});
	
	
	



	


// --- (Your functions will follow after these declarations) ---
// --- Utility Functions ---
// LATEST FIX 7/8/5: Function to manage the visibility and enabled state of the Google Classroom button
function updateClassroomButtonState() {
    // Ensure both the activeRecordTypeSelect and generateClassroomBtn elements exist
    if (!activeRecordTypeSelect || !generateClassroomBtn) {
        console.warn("Required DOM elements for Classroom button state not found.");
        return;
    }

    const currentModuleType = activeRecordTypeSelect.value;

    if (currentModuleType === 'COURSE') {
        generateClassroomBtn.style.display = 'inline-block'; // Make it visible
        generateClassroomBtn.disabled = false; // Enable it
    } else {
        generateClassroomBtn.style.display = 'none'; // Hide it
        generateClassroomBtn.disabled = true; // Disable it
    }
}

/**
 * Shows a temporary alert message.
 * @param {string} message The message to display.
 * @param {boolean} isError If true, styles as an error. Defaults to success.
 */
function showAlert(message, isError = false) {
    // **CRUCIAL CHANGE: Add safety checks for statusAlert and statusMessageSpan**
    if (statusMessageSpan) {
        statusMessageSpan.textContent = message;
    } else {
        console.error("Alert message span not found! Message:", message);
        return; // Cannot display alert if the element is missing
    }

    if (statusAlert) {
        statusAlert.classList.remove('hidden');
        // Get button dynamically to ensure it exists before trying to access properties
        const errorButton = statusAlert.querySelector('.error-button');

        if (isError) {
            statusAlert.style.backgroundColor = '#dc3545'; // Red for errors
            if (errorButton) { // Safety check for the button
                errorButton.style.backgroundColor = '#dc3545';
                errorButton.style.boxShadow = '0 6px #a71d2a, 0 2px 4px rgba(0,0,0,0.3)';
            }
        } else {
            statusAlert.style.backgroundColor = '#218b5f'; // Green for success (your default)
            if (errorButton) { // Safety check for the button
                errorButton.style.backgroundColor = '#218b5f';
                errorButton.style.boxShadow = '0 6px #0056b3, 0 2px 4px rgba(0,0,0,0.3)';
            }
        }

        // Auto-hide after 5 seconds unless dismissed
        setTimeout(() => {
            statusAlert.classList.add('hidden');
        }, 5000);
    } else {
        console.error("Alert container not found! Displaying message to console:", message);
    }
}

function showSpinner(targetElement) {
    if (targetElement) {
        targetElement.innerHTML = `<li class="loading-placeholder">Loading... <span class="spinner"></span></li>`;
        // **CRUCIAL CHANGE: Check if spinner exists before accessing its classList**
        const spinnerElement = targetElement.querySelector('.spinner');
        if (spinnerElement) {
            spinnerElement.classList.remove('hidden');
        }
    }
}

function hideSpinner(targetElement) {
    if (targetElement) {
        // **CRUCIAL CHANGE: Check if spinner exists before accessing its classList**
        const spinnerElement = targetElement.querySelector('.spinner');
        if (spinnerElement) {
            spinnerElement.classList.add('hidden');
        }
        // Clear the loading message if it's still there
        const loadingPlaceholder = targetElement.querySelector('.loading-placeholder');
        if (loadingPlaceholder) { // Check if the placeholder exists before clearing
             targetElement.innerHTML = ''; // Clear placeholder once content is ready
        }
    }
}

/**
 * Renders an image thumbnail.
 * @param {string} gsUrl Google Cloud Storage URL (gs://bucket/path)
 * @returns {HTMLImageElement | null}
 */
function renderThumbnail(gsUrl) {
    if (!gsUrl) return null;
    const img = document.createElement('img');
    img.className = 'thumbnail';
    // Firebase Storage provides a public download URL from gs://
    // You'd typically use storage.refFromURL(gsUrl).getDownloadURL()
    // For this example, we'll assume a direct URL or pre-signed URL is used or generated.
    // In a real app, you'd convert gs:// to https:// using getDownloadURL() on page load or on demand.
    // For simplicity, we'll just put the gsUrl for now and you'd implement proper URL conversion.
    // Placeholder for now:
    img.src = gsUrl.replace('gs://', 'https://storage.googleapis.com/'); // This is a common pattern, but actual public URLs may differ
    img.alt = 'Thumbnail';
    img.title = 'Click to view full image'; // Add a helpful tooltip on hover
  // Create the anchor element
    const link = document.createElement('a');
    link.href = gsUrl; // Link to the full image URL
    link.target = "_blank"; // Open in a new tab
    link.rel = "noopener noreferrer"; // Recommended for security when using target="_blank"
    link.appendChild(img); // Put the image inside the link
    return link;
}

/**
 * Renders an audio player button.
 * @param {string} gsUrl Google Cloud Storage URL (gs://bucket/path)
 * @returns {HTMLButtonElement | null}
 */
function renderAudioPlayer(gsUrl) {
    if (!gsUrl) return null;
    const button = document.createElement('button');
    button.className = 'audio-player-btn';
    button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-fill" viewBox="0 0 16 16"><path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/></svg> Play';
    button.onclick = async () => {
        try {
            // If gsUrl is truly an HTTPS URL from storage, this might be redundant.
            // If it's a gs:// path, then getDownloadURL is needed.
            // Assuming for now it's an HTTPS URL as per your clarification.
            const audio = new Audio(gsUrl); // Directly use gsUrl (which should be https://)
            audio.play();
        } catch (error) {
            console.error("Error playing audio:", error);
            showAlert("Could not play audio. Check file permissions or URL.", true);
        }
    };
    return button;
}
// This function creates an individual list item for the larger availableModulesList.
// It receives moduleData (the record from Firestore), a level (which you're currently using as 0),
// and currentModuleIds (for checkbox pre-selection).
function renderModuleListItem(moduleData, level, currentModuleIds) {
    const li = document.createElement('li');
    li.classList.add('module-item'); // Main class for list item styling
    li.classList.add(`module-type-${moduleData.MODULETYPE.toLowerCase().replace(/_/g, '-')}`);
    li.dataset.moduleId = moduleData.id;
    // Add level class for indentation (if your data has a 'level' property for nesting)
    if (level > 0) {
        li.classList.add(`level-${level}`);
        li.dataset.level = level; // Set data-level attribute for easy lookup during collapse
    }

    // --- 1. Checkbox (Direct child of <li>) ---
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.moduleId = moduleData.id;
    if (currentModuleIds.includes(moduleData.id)) {
        checkbox.checked = true;
    }
    li.appendChild(checkbox);

    // --- 2. Main Content Wrapper (for Title, Theme, Desc, CEFR) (Direct child of <li>) ---
    // This div will grow to take available space
    const contentWrapper = document.createElement('div');
    contentWrapper.classList.add('module-item-content');
    li.appendChild(contentWrapper);

    // --- Title and Type (inside contentWrapper) ---
    const titleWrapper = document.createElement('div');
    titleWrapper.classList.add('module-item-title-wrapper');
    contentWrapper.appendChild(titleWrapper);

    const titleElement = document.createElement('div');
    titleElement.classList.add('title'); // Corresponds to .module-item-content .title CSS
    titleElement.textContent = moduleData.TITLE || moduleData.name || 'Untitled Module';
    titleWrapper.appendChild(titleElement);

    const typeIndicator = document.createElement('span');
    typeIndicator.classList.add('type'); // Corresponds to .module-item-content .type CSS
    typeIndicator.textContent = `${moduleData.MODULETYPE.replace(/_/g, ' ')}`;
    titleWrapper.appendChild(typeIndicator);

    // --- THEME (inside contentWrapper) ---
    const typesWithTheme = ['COURSE', 'LESSON', 'VOCABULARY_GROUP', 'VOCABULARY']; // **UPDATED FOR THEME VISIBILITY**
    if (moduleData.THEME && typesWithTheme.includes(moduleData.MODULETYPE)) {
        const themeElement = document.createElement('div');
        themeElement.classList.add('module-item-detail');
        themeElement.classList.add('module-item-theme'); // Specific class for theme
        themeElement.textContent = `Theme: ${moduleData.THEME}`;
        contentWrapper.appendChild(themeElement);
    }

    // --- DESCRIPTION (inside contentWrapper) ---
    if (moduleData.DESCRIPTION) {
        const descriptionElement = document.createElement('p');
        descriptionElement.classList.add('module-item-detail');
        descriptionElement.classList.add('module-item-description');
        const displayDescription = moduleData.DESCRIPTION.length > 150
            ? moduleData.DESCRIPTION.substring(0, 147) + '...'
            : moduleData.DESCRIPTION;
        descriptionElement.textContent = `Description: ${displayDescription}`;
        contentWrapper.appendChild(descriptionElement);
    }

    // --- CEFR (inside contentWrapper) ---
    const typesWithCEFR = [ // Should match your typesWithCEFR in loadRecordIntoEditor
        'LESSON', 'SEMANTIC_GROUP', 'GRAMMAR', 'CONVERSATION',
        'READING-WRITING', 'LISTENINGSPEAKING', 'VOCABULARY_GROUP', 'VOCABULARY' // **ADDED VOCABULARY_GROUP & VOCABULARY**
    ];
    if (moduleData.CEFR && typesWithCEFR.includes(moduleData.MODULETYPE)) {
        const cefrElement = document.createElement('span');
        cefrElement.classList.add('module-item-detail');
        cefrElement.classList.add('module-item-cefr');
        cefrElement.textContent = `CEFR: ${moduleData.CEFR}`;
        contentWrapper.appendChild(cefrElement);
    }

    // --- MEANING_ORIGIN (inside contentWrapper) --- **NEW FIELD**
    const typesWithMeaningOrigin = ['VOCABULARY_GROUP', 'VOCABULARY']; // Define where MEANING_ORIGIN applies
    if (moduleData.MEANING_ORIGIN && typesWithMeaningOrigin.includes(moduleData.MODULETYPE)) {
        const meaningOriginElement = document.createElement('div');
        meaningOriginElement.classList.add('module-item-detail');
        meaningOriginElement.classList.add('module-item-meaning-origin');
        meaningOriginElement.textContent = `Origin: ${moduleData.MEANING_ORIGIN}`;
        contentWrapper.appendChild(meaningOriginElement);
    }

    // --- 3. Media Container (Direct child of <li>) ---
    // Make sure your moduleData actually has IMAGEURL and audioUrl properties from Firestore
    console.log(`DEBUG (renderModuleListItem): Module ID: ${moduleData.id}, Title: "${moduleData.TITLE || moduleData.name}"`);
    console.log(`  IMAGEURL: ${moduleData.IMAGEURL}, audioUrl: ${moduleData.audioUrl}`);

    if (moduleData.IMAGEURL || moduleData.audioUrl) {
        const mediaContainer = document.createElement('div');
        mediaContainer.classList.add('module-media');

        if (moduleData.IMAGEURL) {
            const img = document.createElement('img');
            img.classList.add('thumbnail');
            img.src = moduleData.IMAGEURL; // Direct use of the URL from Firestore
            img.alt = `Thumbnail for ${moduleData.TITLE || 'module'}`;

            // **FIX: Wrap the image in an anchor tag to make it clickable**
            const imgLink = document.createElement('a');
            imgLink.href = moduleData.IMAGEURL; // Link to the full image URL
            imgLink.target = "_blank"; // Open in a new tab
            imgLink.rel = "noopener noreferrer"; // Recommended for security
            imgLink.appendChild(img); // Put the image inside the link

            mediaContainer.appendChild(imgLink); // Append the link to the media container
        }

        if (moduleData.audioUrl) {
            const audioBtn = document.createElement('button');
            audioBtn.classList.add('audio-player-btn');
            audioBtn.textContent = 'Play Audio'; // You could use an icon here too
            audioBtn.onclick = () => {
                const audio = new Audio(moduleData.audioUrl); // Direct use of the URL from Firestore
                audio.play().catch(e => console.error("Audio playback failed:", e));
            };
            mediaContainer.appendChild(audioBtn);
        }
        li.appendChild(mediaContainer);
    }

    // --- 4. Expand/Collapse Toggle (Direct child of <li>) ---
    // Determine if this module type can have children that are listed
    // A module can have children if its type is in PARENT_MODULE_TYPES or if it explicitly has MODULEID_ARRAY.
    const canHaveChildren = PARENT_MODULE_TYPES.includes(moduleData.MODULETYPE) || (moduleData.MODULEID_ARRAY && moduleData.MODULEID_ARRAY.length > 0);

    const expandToggle = document.createElement('span');
    expandToggle.classList.add('expand-toggle');
    expandToggle.textContent = '▶'; // Right-pointing triangle unicode character
    li.appendChild(expandToggle);

    // Add event listener only if the module potentially has children
    if (canHaveChildren) {
        expandToggle.style.cursor = 'pointer'; // Indicate it's clickable
        expandToggle.addEventListener('click', async () => {
            const isExpanded = li.classList.toggle('expanded'); // Toggle expanded class on the list item
            expandToggle.textContent = isExpanded ? '▼' : '▶'; // Change arrow direction

            // **CRITICAL FIX: More comprehensive child removal for collapse**
            if (!isExpanded) { // If we are collapsing, remove all nested children
                let nextSibling = li.nextElementSibling;
                while (nextSibling && parseInt(nextSibling.dataset.level) > level) {
                    const tempSibling = nextSibling;
                    nextSibling = tempSibling.nextElementSibling;
                    tempSibling.remove();
                }
            }


            if (isExpanded) {
                // If expanded, fetch and render children
                const childIds = moduleData.MODULEID_ARRAY || [];
                await fetchAndRenderChildren(moduleData.id, childIds, level + 1, li, []);
            }
        });
    } else {
        expandToggle.classList.add('hidden'); // Hide arrow if no children expected
    }

    return li;
}

/**
 * Fetches and renders child modules for a given parent.
 * @param {string} parentId The ID of the parent module.
 * @param {Array<string>} childIds An array of IDs of the child modules.
 * @param {number} level The nesting level for the children.
 * @param {HTMLLIElement} parentLi The HTML <li> element of the parent.
 * @param {Array<string>} [selectedModuleIds=[]] Array of IDs currently selected for the active parent.
 */
async function fetchAndRenderChildren(parentId, childIds, level, parentLi, selectedModuleIds = []) {
    console.log(`--- fetchAndRenderChildren called for parent: ${parentId}, level: ${level} ---`);
    console.log(`Child IDs to fetch:`, childIds);

    if (!childIds || childIds.length === 0) {
        console.log(`DEBUG: No child IDs provided or array is empty for parent ${parentId}. Returning.`);
        // Optionally, display a "No children" message here
        const noChildrenLi = document.createElement('li');
        noChildrenLi.className = `module-item level-${level} no-content-message`;
        noChildrenLi.textContent = '(No children found or defined for this module)';
        parentLi.after(noChildrenLi);
        return;
    }

    const allChildPromises = childIds.map(async (childId) => {
        let docSnap = null;
        try {
            // Priority for where children of LESSONs (or SEMANTIC_GROUPs) typically reside
            // According to our refined model, LESSON children are from `learningContent`
            docSnap = await db.collection('learningContent').doc(childId).get();
            if (docSnap.exists) {
                console.log(`DEBUG (fetchAndRenderChildren): Child ${childId} from 'learningContent'. Image: ${docSnap.data().IMAGEURL}, Audio: ${docSnap.data().audioUrl}`);
                return { id: docSnap.id, ...docSnap.data(), collection: 'learningContent' };
            }

            // Check 'syllables' collection (children of VOCABULARY items from learningContent)
            docSnap = await db.collection('syllables').doc(childId).get();
            if (docSnap.exists) {
                console.log(`DEBUG (fetchAndRenderChildren): Child ${childId} from 'syllables'. Image: ${docSnap.data().IMAGEURL}, Audio: ${docSnap.data().audioUrl}`);
                return { id: docSnap.id, ...docSnap.data(), collection: 'syllables' };
            }

            // Check 'phonemes' collection (children of SYLLABLE items from syllables)
            docSnap = await db.collection('phonemes').doc(childId).get();
            if (docSnap.exists) {
                console.log(`DEBUG (fetchAndRenderChildren): Child ${childId} from 'phonemes'. Image: ${docSnap.data().IMAGEURL}, Audio: ${docSnap.data().audioUrl}`);
                return { id: docSnap.id, ...docSnap.data(), collection: 'phonemes' };
            }

            // Note: LESSONs are not usually children of other LESSONs or SEMANTIC_GROUPs
            //       Courses are not children of anything.
            //       If an ID is here and not found above, it's likely an error or old data.
            console.warn(`DEBUG: Child module with ID ${childId} not found in 'learningContent', 'syllables', or 'phonemes' collections.`);
            return null; // Return null if not found in any expected collection
        } catch (error) {
            console.error(`DEBUG: Error fetching child ${childId}:`, error);
            // Crucial: Permissions errors will show up here.
            // If you see "Missing or insufficient permissions" here, that's the problem!
            showAlert(`Permission denied for child module ${childId}. Check Firestore Rules.`, true);
            return null; // Ensure null is returned on error to prevent breaking Promise.all
        }
    });
    const children = (await Promise.all(allChildPromises)).filter(Boolean); // Filter out nulls
   console.log(`DEBUG: Number of valid children fetched for parent ${parentId}: ${children.length}`);
    console.log(`DEBUG: Fetched children data (filtered):`, children);
// Remove any previous "No content" message if present from a previous expansion attempt.
    const existingNoContent = parentLi.nextElementSibling;
    if (existingNoContent && existingNoContent.classList.contains('no-content-message') && parseInt(existingNoContent.dataset.level) === level) {
        existingNoContent.remove();
    }


    if (children.length === 0) {
        console.log(`DEBUG: No actual child documents were retrieved for parent ID: ${parentId}. Displaying 'No content' message.`);
        const noContentLi = document.createElement('li');
        noContentLi.textContent = `(No content found or could be loaded for this module)`;
        noContentLi.className = `module-item level-${level} no-content-message`;
        parentLi.after(noContentLi);
    } else {
    const tempDiv = document.createElement('div'); // Use a temp div to build children before inserting
    children.forEach(childData => {
        const childLi = renderModuleListItem(childData, level, selectedModuleIds);
        tempDiv.appendChild(childLi);
    });

   // --- NEW INSERTION LOGIC START ---
        // We will insert each child LI one by one, immediately after the previous one inserted,
        // starting after the parentLi.

        let currentNodeToInsertAfter = parentLi; // Start inserting immediately after the parent <li>

        // Use Array.from to get a real array of children from the tempDiv
        Array.from(tempDiv.children).forEach(childElement => {
            // Insert the current childElement immediately after currentNodeToInsertAfter
            currentNodeToInsertAfter.after(childElement);
            // Update currentNodeToInsertAfter to the element we just inserted,
            // so the next child is inserted after *it*.
            currentNodeToInsertAfter = childElement;
        });  console.log(`DEBUG: Children rendered for parent ${parentId}.`);
	}
}

/**
 * Loads all relevant modules for the larger list view.
 * This includes LESSONs (for COURSE building) and all selectable items from learningContent.
 */
async function loadAllAvailableModules() {
    showSpinner(availableModulesList);
    if (availableModulesList) { // Safety check before clearing innerHTML
        availableModulesList.innerHTML = ''; // Clear previous content
    }


    try {
        const allFetchedModules = [];

        // 1. Fetch all COURSEs
        const coursesSnapshot = await db.collection('COURSE').get();
        coursesSnapshot.forEach(doc => {
            console.log(`DEBUG (loadAllAvailableModules - COURSE): ID: ${doc.id}, Image: ${doc.data().IMAGEURL}, Audio: ${doc.data().audioUrl}`);
            allFetchedModules.push({ id: doc.id, ...doc.data(), MODULETYPE: 'COURSE' });
        });

        // 2. Fetch all LESSONs
        const lessonsSnapshot = await db.collection('LESSON').get();
        lessonsSnapshot.forEach(doc => {
            console.log(`DEBUG (loadAllAvailableModules - LESSON): ID: ${doc.id}, Image: ${doc.data().IMAGEURL}, Audio: ${doc.data().audioUrl}`);
            allFetchedModules.push({ id: doc.id, ...doc.data(), MODULETYPE: 'LESSON' });
        });

        // 3. Fetch all selectable items from learningContent (SEMANTIC_GROUP, VOCABULARY_GROUP, etc.)
        // This is where your new module types (GRAMMAR, CONVERSATION, etc.) will be picked up,
        // as they reside in 'learningContent' and are not in NON_SELECTABLE_LEAF_MODULE_TYPES.
        const learningContentSnapshot = await db.collection('learningContent').get();
        learningContentSnapshot.forEach(doc => {
             // Only include if it's a known parent type or a specific item type
            const data = doc.data();
            if (data.MODULETYPE && !NON_SELECTABLE_LEAF_MODULE_TYPES.includes(data.MODULETYPE)) {
                 console.log(`DEBUG (loadAllAvailableModules - learningContent): ID: ${doc.id}, Type: ${data.MODULETYPE}, Image: ${data.IMAGEURL}, Audio: ${data.audioUrl}`);
                 allFetchedModules.push({ id: doc.id, ...data });
            }
        });

        // At this stage, we are not pre-fetching syllabes or phonemes as they are non-selectable leaves
        // They will be fetched on demand when their parent VOCABULARY or SYLLABLE is expanded.

        allAvailableModules = allFetchedModules; // Store for filtering/searching
        displayFilteredModules(); // Display initially without filters

    } catch (error) {
        console.error("Error loading all available modules:", error);
        showAlert("Failed to load available modules. " + error.message, true);
    } finally {
        hideSpinner(availableModulesList);
    }
}

/**
 * Displays modules in the larger list view based on current filters and search.
 * It uses the 'allAvailableModules' global array.
 */
function displayFilteredModules() {
    if (availableModulesList) { // Safety check before clearing innerHTML
        availableModulesList.innerHTML = ''; // Clear current display
    }

    const filterType = filterModuleTypeSelect ? filterModuleTypeSelect.value : 'all'; // Safety check
    const searchTerm = searchModulesInput ? searchModulesInput.value.toLowerCase() : ''; // Safety check


    // Get the ID of the currently active record. If no record is active, this will be null.
    const activeRecordId = currentActiveRecord ? currentActiveRecord.id : null;

    // currentModuleIds seems to be for indicating which children are already linked,
    // not for filtering the *available* list itself.
    const currentModuleIds = currentActiveRecord && currentActiveRecord.MODULEID_ARRAY ? currentActiveRecord.MODULEID_ARRAY : [];

    let modulesToShow = [...allAvailableModules]; // Start with a copy of all fetched modules

    // If the active record is a COURSE, filter to show only LESSONs
    if (currentActiveRecord && currentActiveRecord.MODULETYPE === 'COURSE') {
        modulesToShow = modulesToShow.filter(module => module.MODULETYPE === 'LESSON');
        // Optionally, reset the filter dropdown and disable it to guide the user
        if (filterModuleTypeSelect) { // Safety check
            filterModuleTypeSelect.value = 'LESSON';
            filterModuleTypeSelect.disabled = true;
        }
    } else {
        // If not a COURSE, ensure the filter dropdown is enabled
        if (filterModuleTypeSelect) { // Safety check
            filterModuleTypeSelect.disabled = false;
            // If the current filter is 'LESSON' from a previous COURSE context, reset it to 'all'
            // unless the user has explicitly selected 'LESSON'
            // This logic might need further refinement based on how you manage parent-child relationships
            // for other module types. For now, keeping it as is.
            if (filterModuleTypeSelect.value === 'LESSON' && !currentActiveRecord) { // Or based on other parent types
                filterModuleTypeSelect.value = 'all'; // Reset to show all selectable types
            }
        }
    }

    const filtered = modulesToShow.filter(module => {
        const matchesType = (filterType === 'all' || module.MODULETYPE === filterType);
        const matchesSearch = (module.TITLE || '').toLowerCase().includes(searchTerm) ||
                              (module.name || '').toLowerCase().includes(searchTerm);

        // *** NEW LOGIC: Exclude the currently active record ***
        // If there's an active record AND its ID matches the current module's ID,
        // then this module should NOT be included in the 'filtered' list.
        const isCurrentActiveRecord = (activeRecordId && module.id === activeRecordId);

        return matchesType && matchesSearch && !isCurrentActiveRecord;
    });

    if (filtered.length === 0) {
        // Updated message for clarity
        if (availableModulesList) { // Safety check
            availableModulesList.innerHTML = `<li class="loading-placeholder">No modules found matching criteria or available for selection.</li>`;
        }
        return;
    }

    filtered.forEach(moduleData => {
        // This is where renderModuleListItem comes in, it will likely render
        // the actual selectable items including the checkbox.
        const li = renderModuleListItem(moduleData, 0, currentModuleIds); // Level 0 for top-level modules
        if (availableModulesList) { // Safety check before appending
            availableModulesList.appendChild(li);
        }


        // Add event listener for checkbox changes
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.disabled) {
            checkbox.addEventListener('change', (event) => {
                const moduleId = event.target.dataset.moduleId;
                if (event.target.checked) {
                    addModuleToActiveRecordSelection(moduleId);
                } else {
                    removeModuleFromActiveRecordSelection(moduleId);
                }
            });
        }
    });
}

/**
 * Adds a module ID to the current active record's selection.
 * @param {string} moduleId The ID of the module to add.
 */
function addModuleToActiveRecordSelection(moduleId) {
    if (currentActiveRecord) {
        if (!currentActiveRecord.MODULEID_ARRAY) {
            currentActiveRecord.MODULEID_ARRAY = [];
        }
        if (!currentActiveRecord.MODULEID_ARRAY.includes(moduleId)) {
            currentActiveRecord.MODULEID_ARRAY.push(moduleId);
            updateCurrentChildrenDisplay(); // Update display immediately
            console.log(`Added ${moduleId} to currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

/**
 * Removes a module ID from the current active record's selection.
 * @param {string} moduleId The ID of the module to remove.
 */
function removeModuleFromActiveRecordSelection(moduleId) {
    if (currentActiveRecord && currentActiveRecord.MODULEID_ARRAY) {
        const index = currentActiveRecord.MODULEID_ARRAY.indexOf(moduleId);
        if (index > -1) {
            currentActiveRecord.MODULEID_ARRAY.splice(index, 1);
            updateCurrentChildrenDisplay(); // Update display immediately
            console.log(`Removed ${moduleId} from currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

// --- Single Record View Logic ---

function loadRecordIntoEditor(recordData, collectionName = null) {
    currentActiveRecord = recordData; // Set the global currentActiveRecord

    if (recordData) {
        // --- Populating fields for an existing record ---
        if (activeRecordIdInput) activeRecordIdInput.value = recordData.id || ''; // Safety check
        if (activeRecordCollectionInput) activeRecordCollectionInput.value = collectionName || ''; // Set the collection name for the active record // Safety check

        // Module Type selection
        if (activeRecordTypeSelect) { // Safety check
            activeRecordTypeSelect.value = recordData.MODULETYPE || '';
            activeRecordTypeSelect.disabled = true; // Disable editing type for existing records
        }
        if (newRecordTypeSelectorGroup) newRecordTypeSelectorGroup.classList.remove('hidden'); // Ensure visible for existing records too, just disabled // Safety check

        // Basic fields
        if (recordTitleInput) recordTitleInput.value = recordData.TITLE || recordData.name || ''; // Safety check
        if (recordDescriptionTextarea) recordDescriptionTextarea.value = recordData.DESCRIPTION || ''; // Safety check

        // Conditional fields and their visibility:

        // 1. THEME field
        const typesWithTheme = [
            'COURSE',
            'LESSON',
            'VOCABULARY_GROUP',
            'VOCABULARY'
        ];
        if (recordData.MODULETYPE && typesWithTheme.includes(recordData.MODULETYPE)) {
            if (recordThemeInput) recordThemeInput.value = recordData.THEME || ''; // Safety check
            if (themeFields) themeFields.forEach(el => el.classList.remove('hidden')); // Show theme fields // Safety check
        } else {
            if (recordThemeInput) recordThemeInput.value = ''; // Clear value if not applicable // Safety check
            if (themeFields) themeFields.forEach(el => el.classList.add('hidden')); // Hide theme fields // Safety check
        }

        // 2. Image Status field
        const typesWithImageStatus = [
            'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY',
            'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING' // Corrected typo here
        ];
        if (recordData.MODULETYPE && typesWithImageStatus.includes(recordData.MODULETYPE)) {
            if (imageStatusSelect) imageStatusSelect.value = recordData.imageStatus || 'needs_review'; // Safety check
            if (imageStatusFields) imageStatusFields.forEach(el => el.classList.remove('hidden')); // Show image status fields // Safety check
        } else {
            if (imageStatusSelect) imageStatusSelect.value = ''; // Clear value if not applicable // Safety check
            if (imageStatusFields) imageStatusFields.forEach(el => el.classList.add('hidden')); // Hide image status fields // Safety check
        }

        // 3. CEFR field
        const typesWithCEFR = [
            'LESSON', 'SEMANTIC_GROUP', 'GRAMMAR', 'CONVERSATION',
            'READING-WRITING', 'LISTENINGSPEAKING', 'VOCABULARY_GROUP', 'VOCABULARY'
        ];
        if (recordData.MODULETYPE && typesWithCEFR.includes(recordData.MODULETYPE)) {
            if (cefrInput) cefrInput.value = recordData.CEFR || ''; // Safety check
            if (cefrFields) cefrFields.forEach(el => el.classList.remove('hidden')); // Show CEFR fields // Safety check
        } else {
            if (cefrInput) cefrInput.value = ''; // Clear value if not applicable // Safety check
            if (cefrFields) cefrFields.forEach(el => el.classList.add('hidden')); // Hide CEFR fields // Safety check
        }

        // 4. MEANING_ORIGIN field
        const typesWithMeaningOrigin = ['VOCABULARY_GROUP', 'VOCABULARY']; // Define where MEANING_ORIGIN applies
        if (recordData.MODULETYPE && typesWithMeaningOrigin.includes(recordData.MODULETYPE)) {
            if (meaningOriginInput) meaningOriginInput.value = recordData.MEANING_ORIGIN || ''; // Safety check
            if (meaningOriginFields) meaningOriginFields.forEach(el => el.classList.remove('hidden')); // Show Meaning Origin fields // Safety check
        } else {
            if (meaningOriginInput) meaningOriginInput.value = ''; // Clear value if not applicable // Safety check
            if (meaningOriginFields) meaningOriginFields.forEach(el => el.classList.add('hidden')); // Hide Meaning Origin fields // Safety check
        }

        // Button text and visibility for existing record
        if (saveRecordBtn) saveRecordBtn.textContent = 'Update Module'; // Safety check
        if (deleteRecordBtn) deleteRecordBtn.style.display = 'inline-block'; // Safety check

    } else {
        // --- Clearing and setting defaults for a new record ---
        if (activeRecordIdInput) activeRecordIdInput.value = ''; // Clear ID for new record // Safety check

        // For new records, enable the type select and default to COURSE
        if (activeRecordTypeSelect) { // Safety check
            activeRecordTypeSelect.value = 'COURSE'; // Default new record to COURSE
            activeRecordTypeSelect.disabled = false; // Enable type selection
        }
        if (newRecordTypeSelectorGroup) newRecordTypeSelectorGroup.classList.remove('hidden'); // Ensure visible for new records // Safety check

        // Set the hidden collection input based on the default selected type (COURSE)
        if (activeRecordCollectionInput && activeRecordTypeSelect && moduleTypes[activeRecordTypeSelect.value]) { // More robust safety check
             activeRecordCollectionInput.value = moduleTypes[activeRecordTypeSelect.value];
        }


        // Clear all input fields
        if (recordTitleInput) recordTitleInput.value = ''; // Safety check
        if (recordDescriptionTextarea) recordDescriptionTextarea.value = ''; // Safety check
        if (recordThemeInput) recordThemeInput.value = ''; // Safety check
        if (imageStatusSelect) imageStatusSelect.value = ''; // Safety check
        if (cefrInput) cefrInput.value = ''; // Safety check
        if (meaningOriginInput) meaningOriginInput.value = ''; // Safety check

        // Set initial visibility for conditional fields based on default 'COURSE' type
        if (themeFields) themeFields.forEach(el => el.classList.remove('hidden')); // COURSE has theme // Safety check
        if (imageStatusFields) imageStatusFields.forEach(el => el.classList.add('hidden')); // COURSE does not have image status // Safety check
        if (cefrFields) cefrFields.forEach(el => el.classList.add('hidden')); // COURSE does not have CEFR // Safety check
        if (meaningOriginFields) meaningOriginFields.forEach(el => el.classList.add('hidden')); // COURSE does not have Meaning Origin // Safety check

        // Button text and visibility for new record
        if (saveRecordBtn) saveRecordBtn.textContent = 'Create Module'; // Safety check
        if (deleteRecordBtn) deleteRecordBtn.style.display = 'none'; // Safety check
    }

    // Always update these after record data is loaded/cleared
    updateCurrentChildrenDisplay();
    displayFilteredModules();
    // LATEST FIX 7/8/5: Update the Classroom button state after loading/clearing a record
    updateClassroomButtonState();
}


/**
 * Updates the 'Currently Included Modules' list based on currentActiveRecord.MODULEID_ARRAY.
 */
async function updateCurrentChildrenDisplay() {
    if (currentChildrenDisplay) { // Safety check before clearing innerHTML
        currentChildrenDisplay.innerHTML = '';
    }

    if (!currentActiveRecord || !currentActiveRecord.MODULEID_ARRAY || currentActiveRecord.MODULEID_ARRAY.length === 0) {
        if (currentChildrenDisplay) { // Safety check
            currentChildrenDisplay.innerHTML = `<li>No modules included yet.</li>`;
        }
        return;
    }

    // Fetch the actual titles of the children for display
    const childPromises = currentActiveRecord.MODULEID_ARRAY.map(async (childId) => {
        // This is a simplified fetch; in a more robust app, you might know the child's type
        // and target its specific collection. For now, we'll iterate through common collections.
        let docRef = db.collection('LESSON').doc(childId);
        let docSnap = await docRef.get();
        if (!docSnap.exists) {
            docRef = db.collection('learningContent').doc(childId);
            docSnap = await docRef.get();
        }
        // Add more collection checks if needed for other child types (syllables, phonemes)
        // that could somehow end up in MODULEID_ARRAY (though design suggests not for parents)

        if (docSnap.exists) {
            const data = docSnap.data();
            return { id: docSnap.id, title: data.TITLE || data.name, type: data.MODULETYPE };
        }
        return { id: childId, title: 'Unknown Module (ID: ' + childId + ')', type: 'Unknown' };
    });

    const childrenDetails = await Promise.all(childPromises);

    childrenDetails.forEach(child => {
        const li = document.createElement('li');
        li.textContent = `${child.title} (${child.type})`;
        if (currentChildrenDisplay) { // Safety check before appending
            currentChildrenDisplay.appendChild(li);
        }
    });
}

/**
 * Saves (creates or updates) the active record in Firestore.
 */
async function saveRecord() {
    // Retrieve values from the form elements
    const recordId = activeRecordIdInput ? activeRecordIdInput.value : null; // Safety check
    const recordCollection = activeRecordCollectionInput ? activeRecordCollectionInput.value : null; // Safety check
    const recordType = activeRecordTypeSelect ? activeRecordTypeSelect.value : null; // Safety check
    const title = recordTitleInput ? recordTitleInput.value.trim() : ''; // Safety check
    const theme = recordThemeInput ? recordThemeInput.value.trim() : ''; // Safety check
    const description = recordDescriptionTextarea ? recordDescriptionTextarea.value.trim() : ''; // Safety check

    // Basic validation
    if (!title) {
        showAlert('Title cannot be empty!', true);
        return;
    }
    if (!recordCollection || !recordType) {
        showAlert('Collection and Module Type are missing! This should not happen.', true);
        return;
    }

    // Prepare data object for saving to Firestore
    const dataToSave = {
        TITLE: title,
        DESCRIPTION: description,
        MODULETYPE: recordType,
        // Ensure MODULEID_ARRAY exists, cloning if currentActiveRecord has it
        MODULEID_ARRAY: currentActiveRecord && currentActiveRecord.MODULEID_ARRAY ? [...currentActiveRecord.MODULEID_ARRAY] : []
    };

    // Conditionally add THEME if the module type supports it
    if (recordType === 'COURSE' || recordType === 'LESSON') {
        dataToSave.THEME = theme;
    }

    // Conditionally add imageStatus if the module type supports it
    const typesWithImageStatus = [
        'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY',
        'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING' // Corrected typo here
    ];
    if (typesWithImageStatus.includes(recordType)) {
        if (imageStatusSelect) dataToSave.imageStatus = imageStatusSelect.value; // Safety check
    }

    // IMPORTANT: As per your clarification, IMAGEURL and audioUrl are NOT user-editable
    // and thus not part of dataToSave being gathered from form inputs.
    // They are assumed to exist in the Firestore document if needed for display.
    // If they were edited or provided by the user in hidden inputs etc.,
    // you would add them here. For now, they are omitted as per your instructions.

    try {
        if (recordId) {
            // --- Update Existing Record ---
            const docRef = db.collection(recordCollection).doc(recordId);
            await docRef.update(dataToSave);
            showAlert('Module updated successfully!');
            console.log("Updated record:", recordId, dataToSave);

            // Update currentActiveRecord global state to reflect the latest changes
            // **Crucial**: When updating currentActiveRecord, ensure to carry over properties
            // like IMAGEURL and audioUrl if they exist and are not part of dataToSave.
            // This ensures they persist in your local model even if not updated.
            currentActiveRecord = {
                ...currentActiveRecord, // Keep existing properties (like IMAGEURL, audioUrl)
                ...dataToSave           // Overlay with updated properties
            };

            // Refresh the top-level navigation list and update current index
            await fetchAndPopulateTopLevelNavigation();
            const updatedIndex = topLevelModuleNavigationList.findIndex(m => m.id === recordId);
            if (updatedIndex !== -1) {
                currentTopLevelModuleIndex = updatedIndex;
                updateNavigationButtons();
            }

        } else {
            // --- Create New Record ---
            const docRef = await db.collection(recordCollection).add(dataToSave);
            const newRecordId = docRef.id;

            // Update form fields with the new ID
            if (activeRecordIdInput) activeRecordIdInput.value = newRecordId; // Safety check

            // Update currentActiveRecord global state for the newly created record
            // For a new record, these are the initial properties.
            currentActiveRecord = { id: newRecordId, ...dataToSave, collection: recordCollection };
            showAlert('Module created successfully!');
            console.log("Created new record with ID:", newRecordId, dataToSave);

            // Refresh the top-level navigation list and select the newly created record
            await fetchAndPopulateTopLevelNavigation();
            const newIndex = topLevelModuleNavigationList.findIndex(m => m.id === newRecordId);
            if (newIndex !== -1) {
                currentTopLevelModuleIndex = newIndex;
                updateNavigationButtons();
                // Optionally, re-load the record into the editor to ensure all fields are fresh
                // loadRecordIntoEditor(currentActiveRecord, recordCollection);
            }
        }

    } catch (error) {
        console.error('Error saving record:', error);
        showAlert(`Error saving module: ${error.message}`, true);
    }
}

/**
 * Deletes the currently active record from Firestore.
 */
async function deleteRecord() {
    if (!currentActiveRecord || !currentActiveRecord.id) {
        showAlert('No module selected for deletion.', true);
        return;
    }

    const confirmDelete = confirm(`Are you sure you want to delete "${currentActiveRecord.TITLE}"? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
        await db.collection(currentActiveRecord.collection).doc(currentActiveRecord.id).delete();
        showAlert('Module deleted successfully!');
        console.log("Deleted record:", currentActiveRecord.id);

        // After deletion, load the "new record" state or the next available record
        // **NOTE**: Changed fetchAndPopulateCourseNavigation to fetchAndPopulateTopLevelNavigation
        // as per your current structure
        await fetchAndPopulateTopLevelNavigation(); // Refresh navigation list
        if (topLevelModuleNavigationList.length > 0) {
            currentTopLevelModuleIndex = Math.min(currentTopLevelModuleIndex, topLevelModuleNavigationList.length - 1);
            const nextModule = filteredNavigationList[currentTopLevelModuleIndex]; // Use filteredNavigationList here
            // Ensure nextModule is valid before trying to load
            if (nextModule) {
                 const nextModuleSnap = await db.collection(nextModule.collection).doc(nextModule.id).get();
                 if (nextModuleSnap.exists) {
                    loadRecordIntoEditor({ id: nextModuleSnap.id, ...nextModuleSnap.data() }, nextModule.collection);
                 } else {
                    loadRecordIntoEditor(null); // Fallback if next module doesn't exist
                 }
            } else {
                 loadRecordIntoEditor(null); // No next module, show new record form
            }
        } else {
            loadRecordIntoEditor(null); // No modules left, show new record form
        }
        updateNavigationButtons();

    } catch (error) {
        console.error('Error deleting record:', error);
        showAlert(`Error deleting module: ${error.message}`, true);
    }
}


// --- NEW FUNCTION: Populate the filter dropdown with unique module types ---
function populateModuleTypeFilter() {
    // Clear existing options except 'ALL'
    if (moduleTypeFilterSelect) { // Safety check
        moduleTypeFilterSelect.innerHTML = '<option value="ALL">All Module Types</option>';

        const uniqueModuleTypes = new Set();
        topLevelModuleNavigationList.forEach(module => {
            uniqueModuleTypes.add(module.MODULETYPE);
        });

        // Sort the types alphabetically for a cleaner dropdown
        const sortedTypes = Array.from(uniqueModuleTypes).sort();

        sortedTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            // Make the text more readable (e.g., SEMANTIC_GROUP becomes Semantic Group)
            option.textContent = type.replace(/_/g, ' ');
            moduleTypeFilterSelect.appendChild(option);
        });

        // Add event listener so that when the selection changes, we apply the filter
        moduleTypeFilterSelect.addEventListener('change', applyModuleTypeFilter);
    }
}


// --- NEW FUNCTION: Apply the selected filter and update the navigation ---
async function applyModuleTypeFilter() {
    const selectedFilterType = moduleTypeFilterSelect ? moduleTypeFilterSelect.value : 'ALL'; // Safety check

    if (selectedFilterType === 'ALL') {
        // If 'ALL' is selected, the filtered list is a copy of the master list
        filteredNavigationList = [...topLevelModuleNavigationList];
    } else {
        // Otherwise, filter the master list by the selected MODULETYPE
        filteredNavigationList = topLevelModuleNavigationList.filter(module => {
            return module.MODULETYPE === selectedFilterType;
            // The magic: Since fetchAndPopulateTopLevelNavigation already correctly assigns
            // 'collection' (e.g., 'COURSE' for COURSE, 'learningContent' for SEMANTIC_GROUP),
            // simply filtering by MODULETYPE automatically handles your collection-specific request!
        });
    }

    // After filtering, we need to reset our current index to the beginning of the new list
    currentTopLevelModuleIndex = 0;

    // Load the first record from this new filtered list, or clear the editor if the list is empty
    if (filteredNavigationList.length > 0) {
        const firstModule = filteredNavigationList[currentTopLevelModuleIndex];
        const moduleSnap = await db.collection(firstModule.collection).doc(firstModule.id).get();
        if (moduleSnap.exists) {
            loadRecordIntoEditor({ id: moduleSnap.id, ...moduleSnap.data() }, firstModule.collection);
        } else {
            // This case should be rare if your data is consistent, but it's a good fallback
            showAlert(`First module of type '${selectedFilterType}' not found in its collection.`, true);
            loadRecordIntoEditor(null); // Clear editor if the first item somehow isn't there
        }
    } else {
        // No records match the selected filter, so clear the editor
        loadRecordIntoEditor(null);
        showAlert(`No records found for module type: ${selectedFilterType}`, false);
    }

    // Finally, update the state of the Prev/Next buttons
    updateNavigationButtons();
}

async function fetchAndPopulateTopLevelNavigation() {
    try {
        const allTopLevelModules = [];

        // 1. Fetch all COURSEs
        const coursesSnapshot = await db.collection('COURSE').get();
        coursesSnapshot.forEach(doc => {
            console.log(`DEBUG (fetchAndPopulateTopLevelNavigation - COURSE): ID: ${doc.id}, Image: ${doc.data().IMAGEURL}, Audio: ${doc.data().audioUrl}`);
            allTopLevelModules.push({ id: doc.id, ...doc.data(), MODULETYPE: 'COURSE', collection: 'COURSE' });
        });

        // 2. Fetch all LESSONs
        const lessonsSnapshot = await db.collection('LESSON').get();
        lessonsSnapshot.forEach(doc => {
            console.log(`DEBUG (fetchAndPopulateTopLevelNavigation - LESSON): ID: ${doc.id}, Image: ${doc.data().IMAGEURL}, Audio: ${doc.data().audioUrl}`);
            allTopLevelModules.push({ id: doc.id, ...doc.data(), MODULETYPE: 'LESSON', collection: 'LESSON' });
        });

        // 3. Fetch top-level types from learningContent
        // These are modules that can act as independent top-level entities, not just children.
        const topLevelLearningContentTypes = [
            'SEMANTIC_GROUP', 'VOCABULARY', 'VOCABULARY_GROUP', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING' // Corrected typo here
            // Add other learningContent types here if they can be edited as top-level entities
        ];
        const learningContentSnapshot = await db.collection('learningContent').get();
        learningContentSnapshot.forEach(doc => {
            const data = doc.data();
            if (topLevelLearningContentTypes.includes(data.MODULETYPE)) {
                console.log(`DEBUG (fetchAndPopulateTopLevelNavigation - learningContent): ID: ${doc.id}, Type: ${data.MODULETYPE}, Image: ${data.IMAGEURL}, Audio: ${data.audioUrl}`);
                allTopLevelModules.push({ id: doc.id, ...data, collection: 'learningContent' });
            }
        });

        // Sort the combined list (e.g., alphabetically by title)
        allTopLevelModules.sort((a, b) => (a.TITLE || '').localeCompare(b.TITLE || ''));

        topLevelModuleNavigationList = allTopLevelModules;
        updateNavigationButtons();
    } catch (error) {
        console.error("Error fetching top-level navigation:", error);
        showAlert("Failed to load top-level navigation. " + error.message, true);
    }
}

/**
 * Updates the disabled state of Prev/Next buttons.
 */
// --- MODIFIED: updateNavigationButtons function ---
// This function now uses 'filteredNavigationList' to determine button states
function updateNavigationButtons() {
    // **CRUCIAL CHANGE: Add safety checks for prevRecordBtn and nextRecordBtn**
    if (prevRecordBtn) {
        prevRecordBtn.disabled = currentTopLevelModuleIndex <= 0;
    } else {
        console.warn("Prev button (prevRecordBtn) not found for updateNavigationButtons.");
    }

    if (nextRecordBtn) {
        nextRecordBtn.disabled = currentTopLevelModuleIndex >= filteredNavigationList.length - 1;
    } else {
        console.warn("Next button (nextRecordBtn) not found for updateNavigationButtons.");
    }

    // Also disable if the filtered list is empty
    if (filteredNavigationList.length === 0) {
        if (prevRecordBtn) prevRecordBtn.disabled = true;
        if (nextRecordBtn) nextRecordBtn.disabled = true;
    }
}

// **REMOVED ALL THESE EVENT LISTENER BLOCKS (They have been moved into the DOMContentLoaded block at the beginning):**
/*
// --- Event Listeners for Single Record View Buttons ---
newRecordBtn.addEventListener('click', () => { ... });
prevRecordBtn.addEventListener('click', async () => { ... });
nextRecordBtn.addEventListener('click', async () => { ... });
saveRecordBtn.addEventListener('click', saveRecord);
deleteRecordBtn.addEventListener('click', deleteRecord);
activeRecordTypeSelect.addEventListener('change', () => { ... });
*/
