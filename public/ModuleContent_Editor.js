// js/ModuleContent_Editor.js (MODULARIZED VERSION)
// Handles the single record editor view: loading, saving, and deleting module records.

// --- Import necessary Firebase modules ---
// Import the initialized 'db' instance from your central Firebase services file.
import { db } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// Import specific functions from the Firebase Firestore SDK.
// IMPORTANT: Using Firebase SDK v12.3.0 from CDN.
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

// Import UI utility functions.
import { showAlert } from './ui-utilities.js'; // Assuming showAlert is the only one needed here from ui-utilities.js

// Import functions from ModuleContent_Classroom.js needed for `setupEditor`
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
let themeFields = null; // NodeList
let imageStatusSelect = null;
let imageStatusFields = null; // NodeList
let cefrInput = null;
let cefrFields = null; // NodeList
let meaningOriginInput = null;
let meaningOriginFields = null; // NodeList
let saveRecordBtn = null;
let deleteRecordBtn = null;
let currentChildrenDisplay = null; // This is used for displaying selected children within the editor
let generateClassroomBtn = null;   // Needed for updateClassroomButtonState call
let statusAlert = null;            // Needed for showAlert calls
let statusMessageSpan = null;      // Needed for showAlert calls


// Store the current record being edited internally
let currentActiveRecordInternal = null;

// The moduleTypes constant from your original ModuleContent.js (internal to this module)
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
const PARENT_MODULE_TYPES = ['COURSE', 'LESSON', 'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY', 'SYLLABLE']; // Not currently used in this file but good to keep if needed
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
export function setupEditor(elements, callbacks) { // Export setupEditor
    console.log("DEBUG Editor: setupEditor called.");
    console.log("DEBUG Editor: elements object received:", elements);

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
    statusAlert = elements.statusAlert;         // Get statusAlert from elements
    statusMessageSpan = elements.statusMessageSpan; // Get statusMessageSpan from elements


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

                // Use the imported updateClassroomButtonState
                updateClassroomButtonState(selectedType, generateClassroomBtn, activeRecordTypeSelect);
            }
        });
    }
}


/**
 * Loads a record's data into the editor form, or clears the form for a new record.
 * @param {object | null} recordData - The Firestore document data (with 'id' property), or null for a new record.
 * @param {string | null} collectionName - The name of the Firestore collection the record belongs to.
 */
export function loadRecordIntoEditor(recordData, collectionName = null) { // Export loadRecordIntoEditor
    // DOM elements are now assumed to be initialized by setupEditor.
    // Re-fetching them inside here creates overhead if they're already set up.
    // For modularity, it's often better to rely on elements being passed once via setup.

    currentActiveRecordInternal = recordData;

    if (recordData) { // Path for existing records
        console.log("DEBUG: Populating editor for existing record. Record ID:", recordData.id);
        console.log("DEBUG: Record TITLE:", recordData.TITLE);
        console.log("DEBUG: Record DESCRIPTION:", recordData.DESCRIPTION);
        console.log("DEBUG: Record MODULETYPE:", recordData.MODULETYPE);
        console.log("DEBUG: Incoming collectionName for existing record:", collectionName);

        // CRITICAL: Ensure currentActiveRecordInternal retains its collection property
        // This is CRITICAL if recordData itself doesn't always contain 'collection' from Firestore.
        // It uses the passed 'collectionName' first, then falls back to existing on recordData if available.
        if (currentActiveRecordInternal) {
            currentActiveRecordInternal.collection = collectionName || recordData.collection;
        }

        if (activeRecordIdInput) activeRecordIdInput.value = recordData.id || '';

        if (activeRecordCollectionInput) {
            console.log("DEBUG-A: activeRecordCollectionInput.value BEFORE assignment:", activeRecordCollectionInput.value);
            activeRecordCollectionInput.value = collectionName || '';
            console.log("DEBUG-B: activeRecordCollectionInput.value AFTER assignment:", activeRecordCollectionInput.value);
        } else {
            console.error("DEBUG-ERROR: activeRecordCollectionInput is NULL or UNDEFINED!");
        }

        if (activeRecordTypeSelect) {
            activeRecordTypeSelect.value = recordData.MODULETYPE || '';
            activeRecordTypeSelect.disabled = true;
            console.log("DEBUG: activeRecordTypeSelect value set to:", activeRecordTypeSelect.value);
        }
        if (newRecordTypeSelectorGroup) newRecordTypeSelectorGroup.classList.remove('hidden');

        if (recordTitleInput) recordTitleInput.value = recordData.TITLE || recordData.name || '';
        if (recordDescriptionTextarea) recordDescriptionTextarea.value = recordData.DESCRIPTION || '';

        toggleConditionalFields(recordData.MODULETYPE); // Use the module-level function

        if (recordThemeInput) recordThemeInput.value = recordData.THEME || '';
        if (imageStatusSelect) imageStatusSelect.value = recordData.imageStatus || 'pending';
        if (cefrInput) cefrInput.value = recordData.CEFR || '';
        if (meaningOriginInput) meaningOriginInput.value = recordData.MEANING_ORIGIN || '';

        if (saveRecordBtn) saveRecordBtn.textContent = 'Update Module';
        if (deleteRecordBtn) deleteRecordBtn.style.display = 'inline-block';

    } else { // Path for new/empty record
        console.log("DEBUG: Clearing editor for a new/empty record.");

        if (activeRecordIdInput) activeRecordIdInput.value = '';
        currentActiveRecordInternal = null; // Clear internal record when starting a new one

        if (activeRecordTypeSelect) {
            activeRecordTypeSelect.value = 'COURSE';
            activeRecordTypeSelect.disabled = false;
        }
        if (newRecordTypeSelectorGroup) { // Ensure this is handled for new records
            newRecordTypeSelectorGroup.classList.remove('hidden');
        }

        // Initialize collection based on default type for new record
        if (activeRecordCollectionInput && activeRecordTypeSelect && moduleTypes[activeRecordTypeSelect.value]) {
             activeRecordCollectionInput.value = moduleTypes[activeRecordTypeSelect.value];
        }

        if (recordTitleInput) recordTitleInput.value = '';
        if (recordDescriptionTextarea) recordDescriptionTextarea.value = '';
        if (recordThemeInput) recordThemeInput.value = '';
        if (imageStatusSelect) imageStatusSelect.value = ''; // Clear for new record
        if (cefrInput) cefrInput.value = '';
        if (meaningOriginInput) meaningOriginInput.value = '';

        toggleConditionalFields('COURSE'); // Use the module-level function

        if (saveRecordBtn) saveRecordBtn.textContent = 'Create Module';
        if (deleteRecordBtn) deleteRecordBtn.style.display = 'none';
    }

    updateCurrentChildrenDisplay(); // Call the exported function directly

    // --- Keep the final DEBUG loadRecordIntoEditor FINISHED logs ---
}


/**
 * Toggles the visibility of conditional fields (Theme, Image Status, CEFR, Meaning Origin)
 * based on the selected module type.
 * @param {string} moduleType - The type of module (e.g., 'COURSE', 'VOCABULARY').
 */
function toggleConditionalFields(moduleType) {
    // Use the module-level assigned DOM elements directly
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
 * Updates the 'Currently Included Modules' list based on currentActiveRecordInternal.MODULEID_ARRAY.
 */
export async function updateCurrentChildrenDisplay() { // Export updateCurrentChildrenDisplay
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
        // Use the modular 'db' instance and Firestore functions.
        const collectionsToSearch = ['LESSON', 'learningContent', 'syllables', 'phonemes'];
        for (const col of collectionsToSearch) {
            const docRef = doc(db, col, childId);
            docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
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
    // These are fetched in setupEditor, but can be re-fetched here for showAlert if not passed directly
    const currentStatusMessageSpan = statusMessageSpan; // Use the module-scoped reference
    const currentStatusAlert = statusAlert;             // Use the module-scoped reference

    // These logs confirm the values *at the moment saveRecord is called*
    console.log("DEBUG saveRecord Check: activeRecordIdInput (Module Element):", activeRecordIdInput);
    if (activeRecordIdInput) console.log("DEBUG saveRecord Check: activeRecordIdInput.value:", activeRecordIdInput.value);

    console.log("DEBUG saveRecord Check: activeRecordCollectionInput (Module Element):", activeRecordCollectionInput);
    if (activeRecordCollectionInput) console.log("DEBUG saveRecord Check: activeRecordCollectionInput.value:", activeRecordCollectionInput.value);

    console.log("DEBUG saveRecord Check: activeRecordTypeSelect (Module Element):", activeRecordTypeSelect);
    if (activeRecordTypeSelect) console.log("DEBUG saveRecord Check: activeRecordTypeSelect.value:", activeRecordTypeSelect.value);


    const recordId = activeRecordIdInput ? activeRecordIdInput.value : null;
    const recordCollection = activeRecordCollectionInput ? activeRecordCollectionInput.value : null;
    const recordType = activeRecordTypeSelect ? activeRecordTypeSelect.value : null;
    const title = recordTitleInput ? recordTitleInput.value.trim() : '';
    const theme = recordThemeInput ? recordThemeInput.value.trim() : '';
    const description = recordDescriptionTextarea ? recordDescriptionTextarea.value.trim() : '';
    const imageStatus = imageStatusSelect ? imageStatusSelect.value : null;
    const cefr = cefrInput ? cefrInput.value : null;
    const meaningOrigin = meaningOriginInput ? meaningOriginInput.value : null;

    // These logs derive from the values obtained above
    console.log("DEBUG saveRecord: recordCollection (derived):", recordCollection);
    console.log("DEBUG saveRecord: recordType (derived):", recordType);

    if (!title) {
        showAlert(currentStatusMessageSpan, currentStatusAlert, 'Title cannot be empty!', true); // Use imported showAlert
        return;
    }
    if (!recordCollection || !recordType) {
        showAlert(currentStatusMessageSpan, currentStatusAlert, 'Collection and Module Type are missing! This should not happen.', true); // Use imported showAlert
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
        delete dataToSave.imageStatus;
    }


    if (typesWithTheme.includes(recordType)) { dataToSave.THEME = theme; } else { delete dataToSave.THEME; }
    if (typesWithCEFR.includes(recordType)) { dataToSave.CEFR = cefr; } else { delete dataToSave.CEFR; }
    if (typesWithMeaningOrigin.includes(recordType)) { dataToSave.MEANING_ORIGIN = meaningOrigin; } else { delete dataToSave.MEANING_ORIGIN; }


    try {
        if (recordId) { // Updating an existing record
            // Use modular Firestore functions: doc and updateDoc
            const docRef = doc(db, recordCollection, recordId);
            await updateDoc(docRef, dataToSave);

            // CRITICAL: When updating, ensure currentActiveRecordInternal retains its collection property
            // as dataToSave doesn't include it.
            currentActiveRecordInternal = {
                ...currentActiveRecordInternal, // Keep existing properties like 'collection'
                ...dataToSave // Overlay with updated fields
            };
            // Double-check the collection is definitely set for callback, using recordCollection (which is confirmed to be valid)
            if (!currentActiveRecordInternal.collection && recordCollection) {
                currentActiveRecordInternal.collection = recordCollection;
            }

            showAlert(currentStatusMessageSpan, currentStatusAlert, 'Module updated successfully!', false); // Use imported showAlert
            console.log("Updated record:", recordId, dataToSave);

        } else { // Creating a new record
            // Use modular Firestore functions: collection and addDoc (or setDoc with auto-ID)
            const newDocRef = doc(collection(db, recordCollection)); // Get a new doc ref with auto-generated ID
            await setDoc(newDocRef, dataToSave); // Use setDoc to create the document
            const newRecordId = newDocRef.id;

            if (activeRecordIdInput) activeRecordIdInput.value = newRecordId;

            // When creating, collection is explicitly set here
            currentActiveRecordInternal = { id: newRecordId, ...dataToSave, collection: recordCollection };

            showAlert(currentStatusMessageSpan, currentStatusAlert, 'Module created successfully!', false); // Use imported showAlert
            console.log("Created new record with ID:", newRecordId, dataToSave);
        }

        // Debug log before callback
        console.log("DEBUG Editor: Calling onRecordSavedCallback with currentActiveRecordInternal:", currentActiveRecordInternal);
        console.log("DEBUG Editor: Specifically, currentActiveRecordInternal.collection (for callback):", currentActiveRecordInternal.collection);

        onRecordSavedCallback(currentActiveRecordInternal); // Pass the updated internal record

    } catch (error) {
        console.error('Error saving record:', error);
        showAlert(currentStatusMessageSpan, currentStatusAlert, `Error saving module: ${error.message}`, true); // Use imported showAlert
    }
}

/**
 * Deletes the currently active record from Firestore.
 */
async function deleteRecord() {
    // These are fetched in setupEditor, but can be re-fetched here for showAlert if not passed directly
    const currentStatusMessageSpan = statusMessageSpan; // Use the module-scoped reference
    const currentStatusAlert = statusAlert;             // Use the module-scoped reference

    if (!currentActiveRecordInternal || !currentActiveRecordInternal.id) {
        showAlert(currentStatusMessageSpan, currentStatusAlert, 'No module selected for deletion.', true); // Use imported showAlert
        return;
    }

    const confirmDelete = confirm(`Are you sure you want to delete "${currentActiveRecordInternal.TITLE || currentActiveRecordInternal.id}"? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
        // Use modular Firestore functions: doc and deleteDoc
        const docRef = doc(db, currentActiveRecordInternal.collection, currentActiveRecordInternal.id);
        await deleteDoc(docRef);

        showAlert(currentStatusMessageSpan, currentStatusAlert, 'Module deleted successfully!', false); // Use imported showAlert
        console.log("Deleted record:", currentActiveRecordInternal.id);

        onRecordDeletedCallback();

    } catch (error) {
        console.error('Error deleting record:', error);
        showAlert(currentStatusMessageSpan, currentStatusAlert, `Error deleting module: ${error.message}`, true); // Use imported showAlert
    }
}

/**
 * Helper to get the current active record from the editor.
 * This function is exported for use by ModuleContent.js.
 */
export function getCurrentActiveRecord() { // Export getCurrentActiveRecord
    return currentActiveRecordInternal;
}
