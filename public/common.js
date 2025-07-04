// common.js

// 🔔 Create a Promise that resolves when the popup HTML is fully loaded
window.popupReady = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => {
        fetch('common.html')
            .then(response => response.text())
            .then(html => {
                const placeholder = document.getElementById('common-html-placeholder');
                if (!placeholder) {
                    console.warn("common-html-placeholder not found.");
                    return;
                }

                placeholder.innerHTML = html;

                // Wait until HTML is rendered
                setTimeout(() => {
                    const popup = document.getElementById('popup-error');
                    const text = document.getElementById('popup-error-text');
                    const closeButton = document.getElementById('popup-error-close');

                    if (!popup || !text || !closeButton) {
                        console.warn("Popup element(s) not found.");
                        return;
                    }

                    // ✅ Define showError globally after DOM is ready
                    window.showError = function (message) {
                        text.textContent = message;
                        popup.style.display = 'block';
                        closeButton.onclick = () => popup.style.display = 'none';

                        // Auto-close after 10 seconds
                        setTimeout(() => {
                            popup.style.display = 'none';
                        }, 10000);
                    };

                    resolve(); // 🟢 Mark popup as ready for use
                }, 0);
            })
            .catch(error => {
                console.error("Error loading common.html:", error);
            });
    });
});
