// js/ModuleContent.js (Remodified for standard script loading - NO 'import' or 'export')
// This script acts as the main orchestrator for ModuleContent.html,
// initializing functionalities from other specialized modules.

// Removed: import { initiateGoogleClassroomExport, updateClassroomButtonState } from './ModuleContent_Classroom.js';
// Removed: import { setupEditor, loadRecordIntoEditor, getCurrentActiveRecord, updateCurrentChildrenDisplay } from './ModuleContent_Editor.js';
// Removed: import { setupListView, fetchAndPopulateTopLevelNavigation, applyModuleTypeFilter, populateModuleTypeFilter, updateNavigationButtons, loadAllAvailableModules, displayFilteredModules } from './ModuleContent_ListView.js';

// Removed: import { db, storage } from './firebase-services.js'; // db and storage will be accessed globally


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
let moduleTypeFilterSelect = null;
let filterModuleTypeSelect = null;
let searchModulesInput = null;
let availableModulesList = null;
let statusAlert = null;
let statusMessageSpan = null;
let loadingSpinner = null;
let singleRecordView = null;
let generateClassroomBtn = null;


// --- DOMContentLoaded Listener: The Orchestration Start Point ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("ModuleContent.js (Orchestrator) loaded. Initializing page functionalities.");

    // --- 1. Get ALL DOM Element References ---
    singleRecordView = document.querySelector('.single-record-view');
    largerListView = document.querySelector('.larger-list-view');

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

    prevRecordBtn = document.getElementById('prevRecordBtn');
    newRecordBtn = document.getElementById('newRecordBtn');
    nextRecordBtn = document.getElementById('nextRecordBtn');

    saveRecordBtn = document.getElementById('saveRecordBtn');
    deleteRecordBtn = document.getElementById('deleteRecordBtn');
    generateClassroomBtn = document.getElementById('generateClassroomBtn');

    currentChildrenDisplay = document.getElementById('currentChildrenDisplay');

    moduleTypeFilterSelect = document.getElementById('moduleTypeFilter');
    filterModuleTypeSelect = document.getElementById('filterModuleType');
    searchModulesInput = document.getElementById('searchModules');
    availableModulesList = document.getElementById('availableModulesList');

    statusAlert = document.getElementById('statusAlert');
    statusMessageSpan = document.getElementById('statusMessage');
    if (availableModulesList) {
        loadingSpinner = availableModulesList.querySelector('.spinner') || document.querySelector('.page-spinner');
    }
    if (!loadingSpinner) {
        loadingSpinner = document.getElementById('globalLoadingSpinner');
    }


    // --- 2. Setup Modules and Define Callbacks ---

    const editorCallbacks = {
        onRecordSaved: async (savedRecord) => {
            // These functions are assumed to be globally available from ModuleContent_ListView.js and ModuleContent_Editor.js
            await fetchAndPopulateTopLevelNavigation();
            await applyModuleTypeFilter();
            // Note: 'filteredNavigationList' and 'currentTopLevelModuleIndex' need to be globally managed by ModuleContent_ListView.js
            // or passed around. Assuming they are global as per the original modular intent.
            const savedIndex = filteredNavigationList.findIndex(m => m.id === savedRecord.id);
            if (savedIndex !== -1) {
                currentTopLevelModuleIndex = savedIndex;
                updateNavigationButtons();
            }
            loadRecordIntoEditor(getCurrentActiveRecord(), savedRecord.collection);
            updateClassroomButtonState(getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
        },
        onRecordDeleted: async () => {
            // These functions are assumed to be globally available
            await fetchAndPopulateTopLevelNavigation();
            await applyModuleTypeFilter();
            loadRecordIntoEditor(null);
            updateClassroomButtonState(getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
        }
    };
    // setupEditor is assumed to be globally available from ModuleContent_Editor.js
    setupEditor({
        activeRecordIdInput, activeRecordCollectionInput, activeRecordTypeSelect, newRecordTypeSelectorGroup,
        recordTitleInput, recordDescriptionTextarea, recordThemeInput, themeFields,
        imageStatusSelect, imageStatusFields, cefrInput, cefrFields,
        meaningOriginInput, meaningOriginFields, saveRecordBtn, deleteRecordBtn,
        currentChildrenDisplay, generateClassroomBtn, statusAlert, statusMessageSpan
    }, editorCallbacks);


    const listViewCallbacks = {
        onRecordSelected: (recordData, collectionName) => {
            // These functions are assumed to be globally available
            loadRecordIntoEditor(recordData, collectionName);
            updateClassroomButtonState(recordData?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
            updateCurrentChildrenDisplay();
        }
    };
    // setupListView is assumed to be globally available from ModuleContent_ListView.js
    setupListView({
        prevRecordBtn, newRecordBtn, nextRecordBtn,
        moduleTypeFilterSelect, filterModuleTypeSelect, searchModulesInput, availableModulesList,
        statusAlert, statusMessageSpan, loadingSpinner
    }, listViewCallbacks);


    // --- 3. Setup Google Classroom Button Listener ---
    if (generateClassroomBtn) {
        generateClassroomBtn.addEventListener('click', () => {
            // getCurrentActiveRecord is assumed to be globally available from ModuleContent_Editor.js
            const currentRecord = getCurrentActiveRecord();

            let selectedCourseId = '';
            let selectedCourseTitle = '';

            if (currentRecord && currentRecord.MODULETYPE === 'COURSE' && currentRecord.id) {
                selectedCourseId = currentRecord.id;
                selectedCourseTitle = currentRecord.TITLE || currentRecord.name;
            }

            // initiateGoogleClassroomExport is assumed to be globally available from ModuleContent_Classroom.js
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
    // These functions are assumed to be globally available from ModuleContent_ListView.js
    await fetchAndPopulateTopLevelNavigation();
    await applyModuleTypeFilter();
    await loadAllAvailableModules();
});
