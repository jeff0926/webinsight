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

// AN-7: New DOM Reference for Navigation Stripping
const stripNavigationCheckbox = document.getElementById('stripNavigation');


// Storage Usage Elements
const storageUsageFill = document.getElementById('storageUsageFill');
const storageUsageLabel = document.getElementById('storageUsageLabel');
const storageUsageDetail = document.getElementById('storageUsageDetail');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    addEventListeners();
    loadStorageUsage();
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
    // AN-7: Added 'stripNavigation' to local storage retrieval
    chrome.storage.local.get(['geminiApiKey', 'aiMode', 'stripNavigation'], (localResult) => {
        if (localResult.geminiApiKey) {
            apiKeyInput.value = localResult.geminiApiKey;
        }
        // NEW: Load AI Mode (default to "ask" if nothing saved yet)
        if (aiModeSelect) {
            aiModeSelect.value = localResult.aiMode || 'ask';
        }
        // AN-7: Load new strip navigation preference (default is false)
        if (stripNavigationCheckbox) {
            stripNavigationCheckbox.checked = localResult.stripNavigation || false;
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
    const aiMode = aiModeSelect ? aiModeSelect.value : 'ask'; 
    // AN-7: Get the state of the new checkbox
    const stripNavigation = stripNavigationCheckbox ? stripNavigationCheckbox.checked : false;

    chrome.storage.local.set({ 
        geminiApiKey: apiKey, 
        aiMode,
        stripNavigation // AN-7: Save new setting
    }, () => {
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
    showStatus("Exporting data... This may take a moment for large databases.", "info", false);
    chrome.runtime.sendMessage({ type: "EXPORT_FULL_BACKUP_DOWNLOAD" }, (response) => {
        if (response && response.success) {
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

            // IMPORTANT: Use standard window.confirm here
            const confirmation = confirm(
                "IMPORTANT: Importing this backup will completely overwrite all current WebInsight data.\n\n" +
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

// --- Storage Usage ---

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function loadStorageUsage() {
    chrome.runtime.sendMessage({ type: "GET_STORAGE_ESTIMATE" }, (response) => {
        if (!storageUsageFill || !storageUsageLabel || !storageUsageDetail) return;

        if (response && response.success) {
            const { usage, quota } = response.payload;
            const pct = quota > 0 ? Math.min((usage / quota) * 100, 100) : 0;

            storageUsageFill.style.width = pct.toFixed(1) + '%';
            storageUsageLabel.textContent = `${formatBytes(usage)} / ${formatBytes(quota)} (${pct.toFixed(1)}%)`;
            storageUsageDetail.textContent = `Using ${formatBytes(usage)} of ${formatBytes(quota)} available storage.`;

            // Color the bar based on usage
            if (pct > 90) {
                storageUsageFill.style.background = '#e74c3c';
            } else if (pct > 70) {
                storageUsageFill.style.background = '#f39c12';
            } else {
                storageUsageFill.style.background = '#4a90d9';
            }
        } else {
            storageUsageLabel.textContent = 'Unable to estimate';
            storageUsageDetail.textContent = response?.error || 'Storage estimation not available.';
        }
    });
}