// js/options.js
// This script manages the WebInsight extension's settings page (options.html).
// It allows users to:
// 1. Input and save their Google Gemini API key.
// 2. Select a visual theme for the extension (light, dark, or system default).
// The API key is stored in `chrome.storage.local` for security (not synced).
// The theme preference is stored in `chrome.storage.sync` to be consistent across devices.
// The script also handles applying the selected theme to the options page itself and
// displaying status messages to the user.

// --- DOM Element References ---
/**
 * Input field for the Google Gemini API key.
 * @type {HTMLInputElement}
 */
const apiKeyInput = document.getElementById('apiKey');

/**
 * Select element for choosing the extension's theme.
 * @type {HTMLSelectElement}
 */
const themeSelect = document.getElementById('themeSelect');

/**
 * Button to save the configured settings.
 * @type {HTMLButtonElement}
 */
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

/**
 * Element used to display status messages (e.g., "Settings saved", "Error").
 * @type {HTMLElement}
 */
const statusMessageEl = document.getElementById('statusMessage');

// --- Initialization ---

/**
 * Loads saved settings when the options page DOM is fully loaded.
 * Populates the API key input and theme select element with stored values.
 * Also applies the currently saved theme to the options page itself.
 */
document.addEventListener('DOMContentLoaded', loadSettings);

/**
 * Attaches an event listener to the "Save Settings" button.
 */
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
} else {
    console.error("WebInsight Options: Save Settings button not found in DOM.");
}

/**
 * Listens for changes in the operating system's preferred color scheme.
 * If the extension's theme is set to 'system', this will dynamically update
 * the options page theme to match the system change.
 */
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    if (themeSelect.value === 'system') {
        console.log("WebInsight Options: System theme changed, re-applying theme to options page.");
        applyTheme('system'); // Re-apply the theme based on the new system preference.
    }
});


// --- Core Functions ---

/**
 * Loads settings from `chrome.storage` and populates the form fields on the options page.
 * API key is loaded from `chrome.storage.local`.
 * Theme preference is loaded from `chrome.storage.sync`.
 * After loading, it applies the theme to the options page.
 */
function loadSettings() {
    console.log("WebInsight Options: Loading settings...");

    // Load API key from local storage.
    chrome.storage.local.get(['geminiApiKey'], (localResult) => {
        if (chrome.runtime.lastError) {
             console.error("WebInsight Options: Error loading API key:", chrome.runtime.lastError);
             showStatus("Error loading API key. Check browser console.", "error", false);
        } else if (localResult.geminiApiKey) {
            apiKeyInput.value = localResult.geminiApiKey;
            console.log("WebInsight Options: API Key loaded from local storage.");
        } else {
             console.log("WebInsight Options: Gemini API Key is not set in local storage.");
        }
    });

    // Load theme preference from sync storage.
    chrome.storage.sync.get(['theme'], (syncResult) => {
         if (chrome.runtime.lastError) {
             console.error("WebInsight Options: Error loading theme setting:", chrome.runtime.lastError);
             showStatus("Error loading theme setting. Check browser console.", "error", false);
             applyTheme('system'); // Default to system theme on error.
         } else {
            const loadedTheme = syncResult.theme || 'system'; // Default to 'system' if not previously set.
            themeSelect.value = loadedTheme;
            console.log(`WebInsight Options: Theme loaded from sync storage: ${loadedTheme}`);
            applyTheme(loadedTheme); // Apply the loaded theme to the options page.
         }
    });
}

/**
 * Saves the current values from the form fields (API key and theme) to `chrome.storage`.
 * The API key is saved to `chrome.storage.local`.
 * The theme is saved to `chrome.storage.sync`.
 * Displays status messages to the user indicating success or failure.
 */
function saveSettings() {
    console.log("WebInsight Options: Attempting to save settings...");
    showStatus("Saving settings...", "info", false); // Indicate that saving is in progress.

    const apiKey = apiKeyInput.value.trim();
    const theme = themeSelect.value;

    // Basic validation for API Key (presence). More complex validation could be added.
    if (!apiKey) {
         console.warn("WebInsight Options: API Key field is empty. It will be saved as empty, disabling related AI features.");
         // Optionally, show a persistent warning if an empty key is saved,
         // or prevent saving an empty key if it's mandatory for core functionality.
         // showStatus("Warning: API Key is empty. AI analysis features will be disabled.", "error", false);
    }

    // Save API Key to local storage.
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        if (chrome.runtime.lastError) {
            console.error("WebInsight Options: Error saving API Key to local storage:", chrome.runtime.lastError);
            showStatus(`Error saving API Key: ${chrome.runtime.lastError.message}`, "error", false);
        } else {
            console.log("WebInsight Options: API Key saved successfully to local storage.");
            // Chain theme saving to occur after API key saving attempt.
            chrome.storage.sync.set({ theme: theme }, () => {
                 if (chrome.runtime.lastError) {
                     console.error("WebInsight Options: Error saving theme to sync storage:", chrome.runtime.lastError);
                     // Notify that API key might have saved but theme failed.
                     showStatus(`API Key saved, but an error occurred while saving theme: ${chrome.runtime.lastError.message}`, "error", false);
                 } else {
                    console.log("WebInsight Options: Theme saved successfully to sync storage.");
                    showStatus("Settings saved successfully!", "success", true); // Auto-clear success message.
                    applyTheme(theme); // Apply the newly saved theme to the options page immediately.
                 }
            });
        }
    });
}

/**
 * Applies the selected theme (light, dark, or system) to the options page's body element
 * by adding or removing the 'dark-mode' CSS class.
 *
 * @param {'light' | 'dark' | 'system'} theme - The theme setting to apply.
 *        If 'system', it respects the operating system's preferred color scheme.
 */
function applyTheme(theme) {
    const body = document.body;
    // Determine if dark mode should be active based on selection or system preference.
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDarkMode = theme === 'dark' || (theme === 'system' && prefersDark);

    if (useDarkMode) {
        body.classList.add('dark-mode');
        console.log("WebInsight Options: Applied dark mode to options page.");
    } else {
        body.classList.remove('dark-mode');
        console.log("WebInsight Options: Applied light mode to options page.");
    }
}


/**
 * Displays a status message (info, success, or error) to the user on the options page.
 * The message can be set to auto-clear after a few seconds.
 *
 * @param {string} message - The text message to be displayed.
 * @param {'info' | 'success' | 'error'} [type="info"] - The type of message, which controls its styling.
 * @param {boolean} [autoClear=true] - Whether the message should automatically disappear after a delay.
 */
function showStatus(message, type = "info", autoClear = true) {
    if (!statusMessageEl) {
        console.error("WebInsight Options: Status message element not found in DOM. Cannot display status:", message);
        return;
    }

    statusMessageEl.textContent = message;
    statusMessageEl.className = `status ${type}`; // Apply class for styling (e.g., 'status success').
    statusMessageEl.style.display = 'block';      // Make the status message element visible.

    // If autoClear is true, set a timeout to hide the message.
    if (autoClear) {
        setTimeout(() => {
             // Only clear if the current message is still the one we set,
             // to avoid clearing a newer message that might have appeared.
             if (statusMessageEl.textContent === message) {
                 statusMessageEl.style.display = 'none'; // Hide the element.
                 statusMessageEl.textContent = '';       // Clear its text content.
                 statusMessageEl.className = 'status';   // Reset class.
             }
        }, 3500); // Default auto-clear delay: 3.5 seconds.
    }
}