// js/ModuleContent_ListView.js
// Handles displaying, filtering, and navigating through module lists.

// Import necessary Firebase services from our centralized setup.
import { db } from './firebase-services.js';
// Import UI utility functions.
import { showAlert, showSpinner, hideSpinner, renderThumbnail, renderAudioPlayer } from './ui-utilities.js';
// Import functions from the Editor module (to load a record into editor when selected)
import { loadRecordIntoEditor, getCurrentActiveRecord } from './ModuleContent_Editor.js';

// --- Crucial Global State Variables (internal to this module) ---
// These manage the navigation and filtering logic for the list view.
let topLevelModuleNavigationList = []; // Stores ALL top-level modules for main navigation
let filteredNavigationList = [];      // Stores the currently filtered list for Prev/Next buttons
let currentTopLevelModuleIndex = 0;   // Current index within filteredNavigationList
let allAvailableModules = [];         // For the larger list of *all* selectable modules (for linking as children)

// --- Global DOM Element References (internal to this module) ---
// These are specific to the list view and navigation.
let prevRecordBtn = null;
let newRecordBtn = null;
let nextRecordBtn = null;
let moduleTypeFilterSelect = null; // The main filter for top-level navigation
let filterModuleTypeSelect = null; // The filter within the larger 'children' list
let searchModulesInput = null;
let availableModulesList = null;
let statusAlert = null;     // Re-reference for showAlert
let statusMessageSpan = null; // Re-reference for showAlert
let loadingSpinner = null;  // For the larger availableModulesList spinner (if separate from main page spinner)


// --- Module-Specific Constants ---
// Lists of module types that determine behavior (moved from original ModuleContent.js)
const PARENT_MODULE_TYPES = ['COURSE', 'LESSON', 'SEMANTIC_GROUP', 'VOCABULARY_GROUP', 'VOCABULARY', 'SYLLABLE'];
const NON_SELECTABLE_LEAF_MODULE_TYPES = ['PHONEME'];
const moduleTypes = { // Define module types and their corresponding collections
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
// These functions will be provided by the main ModuleContent.js to allow ListView.js
// to trigger actions in other modules (like updating the editor after selection).
let onRecordSelectedCallback = () => {};


/**
 * Initializes the list view module by assigning DOM elements and setting up event listeners.
 * @param {object} elements - An object containing references to the list view's DOM elements.
 * @param {object} callbacks - An object containing callback functions for inter-module communication.
 */
export function setupListView(elements, callbacks) {
    // Assign DOM elements
    prevRecordBtn = elements.prevRecordBtn;
    newRecordBtn = elements.newRecordBtn; // New record creation is initiated from list view
    nextRecordBtn = elements.nextRecordBtn;
    moduleTypeFilterSelect = elements.moduleTypeFilterSelect;
    filterModuleTypeSelect = elements.filterModuleTypeSelect; // Filter within the available modules list
    searchModulesInput = elements.searchModulesInput;
    availableModulesList = elements.availableModulesList;
    statusAlert = elements.statusAlert; // For showAlert function
    statusMessageSpan = elements.statusMessageSpan; // For showAlert function
    loadingSpinner = elements.loadingSpinner; // For show/hideSpinner (if a separate spinner for this list)

    // Assign callbacks
    onRecordSelectedCallback = callbacks.onRecordSelected;


    // --- Event Listeners for Filters/Search ---
    if (filterModuleTypeSelect) {
        filterModuleTypeSelect.addEventListener('change', displayFilteredModules);
    }
    if (searchModulesInput) {
        searchModulesInput.addEventListener('input', displayFilteredModules); // Or 'change' if you prefer
    }

    // --- Event Listeners for Single Record View Buttons ---
    if (newRecordBtn) {
        newRecordBtn.addEventListener('click', () => {
            onRecordSelectedCallback(null, null); // Notify orchestrator to load a blank form
            currentTopLevelModuleIndex = -1; // Indicate no record is active in navigation
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
            const moduleSnap = await db.collection(selectedModule.collection).doc(selectedModule.id).get();
            if (moduleSnap.exists) {
                onRecordSelectedCallback({ id: moduleSnap.id, ...moduleSnap.data() }, selectedModule.collection);
            } else {
                showAlert(statusMessageSpan, statusAlert, "Selected module not found. Refreshing navigation.", true);
                await fetchAndPopulateTopLevelNavigation();
                await applyModuleTypeFilter(); // This will reload the first item of the now-refreshed filtered list
            }
        } catch (error) {
            console.error("Error fetching selected module for editor:", error);
            showAlert(statusMessageSpan, statusAlert, `Error loading module: ${error.message}`, true);
        }
    } else {
        onRecordSelectedCallback(null, null); // No module to load, clear editor
    }
}


/**
 * Renders an individual list item for the larger availableModulesList.
 * @param {object} moduleData - The record data from Firestore.
 * @param {number} level - The nesting level for indentation (0 for top-level).
 * @param {Array<string>} currentModuleIds - Array of IDs currently selected for the active parent.
 * @returns {HTMLLIElement} The created list item HTML element.
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
            const imgLink = renderThumbnail(moduleData.IMAGEURL);
            if (imgLink) mediaContainer.appendChild(imgLink);
        }
        if (moduleData.audioUrl) {
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

            if (!isExpanded) { // If collapsing, remove all nested children
                let nextSibling = li.nextElementSibling;
                while (nextSibling && parseInt(nextSibling.dataset.level) > level) {
                    const tempSibling = nextSibling;
                    nextSibling = tempSibling.nextElementSibling;
                    tempSibling.remove();
                }
            } else { // If expanding, fetch and render children
                const childIds = moduleData.MODULEID_ARRAY || [];
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
 * @param {string} parentId The ID of the parent module.
 * @param {Array<string>} childIds An array of IDs of the child modules.
 * @param {number} level The nesting level for the children.
 * @param {HTMLLIElement} parentLi The HTML <li> element of the parent.
 * @param {Array<string>} selectedModuleIds Array of IDs currently selected for the active parent.
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
            // Check learningContent, syllables, phonemes collections
            for (const col of ['learningContent', 'syllables', 'phonemes']) {
                docSnap = await db.collection(col).doc(childId).get();
                if (docSnap.exists) {
                    console.log(`DEBUG (fetchAndRenderChildren): Child ${childId} from '${col}'.`);
                    return { id: docSnap.id, ...docSnap.data(), collection: col };
                }
            }
            console.warn(`DEBUG: Child module with ID ${childId} not found in any expected collection.`);
            showAlert(statusMessageSpan, statusAlert, `Child module ${childId} not found.`, true);
            return null;
        } catch (error) {
            console.error(`DEBUG: Error fetching child ${childId}:`, error);
            showAlert(statusMessageSpan, statusAlert, `Permission denied for child module ${childId}. Check Firestore Rules.`, true);
            return null;
        }
    });

    const children = (await Promise.all(allChildPromises)).filter(Boolean); // Filter out nulls
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
 * This includes COURSEs, LESSONs, and all selectable items from learningContent.
 */
export async function loadAllAvailableModules() {
    showSpinner(availableModulesList, loadingSpinner);
    if (availableModulesList) { availableModulesList.innerHTML = ''; }

    try {
        const allFetchedModules = [];

        const collectionsToFetch = ['COURSE', 'LESSON', 'learningContent'];
        for (const colName of collectionsToFetch) {
            const snapshot = await db.collection(colName).get();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (colName === 'learningContent' && data.MODULETYPE && NON_SELECTABLE_LEAF_MODULE_TYPES.includes(data.MODULETYPE)) {
                    // Skip non-selectable leaf types from learningContent for this list.
                    return;
                }
                allFetchedModules.push({ id: doc.id, ...data, collection: colName });
            });
        }

        allAvailableModules = allFetchedModules;
        displayFilteredModules(); // Display initially without filters

    } catch (error) {
        console.error("Error loading all available modules:", error);
        showAlert(statusMessageSpan, statusAlert, "Failed to load available modules. " + error.message, true);
    } finally {
        hideSpinner(availableModulesList, loadingSpinner);
    }
}

/**
 * Displays modules in the larger list view based on current filters and search.
 * It uses the 'allAvailableModules' global array.
 */
export function displayFilteredModules() {
    if (availableModulesList) { availableModulesList.innerHTML = ''; }

    const filterType = filterModuleTypeSelect ? filterModuleTypeSelect.value : 'all';
    const searchTerm = searchModulesInput ? searchModulesInput.value.toLowerCase() : '';

    const activeRecord = getCurrentActiveRecord(); // Get active record from editor module
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
                const activeRecordForSelection = getCurrentActiveRecord(); // Get latest active record

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
                    // Notify editor to update its children display (if needed, or editor does it on load)
                    // For now, let's keep updateCurrentChildrenDisplay as part of editor module.
                    // This change handler should directly update the active record's children array,
                    // and then editor module's updateCurrentChildrenDisplay should be called if editor is visible.
                    loadRecordIntoEditor(activeRecordForSelection, activeRecordForSelection.collection);
                }
            });
        }
    });
}

/**
 * Adds a module ID to the current active record's selection.
 * NOTE: This function is now mostly handled by the checkbox change listener in displayFilteredModules,
 * but keeping it exported if other parts of the app need to programmatically add children.
 * @param {string} moduleId The ID of the module to add.
 */
export function addModuleToActiveRecordSelection(moduleId) {
    const activeRecord = getCurrentActiveRecord();
    if (activeRecord) {
        if (!activeRecord.MODULEID_ARRAY) {
            activeRecord.MODULEID_ARRAY = [];
        }
        if (!activeRecord.MODULEID_ARRAY.includes(moduleId)) {
            activeRecord.MODULEID_ARRAY.push(moduleId);
            loadRecordIntoEditor(activeRecord, activeRecord.collection); // Refresh editor to show change
            console.log(`Added ${moduleId} to currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

/**
 * Removes a module ID from the current active record's selection.
 * NOTE: This function is now mostly handled by the checkbox change listener in displayFilteredModules,
 * but keeping it exported if other parts of the app need to programmatically remove children.
 * @param {string} moduleId The ID of the module to remove.
 */
export function removeModuleFromActiveRecordSelection(moduleId) {
    const activeRecord = getCurrentActiveRecord();
    if (activeRecord && activeRecord.MODULEID_ARRAY) {
        const index = activeRecord.MODULEID_ARRAY.indexOf(moduleId);
        if (index > -1) {
            activeRecord.MODULEID_ARRAY.splice(index, 1);
            loadRecordIntoEditor(activeRecord, activeRecord.collection); // Refresh editor to show change
            console.log(`Removed ${moduleId} from currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

/**
 * Populates the main filter dropdown with unique module types found in top-level modules.
 */
export function populateModuleTypeFilter() {
    if (moduleTypeFilterSelect) {
        moduleTypeFilterSelect.innerHTML = '<option value="ALL">All Module Types</option>'; // Clear existing options except 'ALL'

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

        // Add event listener so that when the selection changes, we apply the filter
        // This was already added in setupListView, so it's a bit redundant here.
        // It should be moved solely to setupListView.
        // moduleTypeFilterSelect.addEventListener('change', applyModuleTypeFilter);
    }
}

/**
 * Applies the selected filter and updates the navigation list, then loads the first record.
 */
export async function applyModuleTypeFilter() {
    const selectedFilterType = moduleTypeFilterSelect ? moduleTypeFilterSelect.value : 'ALL';

    if (selectedFilterType === 'ALL') {
        filteredNavigationList = [...topLevelModuleNavigationList];
    } else {
        filteredNavigationList = topLevelModuleNavigationList.filter(module => {
            return module.MODULETYPE === selectedFilterType;
        });
    }

    currentTopLevelModuleIndex = 0; // Reset index for new filter

    if (filteredNavigationList.length > 0) {
        await loadSelectedModuleIntoEditor(); // Load the first record of the filtered list
    } else {
        loadRecordIntoEditor(null); // No records match, clear editor
        showAlert(statusMessageSpan, statusAlert, `No records found for module type: ${selectedFilterType}`, false);
    }
    updateNavigationButtons();
}

/**
 * Fetches all top-level modules (COURSEs, LESSONs, and selected learningContent types)
 * into the master navigation list.
 */
export async function fetchAndPopulateTopLevelNavigation() {
    try {
        const allTopLevelModules = [];

        const topLevelCollections = ['COURSE', 'LESSON'];
        for (const col of topLevelCollections) {
            const snapshot = await db.collection(col).get();
            snapshot.forEach(doc => {
                allTopLevelModules.push({ id: doc.id, ...doc.data(), MODULETYPE: doc.data().MODULETYPE || col, collection: col });
            });
        }

        const topLevelLearningContentTypes = [
            'SEMANTIC_GROUP', 'VOCABULARY', 'VOCABULARY_GROUP', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING'
        ];
        const learningContentSnapshot = await db.collection('learningContent').get();
        learningContentSnapshot.forEach(doc => {
            const data = doc.data();
            if (topLevelLearningContentTypes.includes(data.MODULETYPE)) {
                allTopLevelModules.push({ id: doc.id, ...data, collection: 'learningContent' });
            }
        });

        allTopLevelModules.sort((a, b) => (a.TITLE || '').localeCompare(b.TITLE || ''));

        topLevelModuleNavigationList = allTopLevelModules;
        populateModuleTypeFilter(); // Re-populate filter dropdown based on new list
        updateNavigationButtons();
    } catch (error) {
        console.error("Error fetching top-level navigation:", error);
        showAlert(statusMessageSpan, statusAlert, "Failed to load top-level navigation. " + error.message, true);
    }
}

/**
 * Updates the disabled state of Prev/Next buttons based on the current index and filtered list length.
 */
export function updateNavigationButtons() {
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
