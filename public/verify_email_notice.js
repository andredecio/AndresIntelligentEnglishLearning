// js/verify_email_notice.js (MODULARIZED VERSION)
// This module handles logic for the email verification notice page,
// including resending verification emails.

// --- Import necessary Firebase modules ---
// Import the initialized 'auth' instance from your central Firebase services file.
import { auth } from './firebase-services.js'; // Adjust path if firebase-services.js is elsewhere

// Import specific functions from the Firebase Authentication SDK.
import { sendEmailVerification } from 'firebase/auth';


document.addEventListener('DOMContentLoaded', () => {
    // 'auth' is now imported directly, so no need for global access.

    const resendEmailButton = document.getElementById('resendEmailButton');
    const resendMessage = document.getElementById('resendMessage');

    // Set up a basic cooldown for resend button to prevent spamming
    const setResendCooldown = (seconds) => {
        let timer = seconds;
        resendEmailButton.disabled = true;
        resendMessage.textContent = `You can resend in ${timer} seconds.`;

        const interval = setInterval(() => {
            timer--;
            resendMessage.textContent = `You can resend in ${timer} seconds.`;
            if (timer <= 0) {
                clearInterval(interval);
                resendEmailButton.disabled = false;
                resendMessage.textContent = '';
            }
        }, 1000);
    };

    resendEmailButton.addEventListener('click', async () => {
        // Access 'currentUser' directly from the imported 'auth' instance.
        const user = auth.currentUser;
        if (user && user.email) {
            try {
                // Use the modular 'sendEmailVerification' function.
                await sendEmailVerification(user);
                resendMessage.textContent = 'Verification email sent! Please check your inbox.';
                setResendCooldown(60); // 60-second cooldown
                console.log("Verification email resent to:", user.email);
            } catch (error) {
                resendMessage.textContent = `Error sending email: ${error.message}`;
                console.error("Error resending verification email:", error);
            }
        } else {
            resendMessage.textContent = 'No user or email found to resend verification. Please sign in again.';
            // You might redirect them to the sign-in page here (e.g., window.location.href = 'index.html';)
        }
    });

    // Initial check for a cooldown if desired (e.g., if user refreshes page shortly after sending)
    // For a more persistent cooldown, you'd store a timestamp in localStorage or Firestore.
    // For now, it only applies after the button is clicked on this page.
});
