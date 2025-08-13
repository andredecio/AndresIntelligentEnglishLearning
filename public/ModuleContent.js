// js/ModuleContent.js
// This script acts as the main orchestrator for ModuleContent.html,
// initializing functionalities from other specialized modules.

// Import specific functionalities from the newly created modules.
import { initiateGoogleClassroomExport, updateClassroomButtonState } from './ModuleContent_Classroom.js';
import { setupEditor, loadRecordIntoEditor, getCurrentActiveRecord, updateCurrentChildrenDisplay } from './ModuleContent_Editor.js';
import { setupListView, fetchAndPopulateTopLevelNavigation, applyModuleTypeFilter, populateModuleTypeFilter, updateNavigationButtons, loadAllAvailableModules, displayFilteredModules } from './ModuleContent_ListView.js';

// Import essential Firebase services from our centralized setup, if used directly by the orchestrator.
// Note: db, storage are primarily used by sub-modules now, but kept here if any direct page-level interaction needs them.
import { db, storage } from './firebase-services.js'; // Keep if you have direct usage on this top level file


// --- Global DOM Element References (All main elements for the page) ---
// These will be passed down to the respective modules.
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
let moduleTypeFilterSelect = null; // Main top-level filter
let filterModuleTypeSelect = null; // Filter within the larger 'children' list
let searchModulesInput = null;
let availableModulesList = null;
let statusAlert = null;
let statusMessageSpan = null;
let loadingSpinner = null; // General page loading spinner (not necessarily list-specific)
let singleRecordView = null;
let generateClassroomBtn = null;


// --- DOMContentLoaded Listener: The Orchestration Start Point ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("ModuleContent.js (Orchestrator) loaded. Initializing page functionalities.");

    // --- 1. Get ALL DOM Element References ---
    // Main layout and view containers
    singleRecordView = document.querySelector('.single-record-view');
    largerListView = document.querySelector('.larger-list-view');

    // Single Record Editor Form Fields
    activeRecordIdInput = document.getElementById('activeRecordId');
    activeRecordCollectionInput = document.getElementById('activeRecordCollection');
    activeRecordTypeSelect = document.getElementById('activeRecordTypeSelect');
    newRecordTypeSelectorGroup = document.querySelector('.new-record-type-selector-group');
    recordTitleInput = document.getElementById('recordTitle');
    recordDescriptionTextarea = document.getElementById('recordDescription');
    recordThemeInput = document.getElementById('recordTheme');
    themeFields = document.querySelectorAll('.theme-fields');
    imageStatusSelect = document.getElementById('imageStatus');
    imageStatusFields = document.querySelectorAll('.image-status-fields');
    cefrInput = document.getElementById('cefrInput');
    cefrFields = document.querySelectorAll('.cefr-fields');
    meaningOriginInput = document.getElementById('meaningOriginInput');
    meaningOriginFields = document.querySelectorAll('.meaning-origin-fields');

    // Navigation Buttons (Prev, New, Next)
    prevRecordBtn = document.getElementById('prevRecordBtn');
    newRecordBtn = document.getElementById('newRecordBtn');
    nextRecordBtn = document.getElementById('nextRecordBtn');

    // Action Buttons (Save, Delete, Classroom)
    saveRecordBtn = document.getElementById('saveRecordBtn');
    deleteRecordBtn = document.getElementById('deleteRecordBtn');
    generateClassroomBtn = document.getElementById('generateClassroomBtn');

    // Current Children Display (part of the editor view)
    currentChildrenDisplay = document.getElementById('currentChildrenDisplay');

    // Larger Module List View (for selecting children) - Filter & Search
    moduleTypeFilterSelect = document.getElementById('moduleTypeFilter'); // The NEW main filter for top-level navigation
    filterModuleTypeSelect = document.getElementById('filterModuleType'); // The filter within the larger 'children' list
    searchModulesInput = document.getElementById('searchModules'); // Search input for the larger list
    availableModulesList = document.getElementById('availableModulesList'); // The UL/container for the larger list

    // Status/Alerts
    statusAlert = document.getElementById('statusAlert');
    statusMessageSpan = document.getElementById('statusMessage');
    if (availableModulesList) {
        // Assuming a shared spinner for the entire page or list. Adjust as needed.
        loadingSpinner = availableModulesList.querySelector('.spinner') || document.querySelector('.page-spinner');
    }
    // If no specific spinner is found above, try a general page spinner if it exists
    if (!loadingSpinner) {
        loadingSpinner = document.getElementById('globalLoadingSpinner'); // Example ID for a global spinner
    }


    // --- 2. Setup Modules and Define Callbacks ---

    // Callbacks for Editor Module
    const editorCallbacks = {
        // When a record is saved/updated, ListView needs to refresh its navigation.
        onRecordSaved: async (savedRecord) => {
            await fetchAndPopulateTopLevelNavigation(); // Refresh master list
            await applyModuleTypeFilter(); // Re-apply filter and load first (or saved) record
            // After save, try to re-select the just-saved record in navigation if it was new.
            const savedIndex = filteredNavigationList.findIndex(m => m.id === savedRecord.id);
            if (savedIndex !== -1) {
                currentTopLevelModuleIndex = savedIndex;
                updateNavigationButtons();
            }
            // Ensure editor re-loads with updated data (e.g., if new ID was assigned)
            loadRecordIntoEditor(getCurrentActiveRecord(), savedRecord.collection);
            updateClassroomButtonState(getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
        },
        // When a record is deleted, ListView needs to refresh its navigation and select next record.
        onRecordDeleted: async () => {
            await fetchAndPopulateTopLevelNavigation(); // Refresh master list
            await applyModuleTypeFilter(); // Re-apply filter and load first record
            loadRecordIntoEditor(null); // Clear editor after delete
            updateClassroomButtonState(getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
        }
    };
    // Initialize the Editor Module
    setupEditor({
        activeRecordIdInput, activeRecordCollectionInput, activeRecordTypeSelect, newRecordTypeSelectorGroup,
        recordTitleInput, recordDescriptionTextarea, recordThemeInput, themeFields,
        imageStatusSelect, imageStatusFields, cefrInput, cefrFields,
        meaningOriginInput, meaningOriginFields, saveRecordBtn, deleteRecordBtn,
        currentChildrenDisplay, generateClassroomBtn, statusAlert, statusMessageSpan
    }, editorCallbacks);


    // Callbacks for ListView Module
    const listViewCallbacks = {
        // When a record is selected in the list, Editor needs to load it.
        onRecordSelected: (recordData, collectionName) => {
            loadRecordIntoEditor(recordData, collectionName);
            // After record is loaded, update classroom button state
            updateClassroomButtonState(recordData?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
            // Also ensure children display is updated if it was previously loaded/collapsed
            updateCurrentChildrenDisplay(); // Call directly from editor module as it manages its own children display
        }
    };
    // Initialize the ListView Module
    setupListView({
        prevRecordBtn, newRecordBtn, nextRecordBtn,
        moduleTypeFilterSelect, filterModuleTypeSelect, searchModulesInput, availableModulesList,
        statusAlert, statusMessageSpan, loadingSpinner
    }, listViewCallbacks);


    // --- 3. Setup Google Classroom Button Listener ---
    if (generateClassroomBtn) {
        generateClassroomBtn.addEventListener('click', () => {
            const currentRecord = getCurrentActiveRecord(); // Get the currently active record from the editor module

            let selectedCourseId = '';
            let selectedCourseTitle = '';

            if (currentRecord && currentRecord.MODULETYPE === 'COURSE' && currentRecord.id) {
                selectedCourseId = currentRecord.id;
                selectedCourseTitle = currentRecord.TITLE || currentRecord.name;
            }

            initiateGoogleClassroomExport(
                selectedCourseId,
                selectedCourseTitle,
                generateClassroomBtn,
                statusMessageSpan,
                statusAlert
            );
        });
    }


    // --- 4. Initial Page Load Actions ---
    // Fetch all top-level modules into our master list
    await fetchAndPopulateTopLevelNavigation();

    // Populate the new module type filter dropdown (this also adds its change listener)
    // NOTE: This call moved inside fetchAndPopulateTopLevelNavigation in ListView.js,
    // so no explicit call needed here unless it was previously external.
    // populateModuleTypeFilter(); // Removed as it's now handled by fetchAndPopulateTopLevelNavigation

    // Apply the default filter (e.g., 'ALL') and load the first record based on that
    await applyModuleTypeFilter();

    // Load all available modules for the children selection list
    await loadAllAvailableModules();
});
