// js/background.js - Service Worker (Add Unique Source Count to SourceInfo)

// --- Imports ---
import { initDB, addContentItem, getAllContentItems, updateContentItem, deleteContentItem, addTag, getTagByName, getAllTags, deleteTag, linkTagToContent, unlinkTagFromContent, getTagIdsByContentId, getContentIdsByTagId, getTagsByIds, getContentItemsByIds, getAllContentTags } from './lib/db.js';
import { analyzeImageWithGemini, analyzeTextWithGemini, getApiKey } from './lib/api.js';

// --- Constants ---
const MAX_ITEMS_FOR_SUMMARY = 5;
const GENERATED_ITEM_TYPE = "generated_analysis";

// --- Service Worker Lifecycle & Setup ---
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`WebInsight extension ${details.reason}. Previous version: ${details.previousVersion}`);
    try {
        await setupContextMenu();
        await initDB();
        if (details.reason === 'install') {
            chrome.storage.sync.set({ theme: 'system' }, () => {
                 if (chrome.runtime.lastError) console.error("Error setting default theme:", chrome.runtime.lastError);
                 else console.log("Default theme setting applied.");
            });
        }
    } catch (error) {
        console.error("Error during onInstalled setup:", error);
    }
});

// --- Toolbar Action (Icon Click) Listener ---
chrome.action.onClicked.addListener(async (tab) => {
    console.log("Extension icon clicked on tab:", tab.id);
    let windowIdToUse = tab.windowId;
    if (!windowIdToUse) {
        console.warn("Action clicked on tab without windowId, querying current window.");
        try {
            const currentWindow = await chrome.windows.getCurrent({ populate: false });
            if (currentWindow && currentWindow.id) windowIdToUse = currentWindow.id;
            else { console.error("Cannot determine window ID to open side panel."); return; }
        } catch (error) { console.error("Error getting current window:", error); return; }
    }
    try {
        await chrome.sidePanel.open({ windowId: windowIdToUse });
        console.log("Side panel open request sent for window:", windowIdToUse);
    } catch (error) {
        console.error("Error opening side panel:", error);
    }
});

// --- Context Menu Setup ---
async function setupContextMenu() {
    chrome.contextMenus.update("saveSelectionWebInsight", {
         title: "Save selected text to WebInsight", contexts: ["selection"]
     }, () => {
         if (chrome.runtime.lastError) {
             console.log("Context menu item 'saveSelectionWebInsight' not found, creating it.");
             chrome.contextMenus.create({ id: "saveSelectionWebInsight", title: "Save selected text to WebInsight", contexts: ["selection"] });
         } else { console.log("Context menu item 'saveSelectionWebInsight' updated/verified successfully."); }
     });
}

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // This function remains unchanged from the reverted version for now
    if (info.menuItemId === "saveSelectionWebInsight") {
        if (info.selectionText && tab) { // Check if tab exists
             console.log("Context menu save triggered for:", info.selectionText.substring(0, 50) + '...');
             // Use the existing saveContent logic which doesn't yet handle metadata/links from reverted code
             saveContent({
                 type: 'selection',
                 content: info.selectionText,
                 url: tab.url || info.pageUrl, // Use tab.url first
                 title: `Selection from: ${tab.title || 'Untitled Page'}`
                 // Note: The reverted saveContent doesn't handle links/metadata yet
             }).then(id => console.log(`Context menu selection saved with ID: ${id}`))
               .catch(error => console.error("Error saving selection from context menu:", error));
        } else { console.warn("Context menu clicked, but no selection text or tab info found.", info); }
     }
});


// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const senderType = sender.tab ? `Content Script (Tab ${sender.tab.id})` : "Extension UI (Panel/Options/Viewer)";
    console.log("Message received in background:", message, "From:", senderType);
    let isResponseAsync = true; // Default to true, must return true if sendResponse is called asynchronously

    switch (message.type) {
        // --- Content Saving ---
        // These handlers use the reverted logic for now
        case "SAVE_PAGE_CONTENT":
            handleSavePageContent()
                .then(id => sendResponse({ success: true, id: id }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "SAVE_SELECTION":
            handleSaveSelection()
                .then(id => sendResponse({ success: true, id: id }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        // --- Screenshot Capturing ---
        case "CAPTURE_VISIBLE_TAB":
            handleCaptureVisibleTab()
                .then(id => sendResponse({ success: true, id: id }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "INITIATE_AREA_CAPTURE":
            handleInitiateAreaCapture()
                .then(response => sendResponse(response))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "CAPTURE_AREA_FROM_CONTENT":
            if (!sender.tab) { sendResponse({ success: false, error: "Missing sender tab info." }); isResponseAsync = false; }
            else { handleCaptureArea(message.payload, sender.tab).then(id => sendResponse({ success: true, id: id })).catch(error => { console.error("Error during handleCaptureArea:", error); sendResponse({ success: false, error: error.message }); }); }
            break;
        // --- Data Retrieval / Deletion ---
        case "GET_ALL_SAVED_CONTENT":
            getAllContentItems()
                .then(items => sendResponse({ success: true, payload: items }))
                .catch(error => { console.error("Error getting all content items:", error); sendResponse({ success: false, error: `Failed retrieve items: ${error.message}` }); });
            break;
        case "DELETE_ITEM":
            const itemIdToDelete = message.payload?.id;
            if (typeof itemIdToDelete !== 'number') { sendResponse({ success: false, error: "Invalid item ID." }); isResponseAsync = false; }
            else { deleteContentItem(itemIdToDelete).then(() => { chrome.storage.local.set({ lastSaveTimestamp: Date.now() }, () => { if (chrome.runtime.lastError) console.error("Error setting timestamp on delete:", chrome.runtime.lastError); }); sendResponse({ success: true }); }).catch(error => { console.error(`Error deleting item ${itemIdToDelete}:`, error); sendResponse({ success: false, error: `Failed delete item: ${error.message}` }); }); }
            break;
        // --- Tag Fetching ---
        case "GET_TAGS_FOR_ITEM":
            const contentIdForTags = message.payload?.contentId;
            if (typeof contentIdForTags !== 'number') { sendResponse({ success: false, error: "Invalid contentId." }); isResponseAsync = false; }
            else { getTagIdsByContentId(contentIdForTags).then(tagIds => tagIds && tagIds.length > 0 ? getTagsByIds(tagIds) : []).then(tags => sendResponse({ success: true, payload: tags })).catch(error => { console.error(`Error fetching tags for item ${contentIdForTags}:`, error); sendResponse({ success: false, error: `Failed fetch tags: ${error.message}` }); }); }
            break;
        // --- Tag Management ---
        case "ADD_TAG_TO_ITEM":
            const { contentId: addContentId, tagName: addTagName } = message.payload || {};
            if (typeof addContentId !== 'number' || !addTagName || typeof addTagName !== 'string' || addTagName.trim().length === 0) { sendResponse({ success: false, error: "Invalid contentId or tagName." }); isResponseAsync = false; }
            else { const trimmedTagName = addTagName.trim(); addTag(trimmedTagName).then(tagId => { if (typeof tagId !== 'number') throw new Error("Invalid tag ID returned."); return linkTagToContent(addContentId, tagId); }).then(() => { chrome.storage.local.set({ lastSaveTimestamp: Date.now() }, () => { if (chrome.runtime.lastError) console.error("Error setting timestamp after tag add:", chrome.runtime.lastError); }); sendResponse({ success: true }); }).catch(error => { console.error(`Error adding tag "${trimmedTagName}" to item ${addContentId}:`, error); sendResponse({ success: false, error: `Failed add tag: ${error.message}` }); }); }
            break;
        case "REMOVE_TAG_FROM_ITEM":
            const { contentId: removeContentId, tagId: removeTagId } = message.payload || {};
            if (typeof removeContentId !== 'number' || typeof removeTagId !== 'number') { sendResponse({ success: false, error: "Invalid contentId or tagId." }); isResponseAsync = false; }
            else { unlinkTagFromContent(removeContentId, removeTagId).then(() => { chrome.storage.local.set({ lastSaveTimestamp: Date.now() }, () => { if (chrome.runtime.lastError) console.error("Error setting timestamp after tag remove:", chrome.runtime.lastError); }); sendResponse({ success: true }); }).catch(error => { console.error(`Error removing tag ${removeTagId} from item ${removeContentId}:`, error); sendResponse({ success: false, error: `Failed remove tag: ${error.message}` }); }); }
            break;
        // --- Tag Filtering / Data Viewer Handlers ---
        case "GET_ALL_TAGS":
            getAllTags()
                .then(tags => sendResponse({ success: true, payload: tags }))
                .catch(error => { console.error("Error getting all tags:", error); sendResponse({ success: false, error: `Failed to get tags: ${error.message}` }); });
            break;
        case "GET_FILTERED_ITEMS_BY_TAG":
            const filterTagId = message.payload?.tagId;
            if (typeof filterTagId !== 'number') { sendResponse({ success: false, error: "Invalid tagId for filtering." }); isResponseAsync = false; }
            else { getContentIdsByTagId(filterTagId).then(contentIds => contentIds && contentIds.length > 0 ? getContentItemsByIds(contentIds) : []).then(items => sendResponse({ success: true, payload: items })).catch(error => { console.error(`Error filtering items by tag ${filterTagId}:`, error); sendResponse({ success: false, error: `Failed filter items: ${error.message}` }); }); }
            break;
        case "GET_ALL_CONTENT_TAGS":
            getAllContentTags()
                .then(links => sendResponse({ success: true, payload: links }))
                .catch(error => { console.error("Error getting all content tags:", error); sendResponse({ success: false, error: `Failed to get content tags: ${error.message}` }); });
            break;

        // --- Key Points Generation Handler ---
        case "GET_KEY_POINTS_FOR_TAG":
            const keyPointsTagId = message.payload?.tagId;
            if (typeof keyPointsTagId !== 'number') { sendResponse({ success: false, error: "Invalid tagId provided for key points." }); isResponseAsync = false; }
            else {
                // Call handleGetKeyPoints which saves the result and returns info
                handleGetKeyPoints(keyPointsTagId)
                    .then(result => {
                        // Result contains { success: true/false, newId?: ..., sourceInfo?: ..., keyPoints?: ..., error?: ... }
                        sendResponse(result); // Forward the result to panel
                    })
                    .catch(error => {
                        // Catch potential critical errors within handleGetKeyPoints itself
                        console.error(`Critical error in handleGetKeyPoints for tag ${keyPointsTagId}:`, error);
                        sendResponse({ success: false, error: `Failed to generate/save key points: ${error.message}` });
                    });
            }
            break;
        // --- Default ---
        default:
            console.warn("Unhandled message type in background:", message.type);
            isResponseAsync = false; // No async response expected
            break;
    }
    return isResponseAsync; // Required for async sendResponse calls
});


// --- Utility Functions ---
/** Gets the currently active tab. Checks for accessibility. */
async function getCurrentTab() {
    // This function remains unchanged from the reverted version
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0 && tabs[0]) {
            const tab = tabs[0];
            if (tab.id !== undefined && tab.id !== chrome.tabs.TAB_ID_NONE) {
                // Basic URL check from reverted version
                if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:') || tab.url.startsWith('file:'))) {
                    return tab;
                } else { throw new Error(`Active tab has inaccessible URL (${tab.url}).`); }
            } else { throw new Error(`Active tab has invalid ID (${tab.id}).`); }
        } else { throw new Error("Could not find active tab."); }
    } catch (error) { console.error("Error querying active tab:", error); throw new Error(`Failed get active tab: ${error.message}`); }
}


// --- Specific Action Handler Functions ---
// These handlers use the reverted logic (no metadata/links yet)
/** Handles saving the full page content by querying the active tab. */
async function handleSavePageContent() {
    const tab = await getCurrentTab();
    try {
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({ url: window.location.href, title: document.title, text: document.body.innerText || "", html: document.documentElement.outerHTML || "" })
        });
        if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) throw new Error("Failed get page content.");
        const pageContent = injectionResults[0].result;
        console.log("Page content received:", pageContent.title);
        return await saveContent({ type: 'page', content: pageContent.text, htmlContent: pageContent.html, url: pageContent.url, title: pageContent.title || 'Untitled Page' });
    } catch (error) { console.error("Error handleSavePageContent:", error); throw error; }
}

/** Handles saving the currently selected text by querying the active tab. */
async function handleSaveSelection() {
    const tab = await getCurrentTab();
     try {
        const injectionResults = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString().trim() });
        if (!injectionResults || injectionResults.length === 0 || injectionResults[0].result === undefined) throw new Error("Failed get selection.");
        const selectedText = injectionResults[0].result;
        if (!selectedText) throw new Error("No text selected.");
        console.log("Selection received:", selectedText.substring(0, 100) + "...");
        return await saveContent({ type: 'selection', content: selectedText, url: tab.url, title: `Selection from: ${tab.title || 'Untitled Page'}` });
     } catch (error) { console.error("Error handleSaveSelection:", error); throw error; }
}

/** Handles capturing the visible area by querying the active tab. */
async function handleCaptureVisibleTab() {
    const tab = await getCurrentTab();
    if (!tab.windowId) throw new Error("Tab missing window ID.");
    try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        if (!dataUrl) throw new Error("Capture empty.");
        console.log("Visible tab captured.");
        return await saveContent({ type: 'screenshot', content: dataUrl, contentType: 'image/png', url: tab.url, title: `Screenshot of ${tab.title || 'Untitled Page'}` });
    } catch (error) { console.error("Error handleCaptureVisibleTab:", error); throw error; }
}

/** Sends a message to the content script of the active tab to start area selection mode. */
async function handleInitiateAreaCapture() {
    const tab = await getCurrentTab();
     try {
         console.log(`Sending START_AREA_SELECTION to tab ${tab.id}`);
         const response = await chrome.tabs.sendMessage(tab.id, { type: "START_AREA_SELECTION" });
         console.log("Response from content script (init area capture):", response);
         if (response && response.success) return { success: true, message: "Area selection started." };
         else throw new Error(response?.error || "Content script failed initiate.");
     } catch (error) {
          console.error("Error initiating area capture:", error);
          if (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist")) throw new Error("Could not communicate with page. Reload page & retry.");
          throw error;
     }
}

/**
 * Handles the actual capture and cropping after receiving coordinates from content script.
 * @param {object} payload - The message payload containing { rect, devicePixelRatio, url, title }.
 * @param {chrome.tabs.Tab} tab - The sender tab object provided by the message listener.
 */
async function handleCaptureArea(payload, tab) {
    // Using reverted logic (no links/metadata in payload yet)
    const { rect, devicePixelRatio, url, title } = payload;
    if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number' || typeof rect.width !== 'number' || typeof rect.height !== 'number') throw new Error("Invalid rectangle data.");
    if (!tab || !tab.windowId) throw new Error("Invalid tab info.");
    let effectiveDevicePixelRatio = devicePixelRatio;
    if (!effectiveDevicePixelRatio || typeof effectiveDevicePixelRatio !== 'number' || effectiveDevicePixelRatio <= 0) { console.warn("Invalid DPR, defaulting to 1."); effectiveDevicePixelRatio = 1; }
    console.log("Received capture request for area:", rect, "on Tab:", tab.id);
    try {
        const fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        if (!fullDataUrl) throw new Error("Capture empty.");
        console.warn("Using direct Canvas cropping..."); // From reverted code
        const croppedDataUrl = await cropImageCanvas(fullDataUrl, rect, effectiveDevicePixelRatio);
        console.log("Image cropped (Canvas).");
        return await saveContent({ type: 'screenshot', content: croppedDataUrl, contentType: 'image/png', url: url || tab.url, title: title ? `Area from: ${title}` : `Area Screenshot` });
    } catch (error) { console.error("Error capturing/cropping area:", error); throw error; }
}

/**
 * ** MODIFIED: Handles generating key points, SAVING the result, and RETURNING the text & source count **
 * @param {number} tagId - The ID of the tag to get key points for.
 * @returns {Promise<object>} Promise resolving with { success: true, newId: number, sourceInfo: string, keyPoints: string } or { success: false, error: string }.
 */
async function handleGetKeyPoints(tagId) {
    console.log(`[KeyPoints] Starting process for tag ID: ${tagId}`);
    let sourceInfo = `Generated from items tagged ID ${tagId}.`;
    let tagName = `Tag ${tagId}`;
    let sourceItemIds = [];
    let uniqueSourceUrls = new Set(); // ** NEW: Set to store unique URLs **

    try {
        // --- Fetch Tag Name ---
        try {
            const tags = await getTagsByIds([tagId]);
            if (tags && tags.length > 0 && tags[0].name) {
                tagName = tags[0].name;
                sourceInfo = `Generated from items tagged "${tagName}" (ID ${tagId}).`;
            } else { console.warn(`[KeyPoints] Could not fetch name for tag ID: ${tagId}`); }
        } catch (tagFetchError) { console.warn(`[KeyPoints] Error fetching tag name for ID ${tagId}:`, tagFetchError); }

        // --- Fetch and Filter Content ---
        const contentIds = await getContentIdsByTagId(tagId);
        if (!contentIds || contentIds.length === 0) {
            return { success: false, error: "No content items found for this tag." };
        }
        const items = await getContentItemsByIds(contentIds);
        const textItems = items
            .filter(item => (item.type === 'page' || item.type === 'selection') && item.content)
            .slice(0, MAX_ITEMS_FOR_SUMMARY);
        sourceItemIds = textItems.map(item => item.id);

        // ** NEW: Collect unique source URLs from the textItems used **
        textItems.forEach(item => {
            if (item.url) { // Only add if URL exists
                uniqueSourceUrls.add(item.url);
            }
        });
        const uniqueSourceCount = uniqueSourceUrls.size; // Get the count

        if (textItems.length === 0) {
            return { success: false, error: "No text content found for this tag (only screenshots?)." };
        }

        // --- ** MODIFIED: Update Source Info with unique source count ** ---
        sourceInfo = `Generated from ${textItems.length} item(s) (from ${uniqueSourceCount} unique source${uniqueSourceCount !== 1 ? 's' : ''}) tagged "${tagName}" (ID ${tagId}).`;
        if (items.length > textItems.length) sourceInfo += ` (Note: ${items.length - textItems.length} non-text items excluded.)`;
        if (contentIds.length > MAX_ITEMS_FOR_SUMMARY) sourceInfo += ` (Note: Limited to first ${MAX_ITEMS_FOR_SUMMARY} text items.)`;

        // --- Combine Text & Check Limits ---
        let combinedText = textItems.map(item => `--- Item ${item.id} (${item.title || 'No Title'}) ---\n${item.content}\n\n`).join('');
        const MAX_CHARS = 15000;
        if (combinedText.length > MAX_CHARS) {
             combinedText = combinedText.substring(0, MAX_CHARS) + "\n\n[... CONTENT TRUNCATED ...]";
             sourceInfo += " (Note: Input text was truncated.)";
        }

        // --- Call AI ---
        const prompt = `Based *only* on the following text compiled from saved web content, please extract the main key points or provide a concise summary. Present the key points clearly, perhaps using bullet points:\n\n${combinedText}`;
        console.log(`[KeyPoints] Sending combined text to AI for tag ID: ${tagId}`);
        const analysisResponse = await analyzeTextWithGemini(combinedText, prompt);
        const keyPoints = extractTextFromResult(analysisResponse);
        if (!keyPoints) {
            throw new Error("AI analysis did not return usable text content.");
        }
        console.log(`[KeyPoints] Received key points for tag ID: ${tagId}`);

        // --- SAVE THE RESULT as a new item ---
        const newItem = {
            type: GENERATED_ITEM_TYPE,
            analysisType: "key_points",
            title: `Key Points for Tag: "${tagName}"`,
            content: keyPoints,
            sourceTagIds: [tagId],
            sourceItemIds: sourceItemIds,
            url: null, pageLang: null, pageDescription: null, pageKeywords: null, links: [], htmlContent: null,
            wordCount: keyPoints.split(/\s+/).filter(Boolean).length,
            readingTimeMinutes: Math.ceil(keyPoints.split(/\s+/).filter(Boolean).length / 200),
            contentType: null, analysis: null, analysisCompleted: true, analysisFailed: false
        };
        const newId = await saveContent(newItem);
        console.log(`[KeyPoints] Saved generated key points as new item ID: ${newId}`);

        // --- Return Success with New ID, Source Info, AND Key Points Text ---
        return {
            success: true,
            newId: newId,
            sourceInfo: sourceInfo, // Now includes unique source count
            keyPoints: keyPoints
        };

    } catch (error) {
        console.error(`[KeyPoints] Error during key points generation/saving for tag ${tagId}:`, error);
        return { success: false, error: error.message || "An unknown error occurred generating key points." };
    }
}


// --- Core Logic Functions ---
// ... (saveContent function remains the same as background_js_save_analysis_v3) ...
async function saveContent(item) {
    // Calculate stats only if content is text and type is appropriate
    if ((item.type === 'page' || item.type === 'selection' || item.type === GENERATED_ITEM_TYPE) && item.content && typeof item.content === 'string') {
        try {
            item.wordCount = item.content.split(/\s+/).filter(Boolean).length;
            item.readingTimeMinutes = Math.ceil(item.wordCount / 200);
        } catch (statError) { console.error("Error calculating stats:", statError); item.wordCount = null; item.readingTimeMinutes = null; }
    } else if (item.type === 'screenshot') {
        // Ensure these are null for screenshots
        item.wordCount = null;
        item.readingTimeMinutes = null;
    }

    // Prepare item for logging (using reverted logic's simpler logging)
    const logItem = { ...item };
    if (logItem.content && typeof logItem.content === 'string' && logItem.content.startsWith('data:image')) {
        logItem.content = logItem.content.substring(0, 50) + '...[imageData]';
    } else if (logItem.content && typeof logItem.content === 'string') {
        logItem.content = logItem.content.substring(0, 100) + (logItem.content.length > 100 ? '...' : '');
    }
    if (logItem.htmlContent) { // Check if htmlContent exists before logging preview
        logItem.htmlContent = logItem.htmlContent.substring(0, 100) + '...[html]';
    } else {
         logItem.htmlContent = undefined; // Ensure it's not logged if null/undefined
    }

    // Simplified logging based on reverted version, adding new type info
    console.log("Attempting to save item:", {
        type: logItem.type,
        title: logItem.title,
        url: logItem.url,
        contentPreview: logItem.content,
        htmlPreview: logItem.htmlContent, // May be undefined
        analysisType: logItem.analysisType, // Log new field if present
        sourceTagIds: logItem.sourceTagIds, // Log new field if present
        sourceItemIds: logItem.sourceItemIds // Log new field if present
    });

    try {
        // Add item (works for all types including the new generated_analysis)
        const itemId = await addContentItem(item);
        console.log(`Item saved with ID: ${itemId}. Type: ${item.type}`);

        // Trigger UI refresh via storage change
        chrome.storage.local.set({ lastSaveTimestamp: Date.now() }, () => { if (chrome.runtime.lastError) console.error("Error setting lastSaveTimestamp:", chrome.runtime.lastError); else console.log("Set lastSaveTimestamp to trigger UI refresh."); });

        // Trigger background analysis ONLY for screenshots (using reverted logic)
        if (item.type === 'screenshot' && item.content && typeof item.content === 'string' && item.content.startsWith('data:image')) {
            console.log(`Triggering analysis for screenshot ID: ${itemId}`);
            // Run analysis async, don't wait for it
            analyzeScreenshotAndUpdate(itemId, item.content).catch(analysisError => {
                 console.error(`[${itemId}] BG analysis failed:`, analysisError);
                 // Update DB item to reflect analysis failure
                 updateContentItem(itemId, { analysis: { error: `BG analysis failed: ${analysisError.message}` }, analysisCompleted: false, analysisFailed: true })
                    .catch(dbUpdateError => console.error(`[${itemId}] Failed update DB analysis error status:`, dbUpdateError));
            });
        }
        return itemId; // Return the ID of the saved item
    } catch (error) {
        console.error("Error during saveContent:", error);
        throw error; // Re-throw error for the caller to handle
    }
}

// ... (analyzeScreenshotAndUpdate function remains the same as background_js_save_analysis_v3) ...
async function analyzeScreenshotAndUpdate(itemId, imageDataUrl) {
    console.log(`[${itemId}] Starting analysis pipeline...`);
    const analysisResults = {}; let analysisOverallSuccess = true;
    try {
        // Prompts from reverted version
        const prompts = {
            description: "Describe this image concisely.",
            diagram_chart: "Analyze this image. If it contains a chart, graph, or diagram, extract the key data points, labels, and title into a structured JSON object. If not, respond with {\"contains_diagram\": false}.",
            layout: "Analyze the layout of this webpage screenshot. Identify key structural elements (like header, footer, main content, sidebar, navigation, forms) and their approximate locations (e.g., top, bottom, left, right, center). Provide the analysis as a JSON object like {\"header\": \"top\", \"main_content\": \"center\", ...}. If it's not a webpage screenshot, respond with {\"is_webpage_layout\": false}.",
        };
        // Run analyses sequentially
        try { console.log(`[${itemId}] Requesting description...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.description); analysisResults.description = extractTextFromResult(r); console.log(`[${itemId}] Description received.`); } catch (e) { console.error(`[${itemId}] Desc analysis failed:`, e); analysisResults.descriptionError = e.message; analysisOverallSuccess = false; }
        try { console.log(`[${itemId}] Requesting diagram/chart analysis...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.diagram_chart); const t = extractTextFromResult(r); if (t) { analysisResults.diagramData = tryParseJson(t, "diagram/chart"); console.log(`[${itemId}] Diagram/Chart analysis processed.`); if (analysisResults.diagramData?.contains_diagram === false) analysisResults.diagramData = null; } else { analysisResults.diagramData = { error: "No text content received." }; analysisOverallSuccess = false; } } catch (e) { console.error(`[${itemId}] Diagram/Chart analysis failed:`, e); analysisResults.diagramError = e.message; analysisOverallSuccess = false; }
        try { console.log(`[${itemId}] Requesting layout analysis...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.layout); const t = extractTextFromResult(r); if (t) { analysisResults.layout = tryParseJson(t, "layout"); console.log(`[${itemId}] Layout analysis processed.`); if (analysisResults.layout?.is_webpage_layout === false) analysisResults.layout = null; } else { analysisResults.layout = { error: "No text content received." }; analysisOverallSuccess = false; } } catch (e) { console.error(`[${itemId}] Layout analysis failed:`, e); analysisResults.layoutError = e.message; analysisOverallSuccess = false; }
        // Update DB
        console.log(`[${itemId}] Updating database item with analysis results:`, analysisResults);
        await updateContentItem(itemId, { analysis: analysisResults, analysisCompleted: true, analysisFailed: !analysisOverallSuccess });
        console.log(`[${itemId}] Database item updated with analysis.`);
        // Trigger storage update AFTER analysis completes
        chrome.storage.local.set({ lastAnalysisTimestamp: Date.now() }, () => { if (chrome.runtime.lastError) console.error("Error setting lastAnalysisTimestamp:", chrome.runtime.lastError); });
    } catch (error) {
        console.error(`[${itemId}] Critical failure in analysis pipeline:`, error);
        try { await updateContentItem(itemId, { analysis: { error: `Critical failure: ${error.message}` }, analysisCompleted: false, analysisFailed: true }); }
        catch (dbError) { console.error(`[${itemId}] Failed to update DB with critical error status:`, dbError); }
    }
}

// ... (cropImageCanvas function remains the same as background_js_save_analysis_v3) ...
async function cropImageCanvas(dataUrl, rect, devicePixelRatio) {
    console.warn("Attempting crop via direct Canvas/createImageBitmap...");
    let imageBitmap; // Declare here for access in catch
    try {
        const response = await fetch(dataUrl); if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const imageBlob = await response.blob(); console.log(`Canvas Crop: Blob created (type: ${imageBlob.type}, size: ${imageBlob.size})`);
        imageBitmap = await createImageBitmap(imageBlob); console.log(`Canvas Crop: ImageBitmap created (${imageBitmap.width}x${imageBitmap.height})`);
        const canvasWidth = Math.round(rect.width * devicePixelRatio);
        const canvasHeight = Math.round(rect.height * devicePixelRatio);
        // Add validation for canvas dimensions
        if (canvasWidth <= 0 || canvasHeight <= 0) {
             imageBitmap.close(); // Clean up bitmap
             throw new Error(`Invalid canvas dimensions calculated: ${canvasWidth}x${canvasHeight}`);
        }
        const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error("Failed to get 2D context.");
        const sx = Math.round(rect.x * devicePixelRatio); const sy = Math.round(rect.y * devicePixelRatio); const sWidth = Math.round(rect.width * devicePixelRatio); const sHeight = Math.round(rect.height * devicePixelRatio);
        console.log(`Canvas Crop: Canvas Size = ${canvas.width}x${canvas.height}`); console.log(`Canvas Crop: Draw Params: sx=${sx}, sy=${sy}, sWidth=${sWidth}, sHeight=${sHeight}`);
        // Add clamping from fixed version
        const clamped_sx = Math.max(0, sx); const clamped_sy = Math.max(0, sy); const clamped_sWidth = Math.max(0, Math.min(sWidth, imageBitmap.width - clamped_sx)); const clamped_sHeight = Math.max(0, Math.min(sHeight, imageBitmap.height - clamped_sy));
        if (clamped_sWidth <= 0 || clamped_sHeight <= 0) {
             console.warn("Canvas Crop: Clamped source dimensions are zero or negative, cannot draw.");
             imageBitmap.close(); // Clean up bitmap
             return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Return minimal transparent PNG
        }
        console.log(`Canvas Crop: Clamped Draw Params: sx=${clamped_sx}, sy=${clamped_sy}, sWidth=${clamped_sWidth}, sHeight=${clamped_sHeight}`);
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(imageBitmap, clamped_sx, clamped_sy, clamped_sWidth, clamped_sHeight, 0, 0, canvas.width, canvas.height);
        console.log("Canvas Crop: ImageBitmap drawn."); imageBitmap.close(); // Close bitmap after drawing
        const resultBlob = await canvas.convertToBlob({ type: 'image/png' }); if (!resultBlob) throw new Error("Canvas generated null blob.");
        console.log("Canvas Crop: Blob converted.");
        // Convert blob back to data URL using FileReader
        return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => { if (reader.result && typeof reader.result === 'string' && reader.result.startsWith('data:image/png')) { console.log("Canvas Crop: Blob converted to data URL."); resolve(reader.result); } else { reject(new Error("FileReader failed.")); } }; reader.onerror = (e) => { console.error("Canvas Crop: FileReader error:", e); reject(new Error(`FileReader error: ${e}`)); }; reader.readAsDataURL(resultBlob); });
    } catch (error) {
        console.error("Error during cropImageCanvas:", error);
        if (imageBitmap?.close) imageBitmap.close(); // Ensure cleanup on error
        throw error;
    }
}

// --- Utility Functions ---
// ... (extractTextFromResult, tryParseJson remain the same as background_js_save_analysis_v3) ...
function extractTextFromResult(result) { try { const text = result?.candidates?.[0]?.content?.parts?.[0]?.text; if (typeof text === 'string') return text; } catch (e) { console.error("Error accessing text:", e, result); } console.warn("Could not extract text:", result); return null; }
function tryParseJson(text, context = "data") { if (!text || typeof text !== 'string') { console.warn(`[${context}] Invalid input for JSON.`); return null; } let jsonString = text.trim(); const m = jsonString.match(/```json\s*([\s\S]*?)\s*```/); if (m && m[1]) { jsonString = m[1].trim(); console.log(`[${context}] Extracted JSON from markdown.`); } if (!jsonString.startsWith('{') && !jsonString.startsWith('[')) { console.warn(`[${context}] Text not JSON:`, text.substring(0, 200)); return { text_summary: text }; } try { const p = JSON.parse(jsonString); console.log(`[${context}] Parsed JSON.`); return p; } catch (e) { console.error(`[${context}] Failed to parse JSON:`, e, "Attempted:", jsonString.substring(0, 200), "Original:", text.substring(0, 200)); return { text_summary: text, parse_error: e.message }; } }


// --- Service Worker Initialization Log ---
console.log("WebInsight Service Worker (Save Analysis - v3 + Source Count) started.");
