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
    let generatePdfBtn = null; // NEW: Reference for the PDF button

    // --- NEW: Define showStatusMessage function globally ---
    // It uses the statusAlert and statusMessageSpan elements
    window.showStatusMessage = function(message, type = 'info', duration = 5000) {
        if (statusAlert && statusMessageSpan) {
            // Clear previous classes
            statusAlert.classList.remove('alert-info', 'alert-success', 'alert-warning', 'alert-error');
            statusAlert.classList.add(`alert-${type}`); // Add type class for styling (e.g., Bootstrap alerts)
            statusMessageSpan.innerHTML = message;
            statusAlert.style.display = 'block';

            if (duration > 0) {
                setTimeout(() => {
                    statusAlert.style.display = 'none';
                }, duration);
            }
        } else {
            console.warn("Status alert elements not found for showStatusMessage:", message);
            // Fallback to console if elements aren't ready
            if (type === 'error') console.error("STATUS ERROR:", message);
            else if (type === 'warning') console.warn("STATUS WARNING:", message);
            else console.log("STATUS INFO:", message);
        }
    };


    // --- Cloud Functions Callable ---
    // Access window.functions and its httpsCallable method
    const generatePdfCallable = window.firebase.functions().httpsCallable('generateModulePdf'); // Corrected way to access callable function

    // --- Function to update the state of the PDF button ---
    async function updatePdfButtonState(moduleType, pdfButtonElement) {
        const currentUser = window.auth.currentUser; // Access global auth object
        let canGeneratePdf = false;

        if (currentUser) {
            try {
                // Get fresh ID token to ensure custom claims are up-to-date
                const idTokenResult = await currentUser.getIdTokenResult(true);
                // --- FIX IS HERE (already made from previous step) ---
                canGeneratePdf = idTokenResult.claims.admin === true; 
                // ---------------------------------------------------
            } catch (error) {
                console.error("Error fetching user claims for PDF button:", error);
                // Now this call to window.showStatusMessage should work!
                window.showStatusMessage('Error checking PDF permissions.', 'error'); 
            }
        }

        const isApplicableModuleType = (moduleType === 'COURSE' || moduleType === 'LESSON');

        if (canGeneratePdf && isApplicableModuleType) {
            pdfButtonElement.style.display = 'inline-block';
            pdfButtonElement.disabled = false;
        } else {
            pdfButtonElement.style.display = 'none';
            pdfButtonElement.disabled = true; // Always disable if not displayed or no permission
        }
    }


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
        generatePdfBtn = document.getElementById('generatePdfBtn'); // NEW: Get reference here

        currentChildrenDisplay = document.getElementById('currentChildrenDisplay');

        moduleTypeFilterSelect = document.getElementById('moduleTypeFilter');
        filterModuleTypeSelect = document.getElementById('filterModuleType');
        searchModulesInput = document.getElementById('searchModules');
        availableModulesList = document.getElementById('availableModulesList');

        statusAlert = document.getElementById('statusAlert'); // Make sure this is correctly querying your HTML
        statusMessageSpan = document.getElementById('statusMessage'); // Make sure this is correctly querying your HTML
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
                window.loadRecordIntoEditor(savedRecord, savedRecord.collection);

                // Re-fetch and re-filter navigation lists.
                await window.fetchAndPopulateTopLevelNavigation();
                await window.applyModuleTypeFilter();

                // After updating navigation and editor, refresh the larger selectable modules list.
                window.displayFilteredModules();

                // NEW: Update PDF button state after saving a record
                updatePdfButtonState(savedRecord.MODULETYPE, generatePdfBtn);
            },
            onRecordDeleted: async () => {
                await window.fetchAndPopulateTopLevelNavigation();
                await window.applyModuleTypeFilter();

                // Assuming window.updateClassroomButtonState and window.getCurrentActiveRecord are globally available
                window.updateClassroomButtonState(window.getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
                // NEW: Update PDF button state after deleting a record (will hide if no active record)
                updatePdfButtonState(window.getCurrentActiveRecord()?.MODULETYPE, generatePdfBtn);

                window.displayFilteredModules();
            }
        };
        // Assuming window.setupEditor is globally available from ModuleContent_Editor.js
        window.setupEditor({
            activeRecordIdInput, activeRecordCollectionInput, activeRecordTypeSelect, newRecordTypeSelectorGroup,
            recordTitleInput, recordDescriptionTextarea, recordThemeInput, themeFields,
            imageStatusSelect, imageStatusFields, cefrInput, cefrFields,
            meaningOriginInput, meaningOriginFields, saveRecordBtn, deleteRecordBtn,
            currentChildrenDisplay, generateClassroomBtn, statusAlert, statusMessageSpan
        }, editorCallbacks);


        const listViewCallbacks = {
            onRecordSelected: (recordData, collectionName) => {
                // Assuming window.loadRecordIntoEditor and window.updateClassroomButtonState are globally available
                window.loadRecordIntoEditor(recordData, collectionName);
                window.updateClassroomButtonState(recordData?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
                // NEW: Update PDF button state when a new record is selected
                updatePdfButtonState(recordData?.MODULETYPE, generatePdfBtn);

                window.displayFilteredModules();
            }
        };
        // Assuming window.setupListView is globally available from ModuleContent_ListView.js
        window.setupListView({
            prevRecordBtn, newRecordBtn, nextRecordBtn,
            moduleTypeFilterSelect, filterModuleTypeSelect, searchModulesInput, availableModulesList,
            statusAlert, statusMessageSpan, loadingSpinner
        }, listViewCallbacks);


        // --- 3. Setup Google Classroom Button Listener ---
        if (generateClassroomBtn) {
            generateClassroomBtn.addEventListener('click', () => {
                // Assuming window.getCurrentActiveRecord and window.initiateGoogleClassroomExport are globally available
                const currentRecord = window.getCurrentActiveRecord();

                let selectedCourseId = '';
                let selectedCourseTitle = '';

                if (currentRecord && currentRecord.MODULETYPE === 'COURSE' && currentRecord.id) {
                    selectedCourseId = currentRecord.id;
                    selectedCourseTitle = currentRecord.TITLE || currentRecord.name;
                }

                window.initiateGoogleClassroomExport(
                    selectedCourseId,
                    selectedCourseTitle,
                    generateClassroomBtn,
                    statusMessageSpan,
                    statusAlert
                );
            });
        }

        // --- 4. Setup Generate PDF Button Listener (NEW) ---
        if (generatePdfBtn) {
            generatePdfBtn.addEventListener('click', async () => {
                const moduleId = activeRecordIdInput.value;
                const moduleType = activeRecordCollectionInput.value; // This holds the collection name (COURSE/LESSON)

                if (!moduleId || (!moduleType || (moduleType !== 'LESSON' && moduleType !== 'COURSE'))) {
                    // Now this call to window.showStatusMessage should work!
                    window.showStatusMessage('Please select a valid Course or Lesson to generate a PDF.', 'error');
                    return;
                }

                generatePdfBtn.disabled = true;
                generatePdfBtn.textContent = 'Generating...';
                // Now this call to window.showStatusMessage should work!
                window.showStatusMessage('Starting PDF generation, this may take a moment...', 'info');

                try {
                    const result = await generatePdfCallable({ moduleId: moduleId, moduleType: moduleType });
                    // --- START OF CLIENT-SIDE CHANGE ---
                    // The Cloud Function now returns 'downloadUrl' for the temporary link
                    const { success, downloadUrl } = result.data; 

                    if (success && downloadUrl) {
                        // Create a temporary link element and click it to trigger download
                        const a = document.createElement('a');
                        a.href = downloadUrl;
                        a.target = '_blank'; // Opens in a new tab/window to display the PDF or initiate download
                        
                        // Suggest a filename for the download. You can make this more dynamic.
                        // Example: "lesson-someid-document.pdf" or "course-someid-document.pdf"
                        a.download = `${moduleType.toLowerCase()}-${moduleId}-document.pdf`; 
                        
                        document.body.appendChild(a); // Append to body (necessary for some browsers like Firefox)
                        a.click(); // Programmatically click the link
                        document.body.removeChild(a); // Clean up the element

                        window.showStatusMessage('PDF generated and download initiated successfully!', 'success', 10000);
                        console.log('PDF download initiated successfully using signed URL.');
                    } else if (success && !downloadUrl) {
                        // This case shouldn't happen if the Cloud Function always returns downloadUrl on success
                        window.showStatusMessage('PDF generated successfully, but no download URL was provided.', 'warning');
                    } else {
                        window.showStatusMessage('PDF generation failed. Please try again.', 'error');
                    }
                    // --- END OF CLIENT-SIDE CHANGE ---
                } catch (error) {
                    console.error("Error calling generateModulePdf Cloud Function:", error);
                    let errorMessage = 'An unexpected error occurred during PDF generation.';
                    // Firebase Callable Function errors have specific structure
                    if (error.code && error.message) {
                        errorMessage = `PDF Generation Failed: ${error.message}`;
                        if (error.details && error.details.message) {
                            errorMessage += ` - ${error.details.message}`;
                        }
                    }
                    // Now this call to window.showStatusMessage should work!
                    window.showStatusMessage(errorMessage, 'error');
                } finally {
                    generatePdfBtn.disabled = false;
                    generatePdfBtn.textContent = 'Generate PDF';
                }
            });
        }


        // --- 5. Initial Page Load Actions ---
        // Assuming window.fetchAndPopulateTopLevelNavigation, window.applyModuleTypeFilter,
        // and window.loadAllAvailableModules are globally available from ModuleContent_ListView.js
        await window.fetchAndPopulateTopLevelNavigation();
        await window.applyModuleTypeFilter(); // This will handle initial load into editor.
        await window.loadAllAvailableModules();

        // NEW: Initial auth state check to set button visibility immediately
        // Access window.auth and its onAuthStateChanged method
        window.firebase.auth().onAuthStateChanged(async (user) => { // Corrected access to auth()
            if (user) {
                // After initial login or refresh, ensure button states are correct for the active record
                const currentRecordType = activeRecordCollectionInput.value;
                updatePdfButtonState(currentRecordType, generatePdfBtn);
                // Assuming window.updateClassroomButtonState is globally available
                window.updateClassroomButtonState(currentRecordType, generateClassroomBtn, activeRecordTypeSelect);
            } else {
                // If logged out, hide all permission-based buttons
                updatePdfButtonState(null, generatePdfBtn);
                window.updateClassroomButtonState(null, generateClassroomBtn, activeRecordTypeSelect);
            }
        });
    });

})(); // End IIFE for ModuleContent.js
