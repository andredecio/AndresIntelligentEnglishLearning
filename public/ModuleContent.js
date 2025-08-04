// ModuleContent.js
    // Modified today 04/08/25 code deployed: v1.006r

// Firebase SDK global variables (initialized by /__/firebase/init.js)
// We are using Firebase v8 syntax based on your provided common.js and AdminSystem.js
const auth = firebase.auth();
const db = firebase.firestore(); // Get Firestore instance
const storage = firebase.storage(); // Get Storage instance

// --- Global State Variables ---
let currentActiveRecord = null; // Stores the data of the COURSE/LESSON/SEMANTIC_GROUP currently in the single-record view
let allAvailableModules = [];   // Stores all modules fetched for the larger list (LESSONs, SEMANTIC_GROUPs, etc.)
let moduleTypes = { // Define module types and their corresponding collections (simplified for now)
    'COURSE': 'courses',
    'LESSON': 'lessons',
    'SEMANTIC_GROUP': 'learningContent',
    'VOCABULARY_GROUP': 'learningContent',
    'VOCABULARY': 'learningContent',
    'SYLLABLE': 'syllables',
    'PHONEME': 'phonemes',
    // Add other types as they get their own collections or handling
};
// List of module types that can be 'parent' containers and thus selectable for inclusion
const PARENT_MODULE_TYPES = ['COURSE', 'LESSON', 'SEMANTIC_GROUP'];
// List of module types that are "leaf" nodes or part of a parent, not independently selectable for inclusion
const NON_SELECTABLE_LEAF_MODULE_TYPES = ['VOCABULARY', 'SYLLABLE', 'PHONEME'];

// --- DOM Element References ---
const singleRecordView = document.querySelector('.single-record-view');
const activeRecordIdInput = document.getElementById('activeRecordId');
const activeRecordCollectionInput = document.getElementById('activeRecordCollection');
const activeRecordTypeInput = document.getElementById('activeRecordType');
const recordTitleInput = document.getElementById('recordTitle');
const recordThemeInput = document.getElementById('recordTheme');
const recordDescriptionTextarea = document.getElementById('recordDescription');
const themeFields = document.querySelectorAll('.theme-field'); // Elements related to theme (like label and input)

const prevRecordBtn = document.getElementById('prevRecordBtn');
const newRecordBtn = document.getElementById('newRecordBtn');
const nextRecordBtn = document.getElementById('nextRecordBtn');
const saveRecordBtn = document.getElementById('saveRecordBtn');
const deleteRecordBtn = document.getElementById('deleteRecordBtn');

const currentChildrenDisplay = document.getElementById('currentChildrenDisplay');

const largerListView = document.querySelector('.larger-list-view');
const filterModuleTypeSelect = document.getElementById('filterModuleType');
const searchModulesInput = document.getElementById('searchModules');
const availableModulesList = document.getElementById('availableModulesList');

const statusAlert = document.getElementById('statusAlert');
const statusMessageSpan = document.getElementById('statusMessage');
const loadingSpinner = availableModulesList.querySelector('.spinner'); // Use the spinner inside the list

// --- Utility Functions ---

/**
 * Shows a temporary alert message.
 * @param {string} message The message to display.
 * @param {boolean} isError If true, styles as an error. Defaults to success.
 */
function showAlert(message, isError = false) {
    statusMessageSpan.textContent = message;
    statusAlert.classList.remove('hidden');
    // Assuming your .error-alert is green by default (from style.css comment)
    // If you want red for error, you'll need a new CSS class like .error-alert.error
    if (isError) {
        statusAlert.style.backgroundColor = '#dc3545'; // Red for errors
        statusAlert.querySelector('.error-button').style.backgroundColor = '#dc3545';
        statusAlert.querySelector('.error-button').style.boxShadow = '0 6px #a71d2a, 0 2px 4px rgba(0,0,0,0.3)';
    } else {
        statusAlert.style.backgroundColor = '#218b5f'; // Green for success (your default)
        statusAlert.querySelector('.error-button').style.backgroundColor = '#218b5f';
        statusAlert.querySelector('.error-button').style.boxShadow = '0 6px #0056b3, 0 2px 4px rgba(0,0,0,0.3)';
    }

    // Auto-hide after 5 seconds unless dismissed
    setTimeout(() => {
        statusAlert.classList.add('hidden');
    }, 5000);
}

/**
 * Shows a loading spinner.
 * @param {HTMLElement} targetElement The element to display the spinner within or next to.
 */
function showSpinner(targetElement) {
    if (targetElement) {
        targetElement.innerHTML = `<li class="loading-placeholder">Loading... <span class="spinner"></span></li>`;
        targetElement.querySelector('.spinner').classList.remove('hidden');
    }
}

/**
 * Hides the loading spinner.
 * @param {HTMLElement} targetElement The element where the spinner was displayed.
 */
function hideSpinner(targetElement) {
    if (targetElement && targetElement.querySelector('.spinner')) {
        targetElement.querySelector('.spinner').classList.add('hidden');
        // Clear the loading message if it's still there
        if (targetElement.querySelector('.loading-placeholder')) {
             targetElement.innerHTML = ''; // Clear placeholder once content is ready
        }
    }
}

/**
 * Renders an image thumbnail.
 * @param {string} gsUrl Google Cloud Storage URL (gs://bucket/path)
 * @returns {HTMLImageElement | null}
 */
function renderThumbnail(gsUrl) {
    if (!gsUrl) return null;
    const img = document.createElement('img');
    img.className = 'thumbnail';
    // Firebase Storage provides a public download URL from gs://
    // You'd typically use storage.refFromURL(gsUrl).getDownloadURL()
    // For this example, we'll assume a direct URL or pre-signed URL is used or generated.
    // In a real app, you'd convert gs:// to https:// using getDownloadURL() on page load or on demand.
    // For simplicity, we'll just put the gsUrl for now and you'd implement proper URL conversion.
    // Placeholder for now:
    img.src = gsUrl.replace('gs://', 'https://storage.googleapis.com/'); // This is a common pattern, but actual public URLs may differ
    img.alt = 'Thumbnail';
    return img;
}

/**
 * Renders an audio player button.
 * @param {string} gsUrl Google Cloud Storage URL (gs://bucket/path)
 * @returns {HTMLButtonElement | null}
 */
function renderAudioPlayer(gsUrl) {
    if (!gsUrl) return null;
    const button = document.createElement('button');
    button.className = 'audio-player-btn';
    button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-fill" viewBox="0 0 16 16"><path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/></svg> Play';
    button.onclick = async () => {
        try {
            // Get download URL from Storage
            const audioRef = storage.refFromURL(gsUrl);
            const downloadURL = await audioRef.getDownloadURL();
            const audio = new Audio(downloadURL);
            audio.play();
        } catch (error) {
            console.error("Error playing audio:", error);
            showAlert("Could not play audio. Check file permissions.", true);
        }
    };
    return button;
}
// ModuleContent.js (Continued from Part 1)

// --- Module List Rendering ---

/**
 * Creates an HTML list item for a module.
 * @param {Object} moduleData The module document data.
 * @param {string} moduleData.id The document ID of the module.
 * @param {string} moduleData.MODULETYPE The type of the module (e.g., 'LESSON', 'SEMANTIC_GROUP').
 * @param {string} moduleData.TITLE The title of the module.
 * @param {Array<string>} [moduleData.MODULEID_ARRAY] Array of child module IDs.
 * @param {string} [moduleData.imageUrl] URL for an associated image.
 * @param {string} [moduleData.audioUrl] URL for an associated audio file.
 * @param {number} level The nesting level (for indentation).
 * @param {Array<string>} [selectedModuleIds=[]] Array of IDs currently selected for the active parent.
 * @returns {HTMLLIElement} The created list item element.
 */
function renderModuleListItem(moduleData, level, selectedModuleIds = []) {
    const li = document.createElement('li');
    li.className = `module-item level-${level}`;
    li.dataset.moduleId = moduleData.id;
    li.dataset.moduleType = moduleData.MODULETYPE;
    li.dataset.level = level;
    // Store child IDs for easier access without re-fetching parent data
    if (moduleData.MODULEID_ARRAY) {
        li.dataset.children = JSON.stringify(moduleData.MODULEID_ARRAY);
    }

    const isSelectable = !NON_SELECTABLE_LEAF_MODULE_TYPES.includes(moduleData.MODULETYPE);
    const hasChildren = moduleData.MODULEID_ARRAY && moduleData.MODULEID_ARRAY.length > 0;

    let contentHTML = ``;

    // Checkbox (if selectable)
    if (isSelectable) {
        const isCurrentlySelected = selectedModuleIds.includes(moduleData.id);
        contentHTML += `<input type="checkbox" data-module-id="${moduleData.id}" ${isCurrentlySelected ? 'checked' : ''}>`;
    } else {
        // Add a placeholder or disable checkbox for non-selectable items visually
        contentHTML += `<input type="checkbox" disabled style="opacity: 0.5;">`;
    }

    contentHTML += `
        <div class="module-item-content">
            <span class="title">${moduleData.TITLE || moduleData.name || 'Untitled'}</span>
            <span class="type">${moduleData.MODULETYPE}</span>
        </div>
    `;

    // Media (Thumbnail and Audio Player)
    const mediaContainer = document.createElement('div');
    mediaContainer.className = 'module-media';
    if (moduleData.imageUrl) {
        const thumbnail = renderThumbnail(moduleData.imageUrl);
        if (thumbnail) mediaContainer.appendChild(thumbnail);
    }
    if (moduleData.audioUrl) {
        const audioPlayer = renderAudioPlayer(moduleData.audioUrl);
        if (audioPlayer) mediaContainer.appendChild(audioPlayer);
    }
    if (mediaContainer.children.length > 0) { // Only append if there's actual media
        li.appendChild(mediaContainer);
    }

    // Expand/Collapse Toggle (if has children)
    if (hasChildren) {
        const toggle = document.createElement('span');
        toggle.className = 'expand-toggle';
        toggle.textContent = '▶'; // Right-facing triangle
        toggle.dataset.expanded = 'false'; // Custom attribute to track state
        li.appendChild(toggle);

        toggle.addEventListener('click', async (event) => {
            event.stopPropagation(); // Prevent parent click handlers from firing
            const isExpanded = toggle.dataset.expanded === 'true';
            if (isExpanded) {
                // Collapse: Remove child items
                let nextSibling = li.nextElementSibling;
                while (nextSibling && parseInt(nextSibling.dataset.level) > level) {
                    const temp = nextSibling.nextElementSibling;
                    nextSibling.remove();
                    nextSibling = temp;
                }
                toggle.dataset.expanded = 'false';
                toggle.textContent = '▶';
                toggle.classList.remove('expanded');
            } else {
                // Expand: Fetch and render children
                toggle.classList.add('expanded'); // Rotate the triangle
                showSpinner(li); // Show spinner next to parent
                await fetchAndRenderChildren(moduleData.id, moduleData.MODULEID_ARRAY, level + 1, li, selectedModuleIds);
                hideSpinner(li); // Hide spinner after children are rendered
                toggle.dataset.expanded = 'true';
                toggle.textContent = '▼'; // Down-facing triangle
            }
        });
    }

    li.innerHTML = contentHTML + li.innerHTML; // Prepend checkbox and title, then append media/toggle
    return li;
}

/**
 * Fetches and renders child modules for a given parent.
 * @param {string} parentId The ID of the parent module.
 * @param {Array<string>} childIds An array of IDs of the child modules.
 * @param {number} level The nesting level for the children.
 * @param {HTMLLIElement} parentLi The HTML <li> element of the parent.
 * @param {Array<string>} [selectedModuleIds=[]] Array of IDs currently selected for the active parent.
 */
async function fetchAndRenderChildren(parentId, childIds, level, parentLi, selectedModuleIds = []) {
    if (!childIds || childIds.length === 0) return;

    // Determine the collection for children based on the parent's type, or the child's type
    // This is where it gets tricky due to cross-collection references
    // For simplicity here, we'll iterate and fetch each child from its respective collection.
    // In a highly optimized scenario, you might do batched lookups or pre-fetch if you know the child types.

    const allChildPromises = childIds.map(async (childId) => {
        // Attempt to guess collection based on likely types
        let docSnap = null;
        // Try common collections first
        docSnap = await db.collection('lessons').doc(childId).get();
        if (docSnap.exists) return { id: docSnap.id, ...docSnap.data(), collection: 'lessons' };

        docSnap = await db.collection('learningContent').doc(childId).get();
        if (docSnap.exists) return { id: docSnap.id, ...docSnap.data(), collection: 'learningContent' };
        
        docSnap = await db.collection('syllables').doc(childId).get();
        if (docSnap.exists) return { id: docSnap.id, ...docSnap.data(), collection: 'syllables' };

        docSnap = await db.collection('phonemes').doc(childId).get();
        if (docSnap.exists) return { id: docSnap.id, ...docSnap.data(), collection: 'phonemes' };

        // If not found in common collections, it might be an invalid ID or deleted.
        console.warn(`Child module with ID ${childId} not found in any expected collection.`);
        return null;
    });

    const children = (await Promise.all(allChildPromises)).filter(Boolean); // Filter out nulls

    const tempDiv = document.createElement('div'); // Use a temp div to build children before inserting
    children.forEach(childData => {
        const childLi = renderModuleListItem(childData, level, selectedModuleIds);
        tempDiv.appendChild(childLi);
    });

    // Insert children right after the parent LI
    parentLi.after(tempDiv.children); // This will insert each child from the tempDiv after the parentLi
}


/**
 * Loads all relevant modules for the larger list view.
 * This includes LESSONs (for COURSE building) and all selectable items from learningContent.
 */
async function loadAllAvailableModules() {
    showSpinner(availableModulesList);
    availableModulesList.innerHTML = ''; // Clear previous content

    try {
        const allFetchedModules = [];

        // 1. Fetch all LESSONs
        const lessonsSnapshot = await db.collection('lessons').get();
        lessonsSnapshot.forEach(doc => {
            allFetchedModules.push({ id: doc.id, ...doc.data(), MODULETYPE: 'LESSON' });
        });

        // 2. Fetch all selectable items from learningContent (SEMANTIC_GROUP, VOCABULARY_GROUP, etc.)
        // We'll rely on the MODULETYPE field within the document to filter later.
        const learningContentSnapshot = await db.collection('learningContent').get();
        learningContentSnapshot.forEach(doc => {
             // Only include if it's a known parent type or a specific item type
            const data = doc.data();
            if (data.MODULETYPE && !NON_SELECTABLE_LEAF_MODULE_TYPES.includes(data.MODULETYPE)) {
                 allFetchedModules.push({ id: doc.id, ...data });
            }
        });
        
        // At this stage, we are not pre-fetching syllabes or phonemes as they are non-selectable leaves
        // They will be fetched on demand when their parent VOCABULARY or SYLLABLE is expanded.

        allAvailableModules = allFetchedModules; // Store for filtering/searching
        displayFilteredModules(); // Display initially without filters
        
    } catch (error) {
        console.error("Error loading all available modules:", error);
        showAlert("Failed to load available modules. " + error.message, true);
    } finally {
        hideSpinner(availableModulesList);
    }
}

/**
 * Displays modules in the larger list view based on current filters and search.
 * It uses the 'allAvailableModules' global array.
 */
function displayFilteredModules() {
    availableModulesList.innerHTML = ''; // Clear current display
    const filterType = filterModuleTypeSelect.value;
    const searchTerm = searchModulesInput.value.toLowerCase();

    const currentModuleIds = currentActiveRecord && currentActiveRecord.MODULEID_ARRAY ? currentActiveRecord.MODULEID_ARRAY : [];

    const filtered = allAvailableModules.filter(module => {
        const matchesType = (filterType === 'all' || module.MODULETYPE === filterType);
        const matchesSearch = (module.TITLE || '').toLowerCase().includes(searchTerm) ||
                              (module.name || '').toLowerCase().includes(searchTerm);
        return matchesType && matchesSearch;
    });

    if (filtered.length === 0) {
        availableModulesList.innerHTML = `<li class="loading-placeholder">No modules found.</li>`;
        return;
    }

    filtered.forEach(moduleData => {
        const li = renderModuleListItem(moduleData, 0, currentModuleIds); // Level 0 for top-level modules
        availableModulesList.appendChild(li);

        // Add event listener for checkbox changes
        const checkbox = li.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.disabled) {
            checkbox.addEventListener('change', (event) => {
                const moduleId = event.target.dataset.moduleId;
                if (event.target.checked) {
                    addModuleToActiveRecordSelection(moduleId);
                } else {
                    removeModuleFromActiveRecordSelection(moduleId);
                }
            });
        }
    });
}

/**
 * Adds a module ID to the current active record's selection.
 * @param {string} moduleId The ID of the module to add.
 */
function addModuleToActiveRecordSelection(moduleId) {
    if (currentActiveRecord) {
        if (!currentActiveRecord.MODULEID_ARRAY) {
            currentActiveRecord.MODULEID_ARRAY = [];
        }
        if (!currentActiveRecord.MODULEID_ARRAY.includes(moduleId)) {
            currentActiveRecord.MODULEID_ARRAY.push(moduleId);
            updateCurrentChildrenDisplay(); // Update display immediately
            console.log(`Added ${moduleId} to currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

/**
 * Removes a module ID from the current active record's selection.
 * @param {string} moduleId The ID of the module to remove.
 */
function removeModuleFromActiveRecordSelection(moduleId) {
    if (currentActiveRecord && currentActiveRecord.MODULEID_ARRAY) {
        const index = currentActiveRecord.MODULEID_ARRAY.indexOf(moduleId);
        if (index > -1) {
            currentActiveRecord.MODULEID_ARRAY.splice(index, 1);
            updateCurrentChildrenDisplay(); // Update display immediately
            console.log(`Removed ${moduleId} from currentActiveRecord.MODULEID_ARRAY`);
        }
    }
}

// --- Event Listeners for Filters/Search ---
filterModuleTypeSelect.addEventListener('change', displayFilteredModules);
searchModulesInput.addEventListener('input', displayFilteredModules);


// End of Part 2
// ModuleContent.js (Continued from Part 2)

// --- Single Record View Logic ---

/**
 * Populates the single record view with data from a given module.
 * @param {Object|null} recordData The module data to load, or null for a new record.
 * @param {string} [collectionName] The name of the collection this record belongs to.
 */
function loadRecordIntoEditor(recordData, collectionName = null) {
    currentActiveRecord = recordData;

    if (recordData) {
        activeRecordIdInput.value = recordData.id || '';
        activeRecordCollectionInput.value = collectionName || ''; // Store the collection
        activeRecordTypeInput.value = recordData.MODULETYPE || '';
        recordTitleInput.value = recordData.TITLE || recordData.name || '';
        recordDescriptionTextarea.value = recordData.DESCRIPTION || '';

        // Handle Theme field visibility based on MODULETYPE
        if (recordData.MODULETYPE === 'COURSE' || recordData.MODULETYPE === 'LESSON') {
            recordThemeInput.value = recordData.THEME || '';
            themeFields.forEach(el => el.classList.remove('hidden'));
        } else {
            recordThemeInput.value = '';
            themeFields.forEach(el => el.classList.add('hidden'));
        }

        saveRecordBtn.textContent = 'Update Module';
        deleteRecordBtn.style.display = 'inline-block'; // Show delete button for existing records
    } else {
        // Clear form for a new record
        activeRecordIdInput.value = '';
        activeRecordCollectionInput.value = 'courses'; // Default to creating a new COURSE
        activeRecordTypeInput.value = 'COURSE'; // Default to creating a new COURSE
        recordTitleInput.value = '';
        recordThemeInput.value = '';
        recordDescriptionTextarea.value = '';

        themeFields.forEach(el => el.classList.remove('hidden')); // Show theme fields for new COURSE

        saveRecordBtn.textContent = 'Create Module';
        deleteRecordBtn.style.display = 'none'; // Hide delete button for new records
    }

    updateCurrentChildrenDisplay();
    // Refresh the available modules list to update selected states for the new active record
    displayFilteredModules();
}

/**
 * Updates the 'Currently Included Modules' list based on currentActiveRecord.MODULEID_ARRAY.
 */
async function updateCurrentChildrenDisplay() {
    currentChildrenDisplay.innerHTML = '';
    if (!currentActiveRecord || !currentActiveRecord.MODULEID_ARRAY || currentActiveRecord.MODULEID_ARRAY.length === 0) {
        currentChildrenDisplay.innerHTML = `<li>No modules included yet.</li>`;
        return;
    }

    // Fetch the actual titles of the children for display
    const childPromises = currentActiveRecord.MODULEID_ARRAY.map(async (childId) => {
        // This is a simplified fetch; in a more robust app, you might know the child's type
        // and target its specific collection. For now, we'll iterate through common collections.
        let docRef = db.collection('lessons').doc(childId);
        let docSnap = await docRef.get();
        if (!docSnap.exists) {
            docRef = db.collection('learningContent').doc(childId);
            docSnap = await docRef.get();
        }
        // Add more collection checks if needed for other child types (syllables, phonemes)
        // that could somehow end up in MODULEID_ARRAY (though design suggests not for parents)

        if (docSnap.exists) {
            const data = docSnap.data();
            return { id: docSnap.id, title: data.TITLE || data.name, type: data.MODULETYPE };
        }
        return { id: childId, title: 'Unknown Module (ID: ' + childId + ')', type: 'Unknown' };
    });

    const childrenDetails = await Promise.all(childPromises);

    childrenDetails.forEach(child => {
        const li = document.createElement('li');
        li.textContent = `${child.title} (${child.type})`;
        currentChildrenDisplay.appendChild(li);
    });
}

/**
 * Saves (creates or updates) the active record in Firestore.
 */
async function saveRecord() {
    const recordId = activeRecordIdInput.value;
    const recordCollection = activeRecordCollectionInput.value;
    const recordType = activeRecordTypeInput.value;
    const title = recordTitleInput.value.trim();
    const theme = recordThemeInput.value.trim();
    const description = recordDescriptionTextarea.value.trim();

    if (!title) {
        showAlert('Title cannot be empty!', true);
        return;
    }
    if (!recordCollection || !recordType) {
        showAlert('Collection and Module Type are missing!', true);
        return;
    }

    // Prepare data for saving
    const dataToSave = {
        TITLE: title,
        DESCRIPTION: description,
        MODULETYPE: recordType,
        MODULEID_ARRAY: currentActiveRecord ? [...currentActiveRecord.MODULEID_ARRAY] : [] // Clone array
    };

    if (recordType === 'COURSE' || recordType === 'LESSON') {
        dataToSave.THEME = theme;
    }

    try {
        if (recordId) {
            // Update existing record
            const docRef = db.collection(recordCollection).doc(recordId);
            await docRef.update(dataToSave);
            showAlert('Module updated successfully!');
            console.log("Updated record:", recordId, dataToSave);
        } else {
            // Create new record
            const docRef = await db.collection(recordCollection).add(dataToSave);
            activeRecordIdInput.value = docRef.id; // Set the new ID
            currentActiveRecord = { id: docRef.id, ...dataToSave }; // Update global state
            showAlert('Module created successfully!');
            console.log("Created new record with ID:", docRef.id, dataToSave);
        }
        // After save, ensure navigation list is updated (especially for new courses)
        await fetchAndPopulateCourseNavigation();
        // Set the newly created/updated record as the active one in the navigation
        const currentIndex = courseNavigationList.findIndex(c => c.id === activeRecordIdInput.value);
        if (currentIndex !== -1) currentCourseIndex = currentIndex;
        updateNavigationButtons();

    } catch (error) {
        console.error('Error saving record:', error);
        showAlert(`Error saving module: ${error.message}`, true);
    }
}

/**
 * Deletes the currently active record from Firestore.
 */
async function deleteRecord() {
    if (!currentActiveRecord || !currentActiveRecord.id) {
        showAlert('No module selected for deletion.', true);
        return;
    }

    const confirmDelete = confirm(`Are you sure you want to delete "${currentActiveRecord.TITLE}"? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
        await db.collection(currentActiveRecord.collection).doc(currentActiveRecord.id).delete();
        showAlert('Module deleted successfully!');
        console.log("Deleted record:", currentActiveRecord.id);

        // After deletion, load the "new record" state or the next available record
        await fetchAndPopulateCourseNavigation(); // Refresh navigation list
        if (courseNavigationList.length > 0) {
            currentCourseIndex = Math.min(currentCourseIndex, courseNavigationList.length - 1);
            const nextCourse = courseNavigationList[currentCourseIndex];
            const nextCourseSnap = await db.collection('courses').doc(nextCourse.id).get();
            loadRecordIntoEditor({ id: nextCourseSnap.id, ...nextCourseSnap.data() }, 'courses');
        } else {
            loadRecordIntoEditor(null); // No courses left, show new record form
        }
        updateNavigationButtons();

    } catch (error) {
        console.error('Error deleting record:', error);
        showAlert(`Error deleting module: ${error.message}`, true);
    }
}

// --- Course Navigation Logic (for single record view) ---
let courseNavigationList = []; // Array of { id, title } for courses
let currentCourseIndex = -1;

/**
 * Fetches all courses and populates the navigation list.
 */
async function fetchAndPopulateCourseNavigation() {
    try {
        const snapshot = await db.collection('courses').orderBy('TITLE').get(); // Order by title for consistent navigation
        courseNavigationList = snapshot.docs.map(doc => ({ id: doc.id, TITLE: doc.data().TITLE || doc.data().name }));
        updateNavigationButtons();
    } catch (error) {
        console.error("Error fetching course navigation:", error);
        showAlert("Failed to load course navigation.", true);
    }
}

/**
 * Updates the disabled state of Prev/Next buttons.
 */
function updateNavigationButtons() {
    prevRecordBtn.disabled = currentCourseIndex <= 0;
    nextRecordBtn.disabled = currentCourseIndex >= courseNavigationList.length - 1;
}

// --- Event Listeners for Single Record View Buttons ---

newRecordBtn.addEventListener('click', () => {
    loadRecordIntoEditor(null); // Load a blank form for new record
    currentCourseIndex = -1; // Indicate no course is active in navigation
    updateNavigationButtons();
});

prevRecordBtn.addEventListener('click', async () => {
    if (currentCourseIndex > 0) {
        currentCourseIndex--;
        const courseId = courseNavigationList[currentCourseIndex].id;
        const courseSnap = await db.collection('courses').doc(courseId).get();
        if (courseSnap.exists) {
            loadRecordIntoEditor({ id: courseSnap.id, ...courseSnap.data() }, 'courses');
        } else {
            showAlert("Selected course not found, refreshing navigation.", true);
            await fetchAndPopulateCourseNavigation();
            loadRecordIntoEditor(null); // Fallback to new record
        }
        updateNavigationButtons();
    }
});

nextRecordBtn.addEventListener('click', async () => {
    if (currentCourseIndex < courseNavigationList.length - 1) {
        currentCourseIndex++;
        const courseId = courseNavigationList[currentCourseIndex].id;
        const courseSnap = await db.collection('courses').doc(courseId).get();
        if (courseSnap.exists) {
            loadRecordIntoEditor({ id: courseSnap.id, ...courseSnap.data() }, 'courses');
        } else {
            showAlert("Selected course not found, refreshing navigation.", true);
            await fetchAndPopulateCourseNavigation();
            loadRecordIntoEditor(null); // Fallback to new record
        }
        updateNavigationButtons();
    }
});

saveRecordBtn.addEventListener('click', saveRecord);
deleteRecordBtn.addEventListener('click', deleteRecord);


// --- Main DOMContentLoaded Listener ---
document.addEventListener('DOMContentLoaded', async () => {
    // Ensure Firebase Auth is ready and user is admin
    // This part relies on common.js to handle auth state and redirection.
    // We can't directly check 'admin' claims here from the client-side for security reasons
    // (unless they are exposed via an ID token claim, which would be managed by your Cloud Functions/Admin SDK).
    // Assuming common.js redirects non-admins away, we just proceed.

    // Initial setup: Load courses for navigation, then load the first one or a new record form
    await fetchAndPopulateCourseNavigation();

    if (courseNavigationList.length > 0) {
        currentCourseIndex = 0;
        const firstCourse = courseNavigationList[currentCourseIndex];
        const courseSnap = await db.collection('courses').doc(firstCourse.id).get();
        if (courseSnap.exists) {
            loadRecordIntoEditor({ id: courseSnap.id, ...courseSnap.data() }, 'courses');
        } else {
            showAlert("First course not found, starting with a new record.", true);
            loadRecordIntoEditor(null);
        }
    } else {
        loadRecordIntoEditor(null); // No courses exist, start with a blank form
    }

    // Load all available modules for the larger selection list
    await loadAllAvailableModules();
});

