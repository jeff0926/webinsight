// js/data_viewer.js - Logic for the IndexedDB data viewer page

// --- DOM References ---
const contentItemsCodeEl = document.getElementById('contentItemsJson');
const tagsCodeEl = document.getElementById('tagsJson');
const contentTagsCodeEl = document.getElementById('contentTagsJson');
const refreshBtn = document.getElementById('refreshDataBtn');

// --- Functions ---

/** Fetches and displays data for all stores */
function loadAllData() {
    console.log("Loading all data for viewer...");
    // Set loading states
    if (contentItemsCodeEl) contentItemsCodeEl.textContent = 'Loading...';
    if (tagsCodeEl) tagsCodeEl.textContent = 'Loading...';
    if (contentTagsCodeEl) contentTagsCodeEl.textContent = 'Loading...';

    // Fetch data for each store via background script
    // ** CHANGE: Use GET_ALL_SAVED_CONTENT to match background handler **
    fetchStoreData('GET_ALL_SAVED_CONTENT', contentItemsCodeEl);
    fetchStoreData('GET_ALL_TAGS', tagsCodeEl);
    fetchStoreData('GET_ALL_CONTENT_TAGS', contentTagsCodeEl);
}

/**
 * Helper function to fetch data for a specific store and display it.
 * @param {string} messageType - The message type to send to the background script.
 * @param {HTMLElement} targetElement - The <code> element to display the JSON in.
 */
function fetchStoreData(messageType, targetElement) {
    if (!targetElement) return; // Exit if element doesn't exist

    chrome.runtime.sendMessage({ type: messageType }, (response) => {
        if (response && response.success && Array.isArray(response.payload)) {
            // Format data as indented JSON string
            const jsonData = JSON.stringify(response.payload, null, 2); // 2 spaces indentation
            targetElement.textContent = jsonData;
            targetElement.style.color = ''; // Reset color on success
        } else {
            // Handle errors
            const errorMsg = response?.error || `Failed to load data for ${messageType}.`;
            console.error(`Error fetching data for ${messageType}:`, errorMsg);
            targetElement.textContent = `Error: ${errorMsg}`;
            targetElement.style.color = 'red'; // Indicate error visually
        }
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', loadAllData); // Load data when page loads
if (refreshBtn) {
    refreshBtn.addEventListener('click', loadAllData); // Reload data on button click
}

console.log("Data viewer script loaded.");
