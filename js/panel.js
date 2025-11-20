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
const aiStatusIndicator = document.getElementById("aiStatusIndicator");
const initializeAIBtn = document.getElementById("initializeAIBtn");
const generateEmbeddingsBtn = document.getElementById("generateEmbeddingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const someOtherCheckbox = document.getElementById("someOtherCheckbox");

// --- State ---
let currentFilterTagId = null; // Keep track of the active filter tag ID
let currentFilterTagName = null; // Keep track of the active filter tag name
let currentItemsCache = []; // Cache the full list of items
let aiInitialized = false;
let aiLoading = false;
let aiMode = "local-first"; // default if not set yet

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
                cachedItem.content = response.payload.newContent;
                
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


// --- Initialization ---

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Panel DOM loaded.");
  applyPanelTheme();
  loadFilterTags();
  loadSavedContent();
  addEventListeners();

  // Load AI mode, apply UI, then check model status
  await loadAIModeFromStorage();
  applyAIModeToUI();
  checkAIStatus();

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


// --- AI MODE: read from storage ---
function loadAIModeFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["aiMode"], (res) => {
      aiMode = res.aiMode || "local-first";
      resolve(aiMode);
    });
  });
}

// --- AI UI: reflect mode in the status pill & buttons ---
function applyAIModeToUI() {
  if (!aiStatusIndicator) return;

  let label = "";
  if (aiMode === "disabled") {
    label = "AI disabled — turn on in Settings";
    aiStatusIndicator.className = "ai-status disabled";
    initializeAIBtn.disabled = true;
    generateEmbeddingsBtn.style.display = "none";
  } else if (aiMode === "cloud-only") {
    label = "AI mode: Cloud (Gemini) — no local model needed";
    aiStatusIndicator.className = "ai-status ready";
    initializeAIBtn.disabled = true; // no local model to init
    generateEmbeddingsBtn.style.display = "none";
  } else if (aiMode === "local-only") {
    label = "AI mode: Local only — initialize to enable features";
    aiStatusIndicator.className = "ai-status disabled";
    initializeAIBtn.disabled = false;
    generateEmbeddingsBtn.style.display = "none"; // show after init
  } else {
    // 'local-first' (default)
    label = "AI mode: Local-first — initialize local model";
    aiStatusIndicator.className = "ai-status disabled";
    initializeAIBtn.disabled = false;
    generateEmbeddingsBtn.style.display = "none"; // show after init
  }

  aiStatusIndicator.textContent = label;
}

// --- Event Listener Setup ---
/** Adds event listeners to all static interactive elements in the panel. */
function addEventListeners() {
  if (initializeAIBtn) {
    initializeAIBtn.addEventListener("click", handleInitializeAI);
  }

  if (generateEmbeddingsBtn) {
    generateEmbeddingsBtn.addEventListener("click", handleGenerateEmbeddings);
  }
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

  // Add to addEventListeners() function (around line 60)
  // AI Control Buttons
  if (initializeAIBtn)
    initializeAIBtn.addEventListener("click", handleInitializeAI);
  else console.warn("Initialize AI button not found.");
  if (generateEmbeddingsBtn)
    generateEmbeddingsBtn.addEventListener("click", handleGenerateEmbeddings);
  else console.warn("Generate Embeddings button not found.");

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

        if (tagName.length === 0 && aiInitialized) {
          enhancedAddTag(contentId, null, itemData.content, addInput, tagsListEl);
        } else if (tagName.length > 0) {
          enhancedAddTag(contentId, tagName, itemData.content, addInput, tagsListEl);
          addInput.value = '';
        } else {
          showStatus('Enter a tag name or initialize AI for suggestions.', 'info');
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

      if (tagName.length === 0 && aiInitialized) {
        enhancedAddTag(contentId, null, itemData.content, inputEl, tagsListEl);
      } else if (tagName.length > 0) {
        enhancedAddTag(contentId, tagName, itemData.content, inputEl, tagsListEl);
        inputEl.value = '';
      } else {
        showStatus('Enter a tag name or initialize AI for suggestions.', 'info');
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
    console.log("Detected data change, reloading panel content and filters...");
    loadFilterTags(); // Reload available tags
    loadSavedContent(currentFilterTagId); // Reload content
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
function loadSavedContent(filterTagId = null) {
  console.log("🔍 loadSavedContent called with filterTagId:", filterTagId);

  currentFilterTagId = filterTagId;
  if (filterTagId === null) {
    currentFilterTagName = null;
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

  const messageType =
    filterTagId !== null
      ? "GET_FILTERED_ITEMS_BY_TAG"
      : "GET_ALL_SAVED_CONTENT";
  const payload = filterTagId !== null ? { tagId: filterTagId } : {};

  console.log(`🔍 Sending message: ${messageType}`, payload);

  chrome.runtime.sendMessage(
    { type: messageType, payload: payload },
    (response) => {
      console.log(
        "🔍 Response received from background for loadSavedContent:",
        response
      );

      if (response && response.success && Array.isArray(response.payload)) {
        currentItemsCache = response.payload || [];
        window.currentItemsCache = currentItemsCache; // For external debugging
        displayContentItems(currentItemsCache);
      } else {
        currentItemsCache = [];
        window.currentItemsCache = currentItemsCache;
        const errorMsg =
          response?.error ||
          `Failed to load ${filterTagId !== null ? "filtered " : ""}items.`;
        console.error("Panel: Failed to load content:", errorMsg);
        panelContentListEl.innerHTML = `<p class="error"><i>Error loading items: ${errorMsg}</i></p>`;
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
      currentFilterTagId !== null
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
    
  // AN-5: Notes HTML Block (Includes AN-8 PII Button)
  const notesHtml = `
        <div class="detail-notes-section" style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--panel-border-light);">
            <h5 style="margin-top: 0; margin-bottom: 8px; font-size: 0.95em; font-weight: 600; color: var(--panel-secondary-text-light);">Personal Notes & Annotations</h5>
            <textarea id="itemNotesInput_${item.id}" 
                      placeholder="Add detailed notes or context here..." 
                      style="width: 100%; min-height: 100px; padding: 8px; box-sizing: border-box; resize: vertical; font-size: 0.9em; border: 1px solid var(--panel-border-light); border-radius: 4px;">${esc(notesContent)}</textarea>
            <button id="saveNotesBtn_${item.id}" class="add-tag-btn" style="float: right; margin-top: 8px; margin-bottom: 8px;">Save Notes</button>
            
            <!-- AN-8: Anonymization Button -->
            <button id="anonymizeBtn_${item.id}" class="add-tag-btn" style="float: right; margin-top: 8px; margin-bottom: 8px; margin-right: 10px; background-color: #c0392b; color: white;">Anonymize PII</button>
            
            <div style="clear: both;"></div>
        </div>
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
      contentHtml = `<img src="${escAttr(
        src
      )}" alt="Full screenshot" class="screenshot-full">`;
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

      // Check if the user entered text or just clicked for suggestions
      if (tagName.length === 0 && aiInitialized) {
        enhancedAddTag(item.id, null, itemContent, addTagInput, tagsListElement);
      } else if (tagName.length > 0) {
        enhancedAddTag(
          item.id,
          tagName,
          itemContent,
          addTagInput,
          tagsListElement
        );
        addTagInput.value = ""; // Clear input immediately after successful submission attempt
      } else {
        // User clicked button but no input and AI is not initialized
        showStatus("Enter a tag name or initialize AI for suggestions.", "info");
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
    // SHORT-LIVED DEBUG: log the successful response from background for tracing
    console.log("panel <- ADD_TAG_TO_ITEM response:", response, "at", new Date().toISOString());
    showStatus("Tag action successful!", "success");
    if (tagsListElement && document.body.contains(tagsListElement)) {
      fetchAndDisplayTags(contentId, tagsListElement);
    } else {
      console.warn(
        "Tag list element no longer valid, cannot refresh tags.",
        contentId
      );
      loadFilterTags();
    }
    loadFilterTags();
  } else {
    // SHORT-LIVED DEBUG: log failure response as well
    console.log("panel <- ADD_TAG_TO_ITEM response (failure):", response, "at", new Date().toISOString());
    // AN-10 DEBUG: Use the detailed error message returned from background.js
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
        if (clearTagFilterBtn) clearTagFilterBtn.style.display = "none";
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
          if (currentFilterTagId === tag.id) {
            tagButton.classList.add("active");
          }
          tagButton.addEventListener("click", handleFilterTagClick);
          tagFilterListEl.appendChild(tagButton);
        });
        if (clearTagFilterBtn)
          clearTagFilterBtn.style.display =
            currentFilterTagId !== null ? "inline-block" : "none";
        updateKeyPointsButtonVisibility();
      }
    } else {
      console.error("Failed to load tags for filtering:", response?.error);
      tagFilterListEl.innerHTML = '<i class="error">Error loading tags.</i>';
      if (getKeyPointsBtn) getKeyPointsBtn.style.display = "none";
    }
  });
}

/** Handles clicks on a tag in the filter list */
function handleFilterTagClick(event) {
  const clickedTagButton = event.target;
  const tagId = parseInt(clickedTagButton.dataset.tagId);
  const tagName = clickedTagButton.dataset.tagName;

  if (isNaN(tagId)) {
    console.error(
      "Invalid tag ID on filter button:",
      clickedTagButton.dataset.tagId
    );
    return;
  }

  if (clickedTagButton.classList.contains("active")) {
    handleClearFilter();
    return;
  }

  currentFilterTagName = tagName;

  const currentActive = tagFilterListEl.querySelector(
    ".tag-filter-item.active"
  );
  if (currentActive) currentActive.classList.remove("active");
  clickedTagButton.classList.add("active");
  if (clearTagFilterBtn) clearTagFilterBtn.style.display = "inline-block";

  loadSavedContent(tagId);
}

/** Handles click on the "Clear Filter" button */
function handleClearFilter() {
  if (currentFilterTagId === null) return;

  currentFilterTagName = null;
  currentFilterTagId = null;

  const currentActive = tagFilterListEl.querySelector(
    ".tag-filter-item.active"
  );
  if (currentActive) currentActive.classList.remove("active");
  if (clearTagFilterBtn) clearTagFilterBtn.style.display = "none";

  loadSavedContent(null);
}

// --- Key Points Logic ---

/** Handles click on the "Get Key Points" button */
function handleGetKeyPointsClick() {
  if (currentFilterTagId === null || !getKeyPointsBtn) return;

  showStatus(
    `Generating key points for tag "${currentFilterTagName || "selected"}"...`,
    "info",
    false
  );
  hideKeyPointsResultArea();

  getKeyPointsBtn.disabled = true;
  getKeyPointsBtn.textContent = "Generating...";

  chrome.runtime.sendMessage(
    { type: "GET_KEY_POINTS_FOR_TAG", payload: { tagId: currentFilterTagId } },
    handleKeyPointsResponse
  );
}

/** Handles click on the "Generate Report" button */
async function handleGenerateReportClick() {
  if (currentFilterTagId === null || !generateReportBtn) return;

  // AN-9: Set initial UI status when clicking the button
  showStatus(
    `Starting PDF report generation for tag "${
      currentFilterTagName || "selected"
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
      payload: { tagId: currentFilterTagId },
    },
    handleGenerateReportResponse
  );
}

/** Handles the response from the background after requesting PDF report generation */
function handleGenerateReportResponse(response) {
  if (generateReportBtn) {
    generateReportBtn.disabled = false;
    updateGenerateReportButtonVisibility();
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
  const hasTag = currentFilterTagId !== null;

  // Key Points button
  if (getKeyPointsBtn) {
    if (hasTag) {
      getKeyPointsBtn.textContent = `Get Key Points for "${
        currentFilterTagName || "Selected"
      }"`;
      getKeyPointsBtn.style.display = "inline-block";
      getKeyPointsBtn.disabled = false;
    } else {
      getKeyPointsBtn.style.display = "none";
    }
  }

  // Generate Report button
  if (generateReportBtn) {
    generateReportBtn.style.display = hasTag ? "inline-block" : "none";
  }

  // Export Project for AI button
  if (exportProjectBtn) {
    exportProjectBtn.style.display = hasTag ? "inline-block" : "none";
  }

  // Show All Items (clear filter) button
  if (clearTagFilterBtn) {
    clearTagFilterBtn.style.display = hasTag ? "inline-block" : "none";
  }
}

/** Updates the visibility and text of the Generate Report button based on filter state */
function updateGenerateReportButtonVisibility() {
  if (!generateReportBtn) return;
  if (currentFilterTagId !== null) {
    generateReportBtn.textContent = `Generate "${
      currentFilterTagName || "Selected"
    }" Report`;
    generateReportBtn.style.display = "inline-block";
    generateReportBtn.disabled = false;
  } else {
    generateReportBtn.style.display = "none";
  }
}

// --- AI Functionality ---
/** Handles export of all items under the current tag into a JSON file */
function handleExportProjectClick() {
  if (currentFilterTagId === null) {
    showStatus("Please select a tag to export a project.", "error");
    return;
  }

  showStatus(`Exporting project "${currentFilterTagName}"...`, "info", false);
  exportProjectBtn.disabled = true;

  chrome.runtime.sendMessage(
    { type: "EXPORT_PROJECT_FOR_AI", payload: { tagId: currentFilterTagId } },
    (response) => {
      exportProjectBtn.disabled = false;

      if (response && response.success) {
        const data = response.payload; // { projectMetadata, documents: [...] }
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        const sanitizedTagName = (currentFilterTagName || "project")
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9-]/g, "");
        const ts = new Date().toISOString().slice(0, 1, 19).replace(/[T:]/g, "-");
        a.download = `${sanitizedTagName}_${ts}.json`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus(`Project "${currentFilterTagName}" exported.`, "success");
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

/** Initialize Local AI functionality */
async function handleInitializeAI() {
  // Respect the mode first
  if (aiMode === "disabled") {
    showStatus("AI is disabled. Enable it in Settings to proceed.", "info");
    return;
  }
  if (aiMode === "cloud-only") {
    showStatus(
      "Cloud AI mode is active. No local model to initialize.",
      "info"
    );
    return;
  }

  // Prevent double-clicks / re-entrancy
  if (aiLoading) return;
  aiLoading = true;

  aiStatusIndicator.className = "ai-status loading";
  aiStatusIndicator.textContent =
    "Initializing local AI… (first time may take a moment)";
  initializeAIBtn.disabled = true;

  try {
    const response = await sendMessageAsync(
      { type: "INITIALIZE_LOCAL_AI" },
      30000
    );

    if (response && response.success) {
      aiInitialized = true;
      aiStatusIndicator.className = "ai-status ready";
      aiStatusIndicator.textContent = "Local AI ready - Tag suggestions available";
      showStatus("Local AI initialized.", "success");

      // show embeddings button if available
      if (generateEmbeddingsBtn)
        generateEmbeddingsBtn.style.display = "inline-block";
    } else {
      throw new Error(response?.error || "Unknown error");
    }
  } catch (err) {
    aiInitialized = false;
    aiStatusIndicator.className = "ai-status error";
    aiStatusIndicator.textContent = "Local AI failed to initialize";
    showStatus(`Failed to initialize local AI: ${err.message}`, "error");
    // Let the user try again
    initializeAIBtn.disabled = false;
  } finally {
    aiLoading = false;
  }
}

// --- Existing handleInitializeAI() ends here ---

async function handleGenerateEmbeddings() {
  if (!aiInitialized) {
    showStatus("Initialize Local AI first.", "info");
    return;
  }

  aiStatusIndicator.className = "ai-status processing";
  aiStatusIndicator.textContent = "Generating embeddings for tags…";
  generateEmbeddingsBtn.disabled = true;

  chrome.runtime.sendMessage(
    { type: "GENERATE_EMBEDDINGS_FOR_TAGS" },
    (response) => {
      generateEmbeddingsBtn.disabled = false;

      if (response && response.success) {
        aiStatusIndicator.className = "ai-status ready";
        aiStatusIndicator.textContent = "Embeddings ready - Tag suggestions available";
        showStatus("Embeddings generated for tags.", "success");
      } else {
        aiStatusIndicator.className = "ai-status error";
        aiStatusIndicator.textContent = "Failed to generate embeddings";
        showStatus(
          `Embedding generation failed: ${response?.error || "Unknown error"}`,
          "error"
        );
      }
    }
  );
}

/** Generate embeddings for all existing tags */
async function handleGenerateEmbeddings() {
  if (!aiInitialized) {
    showStatus(
      "Please initialize AI first before generating embeddings.",
      "error"
    );
    return;
  }

  if (generateEmbeddingsBtn) {
    generateEmbeddingsBtn.disabled = true;
    generateEmbeddingsBtn.textContent = "Processing...";
  }

  updateAIStatus("processing", "Generating embeddings for existing tags...");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_EMBEDDINGS_FOR_TAGS",
    });

    if (response.success) {
      const { processed, skipped, total } = response.payload;
      updateAIStatus(
        "ready",
        `Embeddings ready (${processed}/${total} tags processed)`
      );
      showStatus(
        `Embeddings generated: ${processed} processed, ${skipped} skipped.`,
        "success"
      );
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

  aiStatusIndicator.style.display = status === "hidden" ? "none" : "block";
}

/** Update AI button visibility and states */
function updateAIButtons() {
  if (initializeAIBtn) {
    initializeAIBtn.style.display = aiInitialized ? "none" : "inline-block";
  }

  if (generateEmbeddingsBtn) {
    generateEmbeddingsBtn.style.display = aiInitialized
      ? "inline-block"
      : "none";
  }
}

/**
 * Enhanced tag adding with AI suggestions or direct tag addition.
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
    const normalizedTag = userInput.trim();
    showStatus(`Adding tag "${normalizedTag}"...`, "info", false);

    // TEMP LOG: trace outgoing add-tag message from panel
    console.log("panel -> ADD_TAG_TO_ITEM", { contentId: contentId, tagName: normalizedTag });
    chrome.runtime.sendMessage(
      {
        type: "ADD_TAG_TO_ITEM",
        payload: { contentId: contentId, tagName: normalizedTag },
      },
      (response) => {
          // SHORT-LIVED DEBUG: raw response echo from background
          console.log("panel <- raw response for ADD_TAG_TO_ITEM:", response);
          if (chrome.runtime.lastError) {
            console.error("panel: runtime.lastError after sendMessage (ADD_TAG_TO_ITEM):", chrome.runtime.lastError);
            handleTagActionResponse({ success: false, error: chrome.runtime.lastError.message }, contentId, tagsListEl);
            return;
          }
          try { handleTagActionResponse(response, contentId, tagsListEl); } catch (e) { console.error("panel: handleTagActionResponse threw:", e); }
      }
    );
    return;
  }

  if (aiInitialized && contentText) {
    await showTagSuggestions(contentId, contentText, tagInputEl, tagsListEl);
  } else {
    showStatus("Enter a tag name or initialize AI for suggestions.", "info");
  }
}

/**
 * Show AI-generated tag suggestions.
 */
async function showTagSuggestions(
  contentId,
  contentText,
  inputElement,
  tagsListEl
) {
  try {
    let suggestionsContainer =
      inputElement.parentElement.querySelector(".tag-suggestions");
    if (!suggestionsContainer) {
      suggestionsContainer = document.createElement("div");
      suggestionsContainer.className = "tag-suggestions";
      inputElement.parentElement.appendChild(suggestionsContainer);
    }
    suggestionsContainer.innerHTML =
      '<span class="suggestion-loading">🤖 Analyzing content...</span>';

    const response = await chrome.runtime.sendMessage({
      type: "SUGGEST_TAGS_FOR_CONTENT",
      payload: { content: contentText },
    });

    if (response.success && response.payload.length > 0) {
      suggestionsContainer.innerHTML = `
                <span class="suggestion-label">🤖 Suggested tags:</span>
                ${response.payload
                  .map(
                    (suggestion) =>
                      `<button class="tag-suggestion" data-tag="${
                        suggestion.name
                      }" data-content-id="${contentId}">
                        ${suggestion.name} (${(
                        suggestion.similarity * 100
                      ).toFixed(0)}%)
                    </button>`
                  )
                  .join("")}
            `;

      suggestionsContainer
        .querySelectorAll(".tag-suggestion")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            const tagName = btn.dataset.tag;
            const targetContentId = parseInt(btn.dataset.contentId);

            showStatus(`Adding suggested tag "${tagName}"...`, "info", false);
            // TEMP LOG: trace outgoing add-tag message from suggestion click
            console.log("panel -> ADD_TAG_TO_ITEM (suggestion)", { contentId: targetContentId, tagName: tagName });
            chrome.runtime.sendMessage(
              {
                type: "ADD_TAG_TO_ITEM",
                payload: { contentId: targetContentId, tagName: tagName },
              },
              (response) => {
                // SHORT-LIVED DEBUG: raw response echo from background (suggestion path)
                console.log("panel <- raw response for ADD_TAG_TO_ITEM (suggestion):", response);
                if (chrome.runtime.lastError) {
                  console.error("panel: runtime.lastError after sendMessage (ADD_TAG_TO_ITEM suggestion):", chrome.runtime.lastError);
                  handleTagActionResponse({ success: false, error: chrome.runtime.lastError.message }, targetContentId, tagsListEl);
                  suggestionsContainer.remove();
                  return;
                }
                try { handleTagActionResponse(response, targetContentId, tagsListEl); } catch (e) { console.error("panel: handleTagActionResponse threw (suggestion):", e); }
                suggestionsContainer.remove();
              }
            );
          });
        });
    } else {
      suggestionsContainer.innerHTML =
        '<span class="suggestion-empty">🤖 No similar tags found. Try typing a new tag!</span>';
      setTimeout(() => {
        if (suggestionsContainer.parentElement) {
          suggestionsContainer.remove();
        }
      }, 3000);
    }
  } catch (error) {
    console.error("Failed to get tag suggestions:", error);
    const suggestionsContainer =
      inputElement.parentElement.querySelector(".tag-suggestions");
    if (suggestionsContainer) {
      suggestionsContainer.innerHTML =
        '<span class="suggestion-error">❌ Failed to get suggestions</span>';
    }
  }
}

/** Check AI initialization status on load */
async function checkAIStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_LOCAL_AI_STATUS",
    });

    if (response.success) {
      aiInitialized = response.payload.isReady;

      if (aiInitialized) {
        updateAIStatus("ready", "AI ready - Tag suggestions available");
      } else {
        updateAIStatus(
          "disabled",
          "AI disabled - Click to enable tag suggestions"
        );
      }

      updateAIButtons();
    }
  } catch (error) {
    console.error("Failed to check AI status:", error);
    updateAIStatus("error", "Failed to check AI status");
  }
}

console.log(
  "WebInsight Panel script loaded and initialized (v8 - Simple Display with PDF support)."
);