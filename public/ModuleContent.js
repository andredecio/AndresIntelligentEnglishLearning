// js/ModuleContent.js (MODULARIZED VERSION - COMPLETED)
// This script acts as the main orchestrator for ModuleContent.html,
// initializing functionalities from other specialized modules.
// Version 1.007x - Fully modular, using Firebase Modular SDK and importing from peer modules.

// --- Import necessary Firebase modules from your firebase-services.js and specific SDK paths ---
// We import 'auth' and 'functions' directly from firebase-services.js
// as they are our central initialized service instances.
import { auth, functions } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// We import 'onAuthStateChanged' and 'httpsCallable' directly from their respective SDK modules,
// as these are specific functions that operate on the imported service instances.
// IMPORTANT: Using Firebase SDK v12.3.0 from CDN for these specific function imports.
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-functions.js';

// --- Import functions from ui-utilities.js ---
// ui-utilities.js is modular, so we import its exported showAlert function directly.
import { showAlert } from './ui-utilities.js';
// Assuming showSpinner and hideSpinner are also needed and exported from ui-utilities.js
import { showSpinner, hideSpinner } from './ui-utilities.js'; // Added these imports

// --- Import functions from ModuleContent_Classroom.js ---
// ModuleContent_Classroom.js is modular, so we import its exported functions directly.
import { initiateGoogleClassroomExport, updateClassroomButtonState } from './ModuleContent_Classroom.js';

// --- Import functions from ModuleContent_Editor.js ---
// These functions are now directly exported from ModuleContent_Editor.js.
import { loadRecordIntoEditor, setupEditor, getCurrentActiveRecord, updateCurrentChildrenDisplay } from './ModuleContent_Editor.js';

// --- Import functions from ModuleContent_ListView.js ---
// These functions are now directly exported from ModuleContent_ListView.js.
import {
    fetchAndPopulateTopLevelNavigation,
    applyModuleTypeFilter,
    displayFilteredModules,
    loadAllAvailableModules,
    setupListView
} from './ModuleContent_ListView.js';

    // --- Global DOM Element References (All main elements for the page) ---
    // These are declared at the module level now, and will be assigned in DOMContentLoaded.
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
    let generatePdfBtn = null;

    // --- Cloud Functions Callable ---
    // 'functions' is now imported from firebase-services.js and is already configured with the region.
    // Use the modular 'httpsCallable' function, passing the 'functions' instance.
    const generatePdfCallable = httpsCallable(functions, 'generateModulePdf');
    // ----------------------------------------------------------------------------------

    async function updatePdfButtonState(moduleType, pdfButtonElement) {
        // Access 'currentUser' directly from the imported 'auth' instance.
        const currentUser = auth.currentUser;
        let canGeneratePdf = false;

        if (currentUser) {
            try {
                const idTokenResult = await currentUser.getIdTokenResult(true);
                canGeneratePdf = idTokenResult.claims.admin === true;
            } catch (error) {
                console.error("Error fetching user claims for PDF button:", error);
                // Use the imported showAlert function
                showAlert(statusMessageSpan, statusAlert, 'Error checking PDF permissions.', true);
            }
        }

        const isApplicableModuleType = (moduleType === 'COURSE' || moduleType === 'LESSON');

        if (canGeneratePdf && isApplicableModuleType) {
            pdfButtonElement.style.display = 'inline-block';
            pdfButtonElement.disabled = false;
        } else {
            pdfButtonElement.style.display = 'none';
            pdfButtonElement.disabled = true;
        }
    }

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
        generatePdfBtn = document.getElementById('generatePdfBtn');

        currentChildrenDisplay = document.getElementById('currentChildrenDisplay');

        moduleTypeFilterSelect = document.getElementById('moduleTypeFilter');
        filterModuleTypeSelect = document.getElementById('filterModuleType');
        searchModulesInput = document.getElementById('searchModules');
        availableModulesList = document.getElementById('availableModulesList');

        statusAlert = document.getElementById('statusAlert');
        statusMessageSpan = document.getElementById('statusMessage');
        // Ensure loadingSpinner is correctly assigned.
        loadingSpinner = document.getElementById('globalLoadingSpinner');


        // --- 2. Setup Modules and Define Callbacks ---
        const editorCallbacks = {
            onRecordSaved: async (savedRecord) => {
                loadRecordIntoEditor(savedRecord, savedRecord.collection); // Direct import call
                await fetchAndPopulateTopLevelNavigation(); // Direct import call
                await applyModuleTypeFilter(); // Direct import call
                displayFilteredModules(); // Direct import call
                updatePdfButtonState(savedRecord.MODULETYPE, generatePdfBtn);
            },
            onRecordDeleted: async () => {
                await fetchAndPopulateTopLevelNavigation(); // Direct import call
                await applyModuleTypeFilter(); // Direct import call
                updateClassroomButtonState(getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect); // Direct import call
                updatePdfButtonState(getCurrentActiveRecord()?.MODULETYPE, generatePdfBtn); // Direct import call
                displayFilteredModules(); // Direct import call
            }
        };
        setupEditor({ // Direct import call
            activeRecordIdInput, activeRecordCollectionInput, activeRecordTypeSelect, newRecordTypeSelectorGroup,
            recordTitleInput, recordDescriptionTextarea, recordThemeInput, themeFields,
            imageStatusSelect, imageStatusFields, cefrInput, cefrFields,
            meaningOriginInput, meaningOriginFields, saveRecordBtn, deleteRecordBtn,
            currentChildrenDisplay, generateClassroomBtn, statusAlert, statusMessageSpan // Passed to editor
        }, editorCallbacks);

        const listViewCallbacks = {
            onRecordSelected: (recordData, collectionName) => {
                loadRecordIntoEditor(recordData, collectionName); // Direct import call
                updateClassroomButtonState(recordData?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
                updatePdfButtonState(recordData?.MODULETYPE, generatePdfBtn);
                displayFilteredModules(); // Direct import call
            }
        };
        setupListView({ // Direct import call
            prevRecordBtn, newRecordBtn, nextRecordBtn,
            moduleTypeFilterSelect, filterModuleTypeSelect, searchModulesInput, availableModulesList,
            statusAlert, statusMessageSpan, loadingSpinner
        }, listViewCallbacks);


        // --- 3. Setup Google Classroom Button Listener ---
        if (generateClassroomBtn) {
            generateClassroomBtn.addEventListener('click', () => {
                const currentRecord = getCurrentActiveRecord(); // Direct import call
                let selectedCourseId = '';
                let selectedCourseTitle = '';

                if (currentRecord && currentRecord.MODULETYPE === 'COURSE' && currentRecord.id) {
                    selectedCourseId = currentRecord.id;
                    selectedCourseTitle = currentRecord.TITLE || currentRecord.name;
                }

                // Now using the imported initiateGoogleClassroomExport function
                initiateGoogleClassroomExport(
                    selectedCourseId,
                    selectedCourseTitle,
                    generateClassroomBtn,
                    statusMessageSpan,
                    statusAlert
                );
            });
        }

        // --- 4. Setup Generate PDF Button Listener ---
        if (generatePdfBtn) {
            generatePdfBtn.addEventListener('click', async () => {
                const moduleId = activeRecordIdInput.value;
                const moduleType = activeRecordCollectionInput.value;

                if (!moduleId || (!moduleType || (moduleType !== 'LESSON' && moduleType !== 'COURSE'))) {
                    showAlert(statusMessageSpan, statusAlert, 'Please select a valid Course or Lesson to generate a PDF.', true);
                    return;
                }

                generatePdfBtn.disabled = true;
                generatePdfBtn.textContent = 'Generating...';
                showAlert(statusMessageSpan, statusAlert, 'Starting PDF generation, this may take a moment...', false);

                try {
                    const result = await generatePdfCallable({ moduleId: moduleId, moduleType: moduleType });
                    const { success, downloadUrl } = result.data;

                    if (success && downloadUrl) {
                        const a = document.createElement('a');
                        a.href = downloadUrl;
                        a.target = '_blank';
                        a.download = `${moduleType.toLowerCase()}-${moduleId}-document.pdf`;

                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);

                        showAlert(statusMessageSpan, statusAlert, 'PDF generated and download initiated successfully!', false);
                        console.log('PDF download initiated successfully using signed URL.');
                    } else if (success && !downloadUrl) {
                        showAlert(statusMessageSpan, statusAlert, 'PDF generated successfully, but no download URL was provided.', false);
                    } else {
                        showAlert(statusMessageSpan, statusAlert, 'PDF generation failed. Please try again.', true);
                    }
                } catch (error) {
                    console.error("Error calling generateModulePdf Cloud Function:", error);
                    let errorMessage = 'An unexpected error occurred during PDF generation.';
                    if (error.code && error.message) {
                        errorMessage = `PDF Generation Failed: ${error.message}`;
                        if (error.details && error.details.message) {
                            errorMessage += ` - ${error.details.message}`;
                        }
                    }
                    showAlert(statusMessageSpan, statusAlert, errorMessage, true);
                } finally {
                    generatePdfBtn.disabled = false;
                    generatePdfBtn.textContent = 'Generate PDF';
                }
            });
        }

        // --- 5. Initial Page Load Actions ---
        await fetchAndPopulateTopLevelNavigation(); // Direct import call
        await applyModuleTypeFilter(); // Direct import call
        await loadAllAvailableModules(); // Direct import call

        // Use the modular 'onAuthStateChanged' function, passing the imported 'auth' instance.
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const currentRecordType = activeRecordCollectionInput.value;
                updatePdfButtonState(currentRecordType, generatePdfBtn);
                updateClassroomButtonState(currentRecordType, generateClassroomBtn, activeRecordTypeSelect);
            } else {
                updatePdfButtonState(null, generatePdfBtn);
                updateClassroomButtonState(null, generateClassroomBtn, activeRecordTypeSelect);
            }
        });
    });
