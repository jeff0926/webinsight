// js/panel.js - Logic for the WebInsight Side Panel (Simple Key Points Display)

// --- Constants (Ensure this matches background.js) ---
const GENERATED_ITEM_TYPE = "generated_analysis";

// --- DOM Element References ---
// !! IMPORTANT !!: Ensure these IDs match your actual panel.html
const panelContentListEl = document.getElementById("panelContentList");
const panelStatusMessageEl = document.getElementById("panelStatusMessage");
const panelOptionsBtn = document.getElementById("panelOptionsBtn");
const panelSavePageBtn = document.getElementById("panelSavePageBtn");
const panelSavePageAsPDFBtn = document.getElementById("panelSavePageAsPDFBtn");
const panelSaveSelectionBtn = document.getElementById("panelSaveSelectionBtn");
const panelCaptureVisibleBtn = document.getElementById(
  "panelCaptureVisibleBtn"
);
const panelCaptureAreaBtn = document.getElementById("panelCaptureAreaBtn");
// Filter Elements
const tagFilterListEl = document.getElementById("tagFilterList");
const clearTagFilterBtn = document.getElementById("clearTagFilterBtn");
const getKeyPointsBtn = document.getElementById("getKeyPointsBtn"); // Button for key points
// ** NEW: Key Points Result Display Area **
const keyPointsResultDisplayArea = document.getElementById(
  "keyPointsResultDisplay"
);
const generateReportBtn = document.getElementById("generateReportBtn"); // Button for generate report
const exportProjectBtn = document.getElementById("exportProjectBtn"); // New button
const aiStatusIndicator = null; // removed — local AI eliminated
const initializeAIBtn = null;
const generateEmbeddingsBtn = null;
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const someOtherCheckbox = document.getElementById("someOtherCheckbox");
// Chat elements
const chatAccordionHintEl = document.querySelector("#chatAccordion .panel-accordion-hint");
const chatHistoryEl = document.getElementById("chatHistory");
const chatInputEl = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatSaveBtn = document.getElementById("chatSaveBtn");
const chatNewBtn = document.getElementById("chatNewBtn");

// --- State ---

    let currentFilterTagIds = []; // Keep track of active filter tag IDs
    let currentFilterTagNames = []; // Keep track of active filter tag names

let currentItemsCache = []; // Cache the full list of items
const ITEMS_PAGE_SIZE = 20; // Number of items to load per page

// Chat state
let chatConversationHistory = [];
let currentPageOffset = 0; // Current pagination offset
let totalItemCount = 0; // Total items in DB (for unfiltered view)
let isLoadingMore = false; // Prevent duplicate page loads
let suppressContentReload = false; // Suppress storage-listener reload during tag operations

// Make it globally accessible for debugging
window.currentItemsCache = currentItemsCache;

// TEMP: Global click logger (short-lived) — logs every click with target info
(function installGlobalClickLogger(){
  if (window.__wi_global_click_logger_installed) return;
  // Global on/off flag (default ON for testing)
  window.__wi_click_logger_enabled = true;

  function _logClick(e){
    try{
      if (!window.__wi_click_logger_enabled) return;
      const t = e.target || e.srcElement;
      const cls = t && t.classList ? Array.from(t.classList).join(' ') : (t && t.className) || '';
      const dataset = t && t.dataset ? Object.assign({}, t.dataset) : null;
      console.log('[WI-CLICK]', new Date().toISOString(), 'tag:', t && t.tagName, 'id:', t && t.id, 'classes:', cls, 'dataset:', dataset);
      // If user clicked anywhere inside an Add button, report nearest add-tag-input value too
      try{
        const nearestAddBtn = t && t.closest ? t.closest('.add-tag-btn') : (t && t.classList && t.classList.contains('add-tag-btn') ? t : null);
        if (nearestAddBtn) {
          console.log('[WI-CLICK] nearest .add-tag-btn detected. contentId:', nearestAddBtn.dataset ? nearestAddBtn.dataset.contentId : undefined, 'add-input-value:', document.querySelector('.add-tag-input')?.value);
        }
      }catch(_e){}
    }catch(_err){/* swallow */}
  }
  window.addEventListener('click', _logClick, true);
  window.__wi_global_click_logger_installed = true;
  window.__wi_remove_global_click_logger = function(){ window.removeEventListener('click', _logClick, true); delete window.__wi_global_click_logger_installed; delete window.__wi_remove_global_click_logger; console.log('WI click logger removed'); };
  window.__wi_set_click_logger = function(on){ window.__wi_click_logger_enabled = !!on; console.log('WI: click logger set to', !!on); };
  // Optional: toggleable pause for Add button clicks. Disabled by default.
  window.__wi_pause_on_add_click = false;
  window.__wi_set_pause_on_add_click = function(on){ window.__wi_pause_on_add_click = !!on; console.log('WI: pause on add click set to', !!on); };
  console.log('WI: Temporary global click logger installed and ENABLED. Use window.__wi_set_click_logger(false) to disable or window.__wi_remove_global_click_logger() to remove.');
})();

// --- Utility Functions (AN-6) ---
/**
 * Copies a given string of text to the user's clipboard.
 */
function copyTextToClipboard(text, buttonEl) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Move textarea out of visual bounds
    Object.assign(textarea.style, {
        position: 'absolute',
        left: '-9999px',
        top: '0'
    });
    document.body.appendChild(textarea);
    textarea.select();
    
    let success = false;
    try {
        // Fallback: Use document.execCommand('copy') as it works reliably in sandboxed contexts/iframes
        success = document.execCommand('copy');
    } catch (err) {
        console.error('Error attempting to copy text:', err);
    }
    
    document.body.removeChild(textarea);

    if (success) {
        const originalText = buttonEl.textContent;
        buttonEl.textContent = 'Copied!';
        buttonEl.disabled = true;
        
        setTimeout(() => {
            buttonEl.textContent = originalText;
            buttonEl.disabled = false;
        }, 2000);
    } else {
        showStatus('Failed to copy JSON. Please select the text manually.', 'error');
    }
}

/**
 * Sends the user's notes to the background script for persistence (AN-5).
 */
function handleSaveNotes(itemId, notesContent, buttonEl) {
    if (!buttonEl) return;
    
    const originalText = buttonEl.textContent;
    buttonEl.textContent = 'Saving...';
    buttonEl.disabled = true;

    chrome.runtime.sendMessage({
        type: "UPDATE_ITEM_NOTES",
        payload: { id: itemId, notes: notesContent }
    }, (response) => {
        buttonEl.disabled = false;
        if (response && response.success) {
            // Success! Update cache so detail view updates on next open
            const cachedItem = currentItemsCache.find(i => i.id === itemId);
            if (cachedItem) cachedItem.notes = notesContent; 

            buttonEl.textContent = 'Saved!';
            showStatus(`Notes for Item ${itemId} updated successfully.`, "success");
            // Revert button text after a short delay
            setTimeout(() => {
                buttonEl.textContent = originalText;
            }, 2000);
        } else {
            buttonEl.textContent = 'Error';
            showStatus(`Error saving notes: ${response?.error || 'Unknown error'}`, "error");
            console.error("Failed to save notes:", response?.error);
            // Revert button text after a short delay
            setTimeout(() => {
                buttonEl.textContent = originalText;
            }, 3000);
        }
    });
}

/**
 * Triggers content anonymization in the background and refreshes the display (AN-8).
 */
function handleAnonymizeContent(itemId, buttonEl, detailElement) {
    if (!confirm("WARNING: This permanently replaces identified PII (emails, names, dates) in the saved text. Continue?")) {
        return;
    }

    const originalText = buttonEl.textContent;
    buttonEl.textContent = 'Anonymizing...';
    buttonEl.disabled = true;

    chrome.runtime.sendMessage({
        type: "ANONYMIZE_ITEM",
        payload: { id: itemId }
    }, (response) => {
        buttonEl.disabled = false;
        if (response && response.success) {
            showStatus(`Item ${itemId} anonymized successfully.`, "success");
            
            // Find item in cache and update its content
            const cachedItem = currentItemsCache.find(i => i.id === itemId);
            if (cachedItem) {
                // Update item content in cache with the new anonymized content
                cachedItem.content = response.anonymizedContent;
                
                // Force re-render the detail view to show anonymized content
                displayItemDetails(cachedItem, detailElement); 
            }
            
            setTimeout(() => { buttonEl.textContent = originalText; }, 2000);
        } else {
            buttonEl.textContent = 'Error';
            showStatus(`Anonymization failed: ${response?.error || 'Unknown error'}`, "error");
            console.error("Anonymization failed:", response?.error);
            setTimeout(() => { buttonEl.textContent = originalText; }, 3000);
        }
    });
}

/**
 * Handles the "Convert to draw.io" button click.
 * Sends the item to background for rich Gemini extraction + XML generation.
 * On success the button turns green and the download/open icon buttons activate.
 */
function handleConvertToDrawio(itemId, buttonEl) {
    if (!buttonEl) return;

    const originalText = buttonEl.textContent;
    buttonEl.textContent = 'Converting...';
    buttonEl.disabled = true;

    const downloadBtn = document.getElementById(`drawioDownloadBtn_${itemId}`);
    const openBtn = document.getElementById(`drawioOpenBtn_${itemId}`);

    chrome.runtime.sendMessage({
        type: "CONVERT_TO_DRAWIO",
        payload: { itemId: itemId }
    }, (response) => {
        buttonEl.disabled = false;
        if (response && response.success) {
            buttonEl.textContent = '✓ draw.io ready';
            buttonEl.classList.add('drawio-convert-btn--done');
            showStatus('draw.io diagram ready — download or open above.', 'success');

            if (downloadBtn) downloadBtn.disabled = false;
            if (openBtn) openBtn.disabled = false;
        } else {
            buttonEl.textContent = 'Error';
            showStatus(`draw.io conversion failed: ${response?.error || 'Unknown error'}`, "error");
            console.error("draw.io conversion failed:", response?.error);
            setTimeout(() => { buttonEl.textContent = originalText; }, 3000);
        }
    });
}

// function handleConvertToToml(itemId, buttonEl) {
//     if (!buttonEl) return;
//     const originalText = buttonEl.textContent;
//     buttonEl.textContent = 'Exporting...';
//     buttonEl.disabled = true;
//     chrome.runtime.sendMessage({ type: "CONVERT_TO_TOML", payload: { itemId } }, (response) => {
//         buttonEl.disabled = false;
//         if (response && response.success) {
//             buttonEl.textContent = 'Downloaded!';
//             showStatus(`TOML file saved: ${response.filename || 'item.toml'}`, "success");
//             setTimeout(() => { buttonEl.textContent = originalText; }, 3000);
//         } else {
//             buttonEl.textContent = 'Error';
//             showStatus(`TOML export failed: ${response?.error || 'Unknown error'}`, "error");
//             setTimeout(() => { buttonEl.textContent = originalText; }, 3000);
//         }
//     });
// }


// --- Initialization ---

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Panel DOM loaded.");
  applyPanelTheme();
  loadFilterTags();
  loadSavedContent();
  addEventListeners();

  if (chatSendBtn) chatSendBtn.addEventListener("click", handleChatSend);
  if (chatSaveBtn) chatSaveBtn.addEventListener("click", handleChatSave);
  if (chatNewBtn) chatNewBtn.addEventListener("click", handleChatNew);
  if (chatInputEl) {
    chatInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
    });
  }

  // AN-9: Add listener for status updates from background (non-response channel)
  chrome.runtime.onMessage.addListener(handleBackgroundStatusUpdate);
});


/** AN-9: Handler for status updates from background.js (during long tasks like PDF report) */
function handleBackgroundStatusUpdate(message, sender, sendResponse) {
    // Only handle messages specifically for long-running task status updates
    if (message.type === "REPORT_GENERATION_STATUS") {
        // Use showStatus to display progress. Use autoClear=false since the background script
        // will send the final success/error message separately (which will auto-clear).
        showStatus(message.payload.message, message.payload.type, false);
    }
}


// --- Event Listener Setup ---
/** Adds event listeners to all static interactive elements in the panel. */
function addEventListeners() {
  // Settings Button
  if (panelOptionsBtn)
    panelOptionsBtn.addEventListener("click", () =>
      chrome.runtime.openOptionsPage()
    );
  else console.warn("Panel Options button not found.");

  // Action Buttons (Using reverted logic)
  if (panelSavePageBtn)
    panelSavePageBtn.addEventListener("click", () => {
      showStatus("Saving page content...", "info", false);
      chrome.runtime.sendMessage(
        { type: "SAVE_PAGE_CONTENT" },
        handleActionResponse
      );
    });
  else console.warn("Panel Save Page button not found.");

  // Generate Report Button
  if (generateReportBtn)
    generateReportBtn.addEventListener("click", handleGenerateReportClick);
  else console.warn("Generate Report button not found.");

  if (panelSavePageAsPDFBtn)
    panelSavePageAsPDFBtn.addEventListener("click", () => {
      showStatus("Generating PDF... This may take a moment.", "info", false);
      chrome.runtime.sendMessage(
        {
          type: "SAVE_PAGE_AS_PDF",
          payload: { preset: "standard" },
        },
        handleActionResponse
      );
    });
  else console.warn("Panel Save Page as PDF button not found.");

  if (panelSaveSelectionBtn)
    panelSaveSelectionBtn.addEventListener("click", () => {
      showStatus("Saving selection...", "info", false);
      chrome.runtime.sendMessage(
        { type: "SAVE_SELECTION" },
        handleActionResponse
      );
    });
  else console.warn("Panel Save Selection button not found.");
  if (panelCaptureVisibleBtn)
    panelCaptureVisibleBtn.addEventListener("click", () => {
      showStatus("Capturing visible area...", "info", false);
      chrome.runtime.sendMessage(
        { type: "CAPTURE_VISIBLE_TAB" },
        handleActionResponse
      );
    });
  else console.warn("Panel Capture Visible button not found.");
  if (panelCaptureAreaBtn)
    panelCaptureAreaBtn.addEventListener("click", () => {
      showStatus("Initiating area capture... Draw on page.", "info", false);
      chrome.runtime.sendMessage(
        { type: "INITIATE_AREA_CAPTURE" },
        (response) => {
          if (response && response.success)
            showStatus("Draw selection area on the page.", "info", false);
          else handleActionResponse(response);
        }
      );
    });
  else console.warn("Panel Capture Area button not found.");

  // Clear Filter Button
  if (clearTagFilterBtn)
    clearTagFilterBtn.addEventListener("click", handleClearFilter);
  else console.warn("Clear Tag Filter button not found.");

  // Get Key Points Button
  if (getKeyPointsBtn)
    getKeyPointsBtn.addEventListener("click", handleGetKeyPointsClick);
  // Use updated handler
  else console.warn("Get Key Points button not found.");

  // New Project Export Button Listener
  if (exportProjectBtn)
    exportProjectBtn.addEventListener("click", handleExportProjectClick);
  else console.warn("Export Project button not found.");

  // Listener for clicks within the item list (using event delegation)
  if (panelContentListEl) {
    panelContentListEl.addEventListener("click", (event) => {
      const itemElement = event.target.closest(".content-item");
      if (!itemElement) {
        return; // Click was not on an item
      }
      const itemId = parseInt(itemElement.dataset.itemId, 10);

      // Delegated handling for dynamic Add Tag buttons (ensures handlers work after re-renders)
      const delegatedAddBtn = event.target.closest('.add-tag-btn');
      if (delegatedAddBtn) {
        event.stopPropagation();
        // Determine contentId (prefer button dataset, fallback to item's dataset)
        const contentId = parseInt(delegatedAddBtn.dataset.contentId || itemElement.dataset.itemId, 10);
        const detailsDiv = itemElement.querySelector('.item-details');
        const addInput = detailsDiv ? detailsDiv.querySelector('.add-tag-input') : null;
        const tagsListEl = detailsDiv ? detailsDiv.querySelector('.tags-list') : null;

        if (!addInput || !tagsListEl) {
          console.warn('Delegated add-tag: missing input or tags list for item', contentId);
          return;
        }

        const tagName = (addInput.value || '').trim();
        const itemData = currentItemsCache.find(i => i.id === contentId) || {};

        if (tagName.length > 0) {
          enhancedAddTag(contentId, tagName, itemData.content, addInput, tagsListEl);
          addInput.value = '';
        } else {
          showStatus('Enter a tag name.', 'info');
        }
        return; // handled
      }

      // Handle delete button click
      if (event.target.classList.contains("delete-btn")) {
        event.stopPropagation();
        const itemTitle =
          itemElement.querySelector(".item-summary strong")?.textContent ||
          `Item ${itemId}`;
        deleteItem(itemId, itemTitle);
        return;
      }

      // --- ** NEW, SIMPLIFIED ACCORDION LOGIC ** ---
      const summaryElement = event.target.closest(".item-summary");

      // 1. Only proceed if the click was on the summary area.
      if (!summaryElement) {
        return;
      }

      const detailsDiv = itemElement.querySelector(".item-details");
      if (!detailsDiv) {
        console.warn("Could not find .item-details for this item.");
        return;
      }

      // 2. Check if the item we clicked was ALREADY open.
      const wasAlreadyOpen = detailsDiv.style.display === "block";

      // 3. Close ALL open items in the list. This simplifies state management.
      panelContentListEl.querySelectorAll(".item-details").forEach((el) => {
        el.style.display = "none";
        el.innerHTML = ""; // Clear content to save resources
      });

      // 4. If the item was NOT already open, then expand it.
      if (!wasAlreadyOpen) {
        const itemData = currentItemsCache.find((i) => i.id === itemId);
        if (itemData) {
          displayItemDetails(itemData, detailsDiv); // Populate its details
          detailsDiv.style.display = "block"; // Show it
        } else {
          console.error(
            `Error: Item data for ID ${itemId} not found in cache.`
          );
          detailsDiv.innerHTML = '<p class="error">Error loading details.</p>';
          detailsDiv.style.display = "block";
        }
      }
      // If it *was* already open, it's now closed from step 3, and we do nothing else.
    });
  } else {
    console.error(
      "Panel content list element (ID: panelContentList) not found for event delegation."
    );
  }

  // KEYDOWN delegation: allow Enter in dynamically-rendered `.add-tag-input` to submit
  if (panelContentListEl) {
    panelContentListEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const inputEl = e.target.closest && e.target.closest('.add-tag-input') ? e.target.closest('.add-tag-input') : null;
      if (!inputEl) return;
      e.preventDefault();
      // Find nearest add button and simulate delegated handling
      const nearestDetails = inputEl.closest('.item-details');
      const nearestItem = inputEl.closest('.content-item');
      const addBtn = nearestDetails ? nearestDetails.querySelector('.add-tag-btn') : null;
      const contentId = parseInt((addBtn && addBtn.dataset.contentId) || (nearestItem && nearestItem.dataset.itemId), 10);
      const tagsListEl = nearestDetails ? nearestDetails.querySelector('.tags-list') : null;
      const tagName = (inputEl.value || '').trim();
      const itemData = currentItemsCache.find(i => i.id === contentId) || {};

      if (!inputEl || !tagsListEl) {
        console.warn('Enter key: missing input or tags list for item', contentId);
        return;
      }

      if (tagName.length > 0) {
        enhancedAddTag(contentId, tagName, itemData.content, inputEl, tagsListEl);
        inputEl.value = '';
      } else {
        showStatus('Enter a tag name.', 'info');
      }
    });
  }
}

// --- Storage & Theme Change Listeners ---
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log(`Storage changed in namespace: ${namespace}`, changes);
  if (namespace === "sync" && changes.theme) {
    console.log("Theme changed, applying to panel...");
    applyPanelTheme();
  }
  if (
    namespace === "local" &&
    (changes.lastSaveTimestamp || changes.lastAnalysisTimestamp)
  ) {
    if (suppressContentReload) {
      // Tag add/remove triggered this — only refresh filter tags, keep accordion open
      console.log("Detected tag change, reloading filters only (accordion preserved).");
      suppressContentReload = false;
      loadFilterTags();
    } else {
      // New content saved or analysis completed — full reload
      console.log("Detected data change, reloading panel content and filters...");
      loadFilterTags();
      loadSavedContent(currentFilterTagIds.length > 0 ? currentFilterTagIds : null);
    }
  }
});
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    console.log("System theme changed, re-applying theme...");
    applyPanelTheme();
  });

/***** PANEL.JS — Auto-KeyPoints + Cloud Assist Hooks *****/

/** Keep in sync with background defaults if/when they change */
const DEFAULT_REPORT_PREFS = {
  autoGenerateKeyPoints: true,
  cloudAssist: false,
  captions: false,
  layoutHints: false,
  exportResearchMarkdown: false,
  normalizeTags: false,
};

/** Helper: promisified runtime message */
function sendBgMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) =>
      resolve(response)
    );
  });
}

/** Helper: read & merge report prefs from storage.local */
async function getReportPrefs() {
  try {
    const stored = await new Promise((resolve) =>
      chrome.storage.local.get(["reportDefaults"], resolve)
    );
    const merged = {
      ...DEFAULT_REPORT_PREFS,
      ...(stored?.reportDefaults || {}),
    };
    return merged;
  } catch (e) {
    console.warn("Failed to read report defaults; using built-ins.", e);
    return { ...DEFAULT_REPORT_PREFS };
  }
}

/** Helper: fetch items for a tag (fresh from BG) */
async function getItemsForTag(tagId) {
  const resp = await sendBgMessage("GET_FILTERED_ITEMS_BY_TAG", { tagId });
  if (!resp?.success) {
    throw new Error(resp?.error || "Failed to fetch items for tag.");
  }
  return Array.isArray(resp.payload) ? resp.payload : [];
}

/** Heuristic: do we already have Key Points generated for this tag? */
function hasKeyPoints(itemsForTag) {
  try {
    return itemsForTag.some((it) => {
      // Generated analysis type (constant declared at top of panel.js)
      if (it?.type !== GENERATED_ITEM_TYPE) return false;

      // Prefer explicit markers if present:
      if (it?.subtype && typeof it.subtype === "string") {
        if (it.subtype.toLowerCase() === "key_points") return true;
      }
      // Fallbacks: title/analysis descriptors
      const t = (it?.title || "").toLowerCase();
      if (t.includes("key points") || t.includes("key-points")) return true;

      const desc = (
        it?.analysis?.kind ||
        it?.analysis?.title ||
        ""
      ).toLowerCase();
      if (desc.includes("key points") || desc.includes("key-points"))
        return true;

      return false;
    });
  } catch {
    return false;
  }
}

/** UI helpers for disabling/enabling buttons */
function setReportButtonsDisabled(disabled) {
  try {
    if (generateReportBtn) generateReportBtn.disabled = disabled;
    if (getKeyPointsBtn) getKeyPointsBtn.disabled = disabled;
  } catch (_) {}
}

/** UPDATED: Generate Report click handler with Auto-KeyPoints + Cloud Assist hooks */
async function handleGenerateReportClick() {
  if (currentFilterTagId === null || typeof currentFilterTagId !== "number") {
    showStatus("Please select a tag before generating a report.", "error");
    return;
  }

  setReportButtonsDisabled(true);
  // AN-9: Set initial UI status when clicking the button
  showStatus(
    `Starting PDF report generation for tag "${
      currentFilterTagName || "selected"
    }"...`,
    "info",
    false
  );

  try {
    const tagId = currentFilterTagId;
    const prefs = await getReportPrefs();

    // 1) Optionally ensure Key Points exist
    if (prefs.autoGenerateKeyPoints) {
      const items = await getItemsForTag(tagId);
      const alreadyHasKeyPoints = hasKeyPoints(items);

      if (!alreadyHasKeyPoints) {
        // NOTE: Status updates here are handled by handleBackgroundStatusUpdate
        const kpResp = await sendBgMessage("GET_KEY_POINTS_FOR_TAG", { tagId });
        if (!kpResp?.success) {
          console.warn("Key Points generation failed:", kpResp?.error);
          // Non-fatal: continue to report anyway
        } else {
          // Refresh list so the generated analysis item appears
          loadSavedContent(tagId);
        }
      }
    }

    // 2) Build report options (Cloud Assist + hints/captions/markdown/normalize)
    const reportOptions = {
      cloudAssistEnabled: !!prefs.cloudAssist,
      captionsEnabled: !!prefs.captions,
      layoutHintsEnabled: !!prefs.layoutHints,
      exportMarkdownEnabled: !!prefs.exportResearchMarkdown,
      normalizeTagsEnabled: !!prefs.normalizeTags,
    };

    // 3) Ask background to generate PDF (BG may safely ignore unknown options)
    // NOTE: This call is now non-blocking and relies on the REPORT_GENERATION_STATUS messages.
    const reportResp = await sendBgMessage("GENERATE_PDF_REPORT_FOR_TAG", {
      tagId,
      options: reportOptions,
    });

    if (!reportResp?.success) {
      throw new Error(reportResp?.error || "Report generation failed.");
    }

    // FINAL SUCCESS MESSAGE (if background didn't fail earlier)
    showStatus("Report generated successfully. Check your Downloads.", "success", 5000);
    // Refresh items so the PDF entry (if saved as an item) shows up
    loadSavedContent(tagId);
  } catch (err) {
    console.error("Report generation error:", err);
    // The background is expected to send the error status via handleBackgroundStatusUpdate
    showStatus(`Error generating report: ${err.message}`, "error", false);
  } finally {
    setReportButtonsDisabled(false);
    if (generateReportBtn) generateReportBtn.textContent = "Generate Report"; // AN-9: Reset text
  }
}

/** OPTIONAL: keep Get Key Points handler consistent with prefs (no UI change required) */
async function handleGetKeyPointsClick() {
  if (currentFilterTagId === null || typeof currentFilterTagId !== "number") {
    showStatus("Please select a tag before generating key points.", "error");
    return;
  }
  setReportButtonsDisabled(true);
  try {
    showStatus("Generating key points…", "info", false);
    const resp = await sendBgMessage("GET_KEY_POINTS_FOR_TAG", {
      tagId: currentFilterTagId,
    });
    if (!resp?.success) {
      throw new Error(resp?.error || "Failed to generate key points.");
    }
    showStatus("Key points generated.", "success");
    loadSavedContent(currentFilterTagId);
  } catch (e) {
    console.error(e);
    showStatus(`Error generating key points: ${e.message}`, "error");
  } finally {
    setReportButtonsDisabled(false);
  }
}

/***** END PATCH *****/

// --- Response Handling ---
/** Handles generic responses for actions like save, capture */
function handleActionResponse(response) {
  if (!response) {
    showStatus("Error: No response received.", "error");
    console.error("Panel: No response.");
    return;
  }
  if (response.success) {
    const message = response.id
      ? `Success! Item saved (ID: ${response.id}).`
      : response.message || "Operation successful.";
    showStatus(message, "success");
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

    function loadSavedContent(filterTagIdsParam = null) {
      // Ensure filterTagIdsParam is an array or null
      const effectiveFilterTagIds = Array.isArray(filterTagIdsParam) ? filterTagIdsParam : (filterTagIdsParam !== null ? [filterTagIdsParam] : []);

      console.log("🔍 loadSavedContent called with filterTagIds:", effectiveFilterTagIds);

      currentFilterTagIds = effectiveFilterTagIds;
      // Update currentFilterTagNames based on currentFilterTagIds, assuming tags are loaded
      currentFilterTagNames = Array.from(tagFilterListEl.querySelectorAll('.tag-filter-item.active')).map(el => el.dataset.tagName);
      if (currentFilterTagIds.length === 0) {
        currentFilterTagNames = [];
      }

      if (!panelContentListEl) {
        console.error(
          "DEBUG ERROR: Panel content list element not found in loadSavedContent."
        );
        return;
      }

      panelContentListEl.innerHTML = "<p><i>Loading items...</i></p>";
      if (
        panelStatusMessageEl &&
        panelStatusMessageEl.textContent.includes("Loading")
      )
        clearStatus();
      hideKeyPointsResultArea();

      // Reset pagination state
      currentItemsCache = [];
      window.currentItemsCache = currentItemsCache;
      currentPageOffset = 0;
      totalItemCount = 0;
      isLoadingMore = false;

      if (currentFilterTagIds.length > 0) {
        // Filtered path — use existing message (filtered results are typically small)
        console.log("🔍 Sending message: GET_FILTERED_ITEMS_BY_TAGS_OR", { tagIds: currentFilterTagIds });
        chrome.runtime.sendMessage(
          { type: "GET_FILTERED_ITEMS_BY_TAGS_OR", payload: { tagIds: currentFilterTagIds } },
          (response) => {
            if (response && response.success && Array.isArray(response.payload)) {
              currentItemsCache = response.payload || [];
              window.currentItemsCache = currentItemsCache;
              displayContentItems(currentItemsCache);
            } else {
              currentItemsCache = [];
              window.currentItemsCache = currentItemsCache;
              const errorMsg = response?.error || "Failed to load filtered items.";
              console.error("Panel: Failed to load filtered content:", errorMsg);
              panelContentListEl.innerHTML = `<p class="error"><i>Error loading items: ${errorMsg}</i></p>`;
              showStatus(`Error loading items: ${errorMsg}`, "error", false);
            }
            updateKeyPointsButtonVisibility();
          }
        );
      } else {
        // Unfiltered path — use paginated loading
        console.log("🔍 Starting paginated load (page size:", ITEMS_PAGE_SIZE, ")");
        // First get total count, then load first page
        chrome.runtime.sendMessage(
          { type: "GET_CONTENT_ITEMS_COUNT" },
          (countResponse) => {
            if (countResponse && countResponse.success) {
              totalItemCount = countResponse.payload || 0;
              console.log(`🔍 Total items in DB: ${totalItemCount}`);
              if (totalItemCount === 0) {
                panelContentListEl.innerHTML = "<p><i>No items saved yet.</i></p>";
                updateKeyPointsButtonVisibility();
                return;
              }
              // Load first page
              loadNextPage(true);
            } else {
              const errorMsg = countResponse?.error || "Failed to count items.";
              console.error("Panel: Failed to count items:", errorMsg);
              panelContentListEl.innerHTML = `<p class="error"><i>Error: ${errorMsg}</i></p>`;
              showStatus(`Error: ${errorMsg}`, "error", false);
              updateKeyPointsButtonVisibility();
            }
          }
        );
      }
    }

    /**
     * Loads the next page of content items and appends them to the list.
     * @param {boolean} isFirstPage - If true, clears the list before appending.
     */
    function loadNextPage(isFirstPage = false) {
      if (isLoadingMore) return;
      isLoadingMore = true;

      console.log(`🔍 Loading page at offset ${currentPageOffset}, limit ${ITEMS_PAGE_SIZE}`);

      chrome.runtime.sendMessage(
        { type: "GET_CONTENT_ITEMS_PAGE", payload: { offset: currentPageOffset, limit: ITEMS_PAGE_SIZE } },
        (response) => {
          isLoadingMore = false;

          if (response && response.success && Array.isArray(response.payload)) {
            const newItems = response.payload;
            currentItemsCache = currentItemsCache.concat(newItems);
            window.currentItemsCache = currentItemsCache;
            currentPageOffset += newItems.length;

            if (isFirstPage) {
              panelContentListEl.innerHTML = "";
            }

            // Remove existing "Load More" button if present
            const existingLoadMoreBtn = panelContentListEl.querySelector(".load-more-btn");
            if (existingLoadMoreBtn) existingLoadMoreBtn.remove();

            // Append items (DB returns newest-first, no client sort needed)
            newItems.forEach((item) => {
              try {
                panelContentListEl.appendChild(createContentItemElement(item));
              } catch (error) {
                console.error(`Error creating element for item ${item.id}:`, error);
                const errorDiv = document.createElement("div");
                errorDiv.className = "content-item error";
                errorDiv.textContent = `Error loading item ${item.id}.`;
                panelContentListEl.appendChild(errorDiv);
              }
            });

            // Add "Load More" button if there are more items
            if (currentPageOffset < totalItemCount) {
              const loadMoreBtn = document.createElement("button");
              loadMoreBtn.className = "load-more-btn";
              loadMoreBtn.textContent = `Load More (${currentPageOffset} of ${totalItemCount} items loaded)`;
              loadMoreBtn.style.cssText = "width:100%;padding:10px;margin-top:8px;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;font-size:13px;";
              loadMoreBtn.addEventListener("click", () => loadNextPage(false));
              panelContentListEl.appendChild(loadMoreBtn);
            }

            if (isFirstPage) {
              showStatus(`Loaded ${newItems.length} of ${totalItemCount} items.`, "info");
            }
          } else {
            const errorMsg = response?.error || "Failed to load items page.";
            console.error("Panel: Failed to load page:", errorMsg);
            if (isFirstPage) {
              panelContentListEl.innerHTML = `<p class="error"><i>Error loading items: ${errorMsg}</i></p>`;
            }
            showStatus(`Error loading items: ${errorMsg}`, "error", false);
          }

          updateKeyPointsButtonVisibility();
        }
      );
    }
    
/**
 * Renders an array of content items into the list element.
 * @param {Array<object>} items - Array of content item objects.
 */
function displayContentItems(items) {
  if (!panelContentListEl) {
    console.error(
      "DEBUG ERROR: Panel content list element not found in displayContentItems."
    );
    return;
  }
  panelContentListEl.innerHTML = ""; // Clear previous items/loading message

  if (items.length === 0) {
    const message =
      currentFilterTagIds.length > 0
        ? "No items match the selected filter."
        : "No items saved yet.";
    panelContentListEl.innerHTML = `<p><i>${message}</i></p>`;
  } else {
    const sortedItems = items.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    sortedItems.forEach((item) => {
      try {
        panelContentListEl.appendChild(createContentItemElement(item));
      } catch (error) {
        console.error(
          `DEBUG ERROR: Error creating element for item ${item.id}:`,
          error
        );
        const errorDiv = document.createElement("div");
        errorDiv.className = "content-item error";
        errorDiv.textContent = `Error loading item ${item.id}.`;
        panelContentListEl.appendChild(errorDiv);
      }
    });
  }
}

/**
 * Creates HTML element for a single saved item summary in the list.
 */
function createContentItemElement(item) {
  const div = document.createElement("div");
  div.className = "content-item";
  div.dataset.itemId = item.id;

  let contentPreview = "";
  let analysisStatus = "";
  let titlePrefix = "";
  let itemTypeDisplay = item.type;

  switch (item.type) {
    case "page":
    case "selection":
      contentPreview =
        (item.content || "").substring(0, 150) +
        ((item.content || "").length > 150 ? "..." : "");
      break;
    case "screenshot":
      contentPreview = `<img src="${item.content}" alt="Screenshot thumbnail" class="screenshot-thumbnail"> Screenshot captured`;
      if (item.analysisCompleted === true && !item.analysisFailed)
        analysisStatus =
          ' <span class="analysis-status success">(Analyzed)</span>';
      else if (item.analysisFailed === true)
        analysisStatus =
          ' <span class="analysis-status error">(Analysis Failed)</span>';
      else if (item.analysis !== undefined && item.analysis !== null)
        analysisStatus =
          ' <span class="analysis-status pending">(Analyzing...)</span>';
      else
        analysisStatus =
          ' <span class="analysis-status pending">(Analysis Pending)</span>';
      break;
    case "pdf":
      const fileSizeKB = item.fileSize
        ? Math.round(item.fileSize / 1024)
        : "Unknown";
      contentPreview = `📄 PDF Document (${fileSizeKB}KB)`;
      analysisStatus = "";
      break;
    case GENERATED_ITEM_TYPE:
      titlePrefix = "[Generated] ";
      itemTypeDisplay = item.analysisType || "Analysis";
      contentPreview =
        (item.content || "").substring(0, 150) +
        ((item.content || "").length > 150 ? "..." : "");
      analysisStatus = ` <span class="analysis-status generated">(${itemTypeDisplay})</span>`;
      break;
    default:
      contentPreview = "Unknown item type";
      break;
  }

  div.innerHTML = `
        <div class="item-summary">
            <strong>${titlePrefix}${
    item.title || `Item ${item.id}`
  } (${itemTypeDisplay})${analysisStatus}</strong>
            <p class="preview">${
              contentPreview || "<i>No preview available</i>"
            }</p>
            <span class="timestamp">${new Date(
              item.createdAt
            ).toLocaleString()}</span>
            <button class="delete-btn" title="Delete Item">&times;</button>
        </div>
        <div class="item-details" style="display: none;">
            <!-- Content will be populated on expand -->
        </div>
    `;
  return div;
}

function displayItemDetails(item, detailElement) {
  // --- helpers ---
  const esc = (s) =>
    (s ?? "").toString().replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  const escAttr = (s) => esc(s);

  let contentHtml = "",
    analysisHtml = "",
    metadataHtml = "";

  // Common metadata (supports both naming schemes)
  const lang = item.pageLang ?? item.lang ?? null;
  const description = item.pageDescription ?? item.metaDescription ?? null;
  const keywords = item.pageKeywords ?? item.metaKeywords ?? null;
  const linksArr = Array.isArray(item.links) ? item.links : [];
  // identifiers
  const host = item.host ?? null;
  const canonicalUrl = item.canonicalUrl ?? null;
  const slug = item.slug ?? null;
  const siteName = item.siteName ?? null;
  const section = item.section ?? null;
  const author = item.author ?? null;
  const publisher = item.publisher ?? null;
  const datePub = item.datePublished ?? null;
  const dateMod = item.dateModified ?? null;
  const ctype = item.contentType ?? null;
  const notesContent = item.notes ?? ''; // AN-5: Notes content

  // Build a reusable metadata block
  const metaBits = [];
  if (lang) metaBits.push(`<div><strong>lang:</strong> ${esc(lang)}</div>`);
  if (description)
    metaBits.push(
      `<div><strong>description:</strong> ${esc(description)}</div>`
    );
  if (keywords)
    metaBits.push(`<div><strong>keywords:</strong> ${esc(keywords)}</div>`);
  // identifiers (pretty + compact)
  if (host) metaBits.push(`<div><strong>host:</b> ${esc(host)}</div>`);
  if (canonicalUrl)
    metaBits.push(
      `<div><strong>canonical:</strong> <a href="${escAttr(
        canonicalUrl
      )}" target="_blank" rel="noopener noreferrer">${esc(
        canonicalUrl
      )}</a></div>`
    );
  if (slug) metaBits.push(`<div><strong>slug:</strong> ${esc(slug)}</div>`);
  if (siteName)
    metaBits.push(`<div><strong>site:</strong> ${esc(siteName)}</div>`);
  if (section)
    metaBits.push(`<div><strong>section:</strong> ${esc(section)}</div>`);
  if (author)
    metaBits.push(`<div><strong>author:</strong> ${esc(author)}</div>`);
  if (publisher)
    metaBits.push(`<div><strong>publisher:</strong> ${esc(publisher)}</div>`);
  if (datePub)
    metaBits.push(`<div><strong>published:</strong> ${esc(datePub)}</div>`);
  if (dateMod)
    metaBits.push(`<div><strong>updated:</strong> ${esc(dateMod)}</div>`);
  if (ctype) metaBits.push(`<div><strong>type:</strong> ${esc(ctype)}</div>`);

  // Optional: show up to 10 links
  if (linksArr.length) {
    const top = linksArr
      .slice(0, 10)
      .map(
        (l) =>
          `<li><a href="${escAttr(
            l.url
          )}" target="_blank" rel="noopener noreferrer">${esc(
            l.text || l.url
          )}</a></li>`
      )
      .join("");
    metaBits.push(
      `<details style="margin-top:6px;">
         <summary><strong>links</strong> (${linksArr.length})</summary>
         <ul style="margin:6px 0 0 18px;">${top}</ul>
       </details>`
    );
  }

  const metaBlock = metaBits.length
    ? `<div class="item-meta" style="margin:8px 0;padding:8px;border:1px solid var(--panel-border-light);border-radius:6px;">
         <div style="font-weight:600;margin-bottom:6px;">Page metadata</div>
         ${metaBits.join("")}
       </div>`
    : "";
    
  // AN-5: Notes HTML Block (Includes AN-8 PII Button) — collapsible accordion
  const notesHtml = `
        <details class="detail-accordion detail-notes-section">
            <summary class="detail-accordion-summary">Personal Notes &amp; Annotations</summary>
            <div class="detail-accordion-body">
                <textarea id="itemNotesInput_${item.id}"
                          placeholder="Add detailed notes or context here..."
                          class="notes-textarea">${esc(notesContent)}</textarea>
                <div class="notes-actions">
                    <button id="anonymizeBtn_${item.id}" class="add-tag-btn notes-action-btn notes-action-btn--danger">Anonymize PII</button>
                    <button id="saveNotesBtn_${item.id}" class="add-tag-btn notes-action-btn">Save Notes</button>
                </div>
            </div>
        </details>
    `;


  // --- type-specific content/metadata ---
  switch (item.type) {
    case GENERATED_ITEM_TYPE:
      contentHtml = `<pre class="content-preview">${esc(
        item.content || "No content."
      )}</pre>`;
      metadataHtml = `<p><small>Source Tag IDs: ${
        esc((item.sourceTagIds || []).join(", ")) || "N/A"
      }</small></p>`;
      break;

    case "page":
    case "selection":
      contentHtml = `<pre class="content-full">${esc(
        item.content || "No text content."
      )}</pre>`;
      metadataHtml = `<p><small>URL: <a href="${escAttr(
        item.url
      )}" target="_blank" rel="noopener noreferrer">${esc(
        item.url
      )}</a></small></p>${metaBlock}`;
      break;

    case "screenshot": {
      const src = item.content || "";
      contentHtml = `
        <img src="${escAttr(src)}" alt="Full screenshot" class="screenshot-full">
        <button class="open-in-new-tab-btn" data-url="${escAttr(item.url)}">Open image in new tab</button>
      `;
      metadataHtml = `<p><small>URL: <a href="${escAttr(
        item.url
      )}" target="_blank" rel="noopener noreferrer">${esc(
        item.url
      )}</a></small></p>${metaBlock}`;

      // Prefer a human-friendly summary if available
      const summary = item?.analysis?.description;
      analysisHtml = summary
        ? `<h4>AI Analysis</h4><div style="margin:6px 0;"><em>${esc(
            summary
          )}</em></div>`
        : "";

      // Full JSON (collapsible) when analysis exists
      if (item.analysis) {
        // AN-6: Add Copy Button and unique ID for JSON content
        analysisHtml += `
          <details style="margin-top:6px;">
            <summary style="display: flex; justify-content: space-between; align-items: center;">
                <span>Show full analysis JSON</span>
                <button id="copyJsonBtn_${item.id}" class="add-tag-btn" style="padding: 3px 8px; font-size: 0.8em; margin-left: 10px; flex-shrink: 0;">Copy JSON</button>
            </summary>
            <pre id="analysisJsonContent_${item.id}"><code>${esc(
              JSON.stringify(item.analysis, null, 2)
            )}</code></pre>
          </details>`;
      }

      // Convert to draw.io button — only when a diagram was detected
      if (item.analysis?.diagramData) {
        analysisHtml += `
          <div class="drawio-action-group" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;">
            <button id="convertDrawioBtn_${item.id}" class="add-tag-btn drawio-convert-btn" style="padding:5px 12px;font-size:0.85em;">Convert to draw.io</button>
            <button id="drawioDownloadBtn_${item.id}" class="drawio-icon-btn" title="Download .drawio file" disabled>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
            <button id="drawioOpenBtn_${item.id}" class="drawio-icon-btn" title="Open in app.diagrams.net" disabled>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 2h4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M14 2L8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>`;
      }
      // TOML export — disabled pending proper serializer
      // if (item.analysis) {
      //   analysisHtml += `
      //     <button id="convertTomlBtn_${item.id}" class="add-tag-btn" style="margin-top:8px;margin-left:6px;padding:5px 12px;font-size:0.85em;">Export as TOML</button>`;
      // }
      break;
    }

    case "pdf": {
      const fname = (item.title || "download").replace(/[^a-z0-9]/gi, "_");
      const href = item.content || "#";
      contentHtml = `<div class="pdf-preview">
          <p><strong>📄 PDF Document</strong></p>
          <div class="pdf-actions">
            <a href="${escAttr(href)}" download="${escAttr(
        fname
      )}.pdf" class="pdf-download-btn">Download</a>
            <button onclick="window.open('${escAttr(
              href
            )}','_blank')" class="pdf-view-btn">View in New Tab</button>
          </div>
        </div>`;
      metadataHtml = `<p><small>URL: <a href="${escAttr(
        item.url
      )}" target="_blank" rel="noopener noreferrer">${esc(
        item.url
      )}</a></small></p>${metaBlock}`;
      break;
    }
  }

  // --- render ---
  detailElement.innerHTML = `
    ${notesHtml}  <!-- AN-5/AN-8: Inject notes/anonymization section -->
    <div class="detail-content">${contentHtml}</div>
    <div class="detail-metadata">${metadataHtml}</div>
    <div class="detail-analysis">${analysisHtml}</div>
    <div class="detail-tags-section">
      <h5>Tags</h5>
      <div class="tags-list" data-content-id="${escAttr(
        item.id
      )}"><i>Loading tags...</i></div>
      <div class="add-tag-controls">
        <input type="text" class="add-tag-input" placeholder="Add tag or get suggestions..." aria-label="Add new tag">
        <button class="add-tag-btn" data-content-id="${escAttr(
          item.id
        )}">Add</button>
      </div>
    </div>
    <button class="close-details-btn">Close</button>
  `;

  // --- AN-5: Save Notes Event Listener ---
    const saveNotesBtn = detailElement.querySelector(`#saveNotesBtn_${item.id}`);
    const notesInput = detailElement.querySelector(`#itemNotesInput_${item.id}`);
    if (saveNotesBtn && notesInput) {
        saveNotesBtn.addEventListener('click', () => {
            handleSaveNotes(item.id, notesInput.value, saveNotesBtn);
        });
    }
    
    // --- AN-8: Anonymization Event Listener ---
    const anonymizeBtn = detailElement.querySelector(`#anonymizeBtn_${item.id}`);
    if (anonymizeBtn) {
        // Only allow anonymization on content that *can* be anonymized
        if (item.type === 'page' || item.type === 'selection') {
            anonymizeBtn.addEventListener('click', () => {
                handleAnonymizeContent(item.id, anonymizeBtn, detailElement);
            });
        } else {
            anonymizeBtn.disabled = true;
            anonymizeBtn.textContent = 'Anonymize N/A';
        }
    }


  // --- AN-6: Copy JSON Event Listener ---
    const copyJsonBtn = detailElement.querySelector(`#copyJsonBtn_${item.id}`);
    const jsonContentEl = detailElement.querySelector(`#analysisJsonContent_${item.id}`);

    if (copyJsonBtn && jsonContentEl) {
        copyJsonBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent the click from toggling the <details> element
            // Use textContent to get the raw JSON string from the <pre>
            copyTextToClipboard(jsonContentEl.textContent, copyJsonBtn);
        });
    }

    // --- Convert to draw.io Event Listener ---
    const convertDrawioBtn = detailElement.querySelector(`#convertDrawioBtn_${item.id}`);
    if (convertDrawioBtn) {
        convertDrawioBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleConvertToDrawio(item.id, convertDrawioBtn);
        });
    }

    // --- draw.io Download icon ---
    const drawioDownloadBtn = detailElement.querySelector(`#drawioDownloadBtn_${item.id}`);
    if (drawioDownloadBtn) {
        drawioDownloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const safeTitle = (item.title || 'diagram').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
            const filename = `${safeTitle}.drawio`;
            chrome.runtime.sendMessage({ type: 'DOWNLOAD_DRAWIO', payload: { itemId: item.id, filename } });
        });
    }

    // --- draw.io Open-in-browser icon ---
    const drawioOpenBtn = detailElement.querySelector(`#drawioOpenBtn_${item.id}`);
    if (drawioOpenBtn) {
        drawioOpenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'OPEN_DRAWIO', payload: { itemId: item.id } });
        });
    }

    // --- Convert to TOML Event Listener --- (disabled pending proper serializer)
    // const convertTomlBtn = detailElement.querySelector(`#convertTomlBtn_${item.id}`);
    // if (convertTomlBtn) {
    //     convertTomlBtn.addEventListener('click', (e) => {
    //         e.stopPropagation();
    //         handleConvertToToml(item.id, convertTomlBtn);
    //     });
    // }

  const screenshotFull = detailElement.querySelector('.screenshot-full');
    if (screenshotFull) {
        screenshotFull.addEventListener('click', (e) => {
            e.stopPropagation();
            if (lightbox && lightboxImg) {
                lightbox.style.display = "block";
                lightboxImg.src = e.target.src;
            }
        });
    }

  const openInNewTabBtn = detailElement.querySelector('.open-in-new-tab-btn');
    if (openInNewTabBtn) {
        openInNewTabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = openInNewTabBtn.dataset.url;
            if (url) {
                window.open(url, '_blank');
            }
        });
    }

  // tags + close wiring
  const tagsListElement = detailElement.querySelector(".tags-list");
  fetchAndDisplayTags(item.id, tagsListElement);

  detailElement.querySelector(".close-details-btn").onclick = () => {
    detailElement.style.display = "none";
    detailElement.innerHTML = "";
  };

  const addTagInput = detailElement.querySelector(".add-tag-input");
  const addTagButton = detailElement.querySelector(".add-tag-btn");
  
  // FIX (AN-10): Redefine handleAddTag to ensure input value is read reliably on every click.
  const handleAddTag = () => {
    try {
      // If enabled via console, pause execution here so DevTools can inspect state.
      if (window.__wi_pause_on_add_click) {
        console.log('WI: pause-on-add-click enabled — breaking into debugger');
        debugger; // one-off pause; toggle with window.__wi_set_pause_on_add_click(true/false)
      }
      // FIX: Retrieve value *inside* the handler right before use.
      const tagName = addTagInput.value.trim();
      const itemContent = item.content; // Content for AI suggestion lookup

      // SHORT-LIVED DEBUG: confirm handler invocation and values
      console.log("panel: handleAddTag invoked for item", item.id, "inputValue:", tagName);

      // Check if the user entered text
      if (tagName.length > 0) {
        enhancedAddTag(
          item.id,
          tagName,
          itemContent,
          addTagInput,
          tagsListElement
        );
        addTagInput.value = "";
      } else {
        showStatus("Enter a tag name.", "info");
      }
    } catch (err) {
      // SHORT-LIVED DEBUG: surface any unexpected exception in the click handler
      console.error("panel: handleAddTag exception:", err && err.stack ? err.stack : err);
      showStatus("An error occurred when adding tag. See console.", "error");
    }
  };
  
  // Event listeners added here
  addTagButton.addEventListener("click", handleAddTag);
  addTagInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        e.preventDefault(); // Prevent accidental form submission
        handleAddTag();
    }
  });
}

/** Fetches and displays tags for an item, adds remove listeners. */
function fetchAndDisplayTags(contentId, tagsListElement) {
  if (!tagsListElement) {
    console.error(
      "Cannot display tags: tagsListElement is null for contentId",
      contentId
    );
    return;
  }
  tagsListElement.innerHTML = "<i>Loading tags...</i>";
  chrome.runtime.sendMessage(
    { type: "GET_TAGS_FOR_ITEM", payload: { contentId: contentId } },
    (response) => {
      tagsListElement.innerHTML = ""; // Clear loading
      if (response && response.success && Array.isArray(response.payload)) {
        const tags = response.payload;
        if (tags.length === 0) {
          tagsListElement.innerHTML = "<i>No tags yet.</i>";
        } else {
          tags.sort((a, b) => a.name.localeCompare(b.name));
          tags.forEach((tag) => {
            const tagSpan = document.createElement("span");
            tagSpan.className = "tag-item";
            tagSpan.textContent = tag.name;
            tagSpan.dataset.tagId = tag.id;
            const removeBtn = document.createElement("button");
            removeBtn.className = "remove-tag-btn";
            removeBtn.innerHTML = "&times;";
            removeBtn.title = `Remove tag "${tag.name}"`;
            removeBtn.dataset.tagId = tag.id;
            removeBtn.dataset.contentId = contentId;
            removeBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              const tagIdToRemove = parseInt(e.target.dataset.tagId);
              const contentIdToRemoveFrom = parseInt(
                e.target.dataset.contentId
              );
              if (!isNaN(tagIdToRemove) && !isNaN(contentIdToRemoveFrom)) {
                showStatus(`Removing tag "${tag.name}"...`, "info", false);
                suppressContentReload = true; // Prevent accordion collapse from storage listener
                chrome.runtime.sendMessage(
                  {
                    type: "REMOVE_TAG_FROM_ITEM",
                    payload: {
                      contentId: contentIdToRemoveFrom,
                      tagId: tagIdToRemove,
                    },
                  },
                  (response) =>
                    handleTagActionResponse(
                      response,
                      contentIdToRemoveFrom,
                      tagsListElement
                    )
                );
              } else {
                console.error(
                  "Invalid tagId/contentId for removal:",
                  e.target.dataset
                );
                showStatus("Error: Could not remove tag.", "error");
              }
            });
            tagSpan.appendChild(removeBtn);
            tagsListElement.appendChild(tagSpan);
          });
        }
      } else {
        console.error(
          "Failed to fetch tags for item",
          contentId,
          ":",
          response?.error
        );
        tagsListElement.innerHTML = '<i class="error">Failed to load tags.</i>';
      }
    }
  );
}

/** Handles responses from tag add/remove actions. Refreshes tags for the specific item. */
function handleTagActionResponse(response, contentId, tagsListElement) {
  if (response && response.success) {
    showStatus("Tag action successful!", "success");
    if (tagsListElement && document.body.contains(tagsListElement)) {
      fetchAndDisplayTags(contentId, tagsListElement);
    } else {
      loadFilterTags();
    }
  } else {
    const detailedError = response?.error || "Unknown error.";
    showStatus(
      `Tag action failed: ${detailedError}`,
      "error"
    );
  }
}

/** Sends delete message to background script. */
function deleteItem(id, title = "") {
  const confirmMessage = `Are you sure you want to delete "${
    title || `Item ${id}`
  }"?`;
  // IMPORTANT: Use standard window.confirm, as it is non-blocking here.
  // We cannot easily replace this with a custom modal without significant restructuring.
  if (!confirm(confirmMessage)) {
    return;
  }
  showStatus(`Deleting item ${id}...`, "info", false);
  chrome.runtime.sendMessage(
    { type: "DELETE_ITEM", payload: { id: id } },
    (response) => {
      handleActionResponse(
        response
          ? response
          : { success: false, error: "No response from background for delete." }
      );
    }
  );
}

// --- Status Message Management ---
function showStatus(message, type = "info", autoClear = true) {
  if (!panelStatusMessageEl) return;
  panelStatusMessageEl.textContent = message;
  panelStatusMessageEl.className = `status-message ${type}`;
  panelStatusMessageEl.style.display = "block";
  if (autoClear) {
    setTimeout(() => {
      if (panelStatusMessageEl.textContent === message) clearStatus();
    }, 3500);
  }
}
function clearStatus() {
  if (!panelStatusMessageEl) return;
  panelStatusMessageEl.style.display = "none";
  panelStatusMessageEl.textContent = "";
  panelStatusMessageEl.className = "status-message";
}
// --- Theme Management ---
function applyPanelTheme() {
  chrome.storage.sync.get(["theme"], (syncResult) => {
    const theme = syncResult.theme || "system";
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const useDarkMode = theme === "dark" || (theme === "system" && prefersDark);
    if (useDarkMode) document.body.classList.add("dark-mode");
    else document.body.classList.remove("dark-mode");
    console.log(
      `Panel theme applied: ${
        theme === "system"
          ? prefersDark
            ? "dark (system)"
            : "light (system)"
          : theme
      }`
    );
  });
}

// --- Filter Logic ---

/** Fetches all unique tags and populates the filter list */
function loadFilterTags() {
  if (!tagFilterListEl) {
    console.error("Tag filter list element not found.");
    return;
  }
  tagFilterListEl.innerHTML = "<i>Loading tags...</i>";

  chrome.runtime.sendMessage({ type: "GET_ALL_TAGS" }, (response) => {
    tagFilterListEl.innerHTML = ""; // Clear loading message
    if (response && response.success && Array.isArray(response.payload)) {
      const tags = response.payload;
      if (tags.length === 0) {
        tagFilterListEl.innerHTML = "<i>No tags available to filter by.</i>";
        if (clearTagFilterBtn) { clearTagFilterBtn.style.display = "inline-block"; clearTagFilterBtn.textContent = "All Items"; }
        if (getKeyPointsBtn) getKeyPointsBtn.style.display = "none";
      } else {
        tags.sort((a, b) => a.name.localeCompare(b.name));
        tags.forEach((tag) => {
          const tagButton = document.createElement("button");
          tagButton.className = "tag-filter-item";
          tagButton.textContent = tag.name;
          tagButton.dataset.tagId = tag.id;
          tagButton.dataset.tagName = tag.name;
          tagButton.title = `Filter by tag: ${tag.name}`;
          if (currentFilterTagIds.includes(tag.id)) {
            tagButton.classList.add("active");
          }
          tagButton.addEventListener("click", handleFilterTagClick);
          tagFilterListEl.appendChild(tagButton);
        });
        if (clearTagFilterBtn) {
          clearTagFilterBtn.style.display = "inline-block";
          clearTagFilterBtn.textContent = currentFilterTagIds.length > 0 ? "View All Items" : "All Items";
        }
        updateKeyPointsButtonVisibility();
      }
    } else {
      console.error("Failed to load tags for filtering:", response?.error);
      tagFilterListEl.innerHTML = '<i class="error">Error loading tags.</i>';
      if (getKeyPointsBtn) getKeyPointsBtn.style.display = "none";
    }
  });
}

// --- Chat Logic ---

// --- Chat Logic ---

function updateChatAccordionHint() {
  if (!chatAccordionHintEl) return;
  chatAccordionHintEl.textContent = currentFilterTagNames.length > 0
    ? `Scoped to: ${currentFilterTagNames.join(", ")}`
    : "Scoped to: all items";
}

async function handleChatSend() {
  const msg = chatInputEl?.value?.trim();
  if (!msg) return;

  appendChatBubble("user", msg);
  chatInputEl.value = "";
  chatSendBtn.disabled = true;

  const thinkingId = appendChatBubble("assistant", "…");

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "CHAT_MESSAGE",
          payload: {
            tagIds: currentFilterTagIds,
            userMessage: msg,
            history: chatConversationHistory,
          }
        },
        (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(r);
        }
      );
    });

    updateChatBubble(thinkingId, response?.success ? response.reply : `Error: ${response?.error || "Unknown error"}`);

    if (response?.success) {
      chatConversationHistory.push({ role: "user", content: msg });
      chatConversationHistory.push({ role: "assistant", content: response.reply });
      if (chatConversationHistory.length > 20) chatConversationHistory = chatConversationHistory.slice(-20);
      if (chatSaveBtn) chatSaveBtn.disabled = false;
    }
  } catch (err) {
    updateChatBubble(thinkingId, `Error: ${err.message}`);
  } finally {
    chatSendBtn.disabled = false;
  }
}

let _chatBubbleCounter = 0;
function appendChatBubble(role, text) {
  if (!chatHistoryEl) return null;
  const id = `chat-bubble-${++_chatBubbleCounter}`;
  const div = document.createElement("div");
  div.className = `chat-bubble chat-bubble--${role}`;
  div.id = id;
  div.textContent = text;
  chatHistoryEl.appendChild(div);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  return id;
}

function updateChatBubble(id, text) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  }
}

function handleChatSave() {
  if (chatConversationHistory.length === 0) return;
  if (chatSaveBtn) chatSaveBtn.disabled = true;
  chrome.runtime.sendMessage(
    {
      type: "SAVE_CHAT_SESSION",
      payload: {
        history: chatConversationHistory,
        tagIds: currentFilterTagIds,
        tagNames: currentFilterTagNames,
      }
    },
    (response) => {
      if (chatSaveBtn) chatSaveBtn.disabled = false;
      if (response?.success) {
        showStatus("Chat saved to your items.", "success");
      } else {
        showStatus(`Save failed: ${response?.error || "Unknown error"}`, "error");
      }
    }
  );
}

function handleChatNew() {
  chatConversationHistory = [];
  if (chatHistoryEl) chatHistoryEl.innerHTML = "";
  if (chatSaveBtn) chatSaveBtn.disabled = true;
}

/** Handles clicks on a tag in the filter list */

    function handleFilterTagClick(event) {
      const clickedTagButton = event.target;
      const tagId = parseInt(clickedTagButton.dataset.tagId);
      const tagName = clickedTagButton.dataset.tagName;

      if (isNaN(tagId)) {
        console.error("Invalid tag ID on filter button:", clickedTagButton.dataset.tagId);
        return;
      }

      // Check if the tag is currently active
      const isActive = currentFilterTagIds.includes(tagId);

      let newFilterTagIds;
      let newFilterTagNames;

      if (isActive) {
        // If active, remove it from the filter
        newFilterTagIds = currentFilterTagIds.filter((id) => id !== tagId);
        newFilterTagNames = currentFilterTagNames.filter((name) => name !== tagName);
      } else {
        // If inactive, add it to the filter
        newFilterTagIds = [...currentFilterTagIds, tagId];
        newFilterTagNames = [...currentFilterTagNames, tagName];
      }

      // Update the global state
      currentFilterTagIds = newFilterTagIds;
      currentFilterTagNames = newFilterTagNames;

      // Toggle the 'active' class immediately for visual feedback
      clickedTagButton.classList.toggle("active", !isActive);

      // Update the label of the 'View All' button
      if (clearTagFilterBtn) {
        clearTagFilterBtn.style.display = "inline-block";
        clearTagFilterBtn.textContent = currentFilterTagIds.length > 0 ? "View All Items" : "All Items";
      }

      // Reload content with the new set of filter tags
      loadSavedContent(currentFilterTagIds);
    }

    /** Handles click on the "Clear Filter" / "View All Items" button */
    function handleClearFilter() {

      currentFilterTagIds = [];
      currentFilterTagNames = [];

      // Remove 'active' class from all filter tags
      tagFilterListEl.querySelectorAll(".tag-filter-item.active").forEach((el) => {
        el.classList.remove("active");
      });

      if (clearTagFilterBtn) {
        clearTagFilterBtn.textContent = "All Items";
      }

      loadSavedContent(null); // Load all content (no filter)
    }
    

// --- Key Points Logic ---

/** Handles click on the "Get Key Points" button */
function handleGetKeyPointsClick() {
  if (currentFilterTagIds.length === 0 || !getKeyPointsBtn) return;

  showStatus(
    `Generating key points for tag "${currentFilterTagNames.join(', ')}" ...`,
    "info",
    false
  );
  hideKeyPointsResultArea();

  getKeyPointsBtn.disabled = true;
  getKeyPointsBtn.textContent = "Generating...";

  chrome.runtime.sendMessage(
    { type: "GET_KEY_POINTS_FOR_TAG", payload: { tagId: currentFilterTagIds[0] } },
    handleKeyPointsResponse
  );
}

/** Handles click on the "Generate Report" button */
async function handleGenerateReportClick() {
  if (currentFilterTagIds.length === 0 || !generateReportBtn) return;

  // Warn if many tags selected (large reports can be very slow)
  if (currentFilterTagIds.length > 3) {
    const proceed = confirm(
      `You have ${currentFilterTagIds.length} tags selected (${currentItemsCache.length} items).\n\n` +
      `Large reports with many screenshots can take several minutes to render.\n` +
      `For best results, select 1-3 tags at a time.\n\nProceed anyway?`
    );
    if (!proceed) return;
  }

  // AN-9: Set initial UI status when clicking the button
  showStatus(
    `Starting PDF report generation for ${currentFilterTagIds.length} tag(s): "${
      currentFilterTagNames.join(', ') || "selected"
    }"...`,
    "info",
    false
  );

  generateReportBtn.disabled = true;
  generateReportBtn.textContent = "Generating...";

  // NOTE: This now relies on handleBackgroundStatusUpdate for step-by-step feedback
  chrome.runtime.sendMessage(
    {
      type: "GENERATE_PDF_REPORT_FOR_TAG",
      payload: { tagIds: currentFilterTagIds },
    },
    handleGenerateReportResponse
  );
}

/** Handles the response from the background after requesting PDF report generation */
function handleGenerateReportResponse(response) {
  if (generateReportBtn) {
    generateReportBtn.disabled = false;
    updateKeyPointsButtonVisibility();
    generateReportBtn.textContent = "Generate Report"; // Reset text
  }

  if (response && response.success) {
    console.log("PDF report generated successfully:", response.filename);
    showStatus(`PDF report generated: ${response.filename}`, "success", 5000);
  } else {
    const errorMsg = response?.error || "Failed to generate PDF report.";
    console.error("PDF report generation failed:", errorMsg);
    // If the background failed, show the final error, but rely on background for progress status
    showStatus(`Error: ${errorMsg}`, "error", false); 
  }
}

/**
 * Handles the response from the background after requesting key points.
 */
function handleKeyPointsResponse(response) {
  if (getKeyPointsBtn) {
    getKeyPointsBtn.disabled = false;
    updateKeyPointsButtonVisibility();
    getKeyPointsBtn.textContent = `Get Key Points for "${currentFilterTagName || "Selected"}"`; // Reset text
  }

  if (response && response.success) {
    showStatus(
      `Key points generated and saved (ID: ${response.newId}). ${
        response.sourceInfo || ""
      }`,
      "success",
      5000
    );
    displayKeyPointsResult(response.keyPoints, response.sourceInfo);
  } else {
    const errorMsg = response?.error || "Failed to generate key points.";
    console.error("Key points generation failed:", errorMsg);
    showStatus(`Error: ${errorMsg}`, "error", false);
    hideKeyPointsResultArea();
  }
}

/** Populates and shows the Key Points Result Display Area */
function displayKeyPointsResult(keyPointsText, sourceInfoText) {
  if (!keyPointsResultDisplayArea) {
    console.error("Key points result display area not found.");
    return;
  }
  keyPointsResultDisplayArea.innerHTML = `
        <h4>Key Points for Tag: ${currentFilterTagName || "Selected"}</h4>
        <div class="key-points-content">${(
          keyPointsText || "No content generated."
        ).replace(/\n/g, "<br>")}</div>
        <span class="source-info">${sourceInfoText || ""}</span>
    `;
  keyPointsResultDisplayArea.style.display = "block";
}

/** Hides and clears the Key Points Result Display Area */
function hideKeyPointsResultArea() {
  if (keyPointsResultDisplayArea) {
    keyPointsResultDisplayArea.style.display = "none";
    keyPointsResultDisplayArea.innerHTML = "";
  }
}

/** Updates the visibility and text of tag-related action buttons based on filter state */

    function updateKeyPointsButtonVisibility() {
      const hasTags = currentFilterTagIds.length > 0;
      const buttonText = hasTags
        ? `Get Key Points for "${currentFilterTagNames.join(", ")}"`
        : "Get Key Points";

      updateChatAccordionHint();

      if (getKeyPointsBtn) {
        getKeyPointsBtn.textContent = buttonText;
        getKeyPointsBtn.style.display = hasTags ? "inline-block" : "none";
        getKeyPointsBtn.disabled = !hasTags; // Disable if no tags are selected
      }

      // Generate Report button (also updated here for consistency)
      if (generateReportBtn) {
        generateReportBtn.textContent = hasTags
          ? `Generate Report for "${currentFilterTagNames.join(", ")}"`
          : "Generate Report";
        generateReportBtn.style.display = hasTags ? "inline-block" : "none";
        generateReportBtn.disabled = !hasTags; // Disable if no tags are selected
      }

      // Export Project for AI button (also updated here for consistency)
      if (exportProjectBtn) {
        exportProjectBtn.textContent = hasTags
          ? `Export Project for "${currentFilterTagNames.join(", ")}"`
          : "Export Project for AI";
        exportProjectBtn.style.display = hasTags ? "inline-block" : "none";
        exportProjectBtn.disabled = !hasTags; // Disable if no tags are selected
      }

      // Show All Items (clear filter) button — always visible, label changes
      if (clearTagFilterBtn) {
        clearTagFilterBtn.style.display = "inline-block";
        clearTagFilterBtn.textContent = hasTags ? "View All Items" : "All Items";
      }
    }
    



// --- AI Functionality ---
/** Handles export of all items under the current tag into a JSON file */
function handleExportProjectClick() {
  if (currentFilterTagIds.length === 0) {
    showStatus("Please select a tag to export a project.", "error");
    return;
  }

  showStatus(`Exporting project "${currentFilterTagNames.join(', ')}"...`, "info", false);
  exportProjectBtn.disabled = true;

  chrome.runtime.sendMessage(
    { type: "EXPORT_PROJECT_FOR_AI", payload: { tagId: currentFilterTagIds[0] } },
    (response) => {
      exportProjectBtn.disabled = false;

      if (response && response.success) {
        const data = response.payload; // { projectMetadata, documents: [...] }
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        const sanitizedTagName = (currentFilterTagNames.join(', ') || "project")
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9-]/g, "");
        const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
        a.download = `${sanitizedTagName}_${ts}.json`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus(`Project "${currentFilterTagNames.join(', ')}" exported.`, "success");
      } else {
        showStatus(
          `Project export failed: ${response?.error || "Unknown error"}`,
          "error"
        );
      }
    }
  );
}

/** Initialize Local AI functionality */
// helper: promise-ified sendMessage with timeout + lastError handling
function sendMessageAsync(message, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Initialization timed out")),
      timeoutMs
    );
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      // Handle extension transport errors
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(response);
    });
  });
}

/**
 * Add a tag to a content item.
 */
async function enhancedAddTag(
  contentId,
  userInput,
  contentText,
  tagInputEl,
  tagsListEl
) {
  if (!tagInputEl || !tagsListEl) {
    console.error("Missing tagInputEl or tagsListEl in enhancedAddTag call.");
    return;
  }

  if (userInput && userInput.trim()) {
    const normalizedTag = userInput;
    showStatus(`Adding tag "${normalizedTag}"...`, "info", false);
    suppressContentReload = true;

    console.log("panel -> ADD_TAG_TO_ITEM", { contentId: contentId, tagName: normalizedTag });
    chrome.runtime.sendMessage(
      {
        type: "ADD_TAG_TO_ITEM",
        payload: { contentId: contentId, tagName: normalizedTag },
      },
      (response) => {
          console.log("panel <- raw response for ADD_TAG_TO_ITEM:", response);
          if (chrome.runtime.lastError) {
            console.error("panel: runtime.lastError after sendMessage (ADD_TAG_TO_ITEM):", chrome.runtime.lastError);
            handleTagActionResponse({ success: false, error: chrome.runtime.lastError.message }, contentId, tagsListEl);
            return;
          }
          try { handleTagActionResponse(response, contentId, tagsListEl); } catch (e) { console.error("panel: handleTagActionResponse threw:", e); }
      }
    );
  }
}

console.log(
  "WebInsight Panel script loaded and initialized (v8 - Simple Display with PDF support)."
);