// js/options.js - Logic for the settings page with backup functionality

// --- DOM Element References ---
const apiKeyInput = document.getElementById('apiKey');
const themeSelect = document.getElementById('themeSelect');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const statusMessageEl = document.getElementById('statusMessage');

// New Backup/Restore Elements
const exportBackupBtn = document.getElementById('exportBackupBtn');
const importBackupBtn = document.getElementById('importBackupBtn');
const importFileInput = document.getElementById('importFileInput');

const aiModeSelect = document.getElementById('aiModeSelect');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    addEventListeners();
});

// --- Event Listener Setup ---
function addEventListeners() {
    // Save settings
    saveSettingsBtn.addEventListener('click', saveSettings);

    // Backup and Restore
    exportBackupBtn.addEventListener('click', handleExport);
    importBackupBtn.addEventListener('click', () => importFileInput.click()); // Open file picker
    importFileInput.addEventListener('change', handleImport);

    // Theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (themeSelect.value === 'system') {
            applyTheme('system');
        }
    });
}

// --- Core Functions ---

/**
 * Loads settings from chrome.storage and populates the form fields.
 */
function loadSettings() {
    chrome.storage.local.get(['geminiApiKey', 'aiMode'], (localResult) => {
        if (localResult.geminiApiKey) {
            apiKeyInput.value = localResult.geminiApiKey;
        }
        // NEW: Load AI Mode (default to "ask" if nothing saved yet)
        if (aiModeSelect) {
            aiModeSelect.value = localResult.aiMode || 'ask';
        }
    });


    chrome.storage.sync.get(['theme'], (syncResult) => {
        const loadedTheme = syncResult.theme || 'system';
        themeSelect.value = loadedTheme;
        applyTheme(loadedTheme);
    });
}

/**
 * Saves the current form values to chrome.storage.
 */
function saveSettings() {
    showStatus("Saving...", "info", false);

    const apiKey = apiKeyInput.value.trim();
    const theme = themeSelect.value;
    const aiMode = aiModeSelect ? aiModeSelect.value : 'ask'; // NEW

    chrome.storage.local.set({ geminiApiKey: apiKey, aiMode }, () => {
        if (chrome.runtime.lastError) {
            showStatus(`Error saving settings: ${chrome.runtime.lastError.message}`, "error");
            return;
        }
        chrome.storage.sync.set({ theme: theme }, () => {
            if (chrome.runtime.lastError) {
                showStatus(`Saved, but theme failed: ${chrome.runtime.lastError.message}`, "error");
                return;
            }
            showStatus("Settings saved successfully!", "success");
            applyTheme(theme);
        });
    });
}


// --- Backup and Restore Functions ---

/**
 * Handles the export process.
 */
function handleExport() {
    showStatus("Exporting data...", "info", false);
    chrome.runtime.sendMessage({ type: "EXPORT_FULL_BACKUP" }, (response) => {
        if (response && response.success) {
            const data = response.payload;
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
            a.download = `webinsight-backup-${timestamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showStatus("Export successful! Check your Downloads folder.", "success");
        } else {
            showStatus(`Export failed: ${response?.error || 'Unknown error'}`, "error");
        }
    });
}

/**
 * Handles the import process once a file is selected.
 */
function handleImport(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // Basic validation
            if (!data.contentItems || !data.tags || !data.contentTags) {
                throw new Error("Invalid backup file format.");
            }

            const confirmation = confirm(
                "IMPORTANT: Importing this backup will completely overwrite all current WebInsight data.\n\n" +
                `This file contains:\n` +
                `- ${data.contentItems.length} saved items\n` +
                `- ${data.tags.length} unique tags\n\n` +
                "Are you sure you want to proceed?"
            );

            if (confirmation) {
                showStatus("Importing data... Please wait.", "info", false);
                chrome.runtime.sendMessage({ type: "IMPORT_FULL_BACKUP", payload: data }, (response) => {
                    if (response && response.success) {
                        showStatus("Import successful! Your data has been restored.", "success");
                    } else {
                        showStatus(`Import failed: ${response?.error || 'Unknown error'}`, "error");
                    }
                });
            } else {
                showStatus("Import cancelled.", "info");
            }

        } catch (error) {
            showStatus(`Error reading file: ${error.message}`, "error");
        } finally {
            // Reset file input to allow re-selection of the same file
            importFileInput.value = "";
        }
    };
    reader.readAsText(file);
}

// --- UI Helper Functions ---

/**
 * Applies the selected theme to the options page.
 */
function applyTheme(theme) {
    const body = document.body;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDarkMode = theme === 'dark' || (theme === 'system' && prefersDark);
    body.classList.toggle('dark-mode', useDarkMode);
}

/**
 * Displays a status message to the user.
 */
function showStatus(message, type = "info", autoClear = true) {
    statusMessageEl.textContent = message;
    statusMessageEl.className = `status ${type}`;
    statusMessageEl.style.display = 'block';

    if (autoClear) {
        setTimeout(() => {
            if (statusMessageEl.textContent === message) {
                statusMessageEl.style.display = 'none';
            }
        }, 4000);
    }
}
