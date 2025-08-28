// js/ModuleContent_ListView.js (Remodified with IIFE for private scope)
// Handles displaying, filtering, and navigating through module lists.

(function() { // Start IIFE for ModuleContent_ListView.js

    // --- Crucial Global State Variables (now private to this IIFE scope) ---
    let topLevelModuleNavigationList = [];
    let filteredNavigationList = [];
    let currentTopLevelModuleIndex = 0;
    let allAvailableModules = [];

    // --- Global DOM Element References (now private to this IIFE scope) ---
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


    // --- Module-Specific Constants (now private to this IIFE scope) ---
    // These constants will no longer conflict with constants of the same name in other files.
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

    // Added a missing constant from the fetchAndPopulateTopLevelNavigation function
    const topLevelLearningContentTypes = [ // This was missing in the global scope of the last version.
        'SEMANTIC_GROUP', 'VOCABULARY', 'VOCABULARY_GROUP', 'GRAMMAR', 'CONVERSATION', 'READING-WRITING', 'LISTENINGSPEAKING'
    ];


    // --- Callbacks to Orchestrator (ModuleContent.js) ---
    let onRecordSelectedCallback = () => {};


    /**
     * Initializes the list view module by assigning DOM elements and setting up event listeners.
     */
    function setupListView(elements, callbacks) {
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

        // Keep existing listeners for the larger list view's filters
        if (filterModuleTypeSelect) {
            filterModuleTypeSelect.addEventListener('change', displayFilteredModules);
        }
        if (searchModulesInput) {
            searchModulesInput.addEventListener('input', displayFilteredModules);
        }

        // --- Event Listeners for Filters/Search ---
        if (filterModuleTypeSelect) {
            filterModuleTypeSelect.addEventListener('change', displayFilteredModules);
        }
        if (searchModulesInput) {
            searchModulesInput.addEventListener('input', displayFilteredModules);
        }

        if (newRecordBtn) {
            newRecordBtn.addEventListener('click', () => {
                // Assumed to be globally available from ModuleContent_Editor.js
                window.loadRecordIntoEditor(null, null);
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
				 		 console.log("DEBUG LV: Already at the last record."); // ADD THIS LINE
                }
            });
        }

        if (nextRecordBtn) {
            nextRecordBtn.addEventListener('click', async () => {
				  console.log("DEBUG LV: Next button clicked."); // ADD THIS LINE
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
		console.log("DEBUG LV: loadSelectedModuleIntoEditor entered."); // ADD THIS LINE
        const selectedModule = filteredNavigationList[currentTopLevelModuleIndex];
		console.log("DEBUG LV: Selected module for editor:", selectedModule); // ADD THIS LINE
        if (selectedModule) {
            try {
                // Accessing global 'db' object
                const moduleSnap = await window.db.collection(selectedModule.collection).doc(selectedModule.id).get();
                if (moduleSnap.exists) {
					 console.log("DEBUG LV: Module data fetched successfully."); // ADD THIS LINE
                    onRecordSelectedCallback({ id: moduleSnap.id, ...moduleSnap.data() }, selectedModule.collection);
					console.log("DEBUG LV: onRecordSelectedCallback called from ListView."); // ADD THIS LINE
                } else {
				console.warn("DEBUG LV: Selected module not found in Firestore. Refreshing navigation."); // ADD THIS LINE
                    // Accessing global 'showAlert' function
                    window.showAlert(statusMessageSpan, statusAlert, "Selected module not found. Refreshing navigation.", true);
                    await fetchAndPopulateTopLevelNavigation();
                    await applyModuleTypeFilter();
                }
            } catch (error) {
				
                 console.error("DEBUG LV: Error fetching selected module for editor (Firestore query failed):", error); // ADD THIS LINE
                // Accessing global 'showAlert' function
                window.showAlert(statusMessageSpan, statusAlert, `Error loading module: ${error.message}`, true);
            }
        } else {
            // Assumed to be globally available from ModuleContent_Editor.js
			console.log("DEBUG LV: No selected module (null/undefined) to load. Clearing editor."); // ADD THIS LINE
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
		
		if (moduleData.CEFR && typesWithCEFR.includes(moduleData.MODULETYPE) &&
            !['VOCABULARY', 'VOCABULARY_GROUP'].includes(moduleData.MODULETYPE)) {
            const cefrElement = document.createElement('span');
            cefrElement.classList.add('module-item-detail', 'module-item-cefr');
            cefrElement.textContent = `  CEFR: ${moduleData.CEFR}`;
            titleWrapper.appendChild(cefrElement); // Third use, now safe because titleWrapper is declared above
        }
		
        // Conditional fields (Theme, Description, CEFR, Meaning Origin)
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

if (moduleData.DESCRIPTION) {
    const descriptionElement = document.createElement('p');
    descriptionElement.classList.add('module-item-detail', 'module-item-description');

    // Truncate if very long
    let displayDescription = moduleData.DESCRIPTION.length > 1500
        ? moduleData.DESCRIPTION.substring(0, 147) + '...'
        : moduleData.DESCRIPTION;

    // Remove any leading "Description:" text
    displayDescription = displayDescription.replace(/^Description:\s*/i, '');

    // Add line breaks before literal 'Number 1', 'Number 2', etc.
    displayDescription = displayDescription.replace(/(Number\s*\d+)/gi, '<br>$1');

    // Add line breaks before numbered questions like "1. "
    displayDescription = displayDescription.replace(/(\d+\.\s)/g, '<br>$1');

    // Add line breaks before dialogue lines "Person A:" or "Person B:"
    displayDescription = displayDescription.replace(/(Person A:|Person B:)/g, '<br>$1');

    // Remove any leading <br> if it exists
    displayDescription = displayDescription.replace(/^<br>/, '');

    descriptionElement.innerHTML = displayDescription;
    contentWrapper.appendChild(descriptionElement);
}

        // --- 3. Media Container ---
        if (moduleData.IMAGEURL || moduleData.audioUrl) {
            const mediaContainer = document.createElement('div');
            mediaContainer.classList.add('module-media');

            if (moduleData.IMAGEURL) {
                // Assumed to be globally available from ui-utilities.js
                const imgLink = window.renderThumbnail(moduleData.IMAGEURL);
                if (imgLink) mediaContainer.appendChild(imgLink);
            }
            if (moduleData.audioUrl) {
                // Assumed to be globally available from ui-utilities.js
                const audioBtn = window.renderAudioPlayer(moduleData.audioUrl);
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
                    // START OF MODIFICATION
                    await fetchAndRenderChildren(moduleData.id, childIds, level + 1, li, window.getCurrentActiveRecord()?.MODULEID_ARRAY || [], moduleData.MODULETYPE);
                    // END OF MODIFICATION
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
    // START OF MODIFICATION
    async function fetchAndRenderChildren(parentId, childIds, level, parentLi, selectedModuleIds, parentModuleType) {
        console.log(`--- fetchAndRenderChildren called for parent: ${parentId} (Type: ${parentModuleType}), level: ${level} ---`);
    // END OF MODIFICATION
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
            let collectionsToSearch = []; // Initialize here

            // START OF MODIFICATION
            // Define the specific collections to search based on the parent's type
            if (parentModuleType === 'SYLLABLE') {
                collectionsToSearch = ['phonemes']; // A SYLLABLE should ONLY have PHONEMES as direct children
            } else if (parentModuleType === 'COURSE') {
                collectionsToSearch = ['LESSON']; // A COURSE should ONLY have LESSONS as direct children
            } else if (parentModuleType === 'LESSON') {
                 // LESSONs can have various learningContent types as children,
                 // or possibly other structured types like VOCABULARY_GROUP
                 collectionsToSearch = ['learningContent', 'VOCABULARY_GROUP', 'VOCABULARY']; // Adjust as per your data model
            }
            // Add more specific rules here for other parent types if they have strict child types.
            else {
                // Default fallback: if the parent type doesn't have a strict child type,
                // you can keep a more general search, but be mindful of performance.
                collectionsToSearch = ['learningContent', 'syllables', 'phonemes', 'COURSE', 'LESSON'];
            }
            // END OF MODIFICATION

            try {
                // Accessing global 'db' object
                // START OF MODIFICATION
                for (const col of collectionsToSearch) {
                    docSnap = await window.db.collection(col).doc(childId).get();
                    if (docSnap.exists) {
                        console.log(`DEBUG (fetchAndRenderChildren): Child ${childId} found in '${col}'.`);
                        return { id: docSnap.id, ...docSnap.data(), collection: col };
                    }
                }
                console.warn(`DEBUG: Child module with ID ${childId} not found in any expected collection for parent type ${parentModuleType}.`);
                // Accessing global 'showAlert' function
                window.showAlert(statusMessageSpan, statusAlert, `Child module ${childId} not found in appropriate collection for parent type ${parentModuleType}.`, true);
                // END OF MODIFICATION
                return null;
            } catch (error) {
                // START OF MODIFICATION
                console.error(`DEBUG: Error fetching child ${childId} for parent type ${parentModuleType}:`, error);
                // Accessing global 'showAlert' function
                window.showAlert(statusMessageSpan, statusAlert, `Permission denied for child module ${childId}. Check Firestore Rules.`, true);
                // END OF MODIFICATION
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
    async function loadAllAvailableModules() {
        // Accessing global 'showSpinner' function
        window.showSpinner(availableModulesList, loadingSpinner);
        if (availableModulesList) { availableModulesList.innerHTML = ''; }

        try {
            const allFetchedModules = [];

            const collectionsToFetch = ['COURSE', 'LESSON', 'learningContent'];
            for (const colName of collectionsToFetch) {
                // Accessing global 'db' object
                const snapshot = await window.db.collection(colName).get();
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
            // Accessing global 'showAlert' function
            window.showAlert(statusMessageSpan, statusAlert, "Failed to load available modules. " + error.message, true);
        } finally {
            // Accessing global 'hideSpinner' function
            window.hideSpinner(availableModulesList, loadingSpinner);
        }
    }

// Inside ModuleContent_ListView.js (within the IIFE)

    /**
     * Displays modules in the larger list view based on current filters and search.
     */
    function displayFilteredModules() {
        if (availableModulesList) { availableModulesList.innerHTML = ''; } // Clear previous list

        const filterType = filterModuleTypeSelect ? filterModuleTypeSelect.value : 'all';
        const searchTerm = searchModulesInput ? searchModulesInput.value.toLowerCase() : '';

        // Get the currently active record and its included module IDs
        // Assumed to be globally available from ModuleContent_Editor.js
        const activeRecord = window.getCurrentActiveRecord();
        const activeRecordId = activeRecord ? activeRecord.id : null;
        const currentModuleIds = activeRecord?.MODULEID_ARRAY || [];

        let modulesToConsider = [...allAvailableModules]; // Start with all fetched modules

        // ENHANCEMENT 1: Do not show COURSE moduletypes in the larger view module list generally.
        // This filter applies unless the active record specifically dictates otherwise (e.g., COURSE only shows LESSONs).
        modulesToConsider = modulesToConsider.filter(module => module.MODULETYPE !== 'COURSE');

        // Existing logic: If the active record is a COURSE, only show LESSONs for selection.
        // This overrides the general 'no COURSE' rule and implicitly means no COURSEs will be shown anyway.
        if (activeRecord && activeRecord.MODULETYPE === 'COURSE') {
            modulesToConsider = modulesToConsider.filter(module => module.MODULETYPE === 'LESSON');
            // Force and disable the filterModuleTypeSelect if a COURSE is selected
            if (filterModuleTypeSelect) {
                filterModuleTypeSelect.value = 'LESSON';
                filterModuleTypeSelect.disabled = true;
            }
        } else {
            // Ensure filterModuleTypeSelect is enabled if not a COURSE active record
            if (filterModuleTypeSelect) {
                filterModuleTypeSelect.disabled = false;
                // You might choose to reset filterModuleTypeSelect.value here if needed,
                // but for now, we'll let it retain its last user-selected value.
            }
        }

        // Apply main filters and search
        const filtered = modulesToConsider.filter(module => {
            const matchesType = (filterType === 'all' || module.MODULETYPE === filterType);

            // ENHANCEMENT 4: Search for theme as well as title
            const matchesSearch = (
                (module.TITLE || '').toLowerCase().includes(searchTerm) || // Search by TITLE
                (module.name || '').toLowerCase().includes(searchTerm) ||  // Fallback for TITLE
                (module.THEME || '').toLowerCase().includes(searchTerm)    // NEW: Search by THEME
            );

            // Exclude the current active record itself from the selectable list
            const isCurrentActiveRecord = (activeRecordId && module.id === activeRecordId);

            return matchesType && matchesSearch && !isCurrentActiveRecord;
        });

        // ENHANCEMENT 2 & 3: Custom Sorting
        // Checked items (those in currentModuleIds) appear at the top,
        // then sorted by MODULETYPE, then THEME, then TITLE.
        filtered.sort((a, b) => {
            const aChecked = currentModuleIds.includes(a.id);
            const bChecked = currentModuleIds.includes(b.id);

            // Priority 1: Checked items first
            if (aChecked && !bChecked) return -1; // 'a' is checked, 'b' is not, so 'a' comes first
            if (!aChecked && bChecked) return 1;  // 'b' is checked, 'a' is not, so 'b' comes first

            // Priority 2: Then by MODULETYPE (alphabetical ascending)
            const typeComparison = (a.MODULETYPE || '').localeCompare(b.MODULETYPE || '');
            if (typeComparison !== 0) return typeComparison;

            // Priority 3: Then by THEME (alphabetical ascending, handle undefined/null)
            const themeA = a.THEME || ''; // Use empty string for comparison if null/undefined
            const themeB = b.THEME || '';
            const themeComparison = themeA.localeCompare(themeB);
            if (themeComparison !== 0) return themeComparison;

            // Priority 4: Finally by TITLE (alphabetical ascending, fallback to 'name')
            const titleA = a.TITLE || a.name || ''; // Use empty string for comparison if null/undefined
            const titleB = b.TITLE || b.name || '';
            return titleA.localeCompare(titleB);
        });

        // Display the filtered and sorted modules
        if (filtered.length === 0) {
            if (availableModulesList) {
                availableModulesList.innerHTML = `<li class="loading-placeholder">No modules found matching criteria or available for selection.</li>`;
            }
            return;
        }

        filtered.forEach(moduleData => {
            // renderModuleListItem already uses currentModuleIds to set the checkbox state
            const li = renderModuleListItem(moduleData, 0, currentModuleIds);
            if (availableModulesList) { availableModulesList.appendChild(li); }

            // Attach checkbox event listener (existing logic)
            const checkbox = li.querySelector('input[type="checkbox"]');
            if (checkbox && !checkbox.disabled) {
                checkbox.addEventListener('change', (event) => {
                    const moduleId = event.target.dataset.moduleId;
                    // Assumed to be globally available from ModuleContent_Editor.js
                    const activeRecordForSelection = window.getCurrentActiveRecord();

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
                        window.loadRecordIntoEditor(activeRecordForSelection, activeRecordForSelection.collection);
                    }
                });
            }
        });
    }

    /**
     * Adds a module ID to the current active record's selection.
     */
    function addModuleToActiveRecordSelection(moduleId) {
        // Assumed to be globally available from ModuleContent_Editor.js
        const activeRecord = window.getCurrentActiveRecord();
        if (activeRecord) {
            if (!activeRecord.MODULEID_ARRAY) {
                activeRecord.MODULEID_ARRAY = [];
            }
            if (!activeRecord.MODULEID_ARRAY.includes(moduleId)) {
                activeRecord.MODULEID_ARRAY.push(moduleId);
                // Assumed to be globally available from ModuleContent_Editor.js
                window.loadRecordIntoEditor(activeRecord, activeRecord.collection);
                console.log(`Added ${moduleId} to currentActiveRecord.MODULEID_ARRAY`);
            }
        }
    }

    /**
     * Removes a module ID from the current active record's selection.
     */
    function removeModuleFromActiveRecordSelection(moduleId) {
        // Assumed to be globally available from ModuleContent_Editor.js
        const activeRecord = window.getCurrentActiveRecord();
        if (activeRecord && activeRecord.MODULEID_ARRAY) {
            const index = activeRecord.MODULEID_ARRAY.indexOf(moduleId);
            if (index > -1) {
                activeRecord.MODULEID_ARRAY.splice(index, 1);
                // Assumed to be globally available from ModuleContent_Editor.js
                window.loadRecordIntoEditor(activeRecord, activeRecord.collection);
                console.log(`Removed ${moduleId} from currentActiveRecord.MODULEID_ARRAY`);
            }
        }
    }

    /**
     * Populates the main filter dropdown with unique module types found in top-level modules.
     */
    function populateModuleTypeFilter() {
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
    async function applyModuleTypeFilter() {
        const selectedFilterType = moduleTypeFilterSelect ? moduleTypeFilterSelect.value : 'ALL';

        if (selectedFilterType === 'ALL') {
            filteredNavigationList = [...topLevelModuleNavigationList];
        } else {
            filteredNavigationList = topLevelModuleNavigationList.filter(module => {
                return module.MODULETYPE === selectedFilterType;
            });
        }

        const activeRecordId = window.getCurrentActiveRecord()?.id;
        let newIndex = 0; // Default to 0 if no record or record not found after filter

        if (activeRecordId) {
            const foundIndex = filteredNavigationList.findIndex(m => m.id === activeRecordId);
            if (foundIndex !== -1) {
                newIndex = foundIndex; // Keep the same record selected if found
            }
        }
        currentTopLevelModuleIndex = newIndex; // Set to preserved index or default 0

        // --- CRITICAL CHANGE START ---
        // Get ID of record currently loaded in the editor
        const currentEditorRecordId = window.getCurrentActiveRecord()?.id;
        // Get ID of the record that *should* be loaded based on the filter and preserved index
        const targetRecordId = filteredNavigationList[currentTopLevelModuleIndex]?.id;

        if (filteredNavigationList.length > 0) {
            // Only call loadSelectedModuleIntoEditor if the target record is DIFFERENT from the one
            // currently loaded in the editor, or if there's nothing loaded.
            if (targetRecordId !== currentEditorRecordId) {
                await loadSelectedModuleIntoEditor();
            } else {
                console.log("DEBUG LV: applyModuleTypeFilter - Editor already has target record loaded. Skipping redundant load.");
            }
        } else {
            // If filtered list is empty, always clear the editor
            window.loadRecordIntoEditor(null);
            window.showAlert(statusMessageSpan, statusAlert, `No records found for module type: ${selectedFilterType}`, false);
        }
        // --- CRITICAL CHANGE END ---

        updateNavigationButtons();
    }

    /**
     * Fetches all top-level modules (COURSEs, LESSONs, and selected learningContent types)
     * into the master navigation list.
     */
    async function fetchAndPopulateTopLevelNavigation() {
        try {
            const allTopLevelModules = [];

            const topLevelCollections = ['COURSE', 'LESSON'];
            for (const col of topLevelCollections) {
                // Accessing global 'db' object
                const snapshot = await window.db.collection(col).get();
                snapshot.forEach(doc => {
                    allTopLevelModules.push({ id: doc.id, ...doc.data(), MODULETYPE: doc.data().MODULETYPE || col, collection: col });
                });
            }

            // Accessing global 'db' object
            const learningContentSnapshot = await window.db.collection('learningContent').get();
            learningContentSnapshot.forEach(doc => {
                const data = doc.data();
                // topLevelLearningContentTypes is now a const inside this IIFE.
                if (topLevelLearningContentTypes.includes(data.MODULETYPE)) {
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
            window.showAlert(statusMessageSpan, statusAlert, "Failed to load top-level navigation. " + error.message, true);
        }
    }

    /**
     * Updates the disabled state of Prev/Next buttons based on the current index and filtered list length.
     */
    function updateNavigationButtons() {
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
    // These are the functions that ModuleContent.js (the orchestrator) will call.
    window.setupListView = setupListView;
    window.loadSelectedModuleIntoEditor = loadSelectedModuleIntoEditor;
    window.renderModuleListItem = renderModuleListItem;
    window.fetchAndRenderChildren = fetchAndRenderChildren;
    window.loadAllAvailableModules = loadAllAvailableModules;
    window.displayFilteredModules = displayFilteredModules;
    window.addModuleToActiveRecordSelection = addModuleToActiveRecordSelection;
    window.removeModuleFromActiveRecordSelection = removeModuleFromActiveRecordSelection;
    window.populateModuleTypeFilter = populateModuleTypeFilter;
    window.applyModuleTypeFilter = applyModuleTypeFilter;
    window.fetchAndPopulateTopLevelNavigation = fetchAndPopulateTopLevelNavigation;
    window.updateNavigationButtons = updateNavigationButtons;
	window.filteredNavigationList = filteredNavigationList; // ADD THIS LINE
	window.currentTopLevelModuleIndex = currentTopLevelModuleIndex; // ADD THIS LINE

})(); // End IIFE for ModuleContent_ListView.js
