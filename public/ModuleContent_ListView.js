// js/ModuleContent_ListView.js version v1.008 Removed one too many scan of learningContent
// Handles displaying, filtering, and navigating through module lists.

// --- Import necessary Firebase modules ---
import { db } from './firebase-services.js'; // Import the initialized 'db' instance
// Explicitly import Firestore functions needed for modular syntax
import { collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

// --- Import UI utility functions ---
import { showAlert, showSpinner, hideSpinner, renderThumbnail, renderAudioPlayer } from './ui-utilities.js';

// --- Import editor functions ---
import { getCurrentActiveRecord, loadRecordIntoEditor } from './ModuleContent_Editor.js';


// --- Crucial Global State Variables (now private to this module scope) ---
let topLevelModuleNavigationList = [];
let filteredNavigationList = [];
let currentTopLevelModuleIndex = 0;
let allAvailableModules = []; // This stores the list for the larger selection area

// --- Global DOM Element References (now private to this module scope) ---
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


// --- Module-Specific Constants (now private to this module scope) ---
const PARENT_MODULE_TYPES = ['COURSE', 'LESSON', 'SEMANTIC_GROUP', 'VOCABULARY', 'SYLLABLE'];

const NON_SELECTABLE_LEAF_MODULE_TYPES = []; // Still empty as per your requirement

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

const topLevelLearningContentTypes = [
    'SEMANTIC_GROUP', 'VOCABULARY', 'VOCABULARY_GROUP', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING'
];


// --- Callbacks to Orchestrator (ModuleContent.js) ---
let onRecordSelectedCallback = () => {};


/**
 * Helper function to get the singular module type from a collection name.
 * Ensures consistent MODULETYPE strings even if the document itself doesn't have one.
 */
function getSingularModuleTypeFromCollection(collectionName) {
    switch (collectionName) {
        case 'syllables': return 'SYLLABLE';
        case 'phonemes': return 'PHONEME';
        case 'COURSE': return 'COURSE';
        case 'LESSON': return 'LESSON';
        case 'learningContent':
            // For learningContent, if no MODULETYPE is explicitly set,
            // we might need a default or expect all documents to have it.
            // For safety, defaulting to a generic 'LEARNINGCONTENT'
            return 'LEARNINGCONTENT';
        default: return collectionName.toUpperCase(); // Fallback for any other collection
    }
}


/**
 * Initializes the list view module by assigning DOM elements and setting up event listeners.
 */
export function setupListView(elements, callbacks) { // Exported
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
    if (moduleTypeFilterSelect) {
        moduleTypeFilterSelect.addEventListener('change', applyModuleTypeFilter);
    }

    if (filterModuleTypeSelect) {
        filterModuleTypeSelect.addEventListener('change', displayFilteredModules);
    }
    if (searchModulesInput) {
        searchModulesInput.addEventListener('input', displayFilteredModules);
    }

    if (newRecordBtn) {
        newRecordBtn.addEventListener('click', () => {
            loadRecordIntoEditor(null, null); // Use imported function
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
            } else {
                console.log("DEBUG LV: Already at the first record.");
            }
        });
    }

    if (nextRecordBtn) {
        nextRecordBtn.addEventListener('click', async () => {
            console.log("DEBUG LV: Next button clicked.");
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
export async function loadSelectedModuleIntoEditor() { // Exported
    console.log("DEBUG LV: loadSelectedModuleIntoEditor entered.");
    const selectedModule = filteredNavigationList[currentTopLevelModuleIndex];
    console.log("DEBUG LV: Selected module for editor:", selectedModule);
    if (selectedModule) {
        try {
            // MODULAR SDK CHANGE: Use doc() and getDoc()
            const docRef = doc(db, selectedModule.collection, selectedModule.id);
            const moduleSnap = await getDoc(docRef);
            if (moduleSnap.exists) {
                console.log("DEBUG LV: Module data fetched successfully.");
                onRecordSelectedCallback({ id: moduleSnap.id, ...moduleSnap.data() }, selectedModule.collection);
                console.log("DEBUG LV: onRecordSelectedCallback called from ListView.");
            } else {
                console.warn("DEBUG LV: Selected module not found in Firestore. Refreshing navigation.");
                showAlert(statusMessageSpan, statusAlert, "Selected module not found. Refreshing navigation.", true); // Use imported 'showAlert'
                await fetchAndPopulateTopLevelNavigation();
                await applyModuleTypeFilter();
            }
        } catch (error) {
             console.error("DEBUG LV: Error fetching selected module for editor (Firestore query failed):", error);
            showAlert(statusMessageSpan, statusAlert, `Error loading module: ${error.message}`, true); // Use imported 'showAlert'
        }
    } else {
        console.log("DEBUG LV: No selected module (null/undefined) to load. Clearing editor.");
        onRecordSelectedCallback(null, null);
    }
}


/**
 * Renders an individual list item for the larger availableModulesList.
 * @param {Object} moduleData - The data for the module to render.
 * @param {number} level - The hierarchical level of the module (0 for top-level).
 * @param {string[]} currentModuleIds - Array of module IDs currently included in the active record.
 * @param {string|null} parentTypeInDisplay - The MODULETYPE of the parent being displayed, if this is a child.
 */
export function renderModuleListItem(moduleData, level, currentModuleIds, parentTypeInDisplay = null) { // Exported
    const li = document.createElement('li');
    li.classList.add('module-item');
    const moduleTypeClass = moduleData.MODULETYPE
        ? `module-type-${moduleData.MODULETYPE.toLowerCase().replace(/_/g, '-')}`
        : 'module-type-unknown';
    li.classList.add(moduleTypeClass);
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

    const activeRecord = getCurrentActiveRecord(); // Use imported function
    const isCurrentActiveRecordCourse = activeRecord && activeRecord.MODULETYPE === 'COURSE';
    const isChildOfLessonBeingDisplayed = (level > 0 && parentTypeInDisplay === 'LESSON');

    if (isCurrentActiveRecordCourse && isChildOfLessonBeingDisplayed) {
        checkbox.style.display = 'none';
        checkbox.disabled = true;
    }

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

    if (moduleData.CEFR && typesWithCEFR.includes(moduleData.MODULETYPE) &&
        !['VOCABULARY', 'VOCABULARY_GROUP'].includes(moduleData.MODULETYPE)) {
        const cefrElement = document.createElement('span');
        cefrElement.classList.add('module-item-detail', 'module-item-cefr');
        cefrElement.textContent = `  CEFR: ${moduleData.CEFR}`;
        titleWrapper.appendChild(cefrElement);
    }

    if (moduleData.THEME && typesWithTheme.includes(moduleData.MODULETYPE)) {
        const themeElement = document.createElement('div');
        themeElement.classList.add('module-item-detail', 'module-item-theme');
        themeElement.textContent = `Theme: ${moduleData.THEME}`;
        contentWrapper.appendChild(themeElement);
    }

    if (moduleData.MEANING_ORIGIN && typesWithMeaningOrigin.includes(moduleData.MODULETYPE)) {
        const meaningOriginElement = document.createElement('div');
        meaningOriginElement.classList.add('module-item-detail', 'module-item-meaning-origin');
        meaningOriginElement.textContent = `Origin: ${moduleData.MEANING_ORIGIN}`;
        contentWrapper.appendChild(meaningOriginElement);
    }

    if (moduleData.MODULETYPE === 'VOCABULARY' && moduleData.WORD_TYPE) {
        const wordTypeElement = document.createElement('div');
        wordTypeElement.classList.add('module-item-detail', 'module-item-word-type');
        wordTypeElement.textContent = `Word Type: ${moduleData.WORD_TYPE}`;
        contentWrapper.appendChild(wordTypeElement);

        if (moduleData.WORD_TYPE.toLowerCase() === 'verb') {
            const verbForms = [];
            if (moduleData.PRESENT_SIMPLE) {
                verbForms.push(`Pres: ${moduleData.PRESENT_SIMPLE}`);
            }
            if (moduleData.PRESENT_SIMPLE_3RD_PERSON_SINGULAR) {
                verbForms.push(`Pres.3rd: ${moduleData.PRESENT_SIMPLE_3RD_PERSON_SINGULAR}`);
            }
            if (moduleData.SIMPLE_PAST) {
                verbForms.push(`Simple Past: ${moduleData.SIMPLE_PAST}`);
            }
            if (moduleData.PAST_PARTICIPLE) {
                verbForms.push(`Past Part.: ${moduleData.PAST_PARTICIPLE}`);
            }

            if (verbForms.length > 0) {
                const verbFormsElement = document.createElement('div');
                verbFormsElement.classList.add('module-item-detail', 'module-item-verb-forms');
                verbFormsElement.innerHTML = `Verb Forms: ${verbForms.join(', ')}`;
                contentWrapper.appendChild(verbFormsElement);
            }
        }
    }

    if (moduleData.DESCRIPTION) {
        const descriptionElement = document.createElement('p');
        descriptionElement.classList.add('module-item-detail', 'module-item-description');

        let displayDescription = moduleData.DESCRIPTION.length > 1500
            ? moduleData.DESCRIPTION.substring(0, 147) + '...'
            : moduleData.DESCRIPTION;

        displayDescription = displayDescription.replace(/^Description:\s*/i, '');
        displayDescription = displayDescription.replace(/(Number\s*\d+)/gi, '<br>$1');
        displayDescription = displayDescription.replace(/(\d+\.\s)/g, '<br>$1');
        displayDescription = displayDescription.replace(/(Person A:|Person B:)/g, '<br>$1');
        displayDescription = displayDescription.replace(/^<br>/, '');

        descriptionElement.innerHTML = displayDescription;
        contentWrapper.appendChild(descriptionElement);
    }

    // --- 3. Media Container ---
    if (moduleData.IMAGEURL || moduleData.audioUrl) {
        const mediaContainer = document.createElement('div');
        mediaContainer.classList.add('module-media');

        if (moduleData.IMAGEURL) {
            const imgLink = renderThumbnail(moduleData.IMAGEURL); // Use imported function
            if (imgLink) mediaContainer.appendChild(imgLink);
        }
        if (moduleData.audioUrl) {
            const audioBtn = renderAudioPlayer(moduleData.audioUrl); // Use imported function
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
                await fetchAndRenderChildren(moduleData.id, childIds, level + 1, li, getCurrentActiveRecord()?.MODULEID_ARRAY || [], moduleData.MODULETYPE); // Use imported function
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
export async function fetchAndRenderChildren(parentId, childIds, level, parentLi, selectedModuleIds, parentModuleType) {
    console.log(`--- fetchAndRenderChildren called for parent: ${parentId} (Type: ${parentModuleType}), level: ${level} ---`);
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
        let collectionsToSearch = [];

        // --- IMPROVED LOGIC FOR collectionsToSearch BASED ON parentModuleType ---
        switch (parentModuleType) {
            case 'COURSE':
                // COURSE parents only have LESSON children.
                collectionsToSearch = ['LESSON'];
                break;
            case 'LESSON':
                // LESSON parents have children like VOCABULARY_GROUP, VOCABULARY, GRAMMAR, etc.,
                // all of which reside in the 'learningContent' collection according to your structure.
                collectionsToSearch = ['learningContent'];
                break;
            case 'VOCABULARY':
                // As per your clarification: VOCABULARY parents only have SYLLABLE children,
                // which are stored in the 'syllables' collection.
                collectionsToSearch = ['syllables'];
                break;
            case 'SYLLABLE':
                // As per your clarification: SYLLABLE parents only have PHONEME children,
                // which are stored in the 'phonemes' collection.
                collectionsToSearch = ['phonemes'];
                break;
			case 'SEMANTIC_GROUP':
                // SEMANTIC_GROUP parents  have LearnigContnet and potentially PHONEME/SYLLABLE children,
                collectionsToSearch = ['phonemes', 'syllables', 'learningContent'];
                break;
            // For other 'learningContent' module types ( VOCABULARY_GROUP, GRAMMAR, etc.),
            // their children are typically also other 'learningContent' types.
            case 'VOCABULARY_GROUP':
            case 'GRAMMAR':
            case 'CONVERSATION':
            case 'READING-WRITING':
            case 'LISTENINGSPEAKING':
                collectionsToSearch = ['learningContent'];
                break;
            default:
                // Fallback for any unexpected or unhandled parent types.
                // You might want to log a warning here if you don't expect this to be hit often.
                console.warn(`DEBUG: Unhandled parentModuleType '${parentModuleType}'. Using a broad search for children.`);
                collectionsToSearch = ['learningContent', 'syllables', 'phonemes', 'COURSE', 'LESSON'];
                break;
        }
        // --- END IMPROVED LOGIC ---

        try {
            for (const col of collectionsToSearch) {
                const docRef = doc(db, col, childId);
                docSnap = await getDoc(docRef);

                // The defensive check for !childData is good practice,
                // but with the improved logic, it should rarely (if ever) be triggered for existing documents.
                if (docSnap.exists) {
                    const childData = docSnap.data();

                    if (!childData) {
                        // This indicates a deeper problem with the Firestore SDK if docSnap.exists is true
                        // but data() is undefined. It should be very rare with the improved logic.
                        console.warn(`DEBUG (fetchAndRenderChildren): Document '${childId}' in collection '${col}' exists but docSnap.data() returned undefined. This is highly unexpected. Skipping this child.`);
                        return null;
                    }

                    const inferredModuleType = childData.MODULETYPE || getSingularModuleTypeFromCollection(col);
                    console.log(`DEBUG (fetchAndRenderChildren): Child ${childId} found in '${col}', inferred MODULETYPE: ${inferredModuleType}.`);
                    return {
                        id: docSnap.id,
                        ...childData,
                        MODULETYPE: inferredModuleType,
                        collection: col
                    };
                }
            }
            console.warn(`DEBUG: Child module with ID ${childId} not found in any expected collection for parent type ${parentModuleType}.`);
            showAlert(statusMessageSpan, statusAlert, `Child module ${childId} not found in appropriate collection for parent type ${parentModuleType}.`, true);
            return null;
        } catch (error) {
            console.error(`DEBUG: Error fetching child ${childId} for parent type ${parentModuleType}:`, error);
            const errorMessage = (error.code === 'permission-denied') ? `Permission denied for child module ${childId}. Check Firestore Rules.` : `Error loading child module ${childId}: ${error.message}.`;
            showAlert(statusMessageSpan, statusAlert, errorMessage, true);
            return null;
        }
    });

    const children = (await Promise.all(allChildPromises)).filter(Boolean);
    console.log(`DEBUG: Number of valid children fetched for parent ${parentId}: ${children.length}`);
    console.log(`DEBUG: Fetched children data (filtered):`, children);

    const existingNoContent = parentLi.nextElementSibling;
    if (existingNoContent && existingNoContent.classList.contains('no-content-message') && parseInt(existingNoContent.dataset.level) > level) {
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
            const childLi = renderModuleListItem(childData, level, selectedModuleIds, parentModuleType);
            currentNodeToInsertAfter.after(childLi);
            currentNodeToInsertAfter = childLi;
        });
        console.log(`DEBUG: Children rendered for parent ${parentId}.`);
    }
}
/**
 * Loads all relevant modules for the larger available modules list.
 */
export async function loadAllAvailableModules() { // Exported
    showSpinner(availableModulesList, loadingSpinner); // Use imported function
    if (availableModulesList) { availableModulesList.innerHTML = ''; }

    try {
        const allFetchedModules = []; // This is the local array for *this* function.

        const collectionsToFetch = ['COURSE', 'LESSON', 'syllables', 'phonemes'];

        for (const colName of collectionsToFetch) {
            // MODULAR SDK CHANGE: Use collection() and getDocs()
            const colRef = collection(db, colName);
            const snapshot = await getDocs(colRef);
            snapshot.forEach(doc => {
                const data = doc.data();
                const inferredModuleType = data.MODULETYPE || getSingularModuleTypeFromCollection(colName);

                if (NON_SELECTABLE_LEAF_MODULE_TYPES.includes(inferredModuleType)) {
                   return;
                }

                allFetchedModules.push({ // Correctly pushing to allFetchedModules
                    id: doc.id,
                    ...data,
                    MODULETYPE: inferredModuleType,
                    collection: colName
                });
            });
        }

        // MODULAR SDK CHANGE: Use collection() and getDocs()
        const learningContentColRef = collection(db, 'learningContent');
        const learningContentSnapshot = await getDocs(learningContentColRef);
        learningContentSnapshot.forEach(doc => {
            const data = doc.data();
            const inferredModuleType = data.MODULETYPE || getSingularModuleTypeFromCollection('learningContent');
            if (topLevelLearningContentTypes.includes(inferredModuleType)) {
                // *** FIX FOR ReferenceError: allTopLevelModules is not defined ***
                // Should be pushing to allFetchedModules, not a non-existent allTopLevelModules
                allFetchedModules.push({
                    id: doc.id,
                    ...data,
                    MODULETYPE: inferredModuleType,
                    collection: 'learningContent'
                });
            }
        });

        allFetchedModules.sort((a, b) => (a.TITLE || '').localeCompare(b.TITLE || ''));

        allAvailableModules = allFetchedModules; // Assign to module-level variable
        displayFilteredModules();

    } catch (error) {
        console.error("Error loading all available modules:", error);
        showAlert(statusMessageSpan, statusAlert, "Failed to load available modules. " + error.message, true); // Use imported 'showAlert'
    } finally {
        hideSpinner(availableModulesList, loadingSpinner); // Use imported function
    }
}

/**
 * Displays modules in the larger list view based on current filters and search.
 */
export function displayFilteredModules() { // Exported
    if (availableModulesList) { availableModulesList.innerHTML = ''; }

    const filterType = filterModuleTypeSelect ? filterModuleTypeSelect.value : 'all';
    const searchTerm = searchModulesInput ? searchModulesInput.value.toLowerCase() : '';

    const activeRecord = getCurrentActiveRecord(); // Use imported function
    const activeRecordId = activeRecord ? activeRecord.id : null;
    const currentModuleIds = activeRecord?.MODULEID_ARRAY || [];

    let modulesToConsider = [...allAvailableModules];

    modulesToConsider = modulesToConsider.filter(module => module.MODULETYPE !== 'COURSE');

    if (filterModuleTypeSelect) {
        filterModuleTypeSelect.disabled = false;
        Array.from(filterModuleTypeSelect.options).forEach(option => {
            option.style.display = '';
        });

        if (activeRecord) {
            if (activeRecord.MODULETYPE === 'COURSE') {
                modulesToConsider = modulesToConsider.filter(module => module.MODULETYPE === 'LESSON');
                filterModuleTypeSelect.value = 'LESSON';
                filterModuleTypeSelect.disabled = true;
                Array.from(filterModuleTypeSelect.options).forEach(option => {
                    if (option.value !== 'LESSON' && option.value !== 'all') {
                        option.style.display = 'none';
                    }
                });
            }
            else if (activeRecord.MODULETYPE === 'LESSON') {
                modulesToConsider = modulesToConsider.filter(module => module.MODULETYPE !== 'LESSON');

                if (filterModuleTypeSelect.value === 'LESSON') {
                    filterModuleTypeSelect.value = 'all';
                }

                Array.from(filterModuleTypeSelect.options).forEach(option => {
                    if (option.value === 'LESSON') {
                        option.style.display = 'none';
                    }
                });
            }
            else if (activeRecord.MODULETYPE === 'SEMANTIC_GROUP') {
                // No special filtering/hiding for filter options.
            }
            else {
                Array.from(filterModuleTypeSelect.options).forEach(option => {
                    if (option.value === 'LESSON') {
                        option.style.display = 'none';
                    }
                });
            }
        }
    }

    const currentFilterType = filterModuleTypeSelect ? filterModuleTypeSelect.value : 'all';
    const filtered = modulesToConsider.filter(module => {
        const matchesType = (currentFilterType === 'all' || module.MODULETYPE === currentFilterType);
        const matchesSearch = (
            (module.TITLE || '').toLowerCase().includes(searchTerm) ||
            (module.name || '').toLowerCase().includes(searchTerm) ||
            (module.THEME || '').toLowerCase().includes(searchTerm)
        );
        const isCurrentActiveRecord = (activeRecordId && module.id === activeRecordId);

        return matchesType && matchesSearch && !isCurrentActiveRecord;
    });

    filtered.sort((a, b) => {
        const aChecked = currentModuleIds.includes(a.id);
        const bChecked = currentModuleIds.includes(b.id);
// 1. Primary Sort: Selected Status (records with checkboxes checked appear first)
        if (aChecked && !bChecked) return -1;
        if (!aChecked && bChecked) return 1;

        const typeComparison = (a.MODULETYPE || '').localeCompare(b.MODULETYPE || '');
        if (typeComparison !== 0) return typeComparison;

        const themeA = a.THEME || '';
        const themeB = b.THEME || '';
        const themeComparison = themeA.localeCompare(themeB);
        if (themeComparison !== 0) return themeComparison;

        const titleA = a.TITLE || a.name || '';
        const titleB = b.TITLE || b.name || '';
        return titleA.localeCompare(titleB);
    });

    if (filtered.length === 0) {
        if (availableModulesList) {
            availableModulesList.innerHTML = `<li class="loading-placeholder">No modules found matching criteria or available for selection.</li>`;
        }
        return;
    }

    filtered.forEach(moduleData => {
        const li = renderModuleListItem(moduleData, 0, currentModuleIds, null);
        if (availableModulesList) { availableModulesList.appendChild(li); }

        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.disabled) {
            checkbox.addEventListener('change', (event) => {
                const moduleId = event.target.dataset.moduleId;
                const activeRecordForSelection = getCurrentActiveRecord(); // Use imported function

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
                    loadRecordIntoEditor(activeRecordForSelection, activeRecordForSelection.collection); // Use imported function
                }
            });
        }
    });
}

/**
 * Adds a module ID to the current active record's selection.
 */
export function addModuleToActiveRecordSelection(moduleId) { // Exported
    const activeRecord = getCurrentActiveRecord(); // Use imported function
    if (activeRecord) {
        if (!activeRecord.MODULEID_ARRAY) {
            activeRecord.MODULEID_ARRAY = [];
        }
        if (!activeRecord.MODULEID_ARRAY.includes(moduleId)) {
            activeRecord.MODULEID_ARRAY.push(moduleId);
            loadRecordIntoEditor(activeRecord, activeRecord.collection); // Use imported function
            console.log(`Added ${moduleId} to currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

/**
 * Removes a module ID from the current active record's selection.
 */
export function removeModuleFromActiveRecordSelection(moduleId) { // Exported
    const activeRecord = getCurrentActiveRecord(); // Use imported function
    if (activeRecord && activeRecord.MODULEID_ARRAY) {
        const index = activeRecord.MODULEID_ARRAY.indexOf(moduleId);
        if (index > -1) {
            activeRecord.MODULEID_ARRAY.splice(index, 1);
            loadRecordIntoEditor(activeRecord, activeRecord.collection); // Use imported function
            console.log(`Removed ${moduleId} from currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

/**
 * Populates the main filter dropdown with unique module types found in top-level modules.
 */
export function populateModuleTypeFilter() { // Exported
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
export async function applyModuleTypeFilter() { // Exported
    const selectedFilterType = moduleTypeFilterSelect ? moduleTypeFilterSelect.value : 'ALL';

    if (selectedFilterType === 'ALL') {
        filteredNavigationList = [...topLevelModuleNavigationList];
    } else {
        filteredNavigationList = topLevelModuleNavigationList.filter(module => {
            return module.MODULETYPE === selectedFilterType;
        });
    }

    const activeRecordId = getCurrentActiveRecord()?.id; // Use imported function
    let newIndex = 0;

    if (activeRecordId) {
        const foundIndex = filteredNavigationList.findIndex(m => m.id === activeRecordId);
        if (foundIndex !== -1) {
            newIndex = foundIndex;
        }
    }
    currentTopLevelModuleIndex = newIndex;

    const currentEditorRecordId = getCurrentActiveRecord()?.id; // Use imported function
    const targetRecordId = filteredNavigationList[currentTopLevelModuleIndex]?.id;

    if (filteredNavigationList.length > 0) {
        if (targetRecordId !== currentEditorRecordId) {
            await loadSelectedModuleIntoEditor();
        } else {
            console.log("DEBUG LV: applyModuleTypeFilter - Editor already has target record loaded. Skipping redundant load.");
        }
    } else {
        loadRecordIntoEditor(null); // Use imported function
        showAlert(statusMessageSpan, statusAlert, `No records found for module type: ${selectedFilterType}`, false); // Use imported 'showAlert'
    }

    updateNavigationButtons();
}

/**
 * Fetches all top-level modules (COURSEs, LESSONs, and selected learningContent types)
 * into the master navigation list.
 */
export async function fetchAndPopulateTopLevelNavigation() { // Exported
    try {
        const allTopLevelModules = [];

        const topLevelCollections = ['COURSE', 'LESSON', 'syllables'];

        for (const col of topLevelCollections) {
            // MODULAR SDK CHANGE: Use collection() and getDocs()
            const colRef = collection(db, col);
            const snapshot = await getDocs(colRef);
            snapshot.forEach(doc => {
                const data = doc.data();
                const inferredModuleType = data.MODULETYPE || getSingularModuleTypeFromCollection(col);
                allTopLevelModules.push({
                    id: doc.id,
                    ...data,
                    MODULETYPE: inferredModuleType,
                    collection: col
                });
            });
        }

        // MODULAR SDK CHANGE: Use collection() and getDocs()
        const learningContentColRef = collection(db, 'learningContent');
        const learningContentSnapshot = await getDocs(learningContentColRef);
        learningContentSnapshot.forEach(doc => {
            const data = doc.data();
            const inferredModuleType = data.MODULETYPE || getSingularModuleTypeFromCollection('learningContent');
            // NEW: Ignore VOCABULARY_GROUP documents completely
            if (inferredModuleType === 'VOCABULARY_GROUP') {
                return; // Skip this document
            }
			if (topLevelLearningContentTypes.includes(inferredModuleType)) {
                allTopLevelModules.push({ // Correctly pushing to allTopLevelModules here
                    id: doc.id,
                    ...data,
                    MODULETYPE: inferredModuleType,
                    collection: 'learningContent'
                });
            }
        });

        allTopLevelModules.sort((a, b) => (a.TITLE || '').localeCompare(b.TITLE || ''));

        topLevelModuleNavigationList = allTopLevelModules;
        populateModuleTypeFilter();
        updateNavigationButtons();
    } catch (error) {
        console.error("Error fetching top-level navigation:", error);
        showAlert(statusMessageSpan, statusAlert, "Failed to load top-level navigation. " + error.message, true);
    }
}

/**
 * Updates the disabled state of Prev/Next buttons based on the current index and filtered list length.
 */
export function updateNavigationButtons() { // Exported
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

// Encapsulated access to internal state variables with getter functions
export function getFilteredNavigationList() { // Exported
    return [...filteredNavigationList];
}
export function getCurrentTopLevelModuleIndex() { // Exported
    return currentTopLevelModuleIndex;
}
