// js/data_viewer.js - Logic for the IndexedDB data viewer page

// --- DOM References ---
const contentItemsCodeEl = document.getElementById('contentItemsJson');
const tagsCodeEl = document.getElementById('tagsJson');
const contentTagsCodeEl = document.getElementById('contentTagsJson');
const refreshBtn = document.getElementById('refreshDataBtn');
// Get references to all export buttons
const exportBtns = document.querySelectorAll('.exportBtn'); // Get all export buttons

// --- Functions ---

/** Fetches and displays data for all stores */
function loadAllData() {
    console.log("Loading all data for viewer...");
    // Set loading states
    if (contentItemsCodeEl) contentItemsCodeEl.textContent = 'Loading...';
    if (tagsCodeEl) tagsCodeEl.textContent = 'Loading...';
    if (contentTagsCodeEl) contentTagsCodeEl.textContent = 'Loading...';

    // Fetch data for each store via background script
    // Using the correct message types based on previous context/assumptions
    fetchStoreData('GET_ALL_SAVED_CONTENT', contentItemsCodeEl); //
    fetchStoreData('GET_ALL_TAGS', tagsCodeEl); //
    fetchStoreData('GET_ALL_CONTENT_TAGS', contentTagsCodeEl); //
}

/**
 * Helper function to fetch data for a specific store and display it.
 * @param {string} messageType - The message type to send to the background script.
 * @param {HTMLElement} targetElement - The <code> element to display the JSON in.
 */
function fetchStoreData(messageType, targetElement) {
    if (!targetElement) return; // Exit if element doesn't exist

    chrome.runtime.sendMessage({ type: messageType }, (response) => { //
        if (response && response.success && Array.isArray(response.payload)) { //
            // Format data as indented JSON string
            const jsonData = JSON.stringify(response.payload, null, 2); // 2 spaces indentation
            targetElement.textContent = jsonData; //
            targetElement.style.color = ''; // Reset color on success
        } else {
            // Handle errors
            const errorMsg = response?.error || `Failed to load data for ${messageType}.`; //
            console.error(`Error fetching data for ${messageType}:`, errorMsg); //
            targetElement.textContent = `Error: ${errorMsg}`; //
            targetElement.style.color = 'red'; // Indicate error visually
        }
    });
}

/**
 * Creates a JSON file from data and triggers a download.
 * @param {Array|Object} data - The data to export.
 * @param {string} filename - The desired filename (e.g., 'data.json').
 */
function downloadJson(data, filename) {
    const jsonString = JSON.stringify(data, null, 2); // Pretty print JSON
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); // Append anchor to body
    a.click(); // Simulate click to trigger download
    document.body.removeChild(a); // Remove anchor from body
    URL.revokeObjectURL(url); // Free up memory
    console.log(`Data export triggered for download as ${filename}`);
}

/**
 * Fetches data for the specified store and triggers a download.
 * @param {Event} event - The click event object.
 */
function handleExportClick(event) {
    const button = event.target;
    const messageType = button.dataset.messagetype; // Get from data attribute
    const filename = button.dataset.filename;    // Get from data attribute

    if (!messageType || !filename) {
        console.error("Export button is missing data-messagetype or data-filename attribute.");
        return;
    }

    console.log(`Export requested for ${messageType}...`);
    button.textContent = 'Exporting...'; // Provide feedback
    button.disabled = true; // Disable button during export

    // Fetch the data specifically for export
    chrome.runtime.sendMessage({ type: messageType }, (response) => {
        if (response && response.success && Array.isArray(response.payload)) {
            // On success, trigger the download
            downloadJson(response.payload, filename);
        } else {
            // Handle errors
            const errorMsg = response?.error || `Failed to fetch data for export (${messageType}).`;
            console.error(`Export Error for ${messageType}:`, errorMsg);
            alert(`Error exporting data: ${errorMsg}`); // Notify user
        }
        // Re-enable button and reset text regardless of success/failure
        button.textContent = 'Export JSON';
        button.disabled = false;
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', loadAllData); // Load data when page loads
if (refreshBtn) {
    refreshBtn.addEventListener('click', loadAllData); // Reload data on button click
}

// Attach listeners to all export buttons
exportBtns.forEach(btn => {
    btn.addEventListener('click', handleExportClick);
});

console.log("Data viewer script loaded."); //