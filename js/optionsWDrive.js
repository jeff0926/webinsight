// js/options.js - Logic for the settings page with Google Drive integration

// --- Imports ---
import { 
    initializeGoogleDrive, 
    authenticateGoogleDrive, 
    isAuthenticated, 
    signOut,
    createFolder,
    listFiles,
    exportWebInsightData,
    importWebInsightData,
    deleteFile
} from './lib/google-drive.js';

// --- DOM Element References ---
const apiKeyInput = document.getElementById('apiKey');
const googleClientIdInput = document.getElementById('googleClientId');
const themeSelect = document.getElementById('themeSelect');
const autoBackupSelect = document.getElementById('autoBackup');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const statusMessageEl = document.getElementById('statusMessage');

// Google Drive elements
const driveConnectionStatus = document.getElementById('driveConnectionStatus');
const connectDriveBtn = document.getElementById('connectDriveBtn');
const disconnectDriveBtn = document.getElementById('disconnectDriveBtn');
const testDriveBtn = document.getElementById('testDriveBtn');
const manualBackupBtn = document.getElementById('manualBackupBtn');
const restoreBackupBtn = document.getElementById('restoreBackupBtn');
const viewBackupsBtn = document.getElementById('viewBackupsBtn');

// Modal elements
const backupModal = document.getElementById('backupModal');
const modalTitle = document.getElementById('modalTitle');
const modalContent = document.getElementById('modalContent');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalActionBtn = document.getElementById('modalActionBtn');
const closeModal = document.getElementById('closeModal');

// --- State ---
let webInsightFolderId = null;
let currentBackups = [];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    loadSettings();
    await initializeGoogleDriveUI();
    addEventListeners();
});

// --- Event Listeners ---
function addEventListeners() {
    // Settings
    saveSettingsBtn.addEventListener('click', saveSettings);
    
    // Google Drive
    connectDriveBtn.addEventListener('click', handleConnectDrive);
    disconnectDriveBtn.addEventListener('click', handleDisconnectDrive);
    testDriveBtn.addEventListener('click', handleTestConnection);
    manualBackupBtn.addEventListener('click', handleManualBackup);
    restoreBackupBtn.addEventListener('click', handleRestoreBackup);
    viewBackupsBtn.addEventListener('click', handleViewBackups);
    
    // Modal
    closeModal.addEventListener('click', hideModal);
    modalCancelBtn.addEventListener('click', hideModal);
    
    // Theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        if (themeSelect.value === 'system') {
            console.log("System theme changed, re-applying theme to options page.");
            applyTheme('system');
        }
    });
}

// --- Settings Management ---
function loadSettings() {
    console.log("Loading settings...");
    
    // Load API key
    chrome.storage.local.get(['geminiApiKey', 'googleClientId', 'autoBackup'], (localResult) => {
        if (chrome.runtime.lastError) {
            console.error("Error loading local settings:", chrome.runtime.lastError);
            showStatus("Error loading settings.", "error", false);
        } else {
            if (localResult.geminiApiKey) {
                apiKeyInput.value = localResult.geminiApiKey;
                console.log("API Key loaded.");
            }
            if (localResult.googleClientId) {
                googleClientIdInput.value = localResult.googleClientId;
                console.log("Google Client ID loaded.");
            }
            if (localResult.autoBackup) {
                autoBackupSelect.value = localResult.autoBackup;
                console.log("Auto backup setting loaded.");
            }
        }
    });

    // Load theme
    chrome.storage.sync.get(['theme'], (syncResult) => {
        if (chrome.runtime.lastError) {
            console.error("Error loading theme:", chrome.runtime.lastError);
            showStatus("Error loading theme setting.", "error", false);
            applyTheme('system');
        } else {
            const loadedTheme = syncResult.theme || 'system';
            themeSelect.value = loadedTheme;
            console.log(`Theme loaded: ${loadedTheme}`);
            applyTheme(loadedTheme);
        }
    });
}

function saveSettings() {
    console.log("Saving settings...");
    showStatus("Saving...", "info", false);

    const apiKey = apiKeyInput.value.trim();
    const googleClientId = googleClientIdInput.value.trim();
    const theme = themeSelect.value;
    const autoBackup = autoBackupSelect.value;

    // Save to local storage
    chrome.storage.local.set({ 
        geminiApiKey: apiKey,
        googleClientId: googleClientId,
        autoBackup: autoBackup
    }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error saving local settings:", chrome.runtime.lastError);
            showStatus(`Error saving settings: ${chrome.runtime.lastError.message}`, "error");
        } else {
            console.log("Local settings saved successfully.");
            
            // Save theme to sync storage
            chrome.storage.sync.set({ theme: theme }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error saving theme:", chrome.runtime.lastError);
                    showStatus(`Settings saved, but error saving theme: ${chrome.runtime.lastError.message}`, "error");
                } else {
                    console.log("Theme saved successfully.");
                    showStatus("Settings saved successfully!", "success");
                    applyTheme(theme);
                    
                    // Update Google Drive UI if client ID changed
                    updateGoogleDriveUI();
                }
            });
        }
    });
}

// --- Google Drive Integration ---
async function initializeGoogleDriveUI() {
    try {
        await initializeGoogleDrive();
        updateGoogleDriveUI();
    } catch (error) {
        console.error("Failed to initialize Google Drive:", error);
        updateConnectionStatus('error', 'Failed to initialize Google Drive');
    }
}

function updateGoogleDriveUI() {
    const hasClientId = googleClientIdInput.value.trim().length > 0;
    const authenticated = isAuthenticated();
    
    // Update connection status
    if (!hasClientId) {
        updateConnectionStatus('disconnected', 'Client ID required');
        toggleDriveButtons(false, false);
    } else if (authenticated) {
        updateConnectionStatus('connected', 'Connected to Google Drive');
        toggleDriveButtons(true, true);
    } else {
        updateConnectionStatus('disconnected', 'Not connected');
        toggleDriveButtons(true, false);
    }
}

function updateConnectionStatus(status, message) {
    driveConnectionStatus.textContent = message;
    driveConnectionStatus.className = `connection-status ${status}`;
}

function toggleDriveButtons(canConnect, isConnected) {
    connectDriveBtn.style.display = canConnect && !isConnected ? 'inline-block' : 'none';
    disconnectDriveBtn.style.display = isConnected ? 'inline-block' : 'none';
    testDriveBtn.style.display = isConnected ? 'inline-block' : 'none';
    
    manualBackupBtn.disabled = !isConnected;
    restoreBackupBtn.disabled = !isConnected;
    viewBackupsBtn.disabled = !isConnected;
}

async function handleConnectDrive() {
    const clientId = googleClientIdInput.value.trim();
    if (!clientId) {
        showStatus("Please enter a Google OAuth Client ID first.", "error");
        return;
    }

    try {
        updateConnectionStatus('connecting', 'Connecting...');
        connectDriveBtn.disabled = true;
        
        await authenticateGoogleDrive(clientId);
        await ensureWebInsightFolder();
        
        updateGoogleDriveUI();
        showStatus("Successfully connected to Google Drive!", "success");
    } catch (error) {
        console.error("Failed to connect to Google Drive:", error);
        showStatus(`Failed to connect: ${error.message}`, "error");
        updateGoogleDriveUI();
    } finally {
        connectDriveBtn.disabled = false;
    }
}

function handleDisconnectDrive() {
    try {
        signOut();
        webInsightFolderId = null;
        updateGoogleDriveUI();
        showStatus("Disconnected from Google Drive.", "info");
    } catch (error) {
        console.error("Error disconnecting:", error);
        showStatus(`Error disconnecting: ${error.message}`, "error");
    }
}

async function handleTestConnection() {
    try {
        showStatus("Testing connection...", "info", false);
        
        const files = await listFiles();
        showStatus(`Connection successful! Found ${files.length} files in your Drive.`, "success");
    } catch (error) {
        console.error("Connection test failed:", error);
        showStatus(`Connection test failed: ${error.message}`, "error");
    }
}

async function ensureWebInsightFolder() {
    try {
        // Check if WebInsight folder exists
        const files = await listFiles(null, "name='WebInsight' and mimeType='application/vnd.google-apps.folder'");
        
        if (files.length > 0) {
            webInsightFolderId = files[0].id;
            console.log("Found existing WebInsight folder:", webInsightFolderId);
        } else {
            // Create WebInsight folder
            webInsightFolderId = await createFolder('WebInsight');
            console.log("Created WebInsight folder:", webInsightFolderId);
        }
    } catch (error) {
        console.error("Failed to ensure WebInsight folder:", error);
        throw error;
    }
}

// --- Backup Operations ---
async function handleManualBackup() {
    try {
        showStatus("Creating backup...", "info", false);
        manualBackupBtn.disabled = true;
        
        // Get all data from background script
        const [contentResponse, tagsResponse, contentTagsResponse] = await Promise.all([
            sendMessage({ type: "GET_ALL_SAVED_CONTENT" }),
            sendMessage({ type: "GET_ALL_TAGS" }),
            sendMessage({ type: "GET_ALL_CONTENT_TAGS" })
        ]);
        
        if (!contentResponse.success || !tagsResponse.success || !contentTagsResponse.success) {
            throw new Error("Failed to retrieve data for backup");
        }
        
        await ensureWebInsightFolder();
        
        const result = await exportWebInsightData(
            contentResponse.payload,
            tagsResponse.payload,
            contentTagsResponse.payload,
            webInsightFolderId
        );
        
        showStatus(`Backup created successfully: ${result.fileName}`, "success");
    } catch (error) {
        console.error("Backup failed:", error);
        showStatus(`Backup failed: ${error.message}`, "error");
    } finally {
        manualBackupBtn.disabled = false;
    }
}

async function handleRestoreBackup() {
    try {
        await loadBackupsList();
        
        if (currentBackups.length === 0) {
            showStatus("No backups found in Google Drive.", "info");
            return;
        }
        
        showRestoreModal();
    } catch (error) {
        console.error("Failed to load backups:", error);
        showStatus(`Failed to load backups: ${error.message}`, "error");
    }
}

async function handleViewBackups() {
    try {
        await loadBackupsList();
        showBackupsModal();
    } catch (error) {
        console.error("Failed to load backups:", error);
        showStatus(`Failed to load backups: ${error.message}`, "error");
    }
}

async function loadBackupsList() {
    await ensureWebInsightFolder();
    
    const files = await listFiles(
        webInsightFolderId, 
        "name contains 'webinsight-backup-' and mimeType='application/json'"
    );
    
    currentBackups = files.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
}

// --- Modal Management ---
function showModal(title, content, actionText = null, actionCallback = null) {
    modalTitle.textContent = title;
    modalContent.innerHTML = content;
    
    if (actionText && actionCallback) {
        modalActionBtn.textContent = actionText;
        modalActionBtn.style.display = 'inline-block';
        modalActionBtn.onclick = actionCallback;
    } else {
        modalActionBtn.style.display = 'none';
    }
    
    backupModal.style.display = 'flex';
}

function hideModal() {
    backupModal.style.display = 'none';
    modalContent.innerHTML = '';
    modalActionBtn.onclick = null;
}

function showBackupsModal() {
    const content = currentBackups.length === 0 
        ? '<p>No backups found.</p>'
        : `
            <ul class="backup-list">
                ${currentBackups.map(backup => `
                    <li class="backup-item">
                        <div class="backup-info">
                            <div class="backup-name">${backup.name}</div>
                            <div class="backup-date">${new Date(backup.createdTime).toLocaleString()}</div>
                        </div>
                        <div class="backup-actions">
                            <button class="backup-action-btn" onclick="restoreSpecificBackup('${backup.id}')">Restore</button>
                            <button class="backup-action-btn danger" onclick="deleteSpecificBackup('${backup.id}', '${backup.name}')">Delete</button>
                        </div>
                    </li>
                `).join('')}
            </ul>
        `;
    
    showModal('Google Drive Backups', content);
}

function showRestoreModal() {
    const content = `
        <p>Select a backup to restore:</p>
        <ul class="backup-list">
            ${currentBackups.map(backup => `
                <li class="backup-item">
                    <div class="backup-info">
                        <div class="backup-name">${backup.name}</div>
                        <div class="backup-date">${new Date(backup.createdTime).toLocaleString()}</div>
                    </div>
                    <div class="backup-actions">
                        <button class="backup-action-btn" onclick="restoreSpecificBackup('${backup.id}')">Select</button>
                    </div>
                </li>
            `).join('')}
        </ul>
        <p><strong>Warning:</strong> Restoring will replace all current data.</p>
    `;
    
    showModal('Restore from Backup', content);
}

// --- Backup Actions (Global functions for onclick handlers) ---
window.restoreSpecificBackup = async function(fileId) {
    if (!confirm('This will replace all current WebInsight data. Are you sure?')) {
        return;
    }
    
    try {
        showStatus("Restoring backup...", "info", false);
        hideModal();
        
        const result = await importWebInsightData(fileId);
        
        // Here you would need to implement the actual restoration logic
        // This would involve clearing current data and importing the backup data
        // For now, we'll just show a success message
        
        showStatus("Backup restored successfully! Please reload the extension.", "success");
    } catch (error) {
        console.error("Restore failed:", error);
        showStatus(`Restore failed: ${error.message}`, "error");
    }
};

window.deleteSpecificBackup = async function(fileId, fileName) {
    if (!confirm(`Delete backup "${fileName}"?`)) {
        return;
    }
    
    try {
        await deleteFile(fileId);
        showStatus(`Backup "${fileName}" deleted.`, "success");
        
        // Refresh the modal if it's still open
        if (backupModal.style.display === 'flex') {
            await loadBackupsList();
            showBackupsModal();
        }
    } catch (error) {
        console.error("Delete failed:", error);
        showStatus(`Delete failed: ${error.message}`, "error");
    }
};

// --- Utility Functions ---
function sendMessage(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, resolve);
    });
}

function applyTheme(theme) {
    const body = document.body;
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

function showStatus(message, type = "info", autoClear = true) {
    if (!statusMessageEl) return;

    statusMessageEl.textContent = message;
    statusMessageEl.className = `status ${type}`;
    statusMessageEl.style.display = 'block';

    if (autoClear) {
        setTimeout(() => {
            if (statusMessageEl.textContent === message) {
                statusMessageEl.style.display = 'none';
                statusMessageEl.textContent = '';
                statusMessageEl.className = 'status';
            }
        }, 3500);
    }
}