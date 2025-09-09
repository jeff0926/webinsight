// js/popup.js - Logic for the extension's popup window

// --- DOM Element References ---
const savePageBtn = document.getElementById('savePageBtn');
const savePageAsPDFBtn = document.getElementById('savePageAsPDFBtn');
const saveSelectionBtn = document.getElementById('saveSelectionBtn');
const captureVisibleBtn = document.getElementById('captureVisibleBtn');
const captureAreaBtn = document.getElementById('captureAreaBtn');
// const viewSavedBtn = document.getElementById('viewSavedBtn'); // Removed as list is inline
const optionsBtn = document.getElementById('optionsBtn');
const statusMessageEl = document.getElementById('statusMessage');
const contentListEl = document.getElementById('contentList');

// --- Event Listeners for Buttons ---

// Save Full Page Content
savePageBtn.addEventListener('click', () => {
    showStatus("Saving page content...", "info", false); // Show persistent loading message
    // Send message to background script to handle saving
    chrome.runtime.sendMessage({ type: "SAVE_PAGE_CONTENT" }, handleResponse);
});

// Save Full Page as PDF
savePageAsPDFBtn.addEventListener('click', () => {
    showStatus("Generating PDF... This may take a moment.", "info", false);
    // Send message to background script to handle PDF generation
    chrome.runtime.sendMessage({ 
        type: "SAVE_PAGE_AS_PDF", 
        payload: { preset: 'standard' } // Use standard preset by default
    }, handleResponse);
});

// Save Selected Text
saveSelectionBtn.addEventListener('click', () => {
    showStatus("Saving selection...", "info", false);
    chrome.runtime.sendMessage({ type: "SAVE_SELECTION" }, handleResponse);
});

// Capture Visible Area Screenshot
captureVisibleBtn.addEventListener('click', () => {
    showStatus("Capturing visible area...", "info", false);
    chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }, handleResponse);
});

// Initiate Custom Area Screenshot
captureAreaBtn.addEventListener('click', () => {
    showStatus("Initiating area capture... Draw on page.", "info", false);
    // Send message to background which forwards to content script
    chrome.runtime.sendMessage({ type: "INITIATE_AREA_CAPTURE" }, (response) => {
        // Handle immediate response from background/content script initiation
        if (response && response.success) {
            // Message already shown, maybe close popup?
            // window.close(); // Close popup to allow drawing
        } else {
            // Show error if initiation failed
            handleResponse(response);
        }
    });
});

// Open Settings Page
optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// --- Response Handling ---

/**
 * Generic handler for responses received from the background script.
 * Updates the status message and potentially refreshes the content list.
 * @param {object} response - The response object from the background script.
 * Expected structure: { success: boolean, id?: number, error?: string }
 */
function handleResponse(response) {
    if (!response) {
         showStatus("Error: No response received from background.", "error");
         console.error("Popup: No response received.");
         return;
    }

    if (response.success) {
        // Show success message, include ID if available
        const message = response.id
            ? `Success! Item saved (ID: ${response.id}).`
            : "Operation successful.";
        showStatus(message, "success");
        // Refresh the list of saved items to show the new one
        loadSavedContent();
    } else {
        // Show error message from the response
        const errorMsg = response.error || "An unknown error occurred.";
        showStatus(`Error: ${errorMsg}`, "error");
        console.error("Popup: Operation failed:", errorMsg);
    }
}

// --- Status Message Management ---

/**
 * Displays a status message to the user in the popup.
 * @param {string} message - The text message to display.
 * @param {'info' | 'success' | 'error'} type - The type of message (controls styling).
 * @param {boolean} [autoClear=true] - Whether the message should disappear automatically.
 */
function showStatus(message, type = "info", autoClear = true) {
    if (!statusMessageEl) return; // Guard against element not found

    statusMessageEl.textContent = message;
    // Reset classes and add the specific type class
    statusMessageEl.className = `status ${type}`;
    statusMessageEl.style.display = 'block'; // Make it visible

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

// --- Content List Management ---

/**
 * Fetches saved content items from the background script and displays them in the list.
 */
function loadSavedContent() {
    if (!contentListEl) return;

    // Show loading indicator
    contentListEl.innerHTML = '<div class="content-item"><i>Loading items...</i></div>';

    // Request data from the background script
    chrome.runtime.sendMessage({ type: "GET_ALL_SAVED_CONTENT" }, (response) => {
        // Clear loading indicator immediately upon response
        contentListEl.innerHTML = '';

        if (response && response.success && Array.isArray(response.payload)) {
            const items = response.payload;
            if (items.length === 0) {
                contentListEl.innerHTML = '<div class="content-item"><i>No items saved yet.</i></div>';
            } else {
                // Sort items by creation date, newest first
                const sortedItems = items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                // Render each item
                sortedItems.forEach(item => {
                    contentListEl.appendChild(createContentItemElement(item));
                });
            }
            // Clear any persistent loading status message
             if (statusMessageEl.classList.contains('info') && statusMessageEl.textContent.includes('Loading')) {
                 statusMessageEl.style.display = 'none';
                 statusMessageEl.className = 'status';
             }
        } else {
            // Handle error fetching items
            const errorMsg = response?.error || "Failed to load items.";
            console.error("Popup: Failed to load content:", errorMsg);
            contentListEl.innerHTML = `<div class="content-item error"><i>Error loading items: ${errorMsg}</i></div>`;
             // Optionally show error in status bar as well
             // showStatus(`Error loading items: ${errorMsg}`, "error", false);
        }
    });
}

/**
 * Creates an HTML element representing a single saved content item.
 * @param {object} item - The content item data from IndexedDB.
 * @returns {HTMLElement} The created div element for the item.
 */
function createContentItemElement(item) {
    const div = document.createElement('div');
    div.className = 'content-item';
    div.dataset.itemId = item.id; // Store ID for potential actions

    let contentPreview = '';
    let analysisStatus = '';

    // --- Generate Preview based on Item Type ---
    switch (item.type) {
        case 'page':
        case 'selection':
            // Show first 100 characters of text content
            contentPreview = (item.content || '').substring(0, 100) + ((item.content || '').length > 100 ? '...' : '');
            break;
        case 'screenshot':
            // Show a small thumbnail preview
            contentPreview = `<img src="${item.content}" alt="Screenshot thumbnail"> Screenshot captured`;
            // Determine analysis status based on flags in the item
            if (item.analysisCompleted === true && item.analysisFailed === false) {
                analysisStatus = ' <span class="analysis-status success">(Analyzed)</span>';
            } else if (item.analysisFailed === true) {
                analysisStatus = ' <span class="analysis-status error">(Analysis Failed)</span>';
            } else if (item.analysis !== undefined) {
                // If analysis object exists but not completed/failed, assume pending
                analysisStatus = ' <span class="analysis-status pending">(Analyzing...)</span>';
            } else {
                 // Analysis not started or field doesn't exist
                 analysisStatus = ' <span class="analysis-status pending">(Analysis Pending)</span>';
            }
            break;
        case 'pdf':
            // Show file size and PDF icon
            const fileSizeKB = item.fileSize ? Math.round(item.fileSize / 1024) : 'Unknown';
            contentPreview = `📄 PDF Document (${fileSizeKB}KB)`;
            break;
        default:
            contentPreview = 'Unknown item type';
    }

    // --- Construct Inner HTML ---
    div.innerHTML = `
        <strong>${item.title || `Item ${item.id}`} (${item.type})${analysisStatus}</strong>
        <p class="preview">${contentPreview || '<i>No preview available</i>'}</p>
        <span class="timestamp">${new Date(item.createdAt).toLocaleString()}</span>
        <button class="delete-btn" title="Delete Item">&times;</button> `;

    // --- Add Event Listeners for the Item ---

    // Click listener for viewing details (currently logs to console)
    div.addEventListener('click', (e) => {
        // Prevent triggering view when clicking the delete button
        if (e.target.classList.contains('delete-btn')) {
            return;
        }
        // For POC, just log the full item details
        console.log("View item details:", item);
        // Potential future action: Open options page to a specific view, or show details in popup
        // chrome.runtime.openOptionsPage();
        showStatus(`Details for item ${item.id} logged to console.`, 'info');
    });

    // Click listener for the delete button
    const deleteButton = div.querySelector('.delete-btn');
    if (deleteButton) {
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent the parent div's click listener
            deleteItem(item.id, item.title); // Pass ID and title for confirmation
        });
    }

    return div;
}

/**
 * Sends a message to the background script to delete an item.
 * @param {number} id - The ID of the item to delete.
 * @param {string} title - The title of the item (used in confirmation).
 */
function deleteItem(id, title = '') {
    // Confirm deletion with the user
    const confirmMessage = `Are you sure you want to delete "${title || `Item ${id}`}"?`;
    if (!confirm(confirmMessage)) {
        return; // User cancelled
    }

    showStatus(`Deleting item ${id}...`, "info", false);
    // Send delete request to background
    chrome.runtime.sendMessage({ type: "DELETE_ITEM", payload: { id: id } }, (response) => {
        if (response && response.success) {
            showStatus(`Item ${id} deleted.`, "success");
            loadSavedContent(); // Refresh the list immediately
        } else {
            handleResponse(response); // Use generic handler for error display
        }
    });
}


// --- Theme Management ---

/**
 * Applies the theme (light/dark) to the popup body based on stored settings.
 */
function applyPopupTheme() {
    chrome.storage.sync.get(['theme'], (syncResult) => {
        const theme = syncResult.theme || 'system'; // Default to system preference

        // Check system preference if theme is 'system'
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (theme === 'dark' || (theme === 'system' && prefersDark)) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        console.log(`Popup theme applied: ${theme === 'system' ? (prefersDark ? 'dark (system)' : 'light (system)') : theme}`);
    });
}

// --- Initialization and Listeners ---

// Run initial setup when the popup DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    applyPopupTheme(); // Set theme first
    loadSavedContent(); // Then load content
});

// Listen for changes in synced storage (e.g., theme changed in options page)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.theme) {
        console.log("Theme changed in storage, applying to popup...");
        applyPopupTheme();
    }
    // Could also listen for changes in 'local' if needed (e.g., API key status)
});

// Listen for changes in the OS-level color scheme preference
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
    console.log("System color scheme changed, re-applying theme...");
    applyPopupTheme(); // Re-apply theme to potentially update if 'system' is selected
});