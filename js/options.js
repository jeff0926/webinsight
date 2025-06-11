// js/options.js - Logic for the settings page

// --- DOM Element References ---
const apiKeyInput = document.getElementById('apiKey');
const themeSelect = document.getElementById('themeSelect'); // Changed ID to themeSelect
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const statusMessageEl = document.getElementById('statusMessage');

// --- Initialization ---

// Load saved settings when the page opens
document.addEventListener('DOMContentLoaded', loadSettings);

// Add listener for the save button
saveSettingsBtn.addEventListener('click', saveSettings);

// Add listener for system theme changes to update UI dynamically if 'system' is selected
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    // Only re-apply if the current setting is 'system'
    if (themeSelect.value === 'system') {
        console.log("System theme changed, re-applying theme to options page.");
        applyTheme('system');
    }
});


// --- Core Functions ---

/**
 * Loads settings from chrome.storage and populates the form fields.
 * Applies the loaded theme to the options page.
 */
function loadSettings() {
    console.log("Loading settings...");
    // Use chrome.storage.local for sensitive data like API keys
    chrome.storage.local.get(['geminiApiKey'], (localResult) => {
        if (chrome.runtime.lastError) {
             console.error("Error loading API key:", chrome.runtime.lastError);
             showStatus("Error loading API key.", "error", false);
        } else if (localResult.geminiApiKey) {
            apiKeyInput.value = localResult.geminiApiKey;
            console.log("API Key loaded.");
        } else {
             console.log("API Key not set.");
        }
    });

    // Use chrome.storage.sync for preferences like theme (syncs across devices)
    chrome.storage.sync.get(['theme'], (syncResult) => {
         if (chrome.runtime.lastError) {
             console.error("Error loading theme:", chrome.runtime.lastError);
             showStatus("Error loading theme setting.", "error", false);
             applyTheme('system'); // Apply default theme on error
         } else {
            const loadedTheme = syncResult.theme || 'system'; // Default to 'system' if not set
            themeSelect.value = loadedTheme;
            console.log(`Theme loaded: ${loadedTheme}`);
            applyTheme(loadedTheme); // Apply theme to the page itself
         }
    });
}

/**
 * Saves the current form values to chrome.storage.
 */
function saveSettings() {
    console.log("Saving settings...");
    showStatus("Saving...", "info", false); // Show saving indicator

    const apiKey = apiKeyInput.value.trim();
    const theme = themeSelect.value;

    // --- Validate API Key (Basic Check) ---
    // Add more robust validation if needed (e.g., length, pattern)
    if (!apiKey) {
         // Optionally warn, but allow saving an empty key to clear it
         console.warn("API Key field is empty.");
         // showStatus("API Key is empty. Analysis features will be disabled.", "error");
         // return; // Uncomment to prevent saving empty key
    }

    // --- Save API Key to Local Storage ---
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error saving API Key:", chrome.runtime.lastError);
            showStatus(`Error saving API Key: ${chrome.runtime.lastError.message}`, "error");
        } else {
            console.log("API Key saved successfully.");
            // --- Save Theme to Sync Storage (Chained after API key save) ---
            chrome.storage.sync.set({ theme: theme }, () => {
                 if (chrome.runtime.lastError) {
                     console.error("Error saving theme:", chrome.runtime.lastError);
                     showStatus(`API Key saved, but error saving theme: ${chrome.runtime.lastError.message}`, "error");
                 } else {
                    console.log("Theme saved successfully.");
                    showStatus("Settings saved successfully!", "success");
                    applyTheme(theme); // Apply theme immediately to the options page
                 }
            });
        }
    });
}

/**
 * Applies the selected theme (light/dark) to the options page body by adding/removing a class.
 * @param {'light' | 'dark' | 'system'} theme - The theme setting to apply.
 */
function applyTheme(theme) {
    const body = document.body;
    // Determine if dark mode should be active
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDarkMode = theme === 'dark' || (theme === 'system' && prefersDark);

    if (useDarkMode) {
        body.classList.add('dark-mode');
        console.log("Applying dark mode to options page.");
    } else {
        body.classList.remove('dark-mode');
        console.log("Applying light mode to options page.");
    }
}


/**
 * Displays a status message to the user on the options page.
 * @param {string} message - The text message to display.
 * @param {'info' | 'success' | 'error'} type - The type of message (controls styling).
 * @param {boolean} [autoClear=true] - Whether the message should disappear automatically.
 */
function showStatus(message, type = "info", autoClear = true) {
    if (!statusMessageEl) return;

    statusMessageEl.textContent = message;
    statusMessageEl.className = `status ${type}`; // Reset classes and add type
    statusMessageEl.style.display = 'block'; // Make visible

    // Clear the message after a delay if autoClear is true
    if (autoClear) {
        setTimeout(() => {
             if (statusMessageEl.textContent === message) { // Avoid clearing newer messages
                 statusMessageEl.style.display = 'none';
                 statusMessageEl.textContent = '';
                 statusMessageEl.className = 'status'; // Reset class
             }
        }, 3500); // Clear after 3.5 seconds
    }
}