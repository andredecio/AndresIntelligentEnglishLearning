// js/ModuleContent.js (Remodified with IIFE for private scope)
// This script acts as the main orchestrator for ModuleContent.html,
// initializing functionalities from other specialized modules.
// Version 1.006x
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
                // IMPORTANT: Ensure the very latest saved data is immediately displayed in the editor.
                // This call will trigger updateCurrentChildrenDisplay, updateClassroomButtonState, etc.
                // It's the primary way to update the editor UI after a save.
                // This replaces the previous logic that tried to manually set currentTopLevelModuleIndex
                // and then call loadRecordIntoEditor with getCurrentActiveRecord.
                window.loadRecordIntoEditor(savedRecord, savedRecord.collection);

                // Re-fetch and re-filter navigation lists.
                // applyModuleTypeFilter will now correctly try to preserve the saved record's position.
                // It should NOT call loadSelectedModuleIntoEditor() internally if the record is already
                // being handled by the explicit loadRecordIntoEditor call above.
                await window.fetchAndPopulateTopLevelNavigation();
                await window.applyModuleTypeFilter();

                // After updating navigation and editor, refresh the larger selectable modules list.
                // This ensures it reflects the updated MODULEID_ARRAY in the now-active record.
                window.displayFilteredModules();
            },
            onRecordDeleted: async () => {
                // These functions are assumed to be globally available
                await window.fetchAndPopulateTopLevelNavigation();
                // applyModuleTypeFilter will call loadSelectedModuleIntoEditor(null) if list becomes empty,
                // or load the first record if list has items.
                await window.applyModuleTypeFilter();

                // updateClassroomButtonState will need to query the *new* current record.
                // getCurrentActiveRecord is important here as it reflects the state after applyModuleTypeFilter.
                window.updateClassroomButtonState(window.getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);

                // Ensure the larger list of selectable modules is refreshed.
                window.displayFilteredModules();
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
                // Calling loadRecordIntoEditor will handle updating the editor fields
                // and will internally trigger updateCurrentChildrenDisplay.
                window.loadRecordIntoEditor(recordData, collectionName);
                window.updateClassroomButtonState(recordData?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
                // REMOVED REDUNDANT CALL: window.updateCurrentChildrenDisplay(); (already handled by loadRecordIntoEditor)
                // Calling displayFilteredModules will also refresh the available modules list
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
        await window.applyModuleTypeFilter(); // This will handle initial load into editor.
        await window.loadAllAvailableModules();
    });

})(); // End IIFE for ModuleContent.js
