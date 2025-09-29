// js/conversation.js (MODULARIZED VERSION)
// This module handles the conversation logic, including AI interaction via Cloud Functions,
// and speech recognition/synthesis using browser APIs.

// --- Import necessary Firebase modules ---
// Import the initialized 'auth' and 'functions' instances from your central Firebase services file.
import { auth, functions } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// Import specific functions from the Firebase Authentication SDK.
// IMPORTANT: Using Firebase SDK v12.3.0 from CDN.
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';

// Import specific functions from the Firebase Functions SDK.
// IMPORTANT: Using Firebase SDK v12.3.0 from CDN.
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-functions.js';


// Get references to DOM elements
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-button');
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessageDiv = document.getElementById('error-message');

// Get the callable Cloud Function
// 'functions' is now imported from firebase-services.js and is already configured with the region.
const chatWithGemini = httpsCallable(functions, 'chatWithGemini');


let isRecording = false;
let recognition; // For Web Speech API SpeechRecognition
const synth = window.speechSynthesis; // For Web Speech API SpeechSynthesis (browser global)


// Access 'auth' object and use modular 'onAuthStateChanged'
onAuthStateChanged(auth, (user) => {
    if (!user) {
        console.warn('No user authenticated. Redirecting to index...');
        window.location.href = 'index.html'; // window.location is a browser global
    }
});


// Function to display messages in the chat UI
function addMessageToChat(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);
    messageDiv.textContent = text;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight; // Scroll to bottom
}

// Function to speak text using browser's TTS
function speakText(text) {
    if (synth.speaking) {
        synth.cancel(); // Stop any current speech
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        errorMessageDiv.textContent = 'Speech synthesis error. Check console.';
        errorMessageDiv.style.display = 'block';
    };
    synth.speak(utterance);
}

// Function to send message to Gemini via Cloud Function
async function sendMessage() {
    const message = messageInput.value.trim();
    if (message === '') return;

    addMessageToChat(message, 'user'); // Add user's message to chat UI
    messageInput.value = ''; // Clear input field
    loadingIndicator.style.display = 'block'; // Show thinking indicator
    errorMessageDiv.style.display = 'none'; // Hide previous errors

    try {
        // Call the Cloud Function using the modular 'chatWithGemini' callable
        const result = await chatWithGemini({ message: message });
        const geminiResponse = result.data.response;

        addMessageToChat(geminiResponse, 'gemini'); // Add Gemini's response to chat UI
        speakText(geminiResponse); // Make Gemini speak

    } catch (error) {
        console.error("Error calling Gemini Cloud Function:", error);
        errorMessageDiv.textContent = `Error: ${error.message}. Please try again.`;
        errorMessageDiv.style.display = 'block';
    } finally {
        loadingIndicator.style.display = 'none'; // Hide thinking indicator
    }
}

// Event listener for Send button
sendButton.addEventListener('click', sendMessage);

// Event listener for Enter key in input field
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Basic Web Speech API (Speech Recognition) for Mic button
// Note: Browser support varies. Chrome works well. Safari/Firefox often require HTTPS.
if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.continuous = false; // Capture one utterance at a time
    recognition.lang = 'en-US';    // Recognize English
    recognition.interimResults = false; // Don't show results while speaking

    recognition.onstart = () => {
        isRecording = true;
        micButton.classList.add('recording');
        messageInput.placeholder = 'Speak now...';
        errorMessageDiv.style.display = 'none';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        messageInput.value = transcript;
        sendMessage(); // Send the transcribed message
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event);
        errorMessageDiv.textContent = `Speech recognition error: ${event.error}.`;
        errorMessageDiv.style.display = 'block';
        isRecording = false;
        micButton.classList.remove('recording');
        messageInput.placeholder = 'Type your message or click mic...';
    };

    recognition.onend = () => {
        isRecording = false;
        micButton.classList.remove('recording');
        messageInput.placeholder = 'Type your message or click mic...';
    };

    micButton.addEventListener('click', () => {
        if (isRecording) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });
} else {
    // Hide mic button if SpeechRecognition is not supported
    micButton.style.display = 'none';
    console.warn('Speech Recognition not supported in this browser.');
    errorMessageDiv.textContent = 'Speech input not supported in your browser.';
    errorMessageDiv.style.display = 'block';
}

// Initial welcome message from Gemini (already in HTML) can be spoken on page load
// Moved into DOMContentLoaded listener to ensure elements are ready
document.addEventListener('DOMContentLoaded', () => {
    speakText("Hello! I'm Gemini, your English language tutor. What would you like to practice today?");
});
