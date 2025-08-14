// js/ModuleContent.js (Remodified with IIFE for private scope)
// This script acts as the main orchestrator for ModuleContent.html,
// initializing functionalities from other specialized modules.

(function() { // Start IIFE for ModuleContent.js

    // --- Global DOM Element References (All main elements for the page) ---
    // These are now private to this IIFE scope.
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
                // These functions are assumed to be globally available from ModuleContent_ListView.js
                await window.fetchAndPopulateTopLevelNavigation();
                await window.applyModuleTypeFilter();
                // Note: 'filteredNavigationList' and 'currentTopLevelModuleIndex' need to be globally managed by ModuleContent_ListView.js
                // or passed around. Assuming they are global as per the original modular intent.
                // Assuming filteredNavigationList and currentTopLevelModuleIndex are exposed globally by ListView
                const savedIndex = window.filteredNavigationList.findIndex(m => m.id === savedRecord.id);
                if (savedIndex !== -1) {
                    window.currentTopLevelModuleIndex = savedIndex; // Corrected from local variable
                    window.updateNavigationButtons();
                }
                window.loadRecordIntoEditor(window.getCurrentActiveRecord(), savedRecord.collection);
                window.updateClassroomButtonState(window.getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
				window.displayFilteredModules();
            },
            onRecordDeleted: async () => {
                // These functions are assumed to be globally available
                await window.fetchAndPopulateTopLevelNavigation();
                await window.applyModuleTypeFilter();
                window.loadRecordIntoEditor(null);
                window.updateClassroomButtonState(window.getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
            }
        };
        // setupEditor is assumed to be globally available from ModuleContent_Editor.js
        window.setupEditor({
            activeRecordIdInput, activeRecordCollectionInput, activeRecordTypeSelect, newRecordTypeSelectorGroup,
            recordTitleInput, recordDescriptionTextarea, recordThemeInput, themeFields,
            imageStatusSelect, imageStatusFields, cefrInput, cefrFields,
            meaningOriginInput, meaningOriginFields, saveRecordBtn, deleteRecordBtn,
            currentChildrenDisplay, generateClassroomBtn, statusAlert, statusMessageSpan
        }, editorCallbacks);


        const listViewCallbacks = {
            onRecordSelected: (recordData, collectionName) => {
                // These functions are assumed to be globally available
                window.loadRecordIntoEditor(recordData, collectionName);
                window.updateClassroomButtonState(recordData?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
                window.updateCurrentChildrenDisplay();
				window.displayFilteredModules();
            }
        };
        // setupListView is assumed to be globally available from ModuleContent_ListView.js
        window.setupListView({
            prevRecordBtn, newRecordBtn, nextRecordBtn,
            moduleTypeFilterSelect, filterModuleTypeSelect, searchModulesInput, availableModulesList,
            statusAlert, statusMessageSpan, loadingSpinner
        }, listViewCallbacks);


        // --- 3. Setup Google Classroom Button Listener ---
        if (generateClassroomBtn) {
            generateClassroomBtn.addEventListener('click', () => {
                // getCurrentActiveRecord is assumed to be globally available from ModuleContent_Editor.js
                const currentRecord = window.getCurrentActiveRecord();

                let selectedCourseId = '';
                let selectedCourseTitle = '';

                if (currentRecord && currentRecord.MODULETYPE === 'COURSE' && currentRecord.id) {
                    selectedCourseId = currentRecord.id;
                    selectedCourseTitle = currentRecord.TITLE || currentRecord.name;
                }

                // initiateGoogleClassroomExport is assumed to be globally available from ModuleContent_Classroom.js
                window.initiateGoogleClassroomExport(
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
        await window.fetchAndPopulateTopLevelNavigation();
        await window.applyModuleTypeFilter();
        await window.loadAllAvailableModules();
    });

})(); // End IIFE for ModuleContent.js
