// js/ModuleContent_ListView.js (Remodified for standard script loading - NO 'import' or 'export')
// Handles displaying, filtering, and navigating through module lists.

// Removed: import { db } from './firebase-services.js';
// Removed: import { showAlert, showSpinner, hideSpinner, renderThumbnail, renderAudioPlayer } from './ui-utilities.js';
// Removed: import { loadRecordIntoEditor, getCurrentActiveRecord } from './ModuleContent_Editor.js';


// --- Crucial Global State Variables (internal to this module, but used by its global functions) ---
let topLevelModuleNavigationList = []; // Stores ALL top-level modules for main navigation
let filteredNavigationList = [];      // Stores the currently filtered list for Prev/Next buttons
let currentTopLevelModuleIndex = 0;   // Current index within filteredNavigationList
let allAvailableModules = [];         // For the larger list of *all* selectable modules (for linking as children)

// --- Global DOM Element References (internal to this module) ---
let prevRecordBtn = null;
let newRecordBtn = null;
let nextRecordBtn = null;
let moduleTypeFilterSelect = null;
let filterModuleTypeSelect = null;
let searchModulesInput = null;
let availableModulesList = null;
let statusAlert = null;
let statusMessageSpan = null;
let loadingSpinner = null;


// --- Module-Specific Constants ---
const PARENT_MODULE_TYPES = ['COURSE', 'LESSON', 'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY', 'SYLLABLE'];
const NON_SELECTABLE_LEAF_MODULE_TYPES = ['PHONEME'];
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
const typesWithTheme = ['COURSE', 'LESSON', 'VOCABULARY_GROUP', 'VOCABULARY'];
const typesWithCEFR = ['LESSON', 'SEMANTIC_GROUP', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING', 'VOCABULARY_GROUP', 'VOCABULARY'];
const typesWithMeaningOrigin = ['VOCABULARY_GROUP', 'VOCABULARY'];


// --- Callbacks to Orchestrator (ModuleContent.js) ---
let onRecordSelectedCallback = () => {};


/**
 * Initializes the list view module by assigning DOM elements and setting up event listeners.
 */
function setupListView(elements, callbacks) { // Removed 'export'
    // Assign DOM elements
    prevRecordBtn = elements.prevRecordBtn;
    newRecordBtn = elements.newRecordBtn;
    nextRecordBtn = elements.nextRecordBtn;
    moduleTypeFilterSelect = elements.moduleTypeFilterSelect;
    filterModuleTypeSelect = elements.filterModuleTypeSelect;
    searchModulesInput = elements.searchModulesInput;
    availableModulesList = elements.availableModulesList;
    statusAlert = elements.statusAlert;
    statusMessageSpan = elements.statusMessageSpan;
    loadingSpinner = elements.loadingSpinner;

    // Assign callbacks
    onRecordSelectedCallback = callbacks.onRecordSelected;


    // --- Event Listeners for Filters/Search ---
    if (filterModuleTypeSelect) {
        filterModuleTypeSelect.addEventListener('change', displayFilteredModules);
    }
    if (searchModulesInput) {
        searchModulesInput.addEventListener('input', displayFilteredModules);
    }

    // --- Event Listeners for Single Record View Buttons ---
    if (newRecordBtn) {
        newRecordBtn.addEventListener('click', () => {
            // Assumed to be globally available from ModuleContent_Editor.js
            loadRecordIntoEditor(null, null);
            currentTopLevelModuleIndex = -1;
            updateNavigationButtons();
        });
    }

    if (prevRecordBtn) {
        prevRecordBtn.addEventListener('click', async () => {
            if (currentTopLevelModuleIndex > 0) {
                currentTopLevelModuleIndex--;
                await loadSelectedModuleIntoEditor();
                updateNavigationButtons();
            }
        });
    }

    if (nextRecordBtn) {
        nextRecordBtn.addEventListener('click', async () => {
            if (currentTopLevelModuleIndex < filteredNavigationList.length - 1) {
                currentTopLevelModuleIndex++;
                await loadSelectedModuleIntoEditor();
                updateNavigationButtons();
            }
        });
    }
}

/**
 * Loads the currently selected module (based on currentTopLevelModuleIndex)
 * into the editor via the orchestrator's callback.
 */
async function loadSelectedModuleIntoEditor() {
    const selectedModule = filteredNavigationList[currentTopLevelModuleIndex];
    if (selectedModule) {
        try {
            // Accessing global 'db' object
            const moduleSnap = await db.collection(selectedModule.collection).doc(selectedModule.id).get();
            if (moduleSnap.exists) {
                // Assumed to be globally available from ModuleContent_Editor.js
                onRecordSelectedCallback({ id: moduleSnap.id, ...moduleSnap.data() }, selectedModule.collection);
            } else {
                // Assumed to be globally available from ui-utilities.js
                showAlert(statusMessageSpan, statusAlert, "Selected module not found. Refreshing navigation.", true);
                // Assumed to be globally available
                await fetchAndPopulateTopLevelNavigation();
                await applyModuleTypeFilter();
            }
        } catch (error) {
            console.error("Error fetching selected module for editor:", error);
            // Assumed to be globally available from ui-utilities.js
            showAlert(statusMessageSpan, statusAlert, `Error loading module: ${error.message}`, true);
        }
    } else {
        // Assumed to be globally available from ModuleContent_Editor.js
        onRecordSelectedCallback(null, null);
    }
}


/**
 * Renders an individual list item for the larger availableModulesList.
 */
function renderModuleListItem(moduleData, level, currentModuleIds) {
    const li = document.createElement('li');
    li.classList.add('module-item');
    li.classList.add(`module-type-${moduleData.MODULETYPE.toLowerCase().replace(/_/g, '-')}`);
    li.dataset.moduleId = moduleData.id;
    if (level > 0) {
        li.classList.add(`level-${level}`);
        li.dataset.level = level;
    }

    // --- 1. Checkbox ---
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.moduleId = moduleData.id;
    if (currentModuleIds.includes(moduleData.id)) {
        checkbox.checked = true;
    }
    li.appendChild(checkbox);

    // --- 2. Main Content Wrapper ---
    const contentWrapper = document.createElement('div');
    contentWrapper.classList.add('module-item-content');
    li.appendChild(contentWrapper);

    const titleWrapper = document.createElement('div');
    titleWrapper.classList.add('module-item-title-wrapper');
    contentWrapper.appendChild(titleWrapper);

    const titleElement = document.createElement('div');
    titleElement.classList.add('title');
    titleElement.textContent = moduleData.TITLE || moduleData.name || 'Untitled Module';
    titleWrapper.appendChild(titleElement);

    const typeIndicator = document.createElement('span');
    typeIndicator.classList.add('type');
    typeIndicator.textContent = `${moduleData.MODULETYPE.replace(/_/g, ' ')}`;
    titleWrapper.appendChild(typeIndicator);

    // Conditional fields (Theme, Description, CEFR, Meaning Origin)
    if (moduleData.THEME && typesWithTheme.includes(moduleData.MODULETYPE)) {
        const themeElement = document.createElement('div');
        themeElement.classList.add('module-item-detail', 'module-item-theme');
        themeElement.textContent = `Theme: ${moduleData.THEME}`;
        contentWrapper.appendChild(themeElement);
    }
    if (moduleData.DESCRIPTION) {
        const descriptionElement = document.createElement('p');
        descriptionElement.classList.add('module-item-detail', 'module-item-description');
        const displayDescription = moduleData.DESCRIPTION.length > 150
            ? moduleData.DESCRIPTION.substring(0, 147) + '...'
            : moduleData.DESCRIPTION;
        descriptionElement.textContent = `Description: ${displayDescription}`;
        contentWrapper.appendChild(descriptionElement);
    }
    if (moduleData.CEFR && typesWithCEFR.includes(moduleData.MODULETYPE)) {
        const cefrElement = document.createElement('span');
        cefrElement.classList.add('module-item-detail', 'module-item-cefr');
        cefrElement.textContent = `CEFR: ${moduleData.CEFR}`;
        contentWrapper.appendChild(cefrElement);
    }
    if (moduleData.MEANING_ORIGIN && typesWithMeaningOrigin.includes(moduleData.MODULETYPE)) {
        const meaningOriginElement = document.createElement('div');
        meaningOriginElement.classList.add('module-item-detail', 'module-item-meaning-origin');
        meaningOriginElement.textContent = `Origin: ${moduleData.MEANING_ORIGIN}`;
        contentWrapper.appendChild(meaningOriginElement);
    }

    // --- 3. Media Container ---
    if (moduleData.IMAGEURL || moduleData.audioUrl) {
        const mediaContainer = document.createElement('div');
        mediaContainer.classList.add('module-media');

        if (moduleData.IMAGEURL) {
            // Assumed to be globally available from ui-utilities.js
            const imgLink = renderThumbnail(moduleData.IMAGEURL);
            if (imgLink) mediaContainer.appendChild(imgLink);
        }
        if (moduleData.audioUrl) {
            // Assumed to be globally available from ui-utilities.js
            const audioBtn = renderAudioPlayer(moduleData.audioUrl);
            if (audioBtn) mediaContainer.appendChild(audioBtn);
        }
        li.appendChild(mediaContainer);
    }

    // --- 4. Expand/Collapse Toggle ---
    const canHaveChildren = PARENT_MODULE_TYPES.includes(moduleData.MODULETYPE) || (moduleData.MODULEID_ARRAY && moduleData.MODULEID_ARRAY.length > 0);
    const expandToggle = document.createElement('span');
    expandToggle.classList.add('expand-toggle');
    expandToggle.textContent = '▶';
    li.appendChild(expandToggle);

    if (canHaveChildren) {
        expandToggle.style.cursor = 'pointer';
        expandToggle.addEventListener('click', async () => {
            const isExpanded = li.classList.toggle('expanded');
            expandToggle.textContent = isExpanded ? '▼' : '▶';

            if (!isExpanded) {
                let nextSibling = li.nextElementSibling;
                while (nextSibling && parseInt(nextSibling.dataset.level) > level) {
                    const tempSibling = nextSibling;
                    nextSibling = tempSibling.nextElementSibling;
                    tempSibling.remove();
                }
            } else {
                const childIds = moduleData.MODULEID_ARRAY || [];
                // Assumed to be globally available from ModuleContent_Editor.js
                await fetchAndRenderChildren(moduleData.id, childIds, level + 1, li, getCurrentActiveRecord()?.MODULEID_ARRAY || []);
            }
        });
    } else {
        expandToggle.classList.add('hidden');
    }

    return li;
}

/**
 * Fetches and renders child modules for a given parent.
 */
async function fetchAndRenderChildren(parentId, childIds, level, parentLi, selectedModuleIds) {
    console.log(`--- fetchAndRenderChildren called for parent: ${parentId}, level: ${level} ---`);
    console.log(`Child IDs to fetch:`, childIds);

    if (!childIds || childIds.length === 0) {
        console.log(`DEBUG: No child IDs provided or array is empty for parent ${parentId}. Returning.`);
        const noChildrenLi = document.createElement('li');
        noChildrenLi.className = `module-item level-${level} no-content-message`;
        noChildrenLi.textContent = '(No children found or defined for this module)';
        parentLi.after(noChildrenLi);
        return;
    }

    const allChildPromises = childIds.map(async (childId) => {
        let docSnap = null;
        try {
            // Accessing global 'db' object
            for (const col of ['learningContent', 'syllables', 'phonemes']) {
                docSnap = await db.collection(col).doc(childId).get();
                if (docSnap.exists) {
                    console.log(`DEBUG (fetchAndRenderChildren): Child ${childId} from '${col}'.`);
                    return { id: docSnap.id, ...docSnap.data(), collection: col };
                }
            }
            console.warn(`DEBUG: Child module with ID ${childId} not found in any expected collection.`);
            // Assumed to be globally available from ui-utilities.js
            showAlert(statusMessageSpan, statusAlert, `Child module ${childId} not found.`, true);
            return null;
        } catch (error) {
            console.error(`DEBUG: Error fetching child ${childId}:`, error);
            // Assumed to be globally available from ui-utilities.js
            showAlert(statusMessageSpan, statusAlert, `Permission denied for child module ${childId}. Check Firestore Rules.`, true);
            return null;
        }
    });

    const children = (await Promise.all(allChildPromises)).filter(Boolean);
    console.log(`DEBUG: Number of valid children fetched for parent ${parentId}: ${children.length}`);
    console.log(`DEBUG: Fetched children data (filtered):`, children);

    const existingNoContent = parentLi.nextElementSibling;
    if (existingNoContent && existingNoContent.classList.contains('no-content-message') && parseInt(existingNoContent.dataset.level) === level) {
        existingNoContent.remove();
    }

    if (children.length === 0) {
        console.log(`DEBUG: No actual child documents were retrieved for parent ID: ${parentId}. Displaying 'No content' message.`);
        const noContentLi = document.createElement('li');
        noContentLi.textContent = `(No content found or could be loaded for this module)`;
        noContentLi.className = `module-item level-${level} no-content-message`;
        parentLi.after(noContentLi);
    } else {
        let currentNodeToInsertAfter = parentLi;
        children.forEach(childData => {
            const childLi = renderModuleListItem(childData, level, selectedModuleIds);
            currentNodeToInsertAfter.after(childLi);
            currentNodeToInsertAfter = childLi;
        });
        console.log(`DEBUG: Children rendered for parent ${parentId}.`);
    }
}

/**
 * Loads all relevant modules for the larger available modules list.
 */
async function loadAllAvailableModules() { // Removed 'export'
    // Assumed to be globally available from ui-utilities.js
    showSpinner(availableModulesList, loadingSpinner);
    if (availableModulesList) { availableModulesList.innerHTML = ''; }

    try {
        const allFetchedModules = [];

        const collectionsToFetch = ['COURSE', 'LESSON', 'learningContent'];
        for (const colName of collectionsToFetch) {
            // Accessing global 'db' object
            const snapshot = await db.collection(colName).get();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (colName === 'learningContent' && data.MODULETYPE && NON_SELECTABLE_LEAF_MODULE_TYPES.includes(data.MODULETYPE)) {
                    return;
                }
                allFetchedModules.push({ id: doc.id, ...data, collection: colName });
            });
        }

        allAvailableModules = allFetchedModules;
        displayFilteredModules();

    } catch (error) {
        console.error("Error loading all available modules:", error);
        // Assumed to be globally available from ui-utilities.js
        showAlert(statusMessageSpan, statusAlert, "Failed to load available modules. " + error.message, true);
    } finally {
        // Assumed to be globally available from ui-utilities.js
        hideSpinner(availableModulesList, loadingSpinner);
    }
}

/**
 * Displays modules in the larger list view based on current filters and search.
 */
function displayFilteredModules() { // Removed 'export'
    if (availableModulesList) { availableModulesList.innerHTML = ''; }

    const filterType = filterModuleTypeSelect ? filterModuleTypeSelect.value : 'all';
    const searchTerm = searchModulesInput ? searchModulesInput.value.toLowerCase() : '';

    // Assumed to be globally available from ModuleContent_Editor.js
    const activeRecord = getCurrentActiveRecord();
    const activeRecordId = activeRecord ? activeRecord.id : null;
    const currentModuleIds = activeRecord?.MODULEID_ARRAY || [];

    let modulesToShow = [...allAvailableModules];

    if (activeRecord && activeRecord.MODULETYPE === 'COURSE') {
        modulesToShow = modulesToShow.filter(module => module.MODULETYPE === 'LESSON');
        if (filterModuleTypeSelect) {
            filterModuleTypeSelect.value = 'LESSON';
            filterModuleTypeSelect.disabled = true;
        }
    } else {
        if (filterModuleTypeSelect) {
            filterModuleTypeSelect.disabled = false;
            if (filterModuleTypeSelect.value === 'LESSON' && !activeRecord) {
                filterModuleTypeSelect.value = 'all';
            }
        }
    }

    const filtered = modulesToShow.filter(module => {
        const matchesType = (filterType === 'all' || module.MODULETYPE === filterType);
        const matchesSearch = (module.TITLE || '').toLowerCase().includes(searchTerm) || (module.name || '').toLowerCase().includes(searchTerm);
        const isCurrentActiveRecord = (activeRecordId && module.id === activeRecordId);

        return matchesType && matchesSearch && !isCurrentActiveRecord;
    });

    if (filtered.length === 0) {
        if (availableModulesList) {
            availableModulesList.innerHTML = `<li class="loading-placeholder">No modules found matching criteria or available for selection.</li>`;
        }
        return;
    }

    filtered.forEach(moduleData => {
        const li = renderModuleListItem(moduleData, 0, currentModuleIds);
        if (availableModulesList) { availableModulesList.appendChild(li); }

        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.disabled) {
            checkbox.addEventListener('change', (event) => {
                const moduleId = event.target.dataset.moduleId;
                // Assumed to be globally available from ModuleContent_Editor.js
                const activeRecordForSelection = getCurrentActiveRecord();

                if (activeRecordForSelection) {
                    if (!activeRecordForSelection.MODULEID_ARRAY) {
                        activeRecordForSelection.MODULEID_ARRAY = [];
                    }
                    if (event.target.checked) {
                        if (!activeRecordForSelection.MODULEID_ARRAY.includes(moduleId)) {
                            activeRecordForSelection.MODULEID_ARRAY.push(moduleId);
                        }
                    } else {
                        const index = activeRecordForSelection.MODULEID_ARRAY.indexOf(moduleId);
                        if (index > -1) {
                            activeRecordForSelection.MODULEID_ARRAY.splice(index, 1);
                        }
                    }
                    // Assumed to be globally available from ModuleContent_Editor.js
                    loadRecordIntoEditor(activeRecordForSelection, activeRecordForSelection.collection);
                }
            });
        }
    });
}

/**
 * Adds a module ID to the current active record's selection.
 */
function addModuleToActiveRecordSelection(moduleId) { // Removed 'export'
    // Assumed to be globally available from ModuleContent_Editor.js
    const activeRecord = getCurrentActiveRecord();
    if (activeRecord) {
        if (!activeRecord.MODULEID_ARRAY) {
            activeRecord.MODULEID_ARRAY = [];
        }
        if (!activeRecord.MODULEID_ARRAY.includes(moduleId)) {
            activeRecord.MODULEID_ARRAY.push(moduleId);
            // Assumed to be globally available from ModuleContent_Editor.js
            loadRecordIntoEditor(activeRecord, activeRecord.collection);
            console.log(`Added ${moduleId} to currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

/**
 * Removes a module ID from the current active record's selection.
 */
function removeModuleFromActiveRecordSelection(moduleId) { // Removed 'export'
    // Assumed to be globally available from ModuleContent_Editor.js
    const activeRecord = getCurrentActiveRecord();
    if (activeRecord && activeRecord.MODULEID_ARRAY) {
        const index = activeRecord.MODULEID_ARRAY.indexOf(moduleId);
        if (index > -1) {
            activeRecord.MODULEID_ARRAY.splice(index, 1);
            // Assumed to be globally available from ModuleContent_Editor.js
            loadRecordIntoEditor(activeRecord, activeRecord.collection);
            console.log(`Removed ${moduleId} from currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

/**
 * Populates the main filter dropdown with unique module types found in top-level modules.
 */
function populateModuleTypeFilter() { // Removed 'export'
    if (moduleTypeFilterSelect) {
        moduleTypeFilterSelect.innerHTML = '<option value="ALL">All Module Types</option>';

        const uniqueModuleTypes = new Set();
        topLevelModuleNavigationList.forEach(module => {
            uniqueModuleTypes.add(module.MODULETYPE);
        });

        const sortedTypes = Array.from(uniqueModuleTypes).sort();

        sortedTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type.replace(/_/g, ' ');
            moduleTypeFilterSelect.appendChild(option);
        });
    }
}

/**
 * Applies the selected filter and updates the navigation list, then loads the first record.
 */
async function applyModuleTypeFilter() { // Removed 'export'
    const selectedFilterType = moduleTypeFilterSelect ? moduleTypeFilterSelect.value : 'ALL';

    if (selectedFilterType === 'ALL') {
        filteredNavigationList = [...topLevelModuleNavigationList];
    } else {
        filteredNavigationList = topLevelModuleNavigationList.filter(module => {
            return module.MODULETYPE === selectedFilterType;
        });
    }

    currentTopLevelModuleIndex = 0;

    if (filteredNavigationList.length > 0) {
        // Assumed to be globally available
        await loadSelectedModuleIntoEditor();
    } else {
        // Assumed to be globally available from ModuleContent_Editor.js
        loadRecordIntoEditor(null);
        // Assumed to be globally available from ui-utilities.js
        showAlert(statusMessageSpan, statusAlert, `No records found for module type: ${selectedFilterType}`, false);
    }
    updateNavigationButtons();
}

/**
 * Fetches all top-level modules (COURSEs, LESSONs, and selected learningContent types)
 * into the master navigation list.
 */
async function fetchAndPopulateTopLevelNavigation() { // Removed 'export'
    try {
        const allTopLevelModules = [];

        const topLevelCollections = ['COURSE', 'LESSON'];
        for (const col of topLevelCollections) {
            // Accessing global 'db' object
            const snapshot = await db.collection(col).get();
            snapshot.forEach(doc => {
                allTopLevelModules.push({ id: doc.id, ...doc.data(), MODULETYPE: doc.data().MODULETYPE || col, collection: col });
            });
        }

        // Accessing global 'db' object
        const learningContentSnapshot = await db.collection('learningContent').get();
        learningContentSnapshot.forEach(doc => {
            const data = doc.data();
            if (topLevelLearningContentTypes.includes(data.MODULETYPE)) { // Fix: topLevelLearningContentTypes was undefined. It's a const defined above.
                allTopLevelModules.push({ id: doc.id, ...data, collection: 'learningContent' });
            }
        });

        allTopLevelModules.sort((a, b) => (a.TITLE || '').localeCompare(b.TITLE || ''));

        topLevelModuleNavigationList = allTopLevelModules;
        populateModuleTypeFilter();
        updateNavigationButtons();
    } catch (error) {
        console.error("Error fetching top-level navigation:", error);
        // Assumed to be globally available from ui-utilities.js
        showAlert(statusMessageSpan, statusAlert, "Failed to load top-level navigation. " + error.message, true);
    }
}

/**
 * Updates the disabled state of Prev/Next buttons based on the current index and filtered list length.
 */
function updateNavigationButtons() { // Removed 'export'
    if (prevRecordBtn) {
        prevRecordBtn.disabled = currentTopLevelModuleIndex <= 0;
    } else {
        console.warn("Prev button (prevRecordBtn) not found for updateNavigationButtons.");
    }

    if (nextRecordBtn) {
        nextRecordBtn.disabled = currentTopLevelModuleIndex >= filteredNavigationList.length - 1;
    } else {
        console.warn("Next button (nextRecordBtn) not found for updateNavigationButtons.");
    }

    if (filteredNavigationList.length === 0) {
        if (prevRecordBtn) prevRecordBtn.disabled = true;
        if (nextRecordBtn) nextRecordBtn.disabled = true;
    }
}

// --- Make functions accessible globally via the window object ---
window.setupListView = setupListView;
window.loadSelectedModuleIntoEditor = loadSelectedModuleIntoEditor;
window.renderModuleListItem = renderModuleListItem; // Often internal, but explicitly exposed for flexibility
window.fetchAndRenderChildren = fetchAndRenderChildren;
window.loadAllAvailableModules = loadAllAvailableModules;
window.displayFilteredModules = displayFilteredModules;
window.addModuleToActiveRecordSelection = addModuleToActiveRecordSelection;
window.removeModuleFromActiveRecordSelection = removeModuleFromActiveRecordSelection;
window.populateModuleTypeFilter = populateModuleTypeFilter;
window.applyModuleTypeFilter = applyModuleTypeFilter;
window.fetchAndPopulateTopLevelNavigation = fetchAndPopulateTopLevelNavigation;
window.updateNavigationButtons = updateNavigationButtons;

// Added a missing constant from the fetchAndPopulateTopLevelNavigation function
const topLevelLearningContentTypes = [
    'SEMANTIC_GROUP', 'VOCABULARY', 'VOCABULARY_GROUP', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING'
];
