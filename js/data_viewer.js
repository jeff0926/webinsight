// js/data_viewer.js
// This script provides the logic for the "Data Viewer" page of the WebInsight extension.
// Its primary purpose is to display raw data from the extension's IndexedDB database,
// allowing users or developers to inspect the stored content items, tags, and their relationships.
// It also includes functionality to export this data as JSON files.

// --- DOM References ---
/**
 * The HTML `<code>` element where the JSON representation of content items will be displayed.
 * @type {HTMLElement | null}
 */
const contentItemsCodeEl = document.getElementById('contentItemsJson');

/**
 * The HTML `<code>` element where the JSON representation of tags will be displayed.
 * @type {HTMLElement | null}
 */
const tagsCodeEl = document.getElementById('tagsJson');

/**
 * The HTML `<code>` element where the JSON representation of content-tag relationships (junction table) will be displayed.
 * @type {HTMLElement | null}
 */
const contentTagsCodeEl = document.getElementById('contentTagsJson');

/**
 * The button element used to refresh/reload all data displayed on the page.
 * @type {HTMLButtonElement | null}
 */
const refreshBtn = document.getElementById('refreshDataBtn');

/**
 * A NodeList of all buttons with the class 'exportBtn'. These buttons trigger JSON export
 * for their respective data sections.
 * @type {NodeListOf<HTMLButtonElement>}
 */
const exportBtns = document.querySelectorAll('.exportBtn');

// --- Functions ---

/**
 * Fetches and displays data for all relevant IndexedDB stores.
 * It sets a "Loading..." message in each display area and then calls
 * `fetchStoreData` for each store type (content items, tags, content-tag links).
 */
function loadAllData() {
    console.log("WebInsight Data Viewer: Loading all data...");
    // Set loading states for each data display area.
    if (contentItemsCodeEl) contentItemsCodeEl.textContent = 'Loading content items...';
    if (tagsCodeEl) tagsCodeEl.textContent = 'Loading tags...';
    if (contentTagsCodeEl) contentTagsCodeEl.textContent = 'Loading content-tag links...';

    // Fetch data for each store by sending messages to the background script.
    // Message types correspond to those handled by the background script for data retrieval.
    fetchStoreData('GET_ALL_SAVED_CONTENT', contentItemsCodeEl);
    fetchStoreData('GET_ALL_TAGS', tagsCodeEl);
    fetchStoreData('GET_ALL_CONTENT_TAGS', contentTagsCodeEl);
}

/**
 * Helper function to fetch data for a specific IndexedDB store (via a message to the background script)
 * and display it as a formatted JSON string in the specified target HTML element.
 *
 * @param {string} messageType - The message type to send to the background script
 *                               (e.g., 'GET_ALL_SAVED_CONTENT'). This determines which data is fetched.
 * @param {HTMLElement} targetElement - The HTML `<code>` element where the fetched data (as JSON)
 *                                      should be displayed.
 */
function fetchStoreData(messageType, targetElement) {
    if (!targetElement) {
        console.error(`WebInsight Data Viewer: Target element for ${messageType} is null.`);
        return;
    }

    chrome.runtime.sendMessage({ type: messageType }, (response) => {
        if (response && response.success && Array.isArray(response.payload)) {
            // Successfully fetched data. Format as an indented JSON string.
            const jsonData = JSON.stringify(response.payload, null, 2); // Indent with 2 spaces for readability.
            targetElement.textContent = jsonData;
            targetElement.style.color = ''; // Reset text color (in case it was red from a previous error).
        } else {
            // Handle errors or unsuccessful response.
            const errorMsg = response?.error || `Failed to load data for ${messageType}. Response was invalid.`;
            console.error(`WebInsight Data Viewer: Error fetching data for ${messageType}:`, errorMsg);
            targetElement.textContent = `Error: ${errorMsg}`;
            targetElement.style.color = 'red'; // Display error message in red.
        }
    });
}

/**
 * Creates a JSON file from the provided data object/array and triggers a browser download.
 *
 * @param {Array<object>|object} data - The data to be stringified and included in the JSON file.
 * @param {string} filename - The desired filename for the downloaded file (e.g., 'contentItems.json').
 */
function downloadJson(data, filename) {
    // Stringify the data with pretty printing (null, 2 for indentation).
    const jsonString = JSON.stringify(data, null, 2);
    // Create a Blob with the JSON string and set its MIME type.
    const blob = new Blob([jsonString], { type: 'application/json' });
    // Create an object URL for the Blob.
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element to trigger the download.
    const a = document.createElement('a');
    a.href = url;
    a.download = filename; // Set the download attribute to the desired filename.
    document.body.appendChild(a); // Append to body to make it clickable.
    a.click(); // Programmatically click the anchor to start the download.
    document.body.removeChild(a); // Clean up by removing the anchor.
    URL.revokeObjectURL(url); // Release the object URL to free up resources.
    console.log(`WebInsight Data Viewer: Data export triggered for download as ${filename}`);
}

/**
 * Handles click events on "Export JSON" buttons.
 * It reads `data-messagetype` and `data-filename` attributes from the clicked button
 * to determine which data to fetch (via background script) and what to name the downloaded file.
 *
 * @param {MouseEvent} event - The click event object from an export button.
 */
function handleExportClick(event) {
    const button = /** @type {HTMLButtonElement} */ (event.target);
    const messageType = button.dataset.messagetype; // Custom data attribute for message type.
    const filename = button.dataset.filename;       // Custom data attribute for filename.

    if (!messageType || !filename) {
        console.error("WebInsight Data Viewer: Export button is missing 'data-messagetype' or 'data-filename' attribute.");
        alert("Error: Export configuration missing on button.");
        return;
    }

    console.log(`WebInsight Data Viewer: Export requested for data type: ${messageType}`);
    button.textContent = 'Exporting...'; // Provide user feedback.
    button.disabled = true;             // Disable button during the process.

    // Send message to background script to fetch the specific data for export.
    chrome.runtime.sendMessage({ type: messageType }, (response) => {
        if (response && response.success && Array.isArray(response.payload)) {
            // On successful data retrieval, trigger the download.
            downloadJson(response.payload, filename);
        } else {
            // Handle errors during data fetching.
            const errorMsg = response?.error || `Failed to fetch data for export (${messageType}).`;
            console.error(`WebInsight Data Viewer: Export Error for ${messageType}:`, errorMsg);
            alert(`Error exporting data: ${errorMsg}`); // Notify user via alert.
        }
        // Re-enable the button and reset its text, regardless of success or failure.
        button.textContent = 'Export JSON';
        button.disabled = false;
    });
}

// --- Event Listeners ---
/**
 * Attaches an event listener to load all data when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', loadAllData);

/**
 * Attaches an event listener to the "Refresh Data" button, if it exists.
 */
if (refreshBtn) {
    refreshBtn.addEventListener('click', loadAllData);
} else {
    console.warn("WebInsight Data Viewer: Refresh Data button (refreshDataBtn) not found.");
}

/**
 * Attaches click event listeners to all "Export JSON" buttons found on the page.
 */
exportBtns.forEach(btn => {
    btn.addEventListener('click', handleExportClick);
});

// Log to confirm that the data viewer script has loaded.
console.log("WebInsight Data Viewer: Script loaded and event listeners attached.");