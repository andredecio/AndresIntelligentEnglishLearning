// js/ModuleContent.js (Remodified with IIFE for private scope)
// This script acts as the main orchestrator for ModuleContent.html,
// initializing functionalities from other specialized modules.
// Version 1.006x
(function() { // Start IIFE for ModuleContent.js

    // --- Global DOM Element References (All main elements for the page) ---
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

    window.showStatusMessage = function(message, type = 'info', duration = 5000) {
        if (statusAlert && statusMessageSpan) {
            statusAlert.classList.remove('alert-info', 'alert-success', 'alert-warning', 'alert-error');
            statusAlert.classList.add(`alert-${type}`);
            statusMessageSpan.innerHTML = message;
            statusAlert.style.display = 'block';

            if (duration > 0) {
                setTimeout(() => {
                    statusAlert.style.display = 'none';
                }, duration);
            }
        } else {
            console.warn("Status alert elements not found for showStatusMessage:", message);
            if (type === 'error') console.error("STATUS ERROR:", message);
            else if (type === 'warning') console.warn("STATUS WARNING:", message);
            else console.log("STATUS INFO:", message);
        }
    };

    // --- Cloud Functions Callable ---
    // Access window.firebase.functions and its httpsCallable method
    // ** THE ESSENTIAL CHANGE IS HERE **
    const functionsInstance = window.firebase.functions('asia-southeast1'); // <<< Specify your function's region!
    const generatePdfCallable = functionsInstance.httpsCallable('generateModulePdf');
    // ----------------------------------------------------------------------------------

    async function updatePdfButtonState(moduleType, pdfButtonElement) {
        const currentUser = window.firebase.auth().currentUser; // Corrected access to auth()
        let canGeneratePdf = false;

        if (currentUser) {
            try {
                const idTokenResult = await currentUser.getIdTokenResult(true);
                canGeneratePdf = idTokenResult.claims.admin === true;
            } catch (error) {
                console.error("Error fetching user claims for PDF button:", error);
                window.showStatusMessage('Error checking PDF permissions.', 'error');
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
        if (availableModulesList) {
            loadingSpinner = availableModulesList.querySelector('.spinner') || document.querySelector('.page-spinner');
        }
        if (!loadingSpinner) {
            loadingSpinner = document.getElementById('globalLoadingSpinner');
        }

        // --- 2. Setup Modules and Define Callbacks ---
        const editorCallbacks = {
            onRecordSaved: async (savedRecord) => {
                window.loadRecordIntoEditor(savedRecord, savedRecord.collection);
                await window.fetchAndPopulateTopLevelNavigation();
                await window.applyModuleTypeFilter();
                window.displayFilteredModules();
                updatePdfButtonState(savedRecord.MODULETYPE, generatePdfBtn);
            },
            onRecordDeleted: async () => {
                await window.fetchAndPopulateTopLevelNavigation();
                await window.applyModuleTypeFilter();
                window.updateClassroomButtonState(window.getCurrentActiveRecord()?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
                updatePdfButtonState(window.getCurrentActiveRecord()?.MODULETYPE, generatePdfBtn);
                window.displayFilteredModules();
            }
        };
        window.setupEditor({
            activeRecordIdInput, activeRecordCollectionInput, activeRecordTypeSelect, newRecordTypeSelectorGroup,
            recordTitleInput, recordDescriptionTextarea, recordThemeInput, themeFields,
            imageStatusSelect, imageStatusFields, cefrInput, cefrFields,
            meaningOriginInput, meaningOriginFields, saveRecordBtn, deleteRecordBtn,
            currentChildrenDisplay, generateClassroomBtn, statusAlert, statusMessageSpan
        }, editorCallbacks);

        const listViewCallbacks = {
            onRecordSelected: (recordData, collectionName) => {
                window.loadRecordIntoEditor(recordData, collectionName);
                window.updateClassroomButtonState(recordData?.MODULETYPE, generateClassroomBtn, activeRecordTypeSelect);
                updatePdfButtonState(recordData?.MODULETYPE, generatePdfBtn);
                window.displayFilteredModules();
            }
        };
        window.setupListView({
            prevRecordBtn, newRecordBtn, nextRecordBtn,
            moduleTypeFilterSelect, filterModuleTypeSelect, searchModulesInput, availableModulesList,
            statusAlert, statusMessageSpan, loadingSpinner
        }, listViewCallbacks);


        // --- 3. Setup Google Classroom Button Listener ---
        if (generateClassroomBtn) {
            generateClassroomBtn.addEventListener('click', () => {
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

        // --- 4. Setup Generate PDF Button Listener ---
        if (generatePdfBtn) {
            generatePdfBtn.addEventListener('click', async () => {
                const moduleId = activeRecordIdInput.value;
                const moduleType = activeRecordCollectionInput.value;

                if (!moduleId || (!moduleType || (moduleType !== 'LESSON' && moduleType !== 'COURSE'))) {
                    window.showStatusMessage('Please select a valid Course or Lesson to generate a PDF.', 'error');
                    return;
                }

                generatePdfBtn.disabled = true;
                generatePdfBtn.textContent = 'Generating...';
                window.showStatusMessage('Starting PDF generation, this may take a moment...', 'info');

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

                        window.showStatusMessage('PDF generated and download initiated successfully!', 'success', 10000);
                        console.log('PDF download initiated successfully using signed URL.');
                    } else if (success && !downloadUrl) {
                        window.showStatusMessage('PDF generated successfully, but no download URL was provided.', 'warning');
                    } else {
                        window.showStatusMessage('PDF generation failed. Please try again.', 'error');
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
                    window.showStatusMessage(errorMessage, 'error');
                } finally {
                    generatePdfBtn.disabled = false;
                    generatePdfBtn.textContent = 'Generate PDF';
                }
            });
        }

        // --- 5. Initial Page Load Actions ---
        await window.fetchAndPopulateTopLevelNavigation();
        await window.applyModuleTypeFilter();
        await window.loadAllAvailableModules();

        window.firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                const currentRecordType = activeRecordCollectionInput.value;
                updatePdfButtonState(currentRecordType, generatePdfBtn);
                window.updateClassroomButtonState(currentRecordType, generateClassroomBtn, activeRecordTypeSelect);
            } else {
                updatePdfButtonState(null, generatePdfBtn);
                window.updateClassroomButtonState(null, generateClassroomBtn, activeRecordTypeSelect);
            }
        });
    });

})();
