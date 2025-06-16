// js/content.js
// This script is injected into web pages by the WebInsight Chrome extension.
// Its primary responsibilities include:
// 1. Extracting page information:
//    - Metadata (title, description, keywords, language).
//    - Full text content of the page.
//    - Full HTML content of the page.
//    - All hyperlinks present on the page.
// 2. Handling messages from other parts of the extension (e.g., background script, side panel):
//    - Providing requested page data.
//    - Reporting the currently selected text on the page.
//    - Initiating and managing an area selection mode for screenshots.
// 3. Implementing the user interface for area selection:
//    - Displaying an overlay on the page.
//    - Allowing the user to draw a rectangle to define an area.
//    - Capturing the coordinates of the selected area and sending them to the background script.
// 4. Listening for text selections on the page (though currently just logs them).

console.log("WebInsight Content Script Loaded (v Link Extraction + Fix)"); // Log script load status.

// --- State Variables for Area Selection ---

/**
 * Reference to the div element used as an overlay for area selection mode.
 * Null when selection mode is not active.
 * @type {HTMLDivElement | null}
 */
let selectionOverlay = null;

/**
 * Reference to the div element that visually represents the selection box being drawn by the user.
 * Null when not actively drawing.
 * @type {HTMLDivElement | null}
 */
let selectionBox = null;

/**
 * Stores the X-coordinate of the mouse cursor when the area selection drag starts.
 * @type {number | undefined}
 */
let startX;

/**
 * Stores the Y-coordinate of the mouse cursor when the area selection drag starts.
 * @type {number | undefined}
 */
let startY;

/**
 * Boolean flag indicating whether area selection mode is currently active.
 * @type {boolean}
 */
let isSelecting = false;

// --- Helper Function: Get Page Data (Metadata, Links, Text, HTML) ---

/**
 * Extracts a comprehensive set of data from the current web page.
 * This includes URL, title, language, meta description and keywords,
 * all hyperlinks, the page's plain text content, and its full HTML structure.
 *
 * @returns {object} An object containing the extracted page data:
 *  - `url` (string): The URL of the current page.
 *  - `title` (string): The title of the page.
 *  - `lang` (string | null): The language of the page (from `document.documentElement.lang`).
 *  - `description` (string | null): The content of the meta description tag.
 *  - `keywords` (string | null): The content of the meta keywords tag.
 *  - `links` (Array<object>): An array of link objects, each with `text` and `url` properties.
 *  - `text` (string): The plain text content of the page body.
 *  - `html` (string): The full outer HTML of the document element.
 */
function getPageData() {
    const data = {
        url: window.location.href,
        title: document.title || 'Untitled Page',
        lang: document.documentElement.lang || null,
        description: null,
        keywords: null,
        links: [],
        text: null, // Initialize text field
        html: null  // Initialize html field
    };

    // Get meta description
    const descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag) {
        data.description = descriptionTag.getAttribute('content');
    }

    // Get meta keywords
    const keywordsTag = document.querySelector('meta[name="keywords"]');
    if (keywordsTag) {
        data.keywords = keywordsTag.getAttribute('content');
    }

    // --- Text and HTML Extraction ---
    // This section was marked with a "FIX" comment, implying it was re-added or crucial.
    try {
        // Attempt to get the main visible text content from the page body.
        // Falls back to an empty string if `document.body.innerText` is not available or fails.
        data.text = document.body.innerText || "";
    } catch (e) {
        console.warn("WebInsight: Could not get document.body.innerText:", e);
        data.text = ""; // Default to empty string on error to ensure data object consistency.
    }
    try {
        // Attempt to get the full HTML source of the page.
        // Falls back to an empty string if `document.documentElement.outerHTML` is not available or fails.
        data.html = document.documentElement.outerHTML || "";
    } catch (e) {
        console.warn("WebInsight: Could not get document.documentElement.outerHTML:", e);
        data.html = ""; // Default to empty string on error.
    }

    // --- Link Extraction ---
    try {
        // Select all anchor (<a>) tags within the document body.
        const anchorTags = document.body.querySelectorAll('a');
        const baseURI = document.baseURI;

        anchorTags.forEach(tag => {
            const rawHref = tag.getAttribute('href'); // Get the raw href attribute value.
            // Get link text, trying innerText first, then textContent, and trim whitespace.
            const text = (tag.innerText || tag.textContent || '').trim();

            // Filter out invalid or irrelevant links:
            // - Empty href
            // - Anchor links (#)
            // - JavaScript execution links
            if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) {
                return; // Skip this link.
            }

            try {
                // Resolve the raw href to an absolute URL using the page's base URI.
                // This handles relative URLs correctly.
                const absoluteUrl = new URL(rawHref, baseURI).href;
                data.links.push({
                    text: text,
                    url: absoluteUrl
                });
            } catch (urlError) {
                 // Log and skip if a URL is invalid and cannot be parsed.
                 // console.warn(`WebInsight: Skipping invalid URL '${rawHref}': ${urlError.message}`);
            }
        });
        // console.log(`WebInsight: Extracted ${data.links.length} links.`);
    } catch (linkError) {
        console.error("WebInsight: Error extracting links:", linkError);
    }

    // Log a summary of extracted data for debugging (lengths instead of full content for brevity).
    // console.log("WebInsight: Extracted Page Data Summary:", {
    //     url: data.url,
    //     title: data.title,
    //     lang: data.lang,
    //     description: data.description ? data.description.substring(0, 50) + '...' : null,
    //     keywords: data.keywords,
    //     linksCount: data.links.length,
    //     textLength: data.text.length,
    //     htmlLength: data.html.length
    // });
    return data;
}

// --- Text Selection Listener ---

/**
 * Handles the `mouseup` event to detect text selections made by the user.
 * If text is selected and area selection mode is not active, it logs the selection.
 * This function is attached as an event listener to the document.
 * @param {MouseEvent} event - The mouseup event object.
 */
function handleTextSelection(event) {
    // Do not interfere if area selection mode is active.
    if (isSelecting) return;

    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
        // Log the selected text (truncated for brevity) for debugging or potential future use.
        console.log('WebInsight: User selected text:', selectedText.substring(0, 100) + '...');
        // Future enhancement: Could send this selection to the background script or panel
        // if there's a use case for capturing passively selected text.
    }
}
// Add the text selection listener to the document.
document.addEventListener('mouseup', handleTextSelection);

// --- Message Listener (from Background Script or Side Panel) ---

/**
 * Listens for messages sent from other parts of the extension (e.g., background.js, sidepanel.js).
 * Handles requests such as retrieving page data, getting the last selected text, or initiating
 * an area selection for screenshots.
 *
 * @param {object} message - The message object received. Expected to have a `type` property.
 * @param {chrome.runtime.MessageSender} sender - An object containing information about the message sender.
 * @param {function} sendResponse - A function to call to send a response back to the sender.
 *                                  The content script must return `true` from this handler if `sendResponse`
 *                                  is to be called asynchronously.
 * @returns {boolean} Returns `true` to indicate that `sendResponse` might be called asynchronously,
 *                    `false` or undefined for synchronous responses. For simplicity and future-proofing,
 *                    this implementation currently always returns `true`.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("WebInsight: Message received in content script:", message);

    switch (message.type) {
        case "GET_PAGE_DATA":
            // Handles request to get all page data (metadata, text, html, links).
            try {
                const pageData = getPageData(); // Calls the main data extraction function.
                sendResponse({ success: true, payload: pageData });
            } catch (error) {
                 console.error("WebInsight: Error getting page data:", error);
                 sendResponse({ success: false, error: `Error in content script while getting page data: ${error.message}` });
            }
            break;

        case "GET_LAST_SELECTION":
            // Handles request to get the currently selected text along with page metadata.
             try {
                const lastSelectedText = window.getSelection().toString().trim();
                if (lastSelectedText) {
                    const pageData = getPageData(); // Get metadata for context.
                    sendResponse({
                        success: true,
                        payload: { // Construct payload with selection and relevant page data.
                            selectionText: lastSelectedText,
                            url: pageData.url,
                            title: pageData.title,
                            lang: pageData.lang,
                            description: pageData.description,
                            keywords: pageData.keywords
                            // Note: Links are generally not included for simple text selections.
                        }
                    });
                } else {
                    sendResponse({ success: false, error: "No text currently selected on the page." });
                }
             } catch (error) {
                  console.error("WebInsight: Error getting current selection:", error);
                  sendResponse({ success: false, error: `Error in content script while getting selection: ${error.message}` });
             }
            break;

        case "START_AREA_SELECTION":
            // Handles request to initiate the area selection mode for screenshots.
            if (isSelecting) {
                // If already in selection mode, inform the sender.
                sendResponse({ success: false, error: "Area selection mode is already active." });
            } else {
                try {
                    activateSelectionMode(); // Activate the UI for area selection.
                    sendResponse({ success: true, message: "Area selection mode activated." });
                } catch (error) {
                     console.error("WebInsight: Error activating selection mode:", error);
                     sendResponse({ success: false, error: `Failed to activate selection mode: ${error.message}` });
                }
            }
            break;

        default:
            // Handle any unrecognized message types.
            console.warn("WebInsight: Unhandled message type received in content script:", message.type);
            // Optionally, send a response indicating the message was not handled.
            // sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
            break;
    }
    // Return true to indicate that sendResponse may be called asynchronously.
    // This is important if any case within the switch statement needs to perform async operations
    // before calling sendResponse. Even if all current cases are synchronous, it's safer for future changes.
    return true;
});


// --- Area Selection UI and Logic ---

// The following functions manage the user interface and logic for selecting a rectangular
// area on the page, typically for taking a targeted screenshot.

/**
 * Activates the area selection mode.
 * This function creates and displays a semi-transparent overlay on the entire page,
 * and attaches event listeners for mouse actions (down, move, up) and the Escape key.
 * It sets the `isSelecting` flag to true.
 */
function activateSelectionMode() {
    if (selectionOverlay) return; // Prevent multiple activations.
    console.log("WebInsight: Activating area selection mode...");
    isSelecting = true; // Set the global state flag.

    // Create the overlay div.
    selectionOverlay = document.createElement('div');
    // Style the overlay for full viewport coverage and visual cues.
    Object.assign(selectionOverlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 50, 100, 0.1)', // Semi-transparent blueish background.
        cursor: 'crosshair', // Standard cursor for selection tasks.
        zIndex: '2147483647', // Extremely high z-index to ensure it's on top of most page elements.
        userSelect: 'none' // Prevent text selection on the overlay itself.
    });
    document.body.appendChild(selectionOverlay); // Add overlay to the page.

    // Attach event listeners for mouse actions on the overlay and keydown on the document.
    selectionOverlay.addEventListener('mousedown', handleMouseDown);
    selectionOverlay.addEventListener('mousemove', handleMouseMove);
    selectionOverlay.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown); // Listen for ESC key globally.
    console.log("WebInsight: Area selection mode activated. Draw an area or press ESC to cancel.");
}

/**
 * Handles the `mousedown` event on the selection overlay.
 * This marks the starting point of the user's drag selection.
 * It creates the visual selection box (`selectionBox`) and records the starting coordinates.
 * @param {MouseEvent} event - The mousedown event object.
 */
function handleMouseDown(event) {
    event.preventDefault(); // Prevent default browser actions for mousedown (e.g., text selection).
    event.stopPropagation(); // Stop the event from bubbling up to other elements.
    startX = event.clientX; // Record starting X coordinate (viewport relative).
    startY = event.clientY; // Record starting Y coordinate (viewport relative).

    // Create the visual selection box element.
    selectionBox = document.createElement('div');
    Object.assign(selectionBox.style, {
        position: 'fixed',
        left: startX + 'px', // Initial position and size (will be updated by mousemove).
        top: startY + 'px',
        width: '0px',
        height: '0px',
        border: '2px dashed #0366d6', // Style for visibility.
        backgroundColor: 'rgba(3, 102, 214, 0.2)', // Semi-transparent fill.
        pointerEvents: 'none', // Ensure mouse events pass through to the overlay.
        zIndex: '2147483647', // Same high z-index as overlay.
        userSelect: 'none'
    });
    document.body.appendChild(selectionBox); // Add selection box to the page.
}

/**
 * Handles the `mousemove` event while the mouse button is held down (i.e., during drag).
 * It continuously updates the size and position of the `selectionBox` to reflect
 * the area being selected by the user.
 * @param {MouseEvent} event - The mousemove event object.
 */
function handleMouseMove(event) {
    if (!selectionBox) return; // Do nothing if selection hasn't started (no selectionBox).
    event.preventDefault();
    event.stopPropagation();

    const currentX = event.clientX;
    const currentY = event.clientY;

    // Calculate width, height, and top-left position of the selection box.
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    // Update the style of the selection box.
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
}

/**
 * Handles the `mouseup` event, finalizing the area selection.
 * It calculates the final dimensions of the selected rectangle. If the selection is
 * large enough, it extracts page metadata and sends a message to the background script
 * with the selection details (`rect`, `devicePixelRatio`, URL, title, etc.)
 * for capturing the screenshot. Then, it cleans up the selection UI.
 * @param {MouseEvent} event - The mouseup event object.
 */
function handleMouseUp(event) {
    if (!selectionBox) { // If mouseup occurs without a selection box (e.g., just a click).
        cleanupSelectionMode(); // Clean up and exit.
        return;
    }
    event.preventDefault();
    event.stopPropagation();

    const finalX = event.clientX;
    const finalY = event.clientY;

    // Define the selected rectangle with positive width and height.
    const rect = {
        x: Math.min(startX, finalX),
        y: Math.min(startY, finalY),
        width: Math.abs(finalX - startX),
        height: Math.abs(finalY - startY)
    };

    const minSize = 5; // Minimum pixel dimension for a valid selection.
    if (rect.width < minSize || rect.height < minSize) {
        console.log("WebInsight: Selection too small, capture cancelled.");
        cleanupSelectionMode(); // Clean up if selection is too small.
        return;
    }
    console.log("WebInsight: Area selected by user (viewport coordinates):", rect);

    // Temporarily hide the selection UI elements before taking the screenshot
    // to avoid them appearing in the capture itself.
    if (selectionOverlay) selectionOverlay.style.display = 'none';
    if (selectionBox) selectionBox.style.display = 'none';

    // Get current page data (URL, title, etc.) to send along with the coordinates.
    const pageData = getPageData();
    const payload = {
        rect: rect, // The selected rectangle (x, y, width, height in viewport pixels).
        devicePixelRatio: window.devicePixelRatio || 1, // Device pixel ratio for accurate capture.
        url: pageData.url,
        title: pageData.title,
        lang: pageData.lang,
        description: pageData.description,
        keywords: pageData.keywords,
        links: pageData.links // Include links from the page as context.
        // Note: Full text and HTML from pageData are generally NOT needed by the background script
        // for an area capture, as it primarily needs the coordinates and basic page context.
    };

    // Send the selection details to the background script for actual capturing.
    // A small timeout can sometimes help ensure the page has visually settled after UI removal.
    setTimeout(() => {
        chrome.runtime.sendMessage({
            type: "CAPTURE_AREA_FROM_CONTENT", // Message type for background script.
            payload: payload
        }, (response) => {
            // Handle response from the background script.
            if (chrome.runtime.lastError) {
                 console.error("WebInsight: Error sending CAPTURE_AREA_FROM_CONTENT message:", chrome.runtime.lastError.message);
            } else if (response && response.success) {
                 console.log("WebInsight: Area capture request successfully processed by background script.");
            } else {
                 console.error("WebInsight: Background script failed to process area capture request:", response?.error);
            }
            cleanupSelectionMode(); // Always cleanup UI after attempting capture.
        });
    }, 50); // 50ms delay.
}

/**
 * Handles the `keydown` event, specifically listening for the Escape (`Esc`) key
 * to allow the user to cancel the area selection mode.
 * @param {KeyboardEvent} event - The keydown event object.
 */
function handleKeyDown(event) {
    if (event.key === "Escape" && isSelecting) {
        console.log("WebInsight: Area selection cancelled by user (Escape key).");
        cleanupSelectionMode(); // Clean up the selection UI.
    }
}

/**
 * Removes the selection overlay and selection box elements from the DOM,
 * detaches the global keydown listener, and resets the `isSelecting` state flag.
 * This function is called when selection is completed, cancelled, or deemed invalid.
 */
function cleanupSelectionMode() {
    console.log("WebInsight: Cleaning up area selection mode UI elements and listeners.");
    if (selectionOverlay) {
        // Remove specific event listeners attached to the overlay.
        selectionOverlay.removeEventListener('mousedown', handleMouseDown);
        selectionOverlay.removeEventListener('mousemove', handleMouseMove);
        selectionOverlay.removeEventListener('mouseup', handleMouseUp);
        selectionOverlay.remove(); // Remove the overlay from the DOM.
        selectionOverlay = null;   // Clear the reference.
    }
    if (selectionBox) {
        selectionBox.remove();    // Remove the selection box from the DOM.
        selectionBox = null;      // Clear the reference.
    }
    // Remove the global keydown listener.
    document.removeEventListener('keydown', handleKeyDown);
    isSelecting = false; // Reset the selection state flag.
}

console.log("WebInsight Content Script listeners and functions attached.");
