// js/ModuleContent_Editor.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles the single record editor view: loading, saving, and deleting module records.

// Removed: import { db, auth } from './firebase-services.js'; // Confirmed, they are gone
// Removed: import { showAlert, renderThumbnail, renderAudioPlayer } from './ui-utilities.js'; // Confirmed, they are gone
// Removed: import { updateClassroomButtonState } from './ModuleContent_Classroom.js'; // Confirmed, it's gone

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
const PARENT_MODULE_TYPES = ['COURSE', 'LESSON', 'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY', 'SYLLABLE'];
const typesWithTheme = ['COURSE', 'LESSON', 'VOCABULARY_GROUP', 'VOCABULARY'];
const typesWithImageStatus = ['SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING'];
const typesWithCEFR = ['LESSON', 'SEMANTIC_GROUP', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING', 'VOCABULARY_GROUP', 'VOCABULARY'];
const typesWithMeaningOrigin = ['VOCABULARY_GROUP', 'VOCABULARY'];


// --- Callbacks to Orchestrator (ModuleContent.js) ---
let onRecordSavedCallback = () => {};
let onRecordDeletedCallback = () => {};


/**
 * Initializes the editor module by assigning DOM elements and setting up event listeners.
 * @param {object} elements - An object containing references to the editor's DOM elements.
 * @param {object} callbacks - An object containing callback functions for inter-module communication.
 */
function setupEditor(elements, callbacks) {
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
    generateClassroomBtn = elements.generateClassroomBtn;


    // Assign callbacks
    onRecordSavedCallback = callbacks.onRecordSaved;
    onRecordDeletedCallback = callbacks.onRecordDeleted;


    // Set up event listeners for the editor buttons
    if (saveRecordBtn) saveRecordBtn.addEventListener('click', saveRecord);
    if (deleteRecordBtn) deleteRecordBtn.addEventListener('click', deleteRecord);

    // activeRecordTypeSelect change listener (for new records)
    if (activeRecordTypeSelect) {
        activeRecordTypeSelect.addEventListener('change', () => {
            if (!activeRecordTypeSelect.disabled) {
                const selectedType = activeRecordTypeSelect.value;

                if (activeRecordCollectionInput && moduleTypes[selectedType]) {
                    activeRecordCollectionInput.value = moduleTypes[selectedType];
                }

                toggleConditionalFields(selectedType);

                // Assuming updateClassroomButtonState is globally available
                // Corrected: Now accesses window.updateClassroomButtonState
                window.updateClassroomButtonState(selectedType, generateClassroomBtn, activeRecordTypeSelect);
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
    const isThemeRelevant = typesWithTheme.includes(moduleType);
    if (themeFields) themeFields.forEach(el => el.classList[isThemeRelevant ? 'remove' : 'add']('hidden'));
    if (!isThemeRelevant && recordThemeInput) recordThemeInput.value = '';

    const isImageStatusRelevant = typesWithImageStatus.includes(moduleType);
    if (imageStatusFields) imageStatusFields.forEach(el => el.classList[isImageStatusRelevant ? 'remove' : 'add']('hidden'));
    if (!isImageStatusRelevant && imageStatusSelect) imageStatusSelect.value = '';

    const isCEFRRelevant = typesWithCEFR.includes(moduleType);
    if (cefrFields) cefrFields.forEach(el => el.classList[isCEFRRelevant ? 'remove' : 'add']('hidden'));
    if (!isCEFRRelevant && cefrInput) cefrInput.value = '';

    const isMeaningOriginRelevant = typesWithMeaningOrigin.includes(moduleType);
    if (meaningOriginFields) meaningOriginFields.forEach(el => el.classList[isMeaningOriginRelevant ? 'remove' : 'add']('hidden'));
    if (!isMeaningOriginRelevant && meaningOriginInput) meaningOriginInput.value = '';
}


/**
 * Loads a record's data into the editor form, or clears the form for a new record.
 * @param {object | null} recordData - The Firestore document data (with 'id' property), or null for a new record.
 * @param {string | null} collectionName - The name of the Firestore collection the record belongs to.
 */
function loadRecordIntoEditor(recordData, collectionName = null) {
    currentActiveRecordInternal = recordData;

    if (recordData) {
        if (activeRecordIdInput) activeRecordIdInput.value = recordData.id || '';
        if (activeRecordCollectionInput) activeRecordCollectionInput.value = collectionName || '';

        if (activeRecordTypeSelect) {
            activeRecordTypeSelect.value = recordData.MODULETYPE || '';
            activeRecordTypeSelect.disabled = true;
        }
        if (newRecordTypeSelectorGroup) newRecordTypeSelectorGroup.classList.remove('hidden');

        if (recordTitleInput) recordTitleInput.value = recordData.TITLE || recordData.name || '';
        if (recordDescriptionTextarea) recordDescriptionTextarea.value = recordData.DESCRIPTION || '';

        toggleConditionalFields(recordData.MODULETYPE);

        if (recordThemeInput) recordThemeInput.value = recordData.THEME || '';
        // Corrected: Now uses 'recordData.imageStatus' if it exists, otherwise defaults to 'pending'
        if (imageStatusSelect) imageStatusSelect.value = recordData.imageStatus || 'pending';
        if (cefrInput) cefrInput.value = recordData.CEFR || '';
        if (meaningOriginInput) meaningOriginInput.value = recordData.MEANING_ORIGIN || '';

        if (saveRecordBtn) saveRecordBtn.textContent = 'Update Module';
        if (deleteRecordBtn) deleteRecordBtn.style.display = 'inline-block';

    } else {
        if (activeRecordIdInput) activeRecordIdInput.value = '';
        currentActiveRecordInternal = null;

        if (activeRecordTypeSelect) {
            activeRecordTypeSelect.value = 'COURSE';
            activeRecordTypeSelect.disabled = false;
        }
        if (newRecordTypeSelectorGroup) newRecordTypeSelectorGroup.classList.remove('hidden');

        if (activeRecordCollectionInput && activeRecordTypeSelect && moduleTypes[activeRecordTypeSelect.value]) {
             activeRecordCollectionInput.value = moduleTypes[activeRecordTypeSelect.value];
        }

        if (recordTitleInput) recordTitleInput.value = '';
        if (recordDescriptionTextarea) recordDescriptionTextarea.value = '';
        if (recordThemeInput) recordThemeInput.value = '';
        if (imageStatusSelect) imageStatusSelect.value = ''; // Clear for new record
        if (cefrInput) cefrInput.value = '';
        if (meaningOriginInput) meaningOriginInput.value = '';

        toggleConditionalFields('COURSE'); // Default to COURSE for new records

        if (saveRecordBtn) saveRecordBtn.textContent = 'Create Module';
        if (deleteRecordBtn) deleteRecordBtn.style.display = 'none';
    }

    // Assuming updateCurrentChildrenDisplay is globally available
    window.updateCurrentChildrenDisplay();
}


/**
 * Updates the 'Currently Included Modules' list based on currentActiveRecordInternal.MODULEID_ARRAY.
 */
async function updateCurrentChildrenDisplay() {
    if (currentChildrenDisplay) {
        currentChildrenDisplay.innerHTML = '';
    }

    if (!currentActiveRecordInternal || !currentActiveRecordInternal.MODULEID_ARRAY || currentActiveRecordInternal.MODULEID_ARRAY.length === 0) {
        if (currentChildrenDisplay) {
            currentChildrenDisplay.innerHTML = `<li>No modules included yet.</li>`;
        }
        return;
    }

    const childPromises = currentActiveRecordInternal.MODULEID_ARRAY.map(async (childId) => {
        let docSnap = null;
        // Accessing global 'db' object
        // Corrected: Now accesses window.db
        const collectionsToSearch = ['LESSON', 'learningContent', 'syllables', 'phonemes'];
        for (const col of collectionsToSearch) {
            docSnap = await window.db.collection(col).doc(childId).get();
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
    const recordId = activeRecordIdInput ? activeRecordIdInput.value : null;
    const recordCollection = activeRecordCollectionInput ? activeRecordCollectionInput.value : null;
    const recordType = activeRecordTypeSelect ? activeRecordTypeSelect.value : null;
    const title = recordTitleInput ? recordTitleInput.value.trim() : '';
    const theme = recordThemeInput ? recordThemeInput.value.trim() : '';
    const description = recordDescriptionTextarea ? recordDescriptionTextarea.value.trim() : '';
    const imageStatus = imageStatusSelect ? imageStatusSelect.value : null;
    const cefr = cefrInput ? cefrInput.value : null;
    const meaningOrigin = meaningOriginInput ? meaningOriginInput.value : null;

    if (!title) {
        // Corrected: Now accesses window.showAlert
        window.showAlert(statusMessageSpan, statusAlert, 'Title cannot be empty!', true);
        return;
    }
    if (!recordCollection || !recordType) {
        // Corrected: Now accesses window.showAlert
        window.showAlert(statusMessageSpan, statusAlert, 'Collection and Module Type are missing! This should not happen.', true);
        return;
    }

    const dataToSave = {
        TITLE: title,
        DESCRIPTION: description,
        MODULETYPE: recordType,
        MODULEID_ARRAY: currentActiveRecordInternal && currentActiveRecordInternal.MODULEID_ARRAY ? [...currentActiveRecordInternal.MODULEID_ARRAY] : []
    };

    // Ensure the imageStatus default is set if the field is relevant but no value is selected.
    if (typesWithImageStatus.includes(recordType)) {
        dataToSave.imageStatus = imageStatus || 'pending'; // Default to 'pending' if null
    } else {
        // If imageStatus is not relevant for this module type, ensure it's not saved or is removed.
        // It's safer to not include it if the field is not applicable.
        delete dataToSave.imageStatus;
    }


    if (typesWithTheme.includes(recordType)) { dataToSave.THEME = theme; } else { delete dataToSave.THEME; } // Ensure Theme is removed if not relevant
    if (typesWithCEFR.includes(recordType)) { dataToSave.CEFR = cefr; } else { delete dataToSave.CEFR; } // Ensure CEFR is removed if not relevant
    if (typesWithMeaningOrigin.includes(recordType)) { dataToSave.MEANING_ORIGIN = meaningOrigin; } else { delete dataToSave.MEANING_ORIGIN; } // Ensure Meaning Origin is removed if not relevant


    try {
        if (recordId) {
            // Corrected: Now accesses window.db
            const docRef = window.db.collection(recordCollection).doc(recordId);
            await docRef.update(dataToSave);
            // Corrected: Now accesses window.showAlert
            window.showAlert(statusMessageSpan, statusAlert, 'Module updated successfully!', false);
            console.log("Updated record:", recordId, dataToSave);

            currentActiveRecordInternal = {
                ...currentActiveRecordInternal,
                ...dataToSave
            };

        } else {
            // Corrected: Now accesses window.db
            const docRef = await window.db.collection(recordCollection).add(dataToSave);
            const newRecordId = docRef.id;

            if (activeRecordIdInput) activeRecordIdInput.value = newRecordId;

            currentActiveRecordInternal = { id: newRecordId, ...dataToSave, collection: recordCollection };
            // Corrected: Now accesses window.showAlert
            window.showAlert(statusMessageSpan, statusAlert, 'Module created successfully!', false);
            console.log("Created new record with ID:", newRecordId, dataToSave);
        }

        // Callbacks from orchestrator
        onRecordSavedCallback(currentActiveRecordInternal);

    } catch (error) {
        console.error('Error saving record:', error);
        // Corrected: Now accesses window.showAlert
        window.showAlert(statusMessageSpan, statusAlert, `Error saving module: ${error.message}`, true);
    }
}

/**
 * Deletes the currently active record from Firestore.
 */
async function deleteRecord() {
    if (!currentActiveRecordInternal || !currentActiveRecordInternal.id) {
        // Corrected: Now accesses window.showAlert
        window.showAlert(statusMessageSpan, statusAlert, 'No module selected for deletion.', true);
        return;
    }

    const confirmDelete = confirm(`Are you sure you want to delete "${currentActiveRecordInternal.TITLE || currentActiveRecordInternal.id}"? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
        // Corrected: Now accesses window.db
        await window.db.collection(currentActiveRecordInternal.collection).doc(currentActiveRecordInternal.id).delete();
        // Corrected: Now accesses window.showAlert
        window.showAlert(statusMessageSpan, statusAlert, 'Module deleted successfully!', false);
        console.log("Deleted record:", currentActiveRecordInternal.id);

        onRecordDeletedCallback();

    } catch (error) {
        console.error('Error deleting record:', error);
        // Corrected: Now accesses window.showAlert
        window.showAlert(statusMessageSpan, statusAlert, `Error deleting module: ${error.message}`, true);
    }
}

/**
 * Helper to get the current active record from the editor.
 */
function getCurrentActiveRecord() {
    return currentActiveRecordInternal;
}

// Make functions accessible globally via the window object
window.setupEditor = setupEditor;
window.loadRecordIntoEditor = loadRecordIntoEditor;
window.updateCurrentChildrenDisplay = updateCurrentChildrenDisplay;
window.getCurrentActiveRecord = getCurrentActiveRecord;

// NOTE: All renderModuleListItem, fetchAndRenderChildren, loadAllAvailableModules,
// displayFilteredModules, addModuleToActiveRecordSelection, removeModuleFromActiveRecordSelection,
// populateModuleTypeFilter, applyModuleTypeFilter, fetchAndPopulateTopLevelNavigation,
// updateNavigationButtons, showSpinner, hideSpinner are NOT part of editor logic.
// They will be placed in ModuleContent_ListView.js or ui-utilities.js. (already fixed in ui-utilities.js)
