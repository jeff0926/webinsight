# WebInsight v2 Development Briefing & Action Plan

This document outlines the development plan for the `webinsights-v2` Chrome extension. It is intended to be used to initialize a new Gemini CLI session in the correct project directory.

**IMPORTANT:** All file operations in the new session **MUST** be performed within the `C:\Users\I820965\dev\webinsights-v2` directory.

## 1. Project Goal

The primary goal of this development sprint is to polish and improve the user experience of the core WebInsight extension. We will focus on quality-of-life features before tackling larger architectural changes like Google Drive integration or WASM/SQLite.

## 2. Current Task List

Here is the prioritized list of features to implement:

1.  **[completed] Implement Multi-Tag Filtering:** Allow users to filter by multiple tags simultaneously (logical AND).
2.  **[completed] Implement Tag Normalization:** Add a utility to merge tags that are duplicates by case (e.g., "React" and "react" become "react").
3.  **[completed] Implement Image Lightbox/Modal Viewer:** Allow users to click on a screenshot thumbnail to view it in a larger modal overlay.
4.  **[completed] Implement Persistent Accordion on Tagging:** Prevent the item detail view from closing automatically after a user adds a tag.

## 3. Detailed Implementation Plan for "Multi-Tag Filtering"

The following are the precise, step-by-step file modifications required to implement the multi-tag filtering feature.

### Step 3.1: Modify `js/panel.js`

**Action 1: Update State Variables**
*   **File:** `js/panel.js`
*   **Instruction:** Refactor the tag filter state variables to support multiple selected tags, changing from single `currentFilterTagId` and `currentFilterTagName` to arrays `currentFilterTagIds` and `currentFilterTagNames` for multi-selection capability.
*   **`old_string`:**
    ```javascript
    let currentFilterTagId = null; // Keep track of the active filter tag ID
    let currentFilterTagName = null; // Keep track of the active filter tag name
    ```
*   **`new_string`:**
    ```javascript
    let currentFilterTagIds = []; // Keep track of active filter tag IDs
    let currentFilterTagNames = []; // Keep track of active filter tag names
    ```

**Action 2: Update `loadSavedContent` function**
*   **File:** `js/panel.js`
*   **Instruction:** Update `loadSavedContent` to use `currentFilterTagIds` (an array) instead of a single `filterTagId`. It should now request items that have *all* selected tags.
*   **`old_string`:**
    ```javascript
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
    ```
*   **`new_string`:**
    ```javascript
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

      let messageType;
      let payload;

      if (currentFilterTagIds.length > 0) {
        messageType = "GET_FILTERED_ITEMS_BY_TAGS_AND"; // New message type for multiple tags (logical AND)
        payload = { tagIds: currentFilterTagIds };
      } else {
        messageType = "GET_ALL_SAVED_CONTENT";
        payload = {};
      }

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
              `Failed to load ${currentFilterTagIds.length > 0 ? "filtered " : ""}items.`;
            console.error("Panel: Failed to load content:", errorMsg);
            panelContentListEl.innerHTML = `<p class="error"><i>Error loading items: ${errorMsg}</i></p>`;
            showStatus(`Error loading items: ${errorMsg}`, "error", false);
          }

          updateKeyPointsButtonVisibility();
          updateGenerateReportButtonVisibility();
        }
      );
    }
    ```

**Action 3: Update `handleFilterTagClick` and `handleClearFilter`**
*   **File:** `js/panel.js`
*   **Instruction:** Update `handleFilterTagClick` to manage `currentFilterTagIds` and `currentFilterTagNames` arrays for multi-selection. It should add/remove the clicked tag's ID and name, toggle the 'active' class on the button, and reload content with the updated filter.
*   **`old_string`:**
    ```javascript
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
    ```
*   **`new_string`:**
    ```javascript
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

      // Update the visibility of the 'Clear All' button
      if (clearTagFilterBtn) {
        clearTagFilterBtn.style.display = currentFilterTagIds.length > 0 ? "inline-block" : "none";
      }

      // Reload content with the new set of filter tags
      loadSavedContent(currentFilterTagIds);
    }

    /** Handles click on the "Clear Filter" button */
    function handleClearFilter() {
      if (currentFilterTagIds.length === 0) return;

      currentFilterTagIds = [];
      currentFilterTagNames = [];

      // Remove 'active' class from all filter tags
      tagFilterListEl.querySelectorAll(".tag-filter-item.active").forEach((el) => {
        el.classList.remove("active");
      });

      if (clearTagFilterBtn) clearTagFilterBtn.style.display = "none";

      loadSavedContent(null); // Load all content (no filter)
    }
    ```

**Action 4: Update `updateKeyPointsButtonVisibility`**
*   **File:** `js/panel.js`
*   **Instruction:** Update `updateKeyPointsButtonVisibility` to reflect the state of multiple selected tags. It should enable/disable and set the text of the 'Get Key Points' button based on whether any tags are selected.
*   **`old_string`:**
    ```javascript
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
    ```
*   **`new_string`:**
    ```javascript
    function updateKeyPointsButtonVisibility() {
      const hasTags = currentFilterTagIds.length > 0;
      const buttonText = hasTags
        ? `Get Key Points for "${currentFilterTagNames.join(", ")}"`
        : "Get Key Points";

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

      // Show All Items (clear filter) button
      if (clearTagFilterBtn) {
        clearTagFilterBtn.style.display = hasTags ? "inline-block" : "none";
      }
    }
    ```

### Step 3.2: Modify `js/background.js`

**Action 1: Add `GET_FILTERED_ITEMS_BY_TAGS_AND` Message Handler**
*   **File:** `js/background.js`
*   **Instruction:** Add a new message handler for `GET_FILTERED_ITEMS_BY_TAGS_AND` that filters content items by multiple tag IDs (logical AND).
*   **`old_string`:**
    ```javascript
        case "GET_FILTERED_ITEMS_BY_TAG":
          const filterTagId = message.payload?.tagId;
          if (typeof filterTagId !== "number") {
            sendResponse({ success: false, error: "Invalid tagId for filtering." });
            isResponseAsync = false;
          } else {
            getContentIdsByTagId(filterTagId)
              .then((contentIds) =>
                contentIds && contentIds.length > 0
                  ? getContentItemsByIds(contentIds)
                  : []
              )
              .then((items) => sendResponse({ success: true, payload: items }))
              .catch((error) => {
                console.error(
                  `Error filtering items by tag ${filterTagId}:`,
                  error
                );
                sendResponse({
                  success: false,
                  error: `Failed filter items: ${error.message}`,
                });
              });
          }
          break;
    ```
*   **`new_string`:**
    ```javascript
        case "GET_FILTERED_ITEMS_BY_TAG":
          const filterTagId = message.payload?.tagId;
          if (typeof filterTagId !== "number") {
            sendResponse({ success: false, error: "Invalid tagId for filtering." });
            isResponseAsync = false;
          } else {
            getContentIdsByTagId(filterTagId)
              .then((contentIds) =>
                contentIds && contentIds.length > 0
                  ? getContentItemsByIds(contentIds)
                  : []
              )
              .then((items) => sendResponse({ success: true, payload: items }))
              .catch((error) => {
                console.error(
                  `Error filtering items by tag ${filterTagId}:`,
                  error
                );
                sendResponse({
                  success: false,
                  error: `Failed filter items: ${error.message}`,
                });
              });
          }
          break;
        case "GET_FILTERED_ITEMS_BY_TAGS_AND":
          const filterTagIds = message.payload?.tagIds;
          if (!Array.isArray(filterTagIds) || filterTagIds.length === 0) {
            sendResponse({ success: false, error: "Invalid or empty tagIds array for filtering." });
            isResponseAsync = false;
          } else {
            (async () => {
              try {
                // Get all content IDs for each selected tag
                const contentIdsPerTag = await Promise.all(
                  filterTagIds.map(id => getContentIdsByTagId(id))
                );

                // Find the intersection of all content ID arrays (logical AND)
                let intersection = new Set(contentIdsPerTag[0] || []);
                for (let i = 1; i < contentIdsPerTag.length; i++) {
                  const currentSet = new Set(contentIdsPerTag[i]);
                  intersection = new Set(
                    [...intersection].filter(id => currentSet.has(id))
                  );
                }
                
                const finalContentIds = Array.from(intersection);

                const items = finalContentIds.length > 0
                  ? await getContentItemsByIds(finalContentIds)
                  : [];
                  
                sendResponse({ success: true, payload: items });
              } catch (error) {
                console.error(`Error filtering items by tags:`, error);
                sendResponse({
                  success: false,
                  error: `Failed filter items by tags: ${error.message}`,
                });
              }
            })();
          }
          break;
    ```

This concludes the plan for the first feature. The new session should execute these `replace` commands in order to complete the "Multi-Tag Filtering" task.
