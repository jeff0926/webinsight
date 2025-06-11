// js/panel.js - Logic for the WebInsight Side Panel (Simple Key Points Display)

// --- Constants (Ensure this matches background.js) ---
const GENERATED_ITEM_TYPE = "generated_analysis";

// --- DOM Element References ---
// !! IMPORTANT !!: Ensure these IDs match your actual panel.html
const panelContentListEl = document.getElementById('panelContentList');
const panelStatusMessageEl = document.getElementById('panelStatusMessage');
const panelOptionsBtn = document.getElementById('panelOptionsBtn');
const panelSavePageBtn = document.getElementById('panelSavePageBtn');
const panelSavePageAsPDFBtn = document.getElementById('panelSavePageAsPDFBtn');
const panelSaveSelectionBtn = document.getElementById('panelSaveSelectionBtn');
const panelCaptureVisibleBtn = document.getElementById('panelCaptureVisibleBtn');
const panelCaptureAreaBtn = document.getElementById('panelCaptureAreaBtn');
// Filter Elements
const tagFilterListEl = document.getElementById('tagFilterList');
const clearTagFilterBtn = document.getElementById('clearTagFilterBtn');
const getKeyPointsBtn = document.getElementById('getKeyPointsBtn'); // Button for key points
// ** NEW: Key Points Result Display Area **
const keyPointsResultDisplayArea = document.getElementById('keyPointsResultDisplay');
const generateReportBtn = document.getElementById('generateReportBtn'); // Button for generate report

const aiStatusIndicator = document.getElementById('aiStatusIndicator');
const initializeAIBtn = document.getElementById('initializeAIBtn');
const generateEmbeddingsBtn = document.getElementById('generateEmbeddingsBtn');


// --- State ---
let currentFilterTagId = null; // Keep track of the active filter tag ID
let currentFilterTagName = null; // Keep track of the active filter tag name
let currentItemsCache = []; // Cache the full list of items
let aiInitialized = false;
let aiLoading = false;


// Make it globally accessible for debugging
window.currentItemsCache = currentItemsCache;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Panel DOM loaded.");
    applyPanelTheme();
    loadFilterTags(); // Load available tags for filtering
    loadSavedContent(); // Load all content initially
    addEventListeners();
    // Check AI status on load
    checkAIStatus();
});

// --- Event Listener Setup ---
/** Adds event listeners to all static interactive elements in the panel. */
function addEventListeners() {
    // Settings Button
    if (panelOptionsBtn) panelOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    else console.warn("Panel Options button not found.");

    // Action Buttons (Using reverted logic)
    if (panelSavePageBtn) panelSavePageBtn.addEventListener('click', () => { showStatus("Saving page content...", "info", false); chrome.runtime.sendMessage({ type: "SAVE_PAGE_CONTENT" }, handleActionResponse); });
    else console.warn("Panel Save Page button not found.");
    
    // Generate Report Button
    if (generateReportBtn) generateReportBtn.addEventListener('click', handleGenerateReportClick);
    else console.warn("Generate Report button not found.");

    if (panelSavePageAsPDFBtn) panelSavePageAsPDFBtn.addEventListener('click', () => { 
        showStatus("Generating PDF... This may take a moment.", "info", false); 
        chrome.runtime.sendMessage({ 
            type: "SAVE_PAGE_AS_PDF", 
            payload: { preset: 'standard' } 
        }, handleActionResponse); 
    });
    else console.warn("Panel Save Page as PDF button not found.");
    
    if (panelSaveSelectionBtn) panelSaveSelectionBtn.addEventListener('click', () => { showStatus("Saving selection...", "info", false); chrome.runtime.sendMessage({ type: "SAVE_SELECTION" }, handleActionResponse); });
    else console.warn("Panel Save Selection button not found.");
    if (panelCaptureVisibleBtn) panelCaptureVisibleBtn.addEventListener('click', () => { showStatus("Capturing visible area...", "info", false); chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }, handleActionResponse); });
    else console.warn("Panel Capture Visible button not found.");
    if (panelCaptureAreaBtn) panelCaptureAreaBtn.addEventListener('click', () => { showStatus("Initiating area capture... Draw on page.", "info", false); chrome.runtime.sendMessage({ type: "INITIATE_AREA_CAPTURE" }, (response) => { if (response && response.success) showStatus("Draw selection area on the page.", "info", false); else handleActionResponse(response); }); });
    else console.warn("Panel Capture Area button not found.");

    // Clear Filter Button
    if (clearTagFilterBtn) clearTagFilterBtn.addEventListener('click', handleClearFilter);
    else console.warn("Clear Tag Filter button not found.");

    // Get Key Points Button
    if (getKeyPointsBtn) getKeyPointsBtn.addEventListener('click', handleGetKeyPointsClick); // Use updated handler
    else console.warn("Get Key Points button not found.");


    // Add to addEventListeners() function (around line 60)
    // AI Control Buttons
    if (initializeAIBtn) initializeAIBtn.addEventListener('click', handleInitializeAI);
    else console.warn("Initialize AI button not found.");
    if (generateEmbeddingsBtn) generateEmbeddingsBtn.addEventListener('click', handleGenerateEmbeddings);
    else console.warn("Generate Embeddings button not found.");

    // Listener for clicks within the item list (using event delegation)
    if (panelContentListEl) {
        console.log("DEBUG: Attaching click listener to panelContentListEl.");
        panelContentListEl.addEventListener('click', (event) => {
            console.log("DEBUG: Click detected on panelContentListEl.", event.target);

            const summaryElement = event.target.closest('.item-summary');
            const itemElement = event.target.closest('.content-item');
            
            if (!itemElement) {
                console.log("DEBUG: Click not on a .content-item, returning.");
                return;
            }
            const itemId = parseInt(itemElement.dataset.itemId, 10);
            console.log("DEBUG: Clicked item ID:", itemId);

            if (event.target.classList.contains('delete-btn')) {
                event.stopPropagation();
                console.log("DEBUG: Delete button clicked for item ID:", itemId);
                const itemTitle = itemElement.querySelector('.item-summary strong')?.textContent || `Item ${itemId}`;
                deleteItem(itemId, itemTitle);
                return;
            }

            // Check if the click is on the summary part and not inside already expanded details
            if (summaryElement && !event.target.closest('.item-details')) {
                console.log("DEBUG: Click is on summary element, attempting to toggle details.");
                const detailsDiv = itemElement.querySelector('.item-details');
                
                if (detailsDiv) {
                    console.log("DEBUG: Found .item-details div.");
                    const isVisible = detailsDiv.style.display === 'block';
                    console.log("DEBUG: Current visibility of detailsDiv:", isVisible ? "block" : "none");

                    // Collapse all other expanded items
                    document.querySelectorAll('.content-item .item-details').forEach(el => { 
                        if (el !== detailsDiv && el.style.display === 'block') { 
                            el.style.display = 'none'; 
                            el.innerHTML = ''; 
                            console.log("DEBUG: Collapsed another item's details.");
                        } 
                    });

                    if (isVisible) {
                        console.log("DEBUG: Details were visible, collapsing them.");
                        detailsDiv.style.display = 'none'; 
                        detailsDiv.innerHTML = ''; 
                    } else {
                        console.log("DEBUG: Details were hidden, attempting to expand.");
                        const itemData = currentItemsCache.find(i => i.id === itemId);
                        console.log("DEBUG: Found itemData in cache:", !!itemData, "Cache length:", currentItemsCache.length);

                        if (itemData) { 
                            displayItemDetails(itemData, detailsDiv); 
                            detailsDiv.style.display = 'block'; 
                            console.log("DEBUG: Item details displayed and set to 'block'.");
                        } else { 
                            console.error(`DEBUG ERROR: Item data for ID ${itemId} not found in currentItemsCache.`); 
                            detailsDiv.innerHTML = '<p class="error">Error loading details: Item data not found.</p>'; 
                            detailsDiv.style.display = 'block'; 
                        }
                    }
                } else {
                    console.warn("DEBUG WARNING: .item-details div not found inside .content-item for ID:", itemId);
                }
            } else {
                console.log("DEBUG: Click was not on a summary element or was inside .item-details, not toggling.");
            }
        });
    } else { 
        console.error("DEBUG ERROR: Panel content list element (ID: panelContentList) not found for event delegation. Item expansion will not work."); 
    }
}

// --- Storage & Theme Change Listeners ---
chrome.storage.onChanged.addListener((changes, namespace) => {
    console.log(`Storage changed in namespace: ${namespace}`, changes);
    if (namespace === 'sync' && changes.theme) { console.log("Theme changed, applying to panel..."); applyPanelTheme(); }
    if (namespace === 'local' && (changes.lastSaveTimestamp || changes.lastAnalysisTimestamp)) {
        console.log("Detected data change, reloading panel content and filters...");
        // ** Always reload list on data change now **
        loadFilterTags(); // Reload available tags
        loadSavedContent(currentFilterTagId); // Reload content
    }
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { console.log("System theme changed, re-applying theme..."); applyPanelTheme(); });


// --- Response Handling ---
/** Handles generic responses for actions like save, capture */
function handleActionResponse(response) {
    if (!response) { showStatus("Error: No response received.", "error"); console.error("Panel: No response."); return; }
    if (response.success) {
        const message = response.id ? `Success! Item saved (ID: ${response.id}).` : response.message || "Operation successful.";
        showStatus(message, "success");
        // Refresh is handled by storage listener
    } else {
        const errorMsg = response.error || "Unknown error.";
        showStatus(`Error: ${errorMsg}`, "error");
        console.error("Panel: Action failed:", errorMsg);
    }
}

// --- Content List Management ---

/**
 * Fetches and displays saved content items. Can be filtered by tagId.
 * @param {number | null} [filterTagId=null] - Optional ID of the tag to filter by. If null, fetches all items.
 */
function loadSavedContent(filterTagId = null) {
    console.log("🔍 loadSavedContent called with filterTagId:", filterTagId);
    
    currentFilterTagId = filterTagId;
    if (filterTagId === null) { currentFilterTagName = null; }

    if (!panelContentListEl) { 
        console.error("DEBUG ERROR: Panel content list element not found in loadSavedContent."); 
        return; 
    }
    
    panelContentListEl.innerHTML = '<p><i>Loading items...</i></p>';
    if (panelStatusMessageEl && panelStatusMessageEl.textContent.includes('Loading')) clearStatus();
    hideKeyPointsResultArea();

    const messageType = filterTagId !== null ? "GET_FILTERED_ITEMS_BY_TAG" : "GET_ALL_SAVED_CONTENT";
    const payload = filterTagId !== null ? { tagId: filterTagId } : {};

    console.log(`🔍 Sending message: ${messageType}`, payload);
    
    chrome.runtime.sendMessage({ type: messageType, payload: payload }, (response) => {
        console.log("🔍 Response received from background for loadSavedContent:", response);
        
        if (response && response.success && Array.isArray(response.payload)) {
            console.log("🔍 Setting cache with", response.payload.length, "items.");
            
            // Force assignment and make sure it sticks
            currentItemsCache = response.payload || [];
            window.currentItemsCache = currentItemsCache; // For external debugging
            
            console.log("🔍 currentItemsCache after assignment (internal):", currentItemsCache.length, "items.");
            console.log("🔍 window.currentItemsCache after assignment (global):", window.currentItemsCache?.length, "items.");
            
            displayContentItems(currentItemsCache);
        } else {
            console.log("🔍 Error or invalid response from background, clearing cache.");
            currentItemsCache = [];
            window.currentItemsCache = currentItemsCache;
            
            const errorMsg = response?.error || `Failed to load ${filterTagId !== null ? 'filtered ' : ''}items.`;
            console.error("Panel: Failed to load content:", errorMsg);
            panelContentListEl.innerHTML = `<p class="error"><i>Error loading items: ${errorMsg}</i></p>`;
            showStatus(`Error loading items: ${errorMsg}`, "error", false);
        }
        
        updateKeyPointsButtonVisibility();
    });
}
/**
 * Renders an array of content items into the list element.
 * @param {Array<object>} items - Array of content item objects.
 */
function displayContentItems(items) {
     if (!panelContentListEl) {
        console.error("DEBUG ERROR: Panel content list element not found in displayContentItems.");
        return;
     }
     panelContentListEl.innerHTML = ''; // Clear previous items/loading message
     console.log("DEBUG: Displaying", items.length, "content items.");

     if (items.length === 0) {
         const message = currentFilterTagId !== null ? 'No items match the selected filter.' : 'No items saved yet.';
         panelContentListEl.innerHTML = `<p><i>${message}</i></p>`;
     } else {
         const sortedItems = items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
         sortedItems.forEach(item => {
             try {
                 panelContentListEl.appendChild(createContentItemElement(item));
             } catch (error) {
                  console.error(`DEBUG ERROR: Error creating element for item ${item.id}:`, error);
                  const errorDiv = document.createElement('div'); errorDiv.className = 'content-item error'; errorDiv.textContent = `Error loading item ${item.id}.`; panelContentListEl.appendChild(errorDiv);
             }
         });
     }
}

/**
 * Creates HTML element for a single saved item summary in the list.
 * ** MODIFIED: Handles GENERATED_ITEM_TYPE and PDF **
 */
function createContentItemElement(item) {
    // This function uses the structure from the reverted panel.js
    // ** MODIFICATION: Added handling for GENERATED_ITEM_TYPE and PDF **
    const div = document.createElement('div');
    div.className = 'content-item';
    div.dataset.itemId = item.id;
    console.log(`DEBUG: Creating content item element for ID: ${item.id}, Type: ${item.type}`);

    let contentPreview = '';
    let analysisStatus = '';
    let titlePrefix = '';
    let itemTypeDisplay = item.type; // Default to item.type

    switch (item.type) {
        case 'page':
        case 'selection':
            contentPreview = (item.content || '').substring(0, 150) + ((item.content || '').length > 150 ? '...' : '');
            break;
        case 'screenshot':
            contentPreview = `<img src="${item.content}" alt="Screenshot thumbnail" class="screenshot-thumbnail"> Screenshot captured`; // Added class
            if (item.analysisCompleted === true && !item.analysisFailed) analysisStatus = ' <span class="analysis-status success">(Analyzed)</span>';
            else if (item.analysisFailed === true) analysisStatus = ' <span class="analysis-status error">(Analysis Failed)</span>';
            else if (item.analysis !== undefined && item.analysis !== null) analysisStatus = ' <span class="analysis-status pending">(Analyzing...)</span>';
            else analysisStatus = ' <span class="analysis-status pending">(Analysis Pending)</span>';
            break;
        case 'pdf':
            const fileSizeKB = item.fileSize ? Math.round(item.fileSize / 1024) : 'Unknown';
            contentPreview = `📄 PDF Document (${fileSizeKB}KB)`;
            analysisStatus = ''; // PDFs don't have analysis like screenshots
            break;
        case GENERATED_ITEM_TYPE: // ** NEW **
            titlePrefix = '[Generated] ';
            itemTypeDisplay = item.analysisType || 'Analysis'; // Show 'key_points' or 'Analysis'
            contentPreview = (item.content || '').substring(0, 150) + ((item.content || '').length > 150 ? '...' : '');
            analysisStatus = ` <span class="analysis-status generated">(${itemTypeDisplay})</span>`;
            break;
        default:
            contentPreview = 'Unknown item type';
            break;
    }

    // Construct the inner HTML (Matches reverted structure)
    div.innerHTML = `
        <div class="item-summary">
            <strong>${titlePrefix}${item.title || `Item ${item.id}`} (${itemTypeDisplay})${analysisStatus}</strong>
            <p class="preview">${contentPreview || '<i>No preview available</i>'}</p>
            <span class="timestamp">${new Date(item.createdAt).toLocaleString()}</span>
            <button class="delete-btn" title="Delete Item">&times;</button>
        </div>
        <div class="item-details" style="display: none;">
            </div>
    `;
    return div;
}


/**
 * Populates the detail area for a selected item.
 * ** MODIFIED: Handles GENERATED_ITEM_TYPE and PDF **
 */
function displayItemDetails(item, detailElement) {
    console.log(`DEBUG: displayItemDetails called for item ID: ${item.id}, Type: ${item.type}`);
    detailElement.innerHTML = '<i>Loading details...</i>'; // Clear previous details

    let contentHtml = '';
    let analysisHtml = '';
    let metadataHtml = ''; // For original items

    // --- Determine content based on type ---
    if (item.type === GENERATED_ITEM_TYPE) {
        // --- Display for Generated Analysis Items ---
        contentHtml = `
            <h4>Content (${item.analysisType || 'Generated Analysis'}):</h4>
            <pre class="content-preview">${item.content || 'No content available.'}</pre>
            ${item.wordCount !== null ? `<p><small>Word Count: ${item.wordCount}, Est. Reading Time: ${item.readingTimeMinutes} min</small></p>` : ''}
            <h4>Generation Source:</h4>
            <p><small>Based on Tag ID(s): ${item.sourceTagIds?.join(', ') || 'N/A'}</small></p>
            <p><small>Based on Item ID(s): ${item.sourceItemIds?.join(', ') || 'N/A'}</small></p>
            ${item.sourceInfo ? `<p><small>Context: ${item.sourceInfo}</small></p>` : ''} `; // Display sourceInfo if available
        analysisHtml = '<p><i>Analysis not applicable for generated items.</i></p>'; // No nested analysis
        metadataHtml = ''; // No original metadata for generated items

    } else if (item.type === 'pdf') {
        // --- Display for PDF Items ---
        const fileSizeKB = item.fileSize ? Math.round(item.fileSize / 1024) : 'Unknown';
        
        contentHtml = `
            <div class="pdf-preview">
                <p><strong>📄 PDF Document</strong></p>
                <p>File Size: ${fileSizeKB}KB</p>
                <div class="pdf-actions">
                    <a href="${item.content}" download="${item.title.replace(/[^a-z0-9]/gi, '_')}.pdf" class="pdf-download-btn">Download PDF</a>
                    <button onclick="window.open('${item.content}', '_blank')" class="pdf-view-btn">View in New Tab</button>
                </div>
                <div class="pdf-embed-container">
                    <iframe src="${item.content}" width="100%" height="400px" style="border: 1px solid var(--panel-border-light); border-radius: 4px;"></iframe>
                </div>
            </div>
        `;
        
        analysisHtml = '<p><i>Analysis not applicable for PDF documents.</i></p>';
        
        metadataHtml = `
            <h4>Source:</h4>
            <p><small>URL: <a href="${item.url || '#'}" target="_blank" title="${item.url || ''}">${item.url || 'N/A'}</a></small></p>
            ${item.characterCount ? `<p><small>Original Page Character Count: ${item.characterCount.toLocaleString()}</small></p>` : ''}
            ${item.pdfOptions ? `<p><small>PDF Settings: ${item.pdfOptions.landscape ? 'Landscape' : 'Portrait'}, Scale: ${(item.pdfOptions.scale || 1) * 100}%</small></p>` : ''}
            ${item.pageDescription ? `<p><small>Page Description: ${item.pageDescription}</small></p>` : ''}
        `;

    } else if (item.type === 'page' || item.type === 'selection') {
        // --- Display for Page/Selection Items (Reverted Logic) ---
        contentHtml = `<pre class="content-full">${item.content || 'No text content available.'}</pre>`; // Use different class for full view
        analysisHtml = '<p><i>Analysis not applicable for text items.</i></p>';
        metadataHtml = `
            <h4>Source:</h4>
            <p><small>URL: <a href="${item.url || '#'}" target="_blank" title="${item.url || ''}">${item.url || 'N/A'}</a></small></p>
            ${item.wordCount !== null ? `<p><small>Word Count: ${item.wordCount}, Est. Reading Time: ${item.readingTimeMinutes} min</small></p>` : ''}
        `;

    } else if (item.type === 'screenshot') {
        // --- Display for Screenshot Items (Reverted Logic) ---
        contentHtml = `<img src="${item.content}" alt="Full screenshot for item ${item.id}" class="screenshot-full">`; // Use specific class
        analysisHtml = '<h4>AI Analysis</h4>';
        if (item.analysis) {
            let analysisContent = '';
            if (item.analysis.description) analysisContent += `<p><strong>Description:</strong> ${item.analysis.description}</p>`;
            if (item.analysis.descriptionError) analysisContent += `<p class="error"><strong>Desc Error:</strong> ${item.analysis.descriptionError}</p>`;
            analysisContent += '<p><strong>Diagram/Chart:</strong> ';
            if (item.analysis.diagramData === null || item.analysis.diagramData?.contains_diagram === false) analysisContent += '<em>None detected.</em>';
            else if (typeof item.analysis.diagramData === 'object' && !item.analysis.diagramData.parse_error && !item.analysis.diagramData.text_summary) analysisContent += `<pre><code>${JSON.stringify(item.analysis.diagramData, null, 2)}</code></pre>`;
            else if (item.analysis.diagramData?.text_summary) analysisContent += `<em>${item.analysis.diagramData.text_summary}</em>${item.analysis.diagramData.parse_error ? ' <span class="error">(JSON parse error)</span>' : ''}`;
            else analysisContent += `<em>Unexpected format.</em>`;
            analysisContent += '</p>';
            if (item.analysis.diagramError) analysisContent += `<p class="error"><strong>Diagram Error:</strong> ${item.analysis.diagramError}</p>`;
            analysisContent += '<p><strong>Layout:</strong> ';
            if (item.analysis.layout === null || item.analysis.layout?.is_webpage_layout === false) analysisContent += '<em>Not applicable/detected.</em>';
            else if (typeof item.analysis.layout === 'object' && !item.analysis.layout.parse_error && !item.analysis.layout.text_summary) analysisContent += `<pre><code>${JSON.stringify(item.analysis.layout, null, 2)}</code></pre>`;
            else if (item.analysis.layout?.text_summary) analysisContent += `<em>${item.analysis.layout.text_summary}</em>${item.analysis.layout.parse_error ? ' <span class="error">(JSON parse error)</span>' : ''}`;
            else analysisContent += `<em>Unexpected format.</em>`;
            analysisContent += '</p>';
            if (item.analysis.layoutError) analysisContent += `<p class="error"><strong>Layout Error:</strong> ${item.analysis.layoutError}</p>`;
            if (item.analysis.error) analysisContent += `<p class="error"><strong>Overall Error:</strong> ${item.analysis.error}</p>`;
            analysisHtml += analysisContent || '<p><em>No analysis results.</em></p>';
        } else if (item.analysisCompleted === true) {
             analysisHtml += '<p><em>Analysis completed, but no results found or results were empty.</em></p>';
        } else if (item.analysisFailed === true) {
             analysisHtml += '<p class="error"><em>Analysis failed to complete. Check background logs.</em></p>';
        } else {
             analysisHtml += '<p><em>Analysis pending or not run.</em></p>';
        }
        metadataHtml = `
            <h4>Source:</h4>
            <p><small>URL: <a href="${item.url || '#'}" target="_blank" title="${item.url || ''}">${item.url || 'N/A'}</a></small></p>
        `;
    }

    // --- Assemble Detail View (Matches reverted structure) ---
    detailElement.innerHTML = `
        <div class="detail-content">${contentHtml}</div>
        <div class="detail-metadata">${metadataHtml}</div>
        <div class="detail-analysis">${analysisHtml}</div>
        <div class="detail-tags-section">
            <h5>Tags</h5>
            <div class="tags-list" data-content-id="${item.id}"><i>Loading tags...</i></div>
            <div class="add-tag-controls">
                <input type="text" class="add-tag-input" placeholder="Add a tag..." aria-label="Add new tag">
                <button class="add-tag-btn" data-content-id="${item.id}">Add</button>
            </div>
        </div>
        <button class="close-details-btn">Close Details</button>
    `;
    console.log("DEBUG: Detail view HTML populated.");

    // Fetch and display tags for this specific item
    const tagsListElement = detailElement.querySelector('.tags-list');
    if (tagsListElement) {
        console.log("DEBUG: Calling fetchAndDisplayTags for item ID:", item.id);
        fetchAndDisplayTags(item.id, tagsListElement);
    } else {
        console.warn("DEBUG WARNING: tags-list element not found for item ID:", item.id);
    }

    // Add event listeners for tag controls within this specific detail view
    const addTagInput = detailElement.querySelector('.add-tag-input');
    const addTagButton = detailElement.querySelector('.add-tag-btn');
    if (addTagInput && addTagButton) {
        const handleAddTag = () => {
            const tagName = addTagInput.value.trim();
            const contentText = item.content; // Get content for AI analysis
            
            if (tagName) {
                // User typed a tag - add it directly
                console.log(`DEBUG: User input tag "${tagName}". Calling enhancedAddTag.`);
                // Pass the direct element references
                enhancedAddTag(item.id, tagName, contentText, addTagInput, tagsListElement);
                addTagInput.value = '';
            } else {
                // No input - show AI suggestions if available
                console.log("DEBUG: No user input tag. Calling enhancedAddTag for suggestions.");
                // Pass the direct element references
                enhancedAddTag(item.id, null, contentText, addTagInput, tagsListElement);
            }
        };
        addTagButton.addEventListener('click', handleAddTag);
        addTagInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddTag(); });
        console.log("DEBUG: Add tag event listeners attached.");
    }

    // Add listener for the close button
    const closeButton = detailElement.querySelector('.close-details-btn');
    if (closeButton) {
        closeButton.onclick = () => {
            console.log("DEBUG: Close details button clicked for item ID:", item.id);
            detailElement.style.display = 'none';
            detailElement.innerHTML = '';
        };
        console.log("DEBUG: Close details button listener attached.");
    }
}


/** Fetches and displays tags for an item, adds remove listeners. (Unchanged) */
function fetchAndDisplayTags(contentId, tagsListElement) {
    console.log(`DEBUG: fetchAndDisplayTags called for contentId: ${contentId}`);
    if (!tagsListElement) { console.error("Cannot display tags: tagsListElement is null for contentId", contentId); return; }
    tagsListElement.innerHTML = '<i>Loading tags...</i>';
    chrome.runtime.sendMessage({ type: 'GET_TAGS_FOR_ITEM', payload: { contentId: contentId } }, (response) => {
        console.log(`DEBUG: Response for GET_TAGS_FOR_ITEM for contentId ${contentId}:`, response);
        tagsListElement.innerHTML = ''; // Clear loading
        if (response && response.success && Array.isArray(response.payload)) {
            const tags = response.payload;
            if (tags.length === 0) { tagsListElement.innerHTML = '<i>No tags yet.</i>'; }
            else { tags.sort((a, b) => a.name.localeCompare(b.name)); tags.forEach(tag => { const tagSpan = document.createElement('span'); tagSpan.className = 'tag-item'; tagSpan.textContent = tag.name; tagSpan.dataset.tagId = tag.id; const removeBtn = document.createElement('button'); removeBtn.className = 'remove-tag-btn'; removeBtn.innerHTML = '&times;'; removeBtn.title = `Remove tag "${tag.name}"`; removeBtn.dataset.tagId = tag.id; removeBtn.dataset.contentId = contentId; removeBtn.addEventListener('click', (e) => { e.stopPropagation(); const tagIdToRemove = parseInt(e.target.dataset.tagId); const contentIdToRemoveFrom = parseInt(e.target.dataset.contentId); if (!isNaN(tagIdToRemove) && !isNaN(contentIdToRemoveFrom)) { showStatus(`Removing tag "${tag.name}"...`, 'info', false); chrome.runtime.sendMessage({ type: 'REMOVE_TAG_FROM_ITEM', payload: { contentId: contentIdToRemoveFrom, tagId: tagIdToRemove } }, (response) => handleTagActionResponse(response, contentIdToRemoveFrom, tagsListElement)); } else { console.error("Invalid tagId/contentId for removal:", e.target.dataset); showStatus("Error: Could not remove tag.", "error"); } }); tagSpan.appendChild(removeBtn); tagsListElement.appendChild(tagSpan); }); }
        } else { console.error("Failed to fetch tags for item", contentId, ":", response?.error); tagsListElement.innerHTML = '<i class="error">Failed to load tags.</i>'; }
    });
}

/** Handles responses from tag add/remove actions. Refreshes tags for the specific item. (Unchanged) */
function handleTagActionResponse(response, contentId, tagsListElement) {
    console.log(`DEBUG: handleTagActionResponse called for contentId ${contentId}:`, response);
    if (response && response.success) { showStatus("Tag action successful!", "success"); console.log(`Refreshing tags for item ${contentId}`); if (tagsListElement && document.body.contains(tagsListElement)) { fetchAndDisplayTags(contentId, tagsListElement); } else { console.warn("Tag list element no longer valid, cannot refresh tags.", contentId); loadFilterTags(); } loadFilterTags(); } else { showStatus(`Tag action failed: ${response?.error || 'Unknown error'}`, "error"); }
}

/** Sends delete message to background script. (Unchanged) */
function deleteItem(id, title = '') {
    console.log(`DEBUG: deleteItem called for ID: ${id}, Title: "${title}"`);
    const confirmMessage = `Are you sure you want to delete "${title || `Item ${id}`}"?`; 
    // IMPORTANT: In a real extension, consider replacing `confirm` with a custom modal for better UX.
    if (!confirm(confirmMessage)) {
        console.log("DEBUG: Delete cancelled by user.");
        return;
    }
    showStatus(`Deleting item ${id}...`, "info", false); 
    chrome.runtime.sendMessage({ type: "DELETE_ITEM", payload: { id: id } }, (response) => { 
        handleActionResponse(response ? response : { success: false, error: 'No response from background for delete.' }); 
        console.log(`DEBUG: Delete item message sent for ID ${id}. Response handled.`);
    });
}

// --- Status Message Management --- (Unchanged)
function showStatus(message, type = "info", autoClear = true) { if (!panelStatusMessageEl) return; panelStatusMessageEl.textContent = message; panelStatusMessageEl.className = `status-message ${type}`; panelStatusMessageEl.style.display = 'block'; if (autoClear) { setTimeout(() => { if (panelStatusMessageEl.textContent === message) clearStatus(); }, 3500); } }
function clearStatus() { if (!panelStatusMessageEl) return; panelStatusMessageEl.style.display = 'none'; panelStatusMessageEl.textContent = ''; panelStatusMessageEl.className = 'status-message'; }
// --- Theme Management --- (Unchanged)
function applyPanelTheme() { chrome.storage.sync.get(['theme'], (syncResult) => { const theme = syncResult.theme || 'system'; const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; const useDarkMode = theme === 'dark' || (theme === 'system' && prefersDark); if (useDarkMode) document.body.classList.add('dark-mode'); else document.body.classList.remove('dark-mode'); console.log(`Panel theme applied: ${theme === 'system' ? (prefersDark ? 'dark (system)' : 'light (system)') : theme}`); }); }


// --- Filter Logic ---

/** Fetches all unique tags and populates the filter list */
function loadFilterTags() {
    // This function remains unchanged from the reverted version
    if (!tagFilterListEl) { console.error("Tag filter list element not found."); return; }
    tagFilterListEl.innerHTML = '<i>Loading tags...</i>';

    chrome.runtime.sendMessage({ type: "GET_ALL_TAGS" }, (response) => {
        tagFilterListEl.innerHTML = ''; // Clear loading message
        if (response && response.success && Array.isArray(response.payload)) {
            const tags = response.payload;
            if (tags.length === 0) {
                tagFilterListEl.innerHTML = '<i>No tags available to filter by.</i>';
                 if (clearTagFilterBtn) clearTagFilterBtn.style.display = 'none';
                 if (getKeyPointsBtn) getKeyPointsBtn.style.display = 'none'; // Hide key points if no tags
            } else {
                tags.sort((a, b) => a.name.localeCompare(b.name));
                tags.forEach(tag => {
                    const tagButton = document.createElement('button');
                    tagButton.className = 'tag-filter-item';
                    tagButton.textContent = tag.name;
                    tagButton.dataset.tagId = tag.id;
                    tagButton.dataset.tagName = tag.name; // Store name for Key Points button
                    tagButton.title = `Filter by tag: ${tag.name}`;
                    if (currentFilterTagId === tag.id) { tagButton.classList.add('active'); }
                    tagButton.addEventListener('click', handleFilterTagClick);
                    tagFilterListEl.appendChild(tagButton);
                });
                 // Show/hide clear button based on current filter state
                 if (clearTagFilterBtn) clearTagFilterBtn.style.display = currentFilterTagId !== null ? 'inline-block' : 'none';
                 // Show/hide key points button based on current filter state
                 updateKeyPointsButtonVisibility(); // Call the visibility update
            }
        } else {
            console.error("Failed to load tags for filtering:", response?.error);
            tagFilterListEl.innerHTML = '<i class="error">Error loading tags.</i>';
            if (getKeyPointsBtn) getKeyPointsBtn.style.display = 'none'; // Hide button on error
        }
    });
}

/** Handles clicks on a tag in the filter list */
function handleFilterTagClick(event) {
    // This function remains unchanged from the reverted version
    const clickedTagButton = event.target;
    const tagId = parseInt(clickedTagButton.dataset.tagId);
    const tagName = clickedTagButton.dataset.tagName;

    if (isNaN(tagId)) { console.error("Invalid tag ID on filter button:", clickedTagButton.dataset.tagId); return; }

    // If clicking the already active tag, clear the filter
    if (clickedTagButton.classList.contains('active')) {
         handleClearFilter();
         return;
    }

    console.log(`Filtering by tag ID: ${tagId} (${tagName})`);
    currentFilterTagName = tagName; // Store name for Key Points button

    // Update UI for active filter button
    const currentActive = tagFilterListEl.querySelector('.tag-filter-item.active');
    if (currentActive) currentActive.classList.remove('active');
    clickedTagButton.classList.add('active');
    if (clearTagFilterBtn) clearTagFilterBtn.style.display = 'inline-block';

    // Load content filtered by this tag ID
    loadSavedContent(tagId); // This will update the button visibility too
}

/** Handles click on the "Clear Filter" button */
function handleClearFilter() {
    // This function remains unchanged from the reverted version
    console.log("Clearing tag filter.");
    if (currentFilterTagId === null) return; // Already cleared

    currentFilterTagName = null; // Clear stored name
    currentFilterTagId = null; // Clear filter ID state

    // Reset UI filter buttons
    const currentActive = tagFilterListEl.querySelector('.tag-filter-item.active');
    if (currentActive) currentActive.classList.remove('active');
    if (clearTagFilterBtn) clearTagFilterBtn.style.display = 'none';

    // Load all content items
    loadSavedContent(null); // This will update the button visibility too
}

// --- ** MODIFIED: Key Points Logic (Simple Display) ** ---

/** Handles click on the "Get Key Points" button */
function handleGetKeyPointsClick() {
    if (currentFilterTagId === null || !getKeyPointsBtn) return;

    console.log(`Requesting key points for tag ID: ${currentFilterTagId}`);
    showStatus(`Generating key points for tag "${currentFilterTagName || 'selected'}"...`, 'info', false);

    // ** Hide the result area while generating **
    hideKeyPointsResultArea();

    // Disable button while processing
    getKeyPointsBtn.disabled = true;
    getKeyPointsBtn.textContent = 'Generating...';

    chrome.runtime.sendMessage(
        { type: 'GET_KEY_POINTS_FOR_TAG', payload: { tagId: currentFilterTagId } },
        handleKeyPointsResponse // Use the modified response handler
    );
}
/** 6.10 8:51 */
/** Handles click on the "Generate Report" button */
function handleGenerateReportClick() {
    if (currentFilterTagId === null || !generateReportBtn) return;

    console.log(`Requesting PDF report generation for tag ID: ${currentFilterTagId}`);
    showStatus(`Generating PDF report for tag "${currentFilterTagName || 'selected'}"... This may take a moment.`, 'info', false);

    // Disable button while processing
    generateReportBtn.disabled = true;
    generateReportBtn.textContent = 'Generating...';

    chrome.runtime.sendMessage(
        { type: 'GENERATE_PDF_REPORT_FOR_TAG', payload: { tagId: currentFilterTagId } },
        handleGenerateReportResponse
    );
}

/** Handles the response from the background after requesting PDF report generation */
function handleGenerateReportResponse(response) {
    // Re-enable button
    if (generateReportBtn) {
        generateReportBtn.disabled = false;
        updateGenerateReportButtonVisibility(); // Reset text based on current filter state
    }

    if (response && response.success) {
        // Success: PDF report was generated and downloaded
        console.log("PDF report generated successfully:", response.filename);
        showStatus(`PDF report generated: ${response.filename}`, "success", 5000);
    } else {
        // Failure: Show the error message
        const errorMsg = response?.error || "Failed to generate PDF report.";
        console.error("PDF report generation failed:", errorMsg);
        showStatus(`Error: ${errorMsg}`, "error", false);
    }
}



/**
 * Handles the response from the background after requesting key points.
 * Displays the key points text directly in the dedicated area.
 */
function handleKeyPointsResponse(response) {
     // Re-enable button
     if (getKeyPointsBtn) {
         getKeyPointsBtn.disabled = false;
         updateKeyPointsButtonVisibility(); // Reset text/title based on current filter state
     }

    if (response && response.success) {
        // Success: A new item was created AND we have the key points text
        console.log("Key points generated and saved as new item ID:", response.newId);
        // Show status message confirming save
        showStatus(`Key points generated and saved (ID: ${response.newId}). ${response.sourceInfo || ''}`, "success", 5000);

        // ** Display the received key points in the dedicated result area **
        displayKeyPointsResult(response.keyPoints, response.sourceInfo);

        // ** DO NOT reload the list here - keep the list displayed below the result **
        // loadSavedContent(currentFilterTagId);

    } else {
        // Failure: Show the error message.
        const errorMsg = response?.error || "Failed to generate key points.";
        console.error("Key points generation failed:", errorMsg);
        showStatus(`Error: ${errorMsg}`, "error", false); // Show persistent error

        // Ensure the result area is hidden on failure
        hideKeyPointsResultArea();
        // Ensure the item list is still displayed correctly
        // loadSavedContent(currentFilterTagId); // Optionally reload list on error
    }
}

/** Populates and shows the Key Points Result Display Area */
function displayKeyPointsResult(keyPointsText, sourceInfoText) {
    if (!keyPointsResultDisplayArea) {
        console.error("Key points result display area not found.");
        return;
    }
    console.log("Displaying key points result.");
    // Construct the HTML for the result area
    keyPointsResultDisplayArea.innerHTML = `
        <h4>Key Points for Tag: ${currentFilterTagName || 'Selected'}</h4>
        <div class="key-points-content">${(keyPointsText || "No content generated.").replace(/\n/g, '<br>')}</div>
        <span class="source-info">${sourceInfoText || ''}</span>
    `;
    keyPointsResultDisplayArea.style.display = 'block'; // Show the area
}

/** Hides and clears the Key Points Result Display Area */
function hideKeyPointsResultArea() {
    if (keyPointsResultDisplayArea) {
        keyPointsResultDisplayArea.style.display = 'none';
        keyPointsResultDisplayArea.innerHTML = ''; // Clear content
    }
}


/** Updates the visibility and text of the Key Points button based on filter state */
function updateKeyPointsButtonVisibility() {
    // This function remains unchanged from the reverted version
    if (!getKeyPointsBtn) return;
    if (currentFilterTagId !== null) {
        getKeyPointsBtn.textContent = `Get Key Points for "${currentFilterTagName || 'Selected'}"`;
        getKeyPointsBtn.style.display = 'inline-block';
        getKeyPointsBtn.disabled = false; // Ensure enabled
    } else {
        getKeyPointsBtn.style.display = 'none';
    }
    updateGenerateReportButtonVisibility();
}

/** Updates the visibility and text of the Generate Report button based on filter state */
function updateGenerateReportButtonVisibility() {
    if (!generateReportBtn) return;
    if (currentFilterTagId !== null) {
        generateReportBtn.textContent = `Generate "${currentFilterTagName || 'Selected'}" Report`;
        generateReportBtn.style.display = 'inline-block';
        generateReportBtn.disabled = false; // Ensure enabled
    } else {
        generateReportBtn.style.display = 'none';
    }
    
}

// Add these new functions (around line 550, after existing functions)

/** Initialize Local AI functionality */
async function handleInitializeAI() {
    if (aiLoading) return;
    
    const userConsent = confirm(
        "Enable AI tag suggestions?\n\n" +
        "This will download a 25MB AI model for local processing.\n" +
        "• Suggests relevant tags based on content\n" +
        "• Processes everything locally (private)\n" +
        "• One-time download, then works offline\n\n" +
        "Continue?"
    );
    
    if (!userConsent) return;
    
    aiLoading = true;
    updateAIStatus("loading", "Downloading AI model (25MB)...");
    if (initializeAIBtn) {
        initializeAIBtn.disabled = true;
        initializeAIBtn.textContent = "Loading...";
    }
    
    try {
        console.log("DEBUG: Sending INITIALIZE_LOCAL_AI message to background.");
        const response = await chrome.runtime.sendMessage({ type: "INITIALIZE_LOCAL_AI" });
        console.log("DEBUG: Response from INITIALIZE_LOCAL_AI:", response);
        
        if (response.success) {
            aiInitialized = true;
            updateAIStatus("ready", "AI ready - Tag suggestions enabled");
            showStatus("AI tag suggestions enabled! Generate embeddings for existing tags to get started.", "success");
            updateAIButtons();
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error("Failed to initialize AI:", error);
        updateAIStatus("error", "AI initialization failed");
        showStatus(`Failed to initialize AI: ${error.message}`, "error");
    } finally {
        aiLoading = false;
        if (initializeAIBtn) {
            initializeAIBtn.disabled = false;
            initializeAIBtn.textContent = "Initialize AI";
        }
    }
}

/** Generate embeddings for all existing tags */
async function handleGenerateEmbeddings() {
    if (!aiInitialized) {
        showStatus("Please initialize AI first before generating embeddings.", "error");
        return;
    }
    
    if (generateEmbeddingsBtn) {
        generateEmbeddingsBtn.disabled = true;
        generateEmbeddingsBtn.textContent = "Processing...";
    }
    
    updateAIStatus("processing", "Generating embeddings for existing tags...");
    
    try {
        console.log("DEBUG: Sending GENERATE_EMBEDDINGS_FOR_TAGS message to background.");
        const response = await chrome.runtime.sendMessage({ type: "GENERATE_EMBEDDINGS_FOR_TAGS" });
        console.log("DEBUG: Response from GENERATE_EMBEDDINGS_FOR_TAGS:", response);
        
        if (response.success) {
            const { processed, skipped, total } = response.payload;
            updateAIStatus("ready", `Embeddings ready (${processed}/${total} tags processed)`);
            showStatus(`Embeddings generated: ${processed} processed, ${skipped} skipped.`, "success");
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error("Failed to generate embeddings:", error);
        updateAIStatus("error", "Failed to generate embeddings");
        showStatus(`Failed to generate embeddings: ${error.message}`, "error");
    } finally {
        if (generateEmbeddingsBtn) {
            generateEmbeddingsBtn.disabled = false;
            generateEmbeddingsBtn.textContent = "Generate Embeddings";
        }
    }
}

/** Update AI status indicator */
function updateAIStatus(status, message) {
    if (!aiStatusIndicator) return;
    
    aiStatusIndicator.className = `ai-status ${status}`;
    aiStatusIndicator.textContent = message;
    
    // Show/hide based on status
    aiStatusIndicator.style.display = status === "hidden" ? "none" : "block";
}

/** Update AI button visibility and states */
function updateAIButtons() {
    if (initializeAIBtn) {
        initializeAIBtn.style.display = aiInitialized ? "none" : "inline-block";
    }
    
    if (generateEmbeddingsBtn) {
        generateEmbeddingsBtn.style.display = aiInitialized ? "inline-block" : "none";
    }
}

/**
 * Enhanced tag adding with AI suggestions or direct tag addition.
 * @param {number} contentId - ID of the content item.
 * @param {string|null} userInput - User-provided tag name, or null if asking for suggestions.
 * @param {string} contentText - The text content of the item for AI analysis.
 * @param {HTMLElement} tagInputEl - Direct reference to the tag input element.
 * @param {HTMLElement} tagsListEl - Direct reference to the tags list element for this item.
 */
async function enhancedAddTag(contentId, userInput, contentText, tagInputEl, tagsListEl) {
    console.log(`DEBUG: enhancedAddTag called for contentId: ${contentId}, userInput: "${userInput}", contentText length: ${contentText?.length}`);
    
    if (!tagInputEl || !tagsListEl) { // Check passed elements directly
        console.error("DEBUG ERROR: Missing tagInputEl or tagsListEl in enhancedAddTag call.");
        return;
    }
    
    // If user provided input, add it normally
    if (userInput && userInput.trim()) {
        const normalizedTag = userInput.trim(); // We'll add normalization here later
        showStatus(`Adding tag "${normalizedTag}"...`, 'info', false);
        
        chrome.runtime.sendMessage(
            { type: 'ADD_TAG_TO_ITEM', payload: { contentId: contentId, tagName: normalizedTag } },
            (response) => {
                // Use the passed tagsListEl directly
                handleTagActionResponse(response, contentId, tagsListEl);
            }
        );
        return;
    }
    
    // If AI is available and we have content, suggest tags
    if (aiInitialized && contentText) {
        console.log("DEBUG: AI initialized and content available, showing tag suggestions.");
        // Pass the tagInputEl directly to showTagSuggestions
        await showTagSuggestions(contentId, contentText, tagInputEl, tagsListEl);
    } else {
        console.log("DEBUG: AI not initialized or content not available for suggestions. Prompting user to type.");
        showStatus("Enter a tag name or initialize AI for suggestions.", "info");
    }
}

/**
 * Show AI-generated tag suggestions.
 * @param {number} contentId - ID of the content item.
 * @param {string} contentText - The text content of the item for AI analysis.
 * @param {HTMLElement} inputElement - Direct reference to the tag input element (parent of suggestions).
 * @param {HTMLElement} tagsListEl - Direct reference to the tags list element to refresh after adding.
 */
async function showTagSuggestions(contentId, contentText, inputElement, tagsListEl) {
    console.log(`DEBUG: showTagSuggestions called for contentId: ${contentId}`);
    try {
        // Show loading state
        let suggestionsContainer = inputElement.parentElement.querySelector('.tag-suggestions');
        if (!suggestionsContainer) {
            suggestionsContainer = document.createElement('div');
            suggestionsContainer.className = 'tag-suggestions';
            inputElement.parentElement.appendChild(suggestionsContainer);
        }
        suggestionsContainer.innerHTML = '<span class="suggestion-loading">🤖 Analyzing content...</span>';
        console.log("DEBUG: Showing AI suggestion loading indicator.");
        
        // Get AI suggestions
        console.log("DEBUG: Sending SUGGEST_TAGS_FOR_CONTENT message to background.");
        const response = await chrome.runtime.sendMessage({
            type: "SUGGEST_TAGS_FOR_CONTENT",
            payload: { content: contentText }
        });
        console.log("DEBUG: Response from SUGGEST_TAGS_FOR_CONTENT:", response);
        
        if (response.success && response.payload.length > 0) {
            // Display suggestions
            suggestionsContainer.innerHTML = `
                <span class="suggestion-label">🤖 Suggested tags:</span>
                ${response.payload.map(suggestion => 
                    `<button class="tag-suggestion" data-tag="${suggestion.name}" data-content-id="${contentId}">
                        ${suggestion.name} (${(suggestion.similarity * 100).toFixed(0)}%)
                    </button>`
                ).join('')}
            `;
            console.log("DEBUG: Displayed", response.payload.length, "AI tag suggestions.");
            
            // Add click handlers for suggestions
            suggestionsContainer.querySelectorAll('.tag-suggestion').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tagName = btn.dataset.tag;
                    const targetContentId = parseInt(btn.dataset.contentId);
                    
                    showStatus(`Adding suggested tag "${tagName}"...`, 'info', false);
                    chrome.runtime.sendMessage(
                        { type: 'ADD_TAG_TO_ITEM', payload: { contentId: targetContentId, tagName: tagName } },
                        (response) => {
                            // Use the passed tagsListEl directly
                            handleTagActionResponse(response, targetContentId, tagsListEl);
                            
                            // Remove suggestions after adding
                            suggestionsContainer.remove();
                            console.log("DEBUG: Suggested tag added, suggestions removed.");
                        }
                    );
                });
            });
            
        } else {
            // No suggestions found
            suggestionsContainer.innerHTML = '<span class="suggestion-empty">🤖 No similar tags found. Try typing a new tag!</span>';
            console.log("DEBUG: No AI tag suggestions found.");
            
            // Auto-hide after 3 seconds
            setTimeout(() => {
                if (suggestionsContainer.parentElement) {
                    suggestionsContainer.remove();
                }
            }, 3000);
        }
        
    } catch (error) {
        console.error("Failed to get tag suggestions:", error);
        const suggestionsContainer = inputElement.parentElement.querySelector('.tag-suggestions');
        if (suggestionsContainer) {
            suggestionsContainer.innerHTML = '<span class="suggestion-error">❌ Failed to get suggestions</span>';
            console.log("DEBUG: Displayed AI suggestion error.");
        }
    }
}

// Update the existing addEventListeners function to use enhanced tag adding
// Find the existing tag controls event listener setup in displayItemDetails() and modify it:

// Replace the existing handleAddTag function in displayItemDetails() with:
// NOTE: This part needs to be manually inserted/verified in the displayItemDetails function itself.
// The code block above is just a reference for what the handleAddTag inside displayItemDetails should do.

/** Check AI initialization status on load */
async function checkAIStatus() {
    try {
        console.log("DEBUG: Checking AI status on panel load.");
        const response = await chrome.runtime.sendMessage({ type: "GET_LOCAL_AI_STATUS" });
        console.log("DEBUG: Response from GET_LOCAL_AI_STATUS:", response);
        
        if (response.success) {
            aiInitialized = response.payload.isReady;
            
            if (aiInitialized) {
                updateAIStatus("ready", "AI ready - Tag suggestions available");
            } else {
                updateAIStatus("disabled", "AI disabled - Click to enable tag suggestions");
            }
            
            updateAIButtons();
        }
    } catch (error) {
        console.error("Failed to check AI status:", error);
        updateAIStatus("error", "Failed to check AI status");
    }
}


console.log("WebInsight Panel script loaded and initialized (v8 - Simple Display with PDF support).");
