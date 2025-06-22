// main.js
// This script contains logic specific to main.html.

document.addEventListener('DOMContentLoaded', () => {
    // Reference to the element that displays the current user's email
    // This is handled by common.js, but ensures the element exists.
    const currentUserEmailSpan = document.getElementById('currentUserEmail');

    // Update the email display on this page (if common.js hasn't already, or for dynamic updates)
    // The onAuthStateChanged in common.js handles the primary redirect, but this can ensure the span is populated.
    if (auth.currentUser && currentUserEmailSpan) {
        currentUserEmailSpan.textContent = auth.currentUser.isAnonymous ? 'Guest User' : auth.currentUser.email || 'N/A';
    }


    // --- Click handlers for in-page functions ---

    // AI Pronunciation Practice
    const pronunciationPractice = document.getElementById('pronunciationPractice');
    if (pronunciationPractice) { // Check if element exists before adding listener
        pronunciationPractice.addEventListener('click', () => {
            alert('Launching AI Pronunciation Coach! (This would open a microphone modal or start a new in-app experience)');
            // Here, you would typically:
            // 1. Open a modal for microphone access.
            // 2. Start a Web Speech API session.
            // 3. Begin an interactive pronunciation exercise.
        });
    }

    // AI Listening Skills
    const listeningSkills = document.getElementById('listeningSkills');
    if (listeningSkills) { // Check if element exists before adding listener
        listeningSkills.addEventListener('click', () => {
            alert('Starting AI Listening Practice! (This would play audio and show interactive transcriptions)');
            // Here, you would typically:
            // 1. Load an audio player.
            // 2. Display an interactive transcript.
            // 3. Initiate a listening comprehension quiz.
        });
    }
});
