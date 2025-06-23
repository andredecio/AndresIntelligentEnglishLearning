// This file will now directly use the global 'firebase' object
// No need for 'import { app } from './firebase-config.js';' or 'import { initializeApp } from ...'

// Get references to Firebase services from the global 'firebase' object
// The 'compat' SDKs expose these directly
const auth = firebase.auth();
const db = firebase.firestore();

const onboardingForm = document.getElementById('onboarding-form');
const loadingDiv = document.getElementById('loading');
const errorMessageDiv = document.getElementById('error-message');

let currentUser = null;

// Ensure user is authenticated
// The onAuthStateChanged listener also provides the 'user' object directly
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
    } else {
        window.location.href = '/login.html'; // Redirect if not logged in
    }
});

onboardingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) {
        errorMessageDiv.textContent = "You must be logged in to save preferences.";
        errorMessageDiv.style.display = 'block';
        return;
    }

    loadingDiv.style.display = 'block';
    errorMessageDiv.style.display = 'none'; // Hide previous errors

    const nativeLanguage = document.getElementById('native-language').value.trim();
    const learningGoal = document.getElementById('learning-goal').value;

    if (!nativeLanguage || !learningGoal) {
        loadingDiv.style.display = 'none';
        errorMessageDiv.textContent = "Please fill in all fields.";
        errorMessageDiv.style.display = 'block';
        return;
    }

    try {
        // Save user preferences to Firestore in the 'users' collection
        // Use db.collection() and doc().set() as these are now directly available
        await db.collection('users').doc(currentUser.uid).set({
            nativeLanguage: nativeLanguage,
            learningGoal: learningGoal,
            onboarded: true, // Mark user as having completed onboarding
            lastUpdated: new Date()
        }, { merge: true }); // Use merge to update existing user doc if it exists, or create if not

        // Redirect to the conversation page
        window.location.href = '/conversation.html';

    } catch (error) {
        console.error("Error saving onboarding info:", error);
        loadingDiv.style.display = 'none';
        errorMessageDiv.textContent = `Error saving info: ${error.message}. Please try again.`;
        errorMessageDiv.style.display = 'block';
    }
});
