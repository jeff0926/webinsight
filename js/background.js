// js/background.js - Service Worker with Google Drive backup support and PDF functionality

// --- Imports ---
import { initDB, addContentItem, getAllContentItems, updateContentItem, deleteContentItem, addTag, getTagByName, getAllTags, deleteTag, linkTagToContent, unlinkTagFromContent, getTagIdsByContentId, getContentIdsByTagId, getTagsByIds, getContentItemsByIds, getAllContentTags } from './lib/db.js';
import { analyzeImageWithGemini, analyzeTextWithGemini, getApiKey } from './lib/api.js';
import { generatePagePDF, pdfToDataUrl, estimatePDFSize, PDFPresets } from './lib/pdf-generator.js';
import { localAI } from './lib/local-ai.js';

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
            // Set default auto-backup to disabled
            chrome.storage.local.set({ autoBackup: 'disabled' }, () => {
                if (chrome.runtime.lastError) console.error("Error setting default auto-backup:", chrome.runtime.lastError);
                else console.log("Default auto-backup setting applied.");
            });
        }
    } catch (error) {
        console.error("Error during onInstalled setup:", error);
    }
});

// --- Auto-backup scheduling ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'webinsight-auto-backup') {
        console.log("Auto-backup alarm triggered");
        await performAutoBackup();
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
    // Existing text selection context menu
    chrome.contextMenus.update("saveSelectionWebInsight", {
         title: "Save selected text to WebInsight", contexts: ["selection"]
     }, () => {
         if (chrome.runtime.lastError) {
             console.log("Context menu item 'saveSelectionWebInsight' not found, creating it.");
             chrome.contextMenus.create({ id: "saveSelectionWebInsight", title: "Save selected text to WebInsight", contexts: ["selection"] });
         } else { console.log("Context menu item 'saveSelectionWebInsight' updated/verified successfully."); }
     });

    // New PDF save context menu
    chrome.contextMenus.update("savePageAsPDFWebInsight", {
         title: "Save page as PDF to WebInsight", contexts: ["page"]
     }, () => {
         if (chrome.runtime.lastError) {
             console.log("Context menu item 'savePageAsPDFWebInsight' not found, creating it.");
             chrome.contextMenus.create({ 
                id: "savePageAsPDFWebInsight", 
                title: "Save page as PDF to WebInsight", 
                contexts: ["page"] 
            });
         } else { 
            console.log("Context menu item 'savePageAsPDFWebInsight' updated/verified successfully."); 
        }
     });
}

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "saveSelectionWebInsight") {
        if (info.selectionText && tab) {
             console.log("Context menu save triggered for:", info.selectionText.substring(0, 50) + '...');
             saveContent({
                 type: 'selection',
                 content: info.selectionText,
                 url: tab.url || info.pageUrl,
                 title: `Selection from: ${tab.title || 'Untitled Page'}`
             }).then(id => console.log(`Context menu selection saved with ID: ${id}`))
               .catch(error => console.error("Error saving selection from context menu:", error));
        } else { console.warn("Context menu clicked, but no selection text or tab info found.", info); }
    } else if (info.menuItemId === "savePageAsPDFWebInsight") {
        if (tab && tab.id) {
            console.log("Context menu PDF save triggered for:", tab.title || tab.url);
            handleSavePageAsPDF({ preset: 'standard' })
                .then(id => console.log(`Context menu PDF saved with ID: ${id}`))
                .catch(error => console.error("Error saving PDF from context menu:", error));
        } else {
            console.warn("Context menu PDF clicked, but no valid tab found.", info);
        }
    }
});

// --- Storage change listener for auto-backup settings ---
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.autoBackup) {
        console.log("Auto-backup setting changed:", changes.autoBackup);
        updateAutoBackupSchedule(changes.autoBackup.newValue);
    }
});

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const senderType = sender.tab ? `Content Script (Tab ${sender.tab.id})` : "Extension UI (Panel/Options/Viewer)";
    console.log("Message received in background:", message, "From:", senderType);
    let isResponseAsync = true;

    switch (message.type) {
        // --- Content Saving ---
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
        case "SAVE_PAGE_AS_PDF":
            handleSavePageAsPDF(message.payload)
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
                handleGetKeyPoints(keyPointsTagId)
                    .then(result => {
                        sendResponse(result);
                    })
                    .catch(error => {
                        console.error(`Critical error in handleGetKeyPoints for tag ${keyPointsTagId}:`, error);
                        sendResponse({ success: false, error: `Failed to generate/save key points: ${error.message}` });
                    });
            }
            break;

        case "GENERATE_PDF_REPORT_FOR_TAG":
            const reportTagId = message.payload?.tagId;
            if (typeof reportTagId !== 'number') { 
                sendResponse({ success: false, error: "Invalid tagId provided for PDF report generation." }); 
                isResponseAsync = false; 
            } else {
                handleGeneratePDFReport(reportTagId)
                    .then(result => {
                        sendResponse(result);
                    })
                    .catch(error => {
                        console.error(`Critical error in handleGeneratePDFReport for tag ${reportTagId}:`, error);
                        sendResponse({ success: false, error: `Failed to generate PDF report: ${error.message}` });
                    });
            }
            break;


        case "INITIALIZE_LOCAL_AI":
            handleInitializeLocalAI()
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;

        case "SUGGEST_TAGS_FOR_CONTENT":
            const suggestContent = message.payload?.content;
            if (!suggestContent || typeof suggestContent !== 'string') {
                sendResponse({ success: false, error: "Invalid content for tag suggestions." });
                isResponseAsync = false;
            } else {
                handleSuggestTags(suggestContent)
                    .then(result => sendResponse(result))
                    .catch(error => sendResponse({ success: false, error: error.message }));
            }
            break;

        case "GENERATE_EMBEDDINGS_FOR_TAGS":
            handleGenerateTagEmbeddings()
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            break;

        case "GET_LOCAL_AI_STATUS":
            sendResponse({ 
                success: true, 
                payload: {
                    isReady: localAI.isReady(),
                    memoryInfo: localAI.getMemoryInfo()
                }
            });
            isResponseAsync = false;
            break;




        // --- Default ---
        default:
            console.warn("Unhandled message type in background:", message.type);
            isResponseAsync = false;
            break;
    }
    return isResponseAsync;
});

// --- Auto-backup Functions ---
async function updateAutoBackupSchedule(setting) {
    try {
        // Clear existing alarm
        await chrome.alarms.clear('webinsight-auto-backup');
        
        if (setting === 'disabled') {
            console.log("Auto-backup disabled");
            return;
        }
        
        let periodInMinutes;
        switch (setting) {
            case 'daily':
                periodInMinutes = 24 * 60; // 24 hours
                break;
            case 'weekly':
                periodInMinutes = 7 * 24 * 60; // 7 days
                break;
            case 'monthly':
                periodInMinutes = 30 * 24 * 60; // 30 days
                break;
            default:
                console.warn("Unknown auto-backup setting:", setting);
                return;
        }
        
        await chrome.alarms.create('webinsight-auto-backup', {
            delayInMinutes: periodInMinutes,
            periodInMinutes: periodInMinutes
        });
        
        console.log(`Auto-backup scheduled: ${setting} (every ${periodInMinutes} minutes)`);
    } catch (error) {
        console.error("Failed to update auto-backup schedule:", error);
    }
}

async function performAutoBackup() {
    try {
        console.log("Performing auto-backup...");
        
        // Check if Google Drive is configured
        const settings = await new Promise(resolve => {
            chrome.storage.local.get(['googleClientId'], resolve);
        });
        
        if (!settings.googleClientId) {
            console.log("Auto-backup skipped: Google Drive not configured");
            return;
        }
        
        // Get all data
        const [contentItems, tags, contentTags] = await Promise.all([
            getAllContentItems(),
            getAllTags(),
            getAllContentTags()
        ]);
        
        // Note: In a real implementation, you would need to handle Google Drive authentication
        // and export here. For now, we'll just log that auto-backup was attempted.
        console.log("Auto-backup completed:", {
            contentItems: contentItems.length,
            tags: tags.length,
            contentTags: contentTags.length
        });
        
    } catch (error) {
        console.error("Auto-backup failed:", error);
    }
}

// --- Utility Functions ---
async function getCurrentTab() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0 && tabs[0]) {
            const tab = tabs[0];
            if (tab.id !== undefined && tab.id !== chrome.tabs.TAB_ID_NONE) {
                if (tab.url && (tab.url.startsWith('http:') || tab.url.startsWith('https:') || tab.url.startsWith('file:'))) {
                    return tab;
                } else { throw new Error(`Active tab has inaccessible URL (${tab.url}).`); }
            } else { throw new Error(`Active tab has invalid ID (${tab.id}).`); }
        } else { throw new Error("Could not find active tab."); }
    } catch (error) { console.error("Error querying active tab:", error); throw new Error(`Failed get active tab: ${error.message}`); }
}

// --- Specific Action Handler Functions ---
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

async function handleSavePageAsPDF(options = {}) {
    console.log("[PDF] Starting page-to-PDF save process");
    const tab = await getCurrentTab();
    
    try {
        // Use the provided options or default to 'standard' preset
        const pdfOptions = options.preset ? PDFPresets[options.preset] : PDFPresets.standard;
        const finalOptions = { ...pdfOptions, ...options };
        
        console.log(`[PDF] Generating PDF for tab ${tab.id} with options:`, finalOptions);
        
        // Generate the PDF using Chrome DevTools Protocol
        const pdfBase64 = await generatePagePDF(tab.id, finalOptions);
        
        if (!pdfBase64) {
            throw new Error("PDF generation returned empty data");
        }
        
        // Convert to data URL for storage
        const pdfDataUrl = pdfToDataUrl(pdfBase64);
        const fileSize = estimatePDFSize(pdfBase64);
        
        console.log(`[PDF] PDF generated successfully. Size: ${Math.round(fileSize / 1024)}KB`);
        
        // Get additional page metadata
        let pageMetadata = {};
        try {
            const injectionResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({
                    url: window.location.href,
                    title: document.title,
                    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || null,
                    keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content') || null,
                    lang: document.documentElement.lang || null,
                    characterCount: document.body.innerText?.length || 0
                })
            });
            
            if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                pageMetadata = injectionResults[0].result;
            }
        } catch (metadataError) {
            console.warn("[PDF] Could not extract page metadata:", metadataError);
            pageMetadata = {
                url: tab.url,
                title: tab.title || 'Untitled Page',
                description: null,
                keywords: null,
                lang: null,
                characterCount: 0
            };
        }
        
        // Create the content item for storage
        const pdfItem = {
            type: 'pdf',
            title: `PDF: ${pageMetadata.title || 'Untitled Page'}`,
            content: pdfDataUrl,
            contentType: 'application/pdf',
            url: pageMetadata.url,
            
            // PDF-specific metadata
            fileSize: fileSize,
            pdfOptions: finalOptions,
            
            // Page metadata
            pageLang: pageMetadata.lang,
            pageDescription: pageMetadata.description,
            pageKeywords: pageMetadata.keywords,
            characterCount: pageMetadata.characterCount,
            
            // Standard fields
            htmlContent: null, // PDFs don't have HTML content
            links: [], // Could extract links in future if needed
            wordCount: null, // PDFs don't have word count like text
            readingTimeMinutes: null,
            analysis: null,
            analysisCompleted: false,
            analysisFailed: false
        };
        
        console.log("[PDF] Saving PDF item to database");
        const itemId = await saveContent(pdfItem);
        
        console.log(`[PDF] PDF saved successfully with ID: ${itemId}`);
        return itemId;
        
    } catch (error) {
        console.error("[PDF] Error in handleSavePageAsPDF:", error);
        throw error;
    }
}

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

async function handleCaptureArea(payload, tab) {
    const { rect, devicePixelRatio, url, title } = payload;
    if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number' || typeof rect.width !== 'number' || typeof rect.height !== 'number') throw new Error("Invalid rectangle data.");
    if (!tab || !tab.windowId) throw new Error("Invalid tab info.");
    let effectiveDevicePixelRatio = devicePixelRatio;
    if (!effectiveDevicePixelRatio || typeof effectiveDevicePixelRatio !== 'number' || effectiveDevicePixelRatio <= 0) { console.warn("Invalid DPR, defaulting to 1."); effectiveDevicePixelRatio = 1; }
    console.log("Received capture request for area:", rect, "on Tab:", tab.id);
    try {
        const fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        if (!fullDataUrl) throw new Error("Capture empty.");
        console.warn("Using direct Canvas cropping...");
        const croppedDataUrl = await cropImageCanvas(fullDataUrl, rect, effectiveDevicePixelRatio);
        console.log("Image cropped (Canvas).");
        return await saveContent({ type: 'screenshot', content: croppedDataUrl, contentType: 'image/png', url: url || tab.url, title: title ? `Area from: ${title}` : `Area Screenshot` });
    } catch (error) { console.error("Error capturing/cropping area:", error); throw error; }
}

async function handleGetKeyPoints(tagId) {
    console.log(`[KeyPoints] Starting process for tag ID: ${tagId}`);
    let sourceInfo = `Generated from items tagged ID ${tagId}.`;
    let tagName = `Tag ${tagId}`;
    let sourceItemIds = [];
    let uniqueSourceUrls = new Set();

    try {
        try {
            const tags = await getTagsByIds([tagId]);
            if (tags && tags.length > 0 && tags[0].name) {
                tagName = tags[0].name;
                sourceInfo = `Generated from items tagged "${tagName}" (ID ${tagId}).`;
            } else { console.warn(`[KeyPoints] Could not fetch name for tag ID: ${tagId}`); }
        } catch (tagFetchError) { console.warn(`[KeyPoints] Error fetching tag name for ID ${tagId}:`, tagFetchError); }

        const contentIds = await getContentIdsByTagId(tagId);
        if (!contentIds || contentIds.length === 0) {
            return { success: false, error: "No content items found for this tag." };
        }
        const items = await getContentItemsByIds(contentIds);
        const textItems = items
            .filter(item => (item.type === 'page' || item.type === 'selection') && item.content)
            .slice(0, MAX_ITEMS_FOR_SUMMARY);
        sourceItemIds = textItems.map(item => item.id);

        textItems.forEach(item => {
            if (item.url) {
                uniqueSourceUrls.add(item.url);
            }
        });
        const uniqueSourceCount = uniqueSourceUrls.size;

        if (textItems.length === 0) {
            return { success: false, error: "No text content found for this tag (only screenshots?)." };
        }

        sourceInfo = `Generated from ${textItems.length} item(s) (from ${uniqueSourceCount} unique source${uniqueSourceCount !== 1 ? 's' : ''}) tagged "${tagName}" (ID ${tagId}).`;
        if (items.length > textItems.length) sourceInfo += ` (Note: ${items.length - textItems.length} non-text items excluded.)`;
        if (contentIds.length > MAX_ITEMS_FOR_SUMMARY) sourceInfo += ` (Note: Limited to first ${MAX_ITEMS_FOR_SUMMARY} text items.)`;

        let combinedText = textItems.map(item => `--- Item ${item.id} (${item.title || 'No Title'}) ---\n${item.content}\n\n`).join('');
        const MAX_CHARS = 15000;
        if (combinedText.length > MAX_CHARS) {
             combinedText = combinedText.substring(0, MAX_CHARS) + "\n\n[... CONTENT TRUNCATED ...]";
             sourceInfo += " (Note: Input text was truncated.)";
        }

        const prompt = `Based *only* on the following text compiled from saved web content, please extract the main key points or provide a concise summary. Present the key points clearly, perhaps using bullet points:\n\n${combinedText}`;
        console.log(`[KeyPoints] Sending combined text to AI for tag ID: ${tagId}`);
        const analysisResponse = await analyzeTextWithGemini(combinedText, prompt);
        const keyPoints = extractTextFromResult(analysisResponse);
        if (!keyPoints) {
            throw new Error("AI analysis did not return usable text content.");
        }
        console.log(`[KeyPoints] Received key points for tag ID: ${tagId}`);

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

        return {
            success: true,
            newId: newId,
            sourceInfo: sourceInfo,
            keyPoints: keyPoints
        };

    } catch (error) {
        console.error(`[KeyPoints] Error during key points generation/saving for tag ${tagId}:`, error);
        return { success: false, error: error.message || "An unknown error occurred generating key points." };
    }
}

// --- Core Logic Functions ---
async function saveContent(item) {
    if ((item.type === 'page' || item.type === 'selection' || item.type === GENERATED_ITEM_TYPE) && item.content && typeof item.content === 'string') {
        try {
            item.wordCount = item.content.split(/\s+/).filter(Boolean).length;
            item.readingTimeMinutes = Math.ceil(item.wordCount / 200);
        } catch (statError) { console.error("Error calculating stats:", statError); item.wordCount = null; item.readingTimeMinutes = null; }
    } else if (item.type === 'screenshot' || item.type === 'pdf') {
        item.wordCount = null;
        item.readingTimeMinutes = null;
    }

    const logItem = { ...item };
    if (logItem.content && typeof logItem.content === 'string' && (logItem.content.startsWith('data:image') || logItem.content.startsWith('data:application/pdf'))) {
        logItem.content = logItem.content.substring(0, 50) + '...[binaryData]';
    } else if (logItem.content && typeof logItem.content === 'string') {
        logItem.content = logItem.content.substring(0, 100) + (logItem.content.length > 100 ? '...' : '');
    }
    if (logItem.htmlContent) {
        logItem.htmlContent = logItem.htmlContent.substring(0, 100) + '...[html]';
    } else {
         logItem.htmlContent = undefined;
    }

    console.log("Attempting to save item:", {
        type: logItem.type,
        title: logItem.title,
        url: logItem.url,
        contentPreview: logItem.content,
        htmlPreview: logItem.htmlContent,
        analysisType: logItem.analysisType,
        sourceTagIds: logItem.sourceTagIds,
        sourceItemIds: logItem.sourceItemIds,
        fileSize: logItem.fileSize
    });

    try {
        const itemId = await addContentItem(item);
        console.log(`Item saved with ID: ${itemId}. Type: ${item.type}`);

        chrome.storage.local.set({ lastSaveTimestamp: Date.now() }, () => { if (chrome.runtime.lastError) console.error("Error setting lastSaveTimestamp:", chrome.runtime.lastError); else console.log("Set lastSaveTimestamp to trigger UI refresh."); });

        if (item.type === 'screenshot' && item.content && typeof item.content === 'string' && item.content.startsWith('data:image')) {
            console.log(`Triggering analysis for screenshot ID: ${itemId}`);
            analyzeScreenshotAndUpdate(itemId, item.content).catch(analysisError => {
                 console.error(`[${itemId}] BG analysis failed:`, analysisError);
                 updateContentItem(itemId, { analysis: { error: `BG analysis failed: ${analysisError.message}` }, analysisCompleted: false, analysisFailed: true })
                    .catch(dbUpdateError => console.error(`[${itemId}] Failed update DB analysis error status:`, dbUpdateError));
            });
        }
        return itemId;
    } catch (error) {
        console.error("Error during saveContent:", error);
        throw error;
    }
}

async function analyzeScreenshotAndUpdate(itemId, imageDataUrl) {
    console.log(`[${itemId}] Starting analysis pipeline...`);
    const analysisResults = {}; let analysisOverallSuccess = true;
    try {
        const prompts = {
            description: "Describe this image concisely.",
            diagram_chart: "Analyze this image. If it contains a chart, graph, or diagram, extract the key data points, labels, and title into a structured JSON object. If not, respond with {\"contains_diagram\": false}.",
            layout: "Analyze the layout of this webpage screenshot. Identify key structural elements (like header, footer, main content, sidebar, navigation, forms) and their approximate locations (e.g., top, bottom, left, right, center). Provide the analysis as a JSON object like {\"header\": \"top\", \"main_content\": \"center\", ...}. If it's not a webpage screenshot, respond with {\"is_webpage_layout\": false}.",
        };
        try { console.log(`[${itemId}] Requesting description...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.description); analysisResults.description = extractTextFromResult(r); console.log(`[${itemId}] Description received.`); } catch (e) { console.error(`[${itemId}] Desc analysis failed:`, e); analysisResults.descriptionError = e.message; analysisOverallSuccess = false; }
        try { console.log(`[${itemId}] Requesting diagram/chart analysis...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.diagram_chart); const t = extractTextFromResult(r); if (t) { analysisResults.diagramData = tryParseJson(t, "diagram/chart"); console.log(`[${itemId}] Diagram/Chart analysis processed.`); if (analysisResults.diagramData?.contains_diagram === false) analysisResults.diagramData = null; } else { analysisResults.diagramData = { error: "No text content received." }; analysisOverallSuccess = false; } } catch (e) { console.error(`[${itemId}] Diagram/Chart analysis failed:`, e); analysisResults.diagramError = e.message; analysisOverallSuccess = false; }
        try { console.log(`[${itemId}] Requesting layout analysis...`); const r = await analyzeImageWithGemini(imageDataUrl, prompts.layout); const t = extractTextFromResult(r); if (t) { analysisResults.layout = tryParseJson(t, "layout"); console.log(`[${itemId}] Layout analysis processed.`); if (analysisResults.layout?.is_webpage_layout === false) analysisResults.layout = null; } else { analysisResults.layout = { error: "No text content received." }; analysisOverallSuccess = false; } } catch (e) { console.error(`[${itemId}] Layout analysis failed:`, e); analysisResults.layoutError = e.message; analysisOverallSuccess = false; }
        console.log(`[${itemId}] Updating database item with analysis results:`, analysisResults);
        await updateContentItem(itemId, { analysis: analysisResults, analysisCompleted: true, analysisFailed: !analysisOverallSuccess });
        console.log(`[${itemId}] Database item updated with analysis.`);
        chrome.storage.local.set({ lastAnalysisTimestamp: Date.now() }, () => { if (chrome.runtime.lastError) console.error("Error setting lastAnalysisTimestamp:", chrome.runtime.lastError); });
    } catch (error) {
        console.error(`[${itemId}] Critical failure in analysis pipeline:`, error);
        try { await updateContentItem(itemId, { analysis: { error: `Critical failure: ${error.message}` }, analysisCompleted: false, analysisFailed: true }); }
        catch (dbError) { console.error(`[${itemId}] Failed to update DB with critical error status:`, dbError); }
    }
}

async function cropImageCanvas(dataUrl, rect, devicePixelRatio) {
    console.warn("Attempting crop via direct Canvas/createImageBitmap...");
    let imageBitmap;
    try {
        const response = await fetch(dataUrl); if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const imageBlob = await response.blob(); console.log(`Canvas Crop: Blob created (type: ${imageBlob.type}, size: ${imageBlob.size})`);
        imageBitmap = await createImageBitmap(imageBlob); console.log(`Canvas Crop: ImageBitmap created (${imageBitmap.width}x${imageBitmap.height})`);
        const canvasWidth = Math.round(rect.width * devicePixelRatio);
        const canvasHeight = Math.round(rect.height * devicePixelRatio);
        if (canvasWidth <= 0 || canvasHeight <= 0) {
             imageBitmap.close();
             throw new Error(`Invalid canvas dimensions calculated: ${canvasWidth}x${canvasHeight}`);
        }
        const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error("Failed to get 2D context.");
        const sx = Math.round(rect.x * devicePixelRatio); const sy = Math.round(rect.y * devicePixelRatio); const sWidth = Math.round(rect.width * devicePixelRatio); const sHeight = Math.round(rect.height * devicePixelRatio);
        console.log(`Canvas Crop: Canvas Size = ${canvas.width}x${canvas.height}`); console.log(`Canvas Crop: Draw Params: sx=${sx}, sy=${sy}, sWidth=${sWidth}, sHeight=${sHeight}`);
        const clamped_sx = Math.max(0, sx); const clamped_sy = Math.max(0, sy); const clamped_sWidth = Math.max(0, Math.min(sWidth, imageBitmap.width - clamped_sx)); const clamped_sHeight = Math.max(0, Math.min(sHeight, imageBitmap.height - clamped_sy));
        if (clamped_sWidth <= 0 || clamped_sHeight <= 0) {
             console.warn("Canvas Crop: Clamped source dimensions are zero or negative, cannot draw.");
             imageBitmap.close();
             return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        }
        console.log(`Canvas Crop: Clamped Draw Params: sx=${clamped_sx}, sy=${clamped_sy}, sWidth=${clamped_sWidth}, sHeight=${clamped_sHeight}`);
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(imageBitmap, clamped_sx, clamped_sy, clamped_sWidth, clamped_sHeight, 0, 0, canvas.width, canvas.height);
        console.log("Canvas Crop: ImageBitmap drawn."); imageBitmap.close();
        const resultBlob = await canvas.convertToBlob({ type: 'image/png' }); if (!resultBlob) throw new Error("Canvas generated null blob.");
        console.log("Canvas Crop: Blob converted.");
        return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => { if (reader.result && typeof reader.result === 'string' && reader.result.startsWith('data:image/png')) { console.log("Canvas Crop: Blob converted to data URL."); resolve(reader.result); } else { reject(new Error("FileReader failed.")); } }; reader.onerror = (e) => { console.error("Canvas Crop: FileReader error:", e); reject(new Error(`FileReader error: ${e}`)); }; reader.readAsDataURL(resultBlob); });
    } catch (error) {
        console.error("Error during cropImageCanvas:", error);
        if (imageBitmap?.close) imageBitmap.close();
        throw error;
    }
}

// --- Utility Functions ---
function extractTextFromResult(result) { try { const text = result?.candidates?.[0]?.content?.parts?.[0]?.text; if (typeof text === 'string') return text; } catch (e) { console.error("Error accessing text:", e, result); } console.warn("Could not extract text:", result); return null; }
function tryParseJson(text, context = "data") { if (!text || typeof text !== 'string') { console.warn(`[${context}] Invalid input for JSON.`); return null; } let jsonString = text.trim(); const m = jsonString.match(/```json\s*([\s\S]*?)\s*```/); if (m && m[1]) { jsonString = m[1].trim(); console.log(`[${context}] Extracted JSON from markdown.`); } if (!jsonString.startsWith('{') && !jsonString.startsWith('[')) { console.warn(`[${context}] Text not JSON:`, text.substring(0, 200)); return { text_summary: text }; } try { const p = JSON.parse(jsonString); console.log(`[${context}] Parsed JSON.`); return p; } catch (e) { console.error(`[${context}] Failed to parse JSON:`, e, "Attempted:", jsonString.substring(0, 200), "Original:", text.substring(0, 200)); return { text_summary: text, parse_error: e.message }; } }

// Initialize auto-backup schedule on startup
chrome.storage.local.get(['autoBackup'], (result) => {
    if (result.autoBackup && result.autoBackup !== 'disabled') {
        updateAutoBackupSchedule(result.autoBackup);
    }
});

// Add these functions at the end of background.js (before the final console.log)

/**
 * Generates a comprehensive PDF report for all items with a specific tag
 * @param {number} tagId - The tag ID to generate report for
 * @returns {Promise<object>} Success response with filename or error response
 */
async function handleGeneratePDFReport(tagId) {
    console.log(`[PDFReport] Starting PDF report generation for tag ID: ${tagId}`);
    
    try {
        // Step 1: Get tag name and check for existing key points
        let tagName = `Tag ${tagId}`;
        let keyPointsContent = null;
        let sourceInfo = '';
        
        try {
            const tags = await getTagsByIds([tagId]);
            if (tags && tags.length > 0 && tags[0].name) {
                tagName = tags[0].name;
            }
        } catch (tagFetchError) {
            console.warn(`[PDFReport] Could not fetch name for tag ID: ${tagId}`);
        }

        // Step 2: Get all items for this tag
        const contentIds = await getContentIdsByTagId(tagId);
        if (!contentIds || contentIds.length === 0) {
            return { success: false, error: "No content items found for this tag." };
        }
        
        const allItems = await getContentItemsByIds(contentIds);
        if (!allItems || allItems.length === 0) {
            return { success: false, error: "Could not retrieve content items for this tag." };
        }

        // Step 3: Check for existing key points or generate them
        const existingKeyPoints = allItems.find(item => 
            item.type === GENERATED_ITEM_TYPE && 
            item.analysisType === 'key_points' &&
            item.sourceTagIds && item.sourceTagIds.includes(tagId)
        );

        if (existingKeyPoints) {
            console.log(`[PDFReport] Using existing key points from item ID: ${existingKeyPoints.id}`);
            keyPointsContent = existingKeyPoints.content;
            sourceInfo = existingKeyPoints.sourceInfo || `Generated from items tagged "${tagName}" (ID ${tagId}).`;
        } else {
            console.log(`[PDFReport] No existing key points found, generating new ones...`);
            const keyPointsResult = await handleGetKeyPoints(tagId);
            if (keyPointsResult.success) {
                keyPointsContent = keyPointsResult.keyPoints;
                sourceInfo = keyPointsResult.sourceInfo;
                console.log(`[PDFReport] Generated new key points successfully`);
            } else {
                console.warn(`[PDFReport] Failed to generate key points: ${keyPointsResult.error}`);
                keyPointsContent = "Key points could not be generated for this report.";
                sourceInfo = `Report generated from ${allItems.length} items tagged "${tagName}" (ID ${tagId}).`;
            }
        }

        // Step 4: Build PDF content
        const reportHTML = await buildReportHTML(tagName, tagId, allItems, keyPointsContent, sourceInfo);
        
        // Step 5: Generate PDF from HTML
        const filename = generateReportFilename(tagName);
        const pdfResult = await generatePDFFromHTML(reportHTML, filename);
        
        console.log(`[PDFReport] PDF report generated successfully: ${filename}`);
        return { 
            success: true, 
            filename: filename,
            message: `PDF report generated successfully for tag "${tagName}"`
        };

    } catch (error) {
        console.error(`[PDFReport] Error generating PDF report for tag ${tagId}:`, error);
        return { success: false, error: error.message || "An unknown error occurred generating PDF report." };
    }
}

/**
 * Builds the HTML content for the PDF report
 */
async function buildReportHTML(tagName, tagId, items, keyPointsContent, sourceInfo) {
    const now = new Date();
    const dateRange = getDateRange(items);
    
    // Sort items by creation date (current order)
    const sortedItems = items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Get all unique tags from all items
    const allTags = new Set();
    for (const item of sortedItems) {
        try {
            const itemTagIds = await getTagIdsByContentId(item.id);
            if (itemTagIds && itemTagIds.length > 0) {
                const itemTags = await getTagsByIds(itemTagIds);
                itemTags.forEach(tag => allTags.add(tag.name));
            }
        } catch (error) {
            console.warn(`[PDFReport] Could not fetch tags for item ${item.id}:`, error);
        }
    }
    
    const otherTags = Array.from(allTags).filter(tag => tag !== tagName).sort();
    
    const introStatement = `
This report was generated using JC WebInsight c2025, an AI-powered research compilation tool.

JC WebInsight allows users to capture, analyze, and organize web content including full pages, text selections, screenshots, and custom area captures. The extension leverages Google Gemini AI to analyze visual content, extract diagrams, and generate insights from collected materials.

This report compiles ${sortedItems.length} items tagged with '${tagName}' collected between ${dateRange}. The following key points summarize the collected research:`;

    let reportHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JC WebInsight Report - ${tagName}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; color: #333; }
        h1 { color: #0366d6; border-bottom: 2px solid #0366d6; padding-bottom: 10px; }
        h2 { color: #586069; border-bottom: 1px solid #e1e4e8; padding-bottom: 5px; margin-top: 30px; }
        h3 { color: #24292e; margin-top: 25px; }
        .intro-section { background-color: #f6f8fa; padding: 20px; border-radius: 6px; margin-bottom: 30px; }
        .key-points-section { background-color: #e6ffed; padding: 20px; border-radius: 6px; margin-bottom: 30px; border-left: 4px solid #1f883d; }
        .source-info { font-size: 0.9em; color: #586069; font-style: italic; margin-top: 15px; }
        .item-break { font-weight: bold; color: #0366d6; margin: 30px 0 20px 0; font-size: 1.1em; }
        .item-container { margin-bottom: 40px; border: 1px solid #e1e4e8; border-radius: 6px; padding: 20px; }
        .item-header { background-color: #f6f8fa; margin: -20px -20px 20px -20px; padding: 15px 20px; border-radius: 6px 6px 0 0; }
        .item-title { font-size: 1.2em; font-weight: bold; color: #24292e; margin: 0; }
        .item-meta { font-size: 0.9em; color: #586069; margin: 5px 0; }
        .item-tags { margin-top: 10px; }
        .tag { background-color: #0366d6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-right: 5px; }
        .tag-focus { background-color: #1f883d; font-weight: bold; }
        .content-section { margin: 20px 0; }
        .ai-analysis { background-color: #fff3cd; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #ffc107; }
        .screenshot-img { max-width: 100%; height: auto; border: 1px solid #e1e4e8; border-radius: 4px; margin: 10px 0; }
        .content-text { background-color: #f8f9fa; padding: 15px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; word-wrap: break-word; }
        .pdf-indicator { color: #d73027; font-weight: bold; }
    </style>
</head>
<body>
    <h1>JC WebInsight Research Report</h1>
    
    <div class="intro-section">
        <h2>Report Overview</h2>
        <p><strong>Topic:</strong> ${tagName}</p>
        <p><strong>Generated:</strong> ${now.toLocaleString()}</p>
        <p><strong>Items Analyzed:</strong> ${sortedItems.length}</p>
        <p><strong>AI Analysis:</strong> Google Gemini 1.5</p>
        <br>
        <p>${introStatement}</p>
    </div>

    <div class="key-points-section">
        <h2>Key Points Summary</h2>
        <div style="white-space: pre-wrap;">${keyPointsContent}</div>
        <div class="source-info">${sourceInfo}</div>
    </div>

    <h2>Tags Analysis</h2>
    <p><strong>Report Focus:</strong> <span class="tag tag-focus">${tagName}</span> (Selected tag)</p>
    ${otherTags.length > 0 ? `<p><strong>Related Topics:</strong> ${otherTags.map(tag => `<span class="tag">${tag}</span>`).join(' ')}</p>` : ''}
    <p><strong>Total Items:</strong> ${sortedItems.length} | <strong>Date Range:</strong> ${dateRange}</p>

    <h2>Research Compilation</h2>
`;

    // Add each item to the report
    for (let i = 0; i < sortedItems.length; i++) {
        const item = sortedItems[i];
        reportHTML += await buildItemHTML(item, i + 1, tagName, tagId);
    }

    reportHTML += `
</body>
</html>`;

    return reportHTML;
}

/**
 * Builds HTML for a single content item
 */
async function buildItemHTML(item, itemNumber, focusTagName, focusTagId) {
    const itemDate = new Date(item.createdAt).toLocaleString();
    
    // Get tags for this item
    let itemTags = [];
    try {
        const tagIds = await getTagIdsByContentId(item.id);
        if (tagIds && tagIds.length > 0) {
            itemTags = await getTagsByIds(tagIds);
        }
    } catch (error) {
        console.warn(`[PDFReport] Could not fetch tags for item ${item.id}`);
    }

    const tagsHTML = itemTags.map(tag => 
        `<span class="tag ${tag.name === focusTagName ? 'tag-focus' : ''}">${tag.name}</span>`
    ).join(' ');

    let contentHTML = '';
    let analysisHTML = '';

    // Build content based on item type
    switch (item.type) {
        case 'page':
        case 'selection':
            contentHTML = `<div class="content-text">${escapeHTML(item.content || 'No content available.')}</div>`;
            if (item.wordCount) {
                contentHTML += `<p><small>Word Count: ${item.wordCount}, Est. Reading Time: ${item.readingTimeMinutes} min</small></p>`;
            }
            break;

        case 'screenshot':
            contentHTML = `<img src="${item.content}" alt="Screenshot from item ${item.id}" class="screenshot-img">`;
            
            if (item.analysis) {
                analysisHTML = '<div class="ai-analysis"><h4>AI Analysis Summary</h4>';
                if (item.analysis.description) {
                    analysisHTML += `<p><strong>Description:</strong> ${escapeHTML(item.analysis.description)}</p>`;
                }
                if (item.analysis.diagramData && item.analysis.diagramData !== null && item.analysis.diagramData.contains_diagram !== false) {
                    if (item.analysis.diagramData.text_summary) {
                        analysisHTML += `<p><strong>Diagram/Chart Analysis:</strong> ${escapeHTML(item.analysis.diagramData.text_summary)}</p>`;
                    } else if (typeof item.analysis.diagramData === 'object') {
                        analysisHTML += `<p><strong>Diagram/Chart:</strong> Structured data detected with key elements identified.</p>`;
                    }
                }
                if (item.analysis.layout && item.analysis.layout !== null && item.analysis.layout.is_webpage_layout !== false) {
                    if (item.analysis.layout.text_summary) {
                        analysisHTML += `<p><strong>Layout Analysis:</strong> ${escapeHTML(item.analysis.layout.text_summary)}</p>`;
                    } else if (typeof item.analysis.layout === 'object') {
                        analysisHTML += `<p><strong>Layout:</strong> Webpage structure analyzed and key elements identified.</p>`;
                    }
                }
                analysisHTML += '</div>';
            }
            break;

        case 'pdf':
            const fileSizeKB = item.fileSize ? Math.round(item.fileSize / 1024) : 'Unknown';
            contentHTML = `<p class="pdf-indicator">📄 PDF Document (${fileSizeKB}KB)</p>`;
            if (item.characterCount) {
                contentHTML += `<p><small>Original Page Character Count: ${item.characterCount.toLocaleString()}</small></p>`;
            }
            break;

        case GENERATED_ITEM_TYPE:
            contentHTML = `<div class="content-text">${escapeHTML(item.content || 'No content available.')}</div>`;
            contentHTML += `<p><small><strong>Generated Analysis Type:</strong> ${item.analysisType || 'Unknown'}</small></p>`;
            if (item.sourceTagIds) {
                contentHTML += `<p><small><strong>Source Tag IDs:</strong> ${item.sourceTagIds.join(', ')}</small></p>`;
            }
            break;

        default:
            contentHTML = '<p>Unknown content type</p>';
    }

    return `
    <div class="item-break">Saved item break --></div>
    <div class="item-container">
        <div class="item-header">
            <div class="item-title">ITEM #${itemNumber}: ${escapeHTML(item.title || `Item ${item.id}`)}</div>
            <div class="item-meta">
                <strong>Source:</strong> ${item.url ? `<a href="${item.url}" target="_blank">${escapeHTML(item.url)}</a>` : 'N/A'}<br>
                <strong>Type:</strong> ${item.type} | <strong>Saved:</strong> ${itemDate}<br>
                <strong>Tags:</strong> ${tagsHTML || 'None'}
            </div>
        </div>
        <div class="content-section">
            ${contentHTML}
            ${analysisHTML}
        </div>
    </div>`;
}

/**
 * Generates filename for the PDF report
 */
function generateReportFilename(tagName) {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-').replace(/-/g, '');
    const sanitizedTag = tagName; // As discussed, use exact tag match for MVP
    return `JC-WebInsights-c2025-${sanitizedTag}-${timestamp}.pdf`;
}

/**
 * Gets date range string from items
 */
function getDateRange(items) {
    if (!items || items.length === 0) return 'No dates available';
    
    const dates = items.map(item => new Date(item.createdAt)).sort((a, b) => a - b);
    const earliest = dates[0];
    const latest = dates[dates.length - 1];
    
    if (earliest.toDateString() === latest.toDateString()) {
        return earliest.toLocaleDateString();
    } else {
        return `${earliest.toLocaleDateString()} - ${latest.toLocaleDateString()}`;
    }
}

/**
 * Escapes HTML characters for safe display
 */
function escapeHTML(text) {
    if (typeof text !== 'string') return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Generates PDF from HTML content using Chrome DevTools Protocol
 */
async function generatePDFFromHTML(htmlContent, filename) {
    try {
        // Create a data URL from the HTML content
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
        
        // Create a new tab with the HTML content
        const tab = await chrome.tabs.create({ url: dataUrl, active: false });
        
        // Wait for the tab to load
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Generate PDF using the same method as page PDF
        const pdfOptions = {
            landscape: false,
            printBackground: true,
            scale: 0.8,
            paperWidth: 8.5,
            paperHeight: 11,
            marginTop: 0.5,
            marginBottom: 0.5,
            marginLeft: 0.5,
            marginRight: 0.5
        };
        
        const pdfBase64 = await generatePagePDF(tab.id, pdfOptions);
        
        // Close the temporary tab
        await chrome.tabs.remove(tab.id);
        
        if (!pdfBase64) {
            throw new Error("PDF generation returned empty data");
        }
        
        // Convert to data URL and trigger download
        const pdfDataUrl = pdfToDataUrl(pdfBase64);
        
        // Create download
        await chrome.downloads.download({
            url: pdfDataUrl,
            filename: filename,
            saveAs: true
        });
        
        console.log(`[PDFReport] PDF downloaded successfully: ${filename}`);
        return { success: true, filename: filename };
        
    } catch (error) {
        console.error('[PDFReport] Error generating PDF from HTML:', error);
        throw error;
    }
}


async function handleInitializeLocalAI() {
    try {
        console.log("[LocalAI] Initializing Universal Sentence Encoder...");
        
        // Check if already initialized
        if (localAI.isReady()) {
            return { success: true, message: "Local AI already initialized." };
        }

        // Initialize the model (this will download ~25MB on first use)
        await localAI.initialize();
        
        console.log("[LocalAI] Initialization complete");
        return { 
            success: true, 
            message: "Local AI initialized successfully. Tag suggestions are now available." 
        };
        
    } catch (error) {
        console.error("[LocalAI] Initialization failed:", error);
        return { 
            success: false, 
            error: `Failed to initialize Local AI: ${error.message}` 
        };
    }
}

/**
 * Suggest tags for given content using local AI
 */
async function handleSuggestTags(content) {
    try {
        console.log("[LocalAI] Generating tag suggestions for content");
        
        // Ensure AI is initialized
        if (!localAI.isReady()) {
            return { 
                success: false, 
                error: "Local AI not initialized. Please enable AI features first." 
            };
        }

        // Get all existing tags with their embeddings
        const existingTagsWithEmbeddings = await getTagsWithEmbeddings();
        
        if (existingTagsWithEmbeddings.length === 0) {
            return { 
                success: true, 
                payload: [], 
                message: "No existing tags found for comparison." 
            };
        }

        // Generate suggestions
        const suggestions = await localAI.suggestTags(content, existingTagsWithEmbeddings);
        
        console.log(`[LocalAI] Generated ${suggestions.length} tag suggestions`);
        return { 
            success: true, 
            payload: suggestions,
            message: `Found ${suggestions.length} suggested tags.`
        };
        
    } catch (error) {
        console.error("[LocalAI] Error suggesting tags:", error);
        return { 
            success: false, 
            error: `Failed to suggest tags: ${error.message}` 
        };
    }
}

/**
 * Generate embeddings for all existing tags
 */
async function handleGenerateTagEmbeddings() {
    try {
        console.log("[LocalAI] Generating embeddings for existing tags");
        
        // Ensure AI is initialized
        if (!localAI.isReady()) {
            return { 
                success: false, 
                error: "Local AI not initialized. Please enable AI features first." 
            };
        }

        // Get all existing tags
        const allTags = await getAllTags();
        
        if (allTags.length === 0) {
            return { 
                success: true, 
                payload: { processed: 0, skipped: 0 },
                message: "No tags found to process." 
            };
        }

        let processed = 0;
        let skipped = 0;

        // Process tags in batches to avoid overwhelming the system
        const batchSize = 10;
        for (let i = 0; i < allTags.length; i += batchSize) {
            const batch = allTags.slice(i, i + batchSize);
            
            for (const tag of batch) {
                try {
                    // Check if tag already has embedding
                    const existingEmbedding = await getTagEmbedding(tag.id);
                    if (existingEmbedding) {
                        skipped++;
                        continue;
                    }

                    // Generate embedding for tag name
                    const embedding = await localAI.embed(tag.name);
                    
                    // Store embedding in database
                    await saveTagEmbedding(tag.id, embedding);
                    processed++;
                    
                    console.log(`[LocalAI] Generated embedding for tag: ${tag.name}`);
                    
                } catch (error) {
                    console.error(`[LocalAI] Failed to process tag ${tag.name}:`, error);
                    skipped++;
                }
            }
            
            // Small delay between batches to avoid blocking
            if (i + batchSize < allTags.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`[LocalAI] Embedding generation complete: ${processed} processed, ${skipped} skipped`);
        return { 
            success: true, 
            payload: { processed, skipped, total: allTags.length },
            message: `Processed ${processed} tags, skipped ${skipped} existing.`
        };
        
    } catch (error) {
        console.error("[LocalAI] Error generating tag embeddings:", error);
        return { 
            success: false, 
            error: `Failed to generate embeddings: ${error.message}` 
        };
    }
}

/**
 * Get all tags with their embeddings for similarity comparison
 */
async function getTagsWithEmbeddings() {
    try {
        const allTags = await getAllTags();
        const tagsWithEmbeddings = [];

        for (const tag of allTags) {
            const embedding = await getTagEmbedding(tag.id);
            if (embedding) {
                tagsWithEmbeddings.push({
                    id: tag.id,
                    name: tag.name,
                    embedding: embedding
                });
            }
        }

        return tagsWithEmbeddings;
    } catch (error) {
        console.error("[LocalAI] Error getting tags with embeddings:", error);
        return [];
    }
}

/**
 * Get embedding for a specific tag (stored separately for performance)
 */
async function getTagEmbedding(tagId) {
    try {
        // Get from chrome.storage.local (embeddings can be large)
        const key = `tag_embedding_${tagId}`;
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key] || null);
            });
        });
    } catch (error) {
        console.error(`[LocalAI] Error getting embedding for tag ${tagId}:`, error);
        return null;
    }
}

/**
 * Save embedding for a tag
 */
async function saveTagEmbedding(tagId, embedding) {
    try {
        const key = `tag_embedding_${tagId}`;
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [key]: embedding }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error(`[LocalAI] Error saving embedding for tag ${tagId}:`, error);
        throw error;
    }
}


console.log("WebInsight Service Worker (with Google Drive integration and PDF support) started.");