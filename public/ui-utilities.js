// js/ui-utilities.js

// Reusable function for displaying errors in a specific HTML element.
// @param {HTMLElement} errorMessageDiv - The div element to display the error in.
// @param {string} message - The error message to display.
export const displayError = (errorMessageDiv, message) => {
    if (errorMessageDiv) {
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
    }
};

// Reusable function for clearing error messages from a specific HTML element.
// @param {HTMLElement} errorMessageDiv - The div element to clear.
export const clearError = (errorMessageDiv) => {
    if (errorMessageDiv) {
        errorMessageDiv.textContent = '';
        errorMessageDiv.style.display = 'none';
    }
};

// Reusable popup-style error display function.
// Assumes HTML elements with IDs 'popup-error', 'popup-error-text', 'popup-error-close' exist.
// @param {string} message - The error message to display in the popup.
export function showErrorPopup(message) {
    const popup = document.getElementById('popup-error');
    const text = document.getElementById('popup-error-text');
    const closeButton = document.getElementById('popup-error-close');

    if (!popup || !text || !closeButton) {
        console.warn("Popup element(s) not found for showErrorPopup. Please ensure your HTML has them.");
        return;
    }

    text.textContent = message;
    popup.style.display = 'flex'; // Keeping your original display style.

    closeButton.onclick = () => {
        popup.style.display = 'none';
    };

    // Your original setTimeout from onboarding.js is included here for completeness
    setTimeout(() => {
        popup.style.display = 'none';
    }, 10000);
}

// --- General Utility Functions (Moved from ModuleContent.js) ---

/**
 * Shows a temporary alert message in a designated status area.
 * @param {HTMLElement} statusMessageSpan - The span element to display the message.
 * @param {HTMLElement} statusAlert - The container div for the alert.
 * @param {string} message The message to display.
 * @param {boolean} isError If true, styles as an error. Defaults to success.
 */
export function showAlert(statusMessageSpan, statusAlert, message, isError = false) {
    if (statusMessageSpan) {
        statusMessageSpan.textContent = message;
    } else {
        console.error("Alert message span not found! Message:", message);
        return;
    }

    if (statusAlert) {
        statusAlert.classList.remove('hidden');
        const errorButton = statusAlert.querySelector('.error-button'); // Assumed element

        if (isError) {
            statusAlert.style.backgroundColor = '#dc3545'; // Red for errors
            if (errorButton) {
                errorButton.style.backgroundColor = '#dc3545';
                errorButton.style.boxShadow = '0 6px #a71d2a, 0 2px 4px rgba(0,0,0,0.3)';
            }
        } else {
            statusAlert.style.backgroundColor = '#218b5f'; // Green for success (your default)
            if (errorButton) {
                errorButton.style.backgroundColor = '#218b5f';
                errorButton.style.boxShadow = '0 6px #0056b3, 0 2px 4px rgba(0,0,0,0.3)';
            }
        }

        setTimeout(() => {
            statusAlert.classList.add('hidden');
        }, 5000);
    } else {
        console.error("Alert container not found! Displaying message to console:", message);
    }
}

/**
 * Shows a loading spinner within a target element.
 * @param {HTMLElement} targetElement - The element where the spinner should be displayed.
 * @param {HTMLElement} loadingSpinner - A specific spinner element to show/hide if global.
 */
export function showSpinner(targetElement, loadingSpinner = null) {
    if (targetElement) {
        targetElement.innerHTML = `<li class="loading-placeholder">Loading... <span class="spinner"></span></li>`;
        const spinnerElement = targetElement.querySelector('.spinner');
        if (spinnerElement) {
            spinnerElement.classList.remove('hidden');
        }
    }
    if (loadingSpinner) { // For a main page spinner
        loadingSpinner.classList.remove('hidden');
    }
}

/**
 * Hides a loading spinner from a target element.
 * @param {HTMLElement} targetElement - The element from which the spinner should be hidden.
 * @param {HTMLElement} loadingSpinner - A specific spinner element to show/hide if global.
 */
export function hideSpinner(targetElement, loadingSpinner = null) {
    if (targetElement) {
        const spinnerElement = targetElement.querySelector('.spinner');
        if (spinnerElement) {
            spinnerElement.classList.add('hidden');
        }
        const loadingPlaceholder = targetElement.querySelector('.loading-placeholder');
        if (loadingPlaceholder) {
             targetElement.innerHTML = ''; // Clear placeholder once content is ready
        }
    }
    if (loadingSpinner) { // For a main page spinner
        loadingSpinner.classList.add('hidden');
    }
}

/**
 * Renders an image thumbnail with a clickable link.
 * @param {string} gsUrl Google Cloud Storage URL (gs://bucket/path) or direct HTTPS URL.
 * @returns {HTMLAnchorElement | null} An anchor element containing the image.
 */
export function renderThumbnail(gsUrl) {
    if (!gsUrl) return null;
    const img = document.createElement('img');
    img.className = 'thumbnail';
    // Assume gsUrl is a direct HTTPS URL for display or can be converted client-side.
    // If it's a gs:// path, you'd need server-side conversion or Firebase Storage SDK's getDownloadURL().
    img.src = gsUrl.startsWith('gs://') ? gsUrl.replace('gs://', 'https://storage.googleapis.com/') : gsUrl;
    img.alt = 'Thumbnail';
    img.title = 'Click to view full image';

    const link = document.createElement('a');
    link.href = img.src; // Link to the same image source
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.appendChild(img);
    return link;
}

/**
 * Renders an audio player button.
 * @param {string} gsUrl Google Cloud Storage URL (gs://bucket/path) or direct HTTPS URL.
 * @returns {HTMLButtonElement | null} A button element that plays audio on click.
 */
export function renderAudioPlayer(gsUrl) {
    if (!gsUrl) return null;
    const button = document.createElement('button');
    button.className = 'audio-player-btn';
    button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-fill" viewBox="0 0 16 16"><path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/></svg> Play';
    button.onclick = async () => {
        try {
            const audio = new Audio(gsUrl);
            await audio.play();
        } catch (error) {
            console.error("Error playing audio:", error);
            // Assuming showAlert can be called with specific elements passed to it from the orchestrator
            // showAlert(statusMessageSpan, statusAlert, "Could not play audio. Check file permissions or URL.", true);
            alert("Could not play audio. Check file permissions or URL."); // Fallback alert
        }
    };
    return button;
}
