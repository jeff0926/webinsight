// js/background.js - Service Worker (No Offscreen API)

// --- Imports ---
import { initDB, addContentItem, getAllContentItems, updateContentItem, deleteContentItem } from './lib/db.js';
import { analyzeImageWithGemini } from './lib/api.js';

// --- Constants ---
// No longer needed: const OFFSCREEN_DOCUMENT_PATH = '/html/offscreen.html';

// --- Service Worker Lifecycle ---
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`WebInsight extension ${details.reason}. Previous version: ${details.previousVersion}`);
    await setupContextMenu();
    await initDB();
    if (details.reason === 'install') {
        chrome.storage.sync.set({ theme: 'system' });
        console.log("Default settings applied.");
    }
});

// --- Context Menu Setup ---
async function setupContextMenu() {
    chrome.contextMenus.create({
        id: "saveSelectionWebInsight",
        title: "Save selected text to WebInsight",
        contexts: ["selection"]
    });
    console.log("Context menu item created/updated.");
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "saveSelectionWebInsight" && info.selectionText && tab) {
        console.log("Context menu save triggered for:", info.selectionText);
        saveContent({
            type: 'selection',
            content: info.selectionText,
            url: tab.url || info.pageUrl,
            title: `Selection from: ${tab.title || 'Untitled Page'}`,
            tags: ['selection']
        }).then(id => console.log(`Context menu selection saved with ID: ${id}`))
          .catch(error => console.error("Error saving selection from context menu:", error));
    } else {
         console.warn("Context menu clicked, but no selection text or tab info found.", info);
    }
});

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in background:", message, "From:", sender.tab ? `Tab ${sender.tab.id}` : "Extension");
    let isResponseAsync = false;

    switch (message.type) {
        case "SAVE_PAGE_CONTENT":
            isResponseAsync = true;
            handleSavePageContent()
                .then(id => sendResponse({ success: true, id: id }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "SAVE_SELECTION":
            isResponseAsync = true;
            handleSaveSelection()
                .then(id => sendResponse({ success: true, id: id }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "CAPTURE_VISIBLE_TAB":
            isResponseAsync = true;
            handleCaptureVisibleTab()
                .then(id => sendResponse({ success: true, id: id }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "INITIATE_AREA_CAPTURE":
             isResponseAsync = true;
             handleInitiateAreaCapture()
                .then(response => sendResponse(response))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "CAPTURE_AREA_FROM_CONTENT": // Comes from content script
            isResponseAsync = true;
            handleCaptureArea(message.payload, sender.tab) // Pass payload and sender.tab
                 .then(id => sendResponse({ success: true, id: id }))
                 .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "GET_ALL_SAVED_CONTENT":
            isResponseAsync = true;
            getAllContentItems()
                .then(items => sendResponse({ success: true, payload: items }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;
        case "DELETE_ITEM":
            isResponseAsync = true;
            const itemId = message.payload?.id;
            if (typeof itemId !== 'number') {
                sendResponse({ success: false, error: "Invalid item ID provided." });
                isResponseAsync = false;
            } else {
                deleteContentItem(itemId)
                    .then(() => sendResponse({ success: true }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
            }
            break;
        default:
            console.warn("Unhandled message type in background:", message.type);
            break;
    }
    return isResponseAsync;
});

// --- Utility Functions ---
async function getCurrentTab() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0 && tabs[0] && tabs[0].id !== undefined && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
            console.log("Found active tab:", tabs[0].id, tabs[0].url);
            return tabs[0];
        } else {
            throw new Error("Could not find a valid active tab in the current window.");
        }
    } catch (error) {
        console.error("Error querying for active tab:", error);
        throw new Error(`Failed to get active tab: ${error.message}`);
    }
}

// --- Specific Action Handler Functions ---
async function handleSavePageContent() {
    const tab = await getCurrentTab();
    try {
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({ url: window.location.href, title: document.title, text: document.body.innerText || "", html: document.documentElement.outerHTML || "" })
        });
        if (!injectionResults || !injectionResults[0] || !injectionResults[0].result) throw new Error("Failed to get page content.");
        const pageContent = injectionResults[0].result;
        console.log("Page content received:", pageContent.title);
        return await saveContent({ type: 'page', content: pageContent.text, htmlContent: pageContent.html, url: pageContent.url, title: pageContent.title || 'Untitled Page', tags: ['page'] });
    } catch (error) { console.error("Error saving page content:", error); throw error; }
}

async function handleSaveSelection() {
    const tab = await getCurrentTab();
     try {
        const injectionResults = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString().trim() });
        if (!injectionResults || !injectionResults[0]) throw new Error("Failed to get selection.");
        const selectedText = injectionResults[0].result;
        if (!selectedText) throw new Error("No text selected.");
        console.log("Selection received:", selectedText.substring(0, 100) + "...");
        return await saveContent({ type: 'selection', content: selectedText, url: tab.url, title: `Selection from: ${tab.title || 'Untitled Page'}`, tags: ['selection'] });
     } catch (error) { console.error("Error saving selection:", error); throw error; }
}

async function handleCaptureVisibleTab() {
    const tab = await getCurrentTab();
    if (!tab.windowId) throw new Error("Active tab missing window ID.");
    try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        if (!dataUrl) throw new Error("Capture returned empty.");
        console.log("Visible tab captured.");
        return await saveContent({ type: 'screenshot', content: dataUrl, contentType: 'image/png', url: tab.url, title: `Screenshot of ${tab.title || 'Untitled Page'}`, tags: ['screenshot', 'visible'] });
    } catch (error) { console.error("Error capturing visible tab:", error); throw error; }
}

async function handleInitiateAreaCapture() {
    const tab = await getCurrentTab();
     try {
         const response = await chrome.tabs.sendMessage(tab.id, { type: "START_AREA_SELECTION" });
         console.log("Response from content script (initiate area capture):", response);
         if (response && response.success) return { success: true, message: "Area selection started." };
         else throw new Error(response?.error || "Failed to initiate area selection.");
     } catch (error) {
          console.error("Error initiating area capture:", error);
          if (error.message.includes("Could not establish connection")) throw new Error("Could not communicate with page. Try reloading.");
          throw error;
     }
}

/**
 * Handles the actual capture and cropping after receiving coordinates from content script.
 * ** MODIFIED to use cropImageCanvas as Offscreen API is removed **
 */
async function handleCaptureArea(payload, tab) {
    const { rect, devicePixelRatio, url, title } = payload;
    if (!rect || !tab || !tab.windowId) throw new Error("Invalid payload or tab info for area capture.");
    console.log("Received capture request for area:", rect, "on Tab:", tab.id);

    try {
        const fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        if (!fullDataUrl) throw new Error("Capture for area cropping returned empty.");

        // ** CHANGE: Use direct Canvas cropping (less reliable) instead of Offscreen **
        console.warn("Using direct Canvas cropping in Service Worker (Offscreen API removed/unavailable). This might be unreliable.");
        const croppedDataUrl = await cropImageCanvas(fullDataUrl, rect, devicePixelRatio);
        // const croppedDataUrl = await cropImageOffscreen(fullDataUrl, rect, devicePixelRatio); // Keep commented out

        console.log("Image cropped successfully (using Canvas).");

        return await saveContent({
            type: 'screenshot',
            content: croppedDataUrl,
            contentType: 'image/png',
            url: url || tab.url,
            title: title ? `Area from: ${title}` : `Area Screenshot`,
            tags: ['screenshot', 'area']
        });
    } catch (error) {
        console.error("Error capturing or cropping area:", error);
        throw error;
    }
}

// --- Core Logic Functions (saveContent, analyzeScreenshotAndUpdate) ---
// Unchanged from previous version...
async function saveContent(item) {
    if ((item.type === 'page' || item.type === 'selection') && item.content && typeof item.content === 'string') {
        try { item.wordCount = item.content.split(/\s+/).filter(Boolean).length; item.readingTimeMinutes = Math.ceil(item.wordCount / 200); }
        catch (statError) { console.error("Error calculating statistics:", statError); item.wordCount = null; item.readingTimeMinutes = null; }
    }
    console.log("Attempting to save item:", { ...item, content: item.content?.substring(0,100) + '...' });
    try {
        const itemId = await addContentItem(item);
        console.log(`Item saved with ID: ${itemId}.`);
        if (item.type === 'screenshot' && item.content && item.content.startsWith('data:image')) {
            console.log(`Triggering analysis for screenshot ID: ${itemId}`);
            analyzeScreenshotAndUpdate(itemId, item.content).catch(analysisError => {
                 console.error(`[${itemId}] Background analysis process failed:`, analysisError);
                 updateContentItem(itemId, { analysis: { error: `Background analysis failed: ${analysisError.message}` }, analysisCompleted: false, analysisFailed: true })
                    .catch(dbUpdateError => console.error(`[${itemId}] Failed to update DB with analysis error status:`, dbUpdateError));
            });
        }
        return itemId;
    } catch (error) { console.error("Error during saveContent:", error); throw error; }
}
async function analyzeScreenshotAndUpdate(itemId, imageDataUrl) {
    console.log(`[${itemId}] Starting analysis pipeline...`);
    const analysisResults = {}; let analysisOverallSuccess = true;
    try {
        const prompts = { description: "Describe this image concisely.", diagram_chart: "Analyze this image. If it contains a chart, graph, or diagram, extract the key data points, labels, and title into a structured JSON object. If not, respond with {\"contains_diagram\": false}.", layout: "Analyze the layout of this webpage screenshot. Identify key structural elements (like header, footer, main content, sidebar, navigation, forms) and their approximate locations (e.g., top, bottom, left, right, center). Provide the analysis as a JSON object like {\"header\": \"top\", \"main_content\": \"center\", ...}. If it's not a webpage screenshot, respond with {\"is_webpage_layout\": false}.", };
        try { console.log(`[${itemId}] Requesting description...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.description); analysisResults.description = extractTextFromResult(r); console.log(`[${itemId}] Description received.`); } catch (e) { console.error(`[${itemId}] Description analysis failed:`, e); analysisResults.descriptionError = e.message; analysisOverallSuccess = false; }
        try { console.log(`[${itemId}] Requesting diagram/chart analysis...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.diagram_chart); const t = extractTextFromResult(r); if (t) { analysisResults.diagramData = tryParseJson(t, "diagram/chart"); console.log(`[${itemId}] Diagram/Chart analysis processed.`); } else { analysisResults.diagramData = { error: "No text content received." }; analysisOverallSuccess = false; } } catch (e) { console.error(`[${itemId}] Diagram/Chart analysis failed:`, e); analysisResults.diagramError = e.message; analysisOverallSuccess = false; }
        try { console.log(`[${itemId}] Requesting layout analysis...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.layout); const t = extractTextFromResult(r); if (t) { analysisResults.layout = tryParseJson(t, "layout"); console.log(`[${itemId}] Layout analysis processed.`); } else { analysisResults.layout = { error: "No text content received." }; analysisOverallSuccess = false; } } catch (e) { console.error(`[${itemId}] Layout analysis failed:`, e); analysisResults.layoutError = e.message; analysisOverallSuccess = false; }
        console.log(`[${itemId}] Updating database item with analysis results:`, analysisResults);
        await updateContentItem(itemId, { analysis: analysisResults, analysisCompleted: true, analysisFailed: !analysisOverallSuccess });
        console.log(`[${itemId}] Database item updated with analysis.`);
    } catch (error) {
        console.error(`[${itemId}] Critical failure in analysis pipeline:`, error);
        try { await updateContentItem(itemId, { analysis: { error: `Critical analysis failure: ${error.message}` }, analysisCompleted: false, analysisFailed: true }); }
        catch (dbError) { console.error(`[${itemId}] Failed to update DB with critical error status:`, dbError); }
    }
}

// --- Image Cropping Helper (Canvas Method) ---
// Using direct Canvas in Service Worker. May be unreliable.
async function cropImageCanvas(dataUrl, rect, devicePixelRatio) {
     console.warn("Attempting crop via direct Canvas in Service Worker (may be unreliable)...");
     return new Promise((resolve, reject) => {
         const img = new Image();
         img.onload = () => {
             const canvas = new OffscreenCanvas(Math.round(rect.width * devicePixelRatio), Math.round(rect.height * devicePixelRatio));
             const ctx = canvas.getContext('2d');
             if (!ctx) return reject(new Error("Failed to get 2D context from OffscreenCanvas"));

             const sx = Math.round(rect.x * devicePixelRatio);
             const sy = Math.round(rect.y * devicePixelRatio);
             const sWidth = Math.round(rect.width * devicePixelRatio);
             const sHeight = Math.round(rect.height * devicePixelRatio);

             console.log(`Canvas Size = ${canvas.width}x${canvas.height}`);
             console.log(`Draw Params: sx=${sx}, sy=${sy}, sWidth=${sWidth}, sHeight=${sHeight}`);

             ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

             canvas.convertToBlob({ type: 'image/png' }).then(blob => {
                 const reader = new FileReader();
                 reader.onloadend = () => resolve(reader.result);
                 reader.onerror = (e) => reject(new Error(`FileReader error: ${e}`));
                 reader.readAsDataURL(blob);
             }).catch(reject);
         };
         img.onerror = (error) => reject(new Error("Failed to load image for cropping."));
         img.src = dataUrl;
     });
 }

// --- Utility Functions (extractTextFromResult, tryParseJson) ---
// Unchanged...
function extractTextFromResult(result) { try { if (result?.candidates?.[0]?.content?.parts?.[0]?.text) return result.candidates[0].content.parts[0].text; } catch (e) { console.error("Error accessing text:", e, result); } console.warn("Could not extract text:", result); return null; }
function tryParseJson(text, context = "data") { if (!text || typeof text !== 'string') { console.warn(`[${context}] Invalid input for JSON.`); return null; } let jsonString = text.trim(); const m = jsonString.match(/```json\s*([\s\S]*?)\s*```/); if (m && m[1]) { jsonString = m[1].trim(); console.log(`[${context}] Extracted JSON from markdown.`); } if (!jsonString.startsWith('{') && !jsonString.startsWith('[')) { console.warn(`[${context}] Text not JSON:`, text); return { text_summary: text }; } try { const p = JSON.parse(jsonString); console.log(`[${context}] Parsed JSON.`); return p; } catch (e) { console.error(`[${context}] Failed to parse JSON:`, e, "Original:", text); return { text_summary: text, parse_error: e.message }; } }

console.log("WebInsight Service Worker started.");
