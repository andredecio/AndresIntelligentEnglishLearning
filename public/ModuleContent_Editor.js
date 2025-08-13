// js/ModuleContent_Editor.js
// Handles the single record editor view: loading, saving, and deleting module records.

// Import necessary Firebase services from our centralized setup.
import { db, auth } from './firebase-services.js';
// Import UI utility functions.
import { showAlert, renderThumbnail, renderAudioPlayer } from './ui-utilities.js';
// Import functions from ModuleContent_Classroom.js for updating its UI state.
import { updateClassroomButtonState } from './ModuleContent_Classroom.js';


// --- Internal Module-Specific Constants and DOM Element References ---
// These are internal to the editor module. They will be initialized via a setup function.
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
let saveRecordBtn = null;
let deleteRecordBtn = null;
let currentChildrenDisplay = null; // This is used for displaying selected children within the editor
let generateClassroomBtn = null;   // Needed for updateClassroomButtonState call

// Store the current record being edited internally
let currentActiveRecordInternal = null;

// The moduleTypes constant from your original ModuleContent.js
const moduleTypes = {
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
    'LISTENINGSPEAKING': 'learningContent',
};

// Lists of module types that determine conditional field visibility.
// These are defined here as they are directly tied to editor logic.
const PARENT_MODULE_TYPES = ['COURSE', 'LESSON', 'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY', 'SYLLABLE'];
const typesWithTheme = ['COURSE', 'LESSON', 'VOCABULARY_GROUP', 'VOCABULARY'];
const typesWithImageStatus = ['SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING'];
const typesWithCEFR = ['LESSON', 'SEMANTIC_GROUP', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING', 'VOCABULARY_GROUP', 'VOCABULARY'];
const typesWithMeaningOrigin = ['VOCABULARY_GROUP', 'VOCABULARY'];


// --- Callbacks to Orchestrator (ModuleContent.js) ---
// These functions will be provided by the main ModuleContent.js to allow Editor.js
// to trigger actions in other modules (like refreshing the list view).
let onRecordSavedCallback = () => {};
let onRecordDeletedCallback = () => {};


/**
 * Initializes the editor module by assigning DOM elements and setting up event listeners.
 * @param {object} elements - An object containing references to the editor's DOM elements.
 * @param {object} callbacks - An object containing callback functions for inter-module communication.
 */
export function setupEditor(elements, callbacks) {
    // Assign DOM elements
    activeRecordIdInput = elements.activeRecordIdInput;
    activeRecordCollectionInput = elements.activeRecordCollectionInput;
    activeRecordTypeSelect = elements.activeRecordTypeSelect;
    newRecordTypeSelectorGroup = elements.newRecordTypeSelectorGroup;
    recordTitleInput = elements.recordTitleInput;
    recordDescriptionTextarea = elements.recordDescriptionTextarea;
    recordThemeInput = elements.recordThemeInput;
    themeFields = elements.themeFields;
    imageStatusSelect = elements.imageStatusSelect;
    imageStatusFields = elements.imageStatusFields;
    cefrInput = elements.cefrInput;
    cefrFields = elements.cefrFields;
    meaningOriginInput = elements.meaningOriginInput;
    meaningOriginFields = elements.meaningOriginFields;
    saveRecordBtn = elements.saveRecordBtn;
    deleteRecordBtn = elements.deleteRecordBtn;
    currentChildrenDisplay = elements.currentChildrenDisplay;
    generateClassroomBtn = elements.generateClassroomBtn; // Needed for updateClassroomButtonState


    // Assign callbacks
    onRecordSavedCallback = callbacks.onRecordSaved;
    onRecordDeletedCallback = callbacks.onRecordDeleted;


    // Set up event listeners for the editor buttons
    if (saveRecordBtn) saveRecordBtn.addEventListener('click', saveRecord);
    if (deleteRecordBtn) deleteRecordBtn.addEventListener('click', deleteRecord);

    // activeRecordTypeSelect change listener (for new records)
    if (activeRecordTypeSelect) {
        activeRecordTypeSelect.addEventListener('change', () => {
            // This listener should only act when the select is enabled (i.e., for new records)
            if (!activeRecordTypeSelect.disabled) {
                const selectedType = activeRecordTypeSelect.value;

                // Update the hidden collection input based on the selected module type
                if (activeRecordCollectionInput && moduleTypes[selectedType]) {
                    activeRecordCollectionInput.value = moduleTypes[selectedType];
                }

                // Adjust visibility of conditional fields based on the newly selected type
                toggleConditionalFields(selectedType);

                // Update the Classroom button state
                updateClassroomButtonState(selectedType, generateClassroomBtn, activeRecordTypeSelect);
            }
        });
    }
}

/**
 * Toggles the visibility of conditional fields (Theme, Image Status, CEFR, Meaning Origin)
 * based on the selected module type.
 * @param {string} moduleType - The type of module (e.g., 'COURSE', 'VOCABULARY').
 */
function toggleConditionalFields(moduleType) {
    // Theme field logic
    const isThemeRelevant = typesWithTheme.includes(moduleType);
    if (themeFields) themeFields.forEach(el => el.classList[isThemeRelevant ? 'remove' : 'add']('hidden'));
    if (!isThemeRelevant && recordThemeInput) recordThemeInput.value = '';

    // Image Status field logic
    const isImageStatusRelevant = typesWithImageStatus.includes(moduleType);
    if (imageStatusFields) imageStatusFields.forEach(el => el.classList[isImageStatusRelevant ? 'remove' : 'add']('hidden'));
    if (!isImageStatusRelevant && imageStatusSelect) imageStatusSelect.value = '';

    // CEFR field logic
    const isCEFRRelevant = typesWithCEFR.includes(moduleType);
    if (cefrFields) cefrFields.forEach(el => el.classList[isCEFRRelevant ? 'remove' : 'add']('hidden'));
    if (!isCEFRRelevant && cefrInput) cefrInput.value = '';

    // Meaning Origin field logic
    const isMeaningOriginRelevant = typesWithMeaningOrigin.includes(moduleType);
    if (meaningOriginFields) meaningOriginFields.forEach(el => el.classList[isMeaningOriginRelevant ? 'remove' : 'add']('hidden'));
    if (!isMeaningOriginRelevant && meaningOriginInput) meaningOriginInput.value = '';
}


/**
 * Loads a record's data into the editor form, or clears the form for a new record.
 * @param {object | null} recordData - The Firestore document data (with 'id' property), or null for a new record.
 * @param {string | null} collectionName - The name of the Firestore collection the record belongs to.
 */
export function loadRecordIntoEditor(recordData, collectionName = null) {
    currentActiveRecordInternal = recordData; // Set the internal global state for the editor

    if (recordData) {
        // --- Populating fields for an existing record ---
        if (activeRecordIdInput) activeRecordIdInput.value = recordData.id || '';
        if (activeRecordCollectionInput) activeRecordCollectionInput.value = collectionName || '';

        // Module Type selection
        if (activeRecordTypeSelect) {
            activeRecordTypeSelect.value = recordData.MODULETYPE || '';
            activeRecordTypeSelect.disabled = true; // Disable editing type for existing records
        }
        if (newRecordTypeSelectorGroup) newRecordTypeSelectorGroup.classList.remove('hidden');

        // Basic fields
        if (recordTitleInput) recordTitleInput.value = recordData.TITLE || recordData.name || '';
        if (recordDescriptionTextarea) recordDescriptionTextarea.value = recordData.DESCRIPTION || '';

        // Toggle conditional fields based on the loaded record's type
        toggleConditionalFields(recordData.MODULETYPE);

        // Populate conditional fields with existing data
        if (recordThemeInput) recordThemeInput.value = recordData.THEME || '';
        if (imageStatusSelect) imageStatusSelect.value = recordData.imageStatus || 'needs_review';
        if (cefrInput) cefrInput.value = recordData.CEFR || '';
        if (meaningOriginInput) meaningOriginInput.value = recordData.MEANING_ORIGIN || '';

        // Button text and visibility for existing record
        if (saveRecordBtn) saveRecordBtn.textContent = 'Update Module';
        if (deleteRecordBtn) deleteRecordBtn.style.display = 'inline-block';

    } else {
        // --- Clearing and setting defaults for a new record ---
        if (activeRecordIdInput) activeRecordIdInput.value = '';
        currentActiveRecordInternal = null; // Ensure no active record is set

        // For new records, enable the type select and default to COURSE
        if (activeRecordTypeSelect) {
            activeRecordTypeSelect.value = 'COURSE'; // Default new record to COURSE
            activeRecordTypeSelect.disabled = false; // Enable type selection
        }
        if (newRecordTypeSelectorGroup) newRecordTypeSelectorGroup.classList.remove('hidden');

        // Set the hidden collection input based on the default selected type (COURSE)
        if (activeRecordCollectionInput && activeRecordTypeSelect && moduleTypes[activeRecordTypeSelect.value]) {
             activeRecordCollectionInput.value = moduleTypes[activeRecordTypeSelect.value];
        }

        // Clear all input fields
        if (recordTitleInput) recordTitleInput.value = '';
        if (recordDescriptionTextarea) recordDescriptionTextarea.value = '';
        if (recordThemeInput) recordThemeInput.value = '';
        if (imageStatusSelect) imageStatusSelect.value = '';
        if (cefrInput) cefrInput.value = '';
        if (meaningOriginInput) meaningOriginInput.value = '';

        // Set initial visibility for conditional fields based on default 'COURSE' type
        toggleConditionalFields('COURSE');

        // Button text and visibility for new record
        if (saveRecordBtn) saveRecordBtn.textContent = 'Create Module';
        if (deleteRecordBtn) deleteRecordBtn.style.display = 'none';
    }

    // Always update these after record data is loaded/cleared
    updateCurrentChildrenDisplay(); // This function relies on currentActiveRecordInternal
    // The displayFilteredModules() and updateClassroomButtonState() calls are
    // handled by the orchestrator (ModuleContent.js) after calling loadRecordIntoEditor
}


/**
 * Updates the 'Currently Included Modules' list based on currentActiveRecordInternal.MODULEID_ARRAY.
 */
export async function updateCurrentChildrenDisplay() {
    if (currentChildrenDisplay) {
        currentChildrenDisplay.innerHTML = ''; // Clear previous content
    }

    if (!currentActiveRecordInternal || !currentActiveRecordInternal.MODULEID_ARRAY || currentActiveRecordInternal.MODULEID_ARRAY.length === 0) {
        if (currentChildrenDisplay) {
            currentChildrenDisplay.innerHTML = `<li>No modules included yet.</li>`;
        }
        return;
    }

    // Fetch the actual titles of the children for display
    const childPromises = currentActiveRecordInternal.MODULEID_ARRAY.map(async (childId) => {
        let docSnap = null;
        // Try various collections until found or exhausted
        const collectionsToSearch = ['LESSON', 'learningContent', 'syllables', 'phonemes'];
        for (const col of collectionsToSearch) {
            docSnap = await db.collection(col).doc(childId).get();
            if (docSnap.exists) {
                const data = docSnap.data();
                return { id: docSnap.id, title: data.TITLE || data.name, type: data.MODULETYPE };
            }
        }
        return { id: childId, title: 'Unknown Module (ID: ' + childId + ')', type: 'Unknown' };
    });

    const childrenDetails = await Promise.all(childPromises);

    childrenDetails.forEach(child => {
        const li = document.createElement('li');
        li.textContent = `${child.title} (${child.type})`;
        if (currentChildrenDisplay) {
            currentChildrenDisplay.appendChild(li);
        }
    });
}

/**
 * Saves (creates or updates) the active record in Firestore.
 */
async function saveRecord() {
    // Retrieve values from the form elements
    const recordId = activeRecordIdInput ? activeRecordIdInput.value : null;
    const recordCollection = activeRecordCollectionInput ? activeRecordCollectionInput.value : null;
    const recordType = activeRecordTypeSelect ? activeRecordTypeSelect.value : null;
    const title = recordTitleInput ? recordTitleInput.value.trim() : '';
    const theme = recordThemeInput ? recordThemeInput.value.trim() : '';
    const description = recordDescriptionTextarea ? recordDescriptionTextarea.value.trim() : '';
    const imageStatus = imageStatusSelect ? imageStatusSelect.value : null;
    const cefr = cefrInput ? cefrInput.value : null;
    const meaningOrigin = meaningOriginInput ? meaningOriginInput.value : null;

    // Basic validation
    if (!title) {
        showAlert(statusMessageSpan, statusAlert, 'Title cannot be empty!', true); // Pass elements to showAlert
        return;
    }
    if (!recordCollection || !recordType) {
        showAlert(statusMessageSpan, statusAlert, 'Collection and Module Type are missing! This should not happen.', true); // Pass elements to showAlert
        return;
    }

    // Prepare data object for saving to Firestore
    const dataToSave = {
        TITLE: title,
        DESCRIPTION: description,
        MODULETYPE: recordType,
        // Ensure MODULEID_ARRAY exists, cloning if currentActiveRecordInternal has it
        MODULEID_ARRAY: currentActiveRecordInternal && currentActiveRecordInternal.MODULEID_ARRAY ? [...currentActiveRecordInternal.MODULEID_ARRAY] : []
    };

    // Conditionally add fields based on module type
    if (typesWithTheme.includes(recordType)) { dataToSave.THEME = theme; }
    if (typesWithImageStatus.includes(recordType)) { dataToSave.imageStatus = imageStatus; }
    if (typesWithCEFR.includes(recordType)) { dataToSave.CEFR = cefr; }
    if (typesWithMeaningOrigin.includes(recordType)) { dataToSave.MEANING_ORIGIN = meaningOrigin; }

    try {
        if (recordId) {
            // --- Update Existing Record ---
            const docRef = db.collection(recordCollection).doc(recordId);
            await docRef.update(dataToSave);
            showAlert(statusMessageSpan, statusAlert, 'Module updated successfully!', false); // Pass elements to showAlert
            console.log("Updated record:", recordId, dataToSave);

            // Update internal state
            currentActiveRecordInternal = {
                ...currentActiveRecordInternal, // Keep existing properties (like IMAGEURL, audioUrl)
                ...dataToSave           // Overlay with updated properties
            };

        } else {
            // --- Create New Record ---
            const docRef = await db.collection(recordCollection).add(dataToSave);
            const newRecordId = docRef.id;

            // Update form fields with the new ID
            if (activeRecordIdInput) activeRecordIdInput.value = newRecordId;

            // Update internal state
            currentActiveRecordInternal = { id: newRecordId, ...dataToSave, collection: recordCollection };
            showAlert(statusMessageSpan, statusAlert, 'Module created successfully!', false); // Pass elements to showAlert
            console.log("Created new record with ID:", newRecordId, dataToSave);
        }

        // Notify orchestrator that a record was saved (for list refresh, navigation update)
        onRecordSavedCallback(currentActiveRecordInternal);

    } catch (error) {
        console.error('Error saving record:', error);
        showAlert(statusMessageSpan, statusAlert, `Error saving module: ${error.message}`, true); // Pass elements to showAlert
    }
}

/**
 * Deletes the currently active record from Firestore.
 */
async function deleteRecord() {
    if (!currentActiveRecordInternal || !currentActiveRecordInternal.id) {
        showAlert(statusMessageSpan, statusAlert, 'No module selected for deletion.', true); // Pass elements to showAlert
        return;
    }

    const confirmDelete = confirm(`Are you sure you want to delete "${currentActiveRecordInternal.TITLE || currentActiveRecordInternal.id}"? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
        await db.collection(currentActiveRecordInternal.collection).doc(currentActiveRecordInternal.id).delete();
        showAlert(statusMessageSpan, statusAlert, 'Module deleted successfully!', false); // Pass elements to showAlert
        console.log("Deleted record:", currentActiveRecordInternal.id);

        // Notify orchestrator that a record was deleted (for list refresh, navigation update)
        onRecordDeletedCallback();

    } catch (error) {
        console.error('Error deleting record:', error);
        showAlert(statusMessageSpan, statusAlert, `Error deleting module: ${error.message}`, true); // Pass elements to showAlert
    }
}

/**
 * Helper to get the current active record from the editor.
 * Useful for other modules (like ListView) if they need to know what's in the editor.
 */
export function getCurrentActiveRecord() {
    return currentActiveRecordInternal;
}

// NOTE: All renderModuleListItem, fetchAndRenderChildren, loadAllAvailableModules,
// displayFilteredModules, addModuleToActiveRecordSelection, removeModuleFromActiveRecordSelection,
// populateModuleTypeFilter, applyModuleTypeFilter, fetchAndPopulateTopLevelNavigation,
// updateNavigationButtons, showSpinner, hideSpinner are NOT part of editor logic.
// They will be placed in ModuleContent_ListView.js or ui-utilities.js.
