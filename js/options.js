// js/options.js - Logic for the settings page
import { clearAllData, bulkImportData } from './lib/db.js';

// --- DOM Element References ---
const apiKeyInput = document.getElementById('apiKey');
const themeSelect = document.getElementById('themeSelect');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const statusMessageEl = document.getElementById('statusMessage');

const exportBackupBtn = document.getElementById('exportBackupBtn');
const importBackupBtn = document.getElementById('importBackupBtn');
const importFileInput = document.getElementById('importFileInput');

const stripNavigationCheckbox = document.getElementById('stripNavigation');

const storageUsageFill = document.getElementById('storageUsageFill');
const storageUsageLabel = document.getElementById('storageUsageLabel');
const storageUsageDetail = document.getElementById('storageUsageDetail');

const aiProviderSelect = document.getElementById('aiProviderSelect');

const hyperspaceSection = document.getElementById('hyperspaceSection');
const hyperspaceTokenInput = document.getElementById('hyperspaceToken');
const hyperspaceBaseUrlInput = document.getElementById('hyperspaceBaseUrl');
const testHyperspaceBtn = document.getElementById('testHyperspaceBtn');
const hyperspaceTestStatus = document.getElementById('hyperspaceTestStatus');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    addEventListeners();
    loadStorageUsage();
});

// --- Event Listener Setup ---
function addEventListeners() {
    saveSettingsBtn.addEventListener('click', saveSettings);

    exportBackupBtn.addEventListener('click', handleExport);
    importBackupBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleImport);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (themeSelect.value === 'system') applyTheme('system');
    });

    if (aiProviderSelect) {
        aiProviderSelect.addEventListener('change', () => {
            toggleHyperspaceSection(aiProviderSelect.value === 'hyperspace');
        });
    }

    if (testHyperspaceBtn) {
        testHyperspaceBtn.addEventListener('click', handleTestHyperspaceConnection);
    }
}

function toggleHyperspaceSection(show) {
    if (hyperspaceSection) {
        hyperspaceSection.style.display = show ? '' : 'none';
    }
}

// --- Core Functions ---

function loadSettings() {
    chrome.storage.local.get([
        'geminiApiKey', 'stripNavigation',
        'aiProvider',
        'hyperspaceToken', 'hyperspaceBaseUrl',
    ], (localResult) => {
        if (localResult.geminiApiKey) {
            apiKeyInput.value = localResult.geminiApiKey;
        }
        if (stripNavigationCheckbox) {
            stripNavigationCheckbox.checked = localResult.stripNavigation || false;
        }

        const provider = localResult.aiProvider || 'gemini';
        if (aiProviderSelect) aiProviderSelect.value = provider;
        toggleHyperspaceSection(provider === 'hyperspace');

        if (hyperspaceTokenInput)   hyperspaceTokenInput.value   = localResult.hyperspaceToken   || '6cb1e31b-b128-4816-818d-e67db4fc5194';
        if (hyperspaceBaseUrlInput) hyperspaceBaseUrlInput.value = localResult.hyperspaceBaseUrl || 'http://localhost:6655/anthropic';
    });

    chrome.storage.sync.get(['theme'], (syncResult) => {
        const loadedTheme = syncResult.theme || 'system';
        themeSelect.value = loadedTheme;
        applyTheme(loadedTheme);
    });
}

function saveSettings() {
    showStatus("Saving...", "info", false);

    const apiKey = apiKeyInput.value.trim();
    const theme = themeSelect.value;
    const stripNavigation = stripNavigationCheckbox ? stripNavigationCheckbox.checked : false;
    const aiProvider = aiProviderSelect ? aiProviderSelect.value : 'gemini';

    chrome.storage.local.set({
        geminiApiKey: apiKey,
        stripNavigation,
        aiProvider,
        hyperspaceToken:   hyperspaceTokenInput?.value?.trim()   || '',
        hyperspaceBaseUrl: hyperspaceBaseUrlInput?.value?.trim() || 'http://localhost:6655/anthropic',
    }, () => {
        if (chrome.runtime.lastError) {
            showStatus(`Error saving settings: ${chrome.runtime.lastError.message}`, "error");
            return;
        }
        chrome.storage.sync.set({ theme }, () => {
            if (chrome.runtime.lastError) {
                showStatus(`Saved, but theme failed: ${chrome.runtime.lastError.message}`, "error");
                return;
            }
            showStatus("Settings saved successfully!", "success");
            applyTheme(theme);
        });
    });
}

function handleTestHyperspaceConnection() {
    if (!hyperspaceTestStatus) return;

    const tempData = {
        hyperspaceToken:   hyperspaceTokenInput?.value?.trim()   || '',
        hyperspaceBaseUrl: hyperspaceBaseUrlInput?.value?.trim() || 'http://localhost:6655/anthropic',
    };

    hyperspaceTestStatus.textContent = 'Testing…';
    hyperspaceTestStatus.className = 'btp-test-status testing';
    testHyperspaceBtn.disabled = true;

    chrome.storage.local.set(tempData, () => {
        chrome.runtime.sendMessage({ type: 'TEST_HYPERSPACE_CONNECTION' }, (response) => {
            testHyperspaceBtn.disabled = false;
            if (response && response.success) {
                hyperspaceTestStatus.textContent = '✓ ' + (response.message || 'Connection successful!');
                hyperspaceTestStatus.className = 'btp-test-status success';
            } else {
                hyperspaceTestStatus.textContent = '✗ ' + (response?.message || 'Connection failed. Is Hyperspace running?');
                hyperspaceTestStatus.className = 'btp-test-status error';
            }
        });
    });
}

// --- Backup and Restore ---

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

function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.contentItems || !data.tags || !data.contentTags) {
                throw new Error("Invalid backup file format.");
            }
            const confirmation = confirm(
                "IMPORTANT: Importing this backup will completely overwrite all current WebInsight data.\n\n" +
                `- ${data.contentItems.length} saved items\n` +
                `- ${data.tags.length} unique tags\n\n` +
                "Are you sure you want to proceed?"
            );
            if (!confirmation) {
                showStatus("Import cancelled.", "info");
                return;
            }
            showStatus("Importing data... Please wait.", "info", false);
            await clearAllData();
            await bulkImportData(data);
            // Notify background to refresh panel UI
            chrome.storage.local.set({ lastSaveTimestamp: Date.now() });
            showStatus("Import successful! Your data has been restored.", "success");
        } catch (error) {
            showStatus(`Error reading file: ${error.message}`, "error");
        } finally {
            importFileInput.value = "";
        }
    };
    reader.readAsText(file);
}

// --- UI Helpers ---

function applyTheme(theme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const useDarkMode = theme === 'dark' || (theme === 'system' && prefersDark);
    document.body.classList.toggle('dark-mode', useDarkMode);
}

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
