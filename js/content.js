// js/content.js - Injected into web pages (Fix: Re-add text/HTML extraction)

console.log("WebInsight Content Script Loaded (v Link Extraction + Fix)");

// --- State Variables ---
let selectionOverlay = null;
let selectionBox = null;
let startX, startY;
let isSelecting = false;

// --- Helper Function: Get Page Data (Metadata, Links, Text, HTML) ---
/**
 * Extracts relevant metadata, hyperlinks, text content, and HTML from the current page's DOM.
 * @returns {object} An object containing url, title, lang, description, keywords, links, text, and html.
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

    // --- ** FIX: Re-add text and HTML extraction ** ---
    try {
        // Attempt to get the main visible text content
        data.text = document.body.innerText || "";
    } catch (e) {
        console.warn("Could not get body.innerText:", e);
        data.text = ""; // Default to empty string on error
    }
    try {
        // Attempt to get the full HTML source
        data.html = document.documentElement.outerHTML || "";
    } catch (e) {
        console.warn("Could not get documentElement.outerHTML:", e);
        data.html = ""; // Default to empty string on error
    }
    // --- End of FIX ---

    // --- Extract Links ---
    try {
        const anchorTags = document.body.querySelectorAll('a');
        const baseURI = document.baseURI;

        anchorTags.forEach(tag => {
            const rawHref = tag.getAttribute('href');
            const text = (tag.innerText || tag.textContent || '').trim();

            if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) {
                return;
            }

            try {
                const absoluteUrl = new URL(rawHref, baseURI).href;
                data.links.push({
                    text: text,
                    url: absoluteUrl
                });
            } catch (urlError) {
                 // console.warn(`Skipping invalid URL '${rawHref}': ${urlError.message}`);
            }
        });
        console.log(`Extracted ${data.links.length} links.`);
    } catch (linkError) {
        console.error("Error extracting links:", linkError);
    }


    console.log("Extracted Page Data:", {
        url: data.url,
        title: data.title,
        lang: data.lang,
        description: data.description ? data.description.substring(0, 50) + '...' : null,
        keywords: data.keywords,
        linksCount: data.links.length,
        textLength: data.text.length,
        htmlLength: data.html.length
    }); // Log lengths instead of full content
    return data;
}

// --- Selection Tool Listener (for text) ---
document.addEventListener('mouseup', handleTextSelection);

function handleTextSelection(event) {
    if (isSelecting) return;
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
        console.log('WebInsight: Text selected:', selectedText.substring(0, 100) + '...');
    }
}

// --- Message Listener (from Background Script or Panel) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in content script:", message);

    switch (message.type) {
        case "GET_PAGE_DATA":
            try {
                // Call the updated function which now includes text/html
                const pageData = getPageData();
                sendResponse({ success: true, payload: pageData });
            } catch (error) {
                 console.error("Error getting page data:", error);
                 sendResponse({ success: false, error: `Error getting page data: ${error.message}` });
            }
            break; // Synchronous response

        case "GET_LAST_SELECTION":
             try {
                const lastSelectedText = window.getSelection().toString().trim();
                if (lastSelectedText) {
                    const pageData = getPageData(); // Get metadata context
                    sendResponse({
                        success: true,
                        payload: {
                            selectionText: lastSelectedText,
                            url: pageData.url,
                            title: pageData.title,
                            lang: pageData.lang,
                            description: pageData.description,
                            keywords: pageData.keywords
                            // Links are not included for selections
                        }
                    });
                } else {
                    sendResponse({ success: false, error: "No text currently selected." });
                }
             } catch (error) {
                  console.error("Error getting selection:", error);
                  sendResponse({ success: false, error: `Error getting selection: ${error.message}` });
             }
            break; // Synchronous response

        case "START_AREA_SELECTION":
            if (isSelecting) {
                sendResponse({ success: false, error: "Area selection is already active." });
            } else {
                try {
                    activateSelectionMode();
                    sendResponse({ success: true });
                } catch (error) {
                     console.error("Error activating selection mode:", error);
                     sendResponse({ success: false, error: `Failed to activate selection mode: ${error.message}` });
                }
            }
            break; // Synchronous response

        default:
            console.warn("Unhandled message type in content script:", message.type);
            break;
    }
    return true; // Keep true for potential async responses in the future
});


// --- Area Selection UI and Logic ---
// (Functions activateSelectionMode, handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown, cleanupSelectionMode remain the same as in the previous version - content_js_links)

/** Creates and displays the overlay for area selection. */
function activateSelectionMode() {
    if (selectionOverlay) return; // Already active
    console.log("Activating area selection mode...");
    isSelecting = true;

    selectionOverlay = document.createElement('div');
    Object.assign(selectionOverlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0, 50, 100, 0.1)', cursor: 'crosshair',
        zIndex: '2147483647', userSelect: 'none'
    });
    document.body.appendChild(selectionOverlay);

    selectionOverlay.addEventListener('mousedown', handleMouseDown);
    selectionOverlay.addEventListener('mousemove', handleMouseMove);
    selectionOverlay.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    console.log("Selection mode activated. Draw area or press ESC to cancel.");
}

/** Handles the mousedown event on the selection overlay. */
function handleMouseDown(event) {
    event.preventDefault();
    event.stopPropagation();
    startX = event.clientX;
    startY = event.clientY;

    selectionBox = document.createElement('div');
    Object.assign(selectionBox.style, {
        position: 'fixed',
        left: startX + 'px', top: startY + 'px',
        width: '0px', height: '0px',
        border: '2px dashed #0366d6',
        backgroundColor: 'rgba(3, 102, 214, 0.2)',
        pointerEvents: 'none', zIndex: '2147483647', userSelect: 'none'
    });
    document.body.appendChild(selectionBox);
}

/** Handles the mousemove event while the mouse button is down. */
function handleMouseMove(event) {
    if (!selectionBox) return;
    event.preventDefault();
    event.stopPropagation();
    const currentX = event.clientX;
    const currentY = event.clientY;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
}

/** Handles the mouseup event, finalizing the selection. */
function handleMouseUp(event) {
    if (!selectionBox) {
        cleanupSelectionMode();
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const finalX = event.clientX;
    const finalY = event.clientY;
    const rect = {
        x: Math.min(startX, finalX),
        y: Math.min(startY, finalY),
        width: Math.abs(finalX - startX),
        height: Math.abs(finalY - startY)
    };

    const minSize = 5;
    if (rect.width < minSize || rect.height < minSize) {
        console.log("Selection too small, cancelled.");
        cleanupSelectionMode();
        return;
    }
    console.log("Area selected (viewport coordinates):", rect);

    if (selectionOverlay) selectionOverlay.style.display = 'none';
    if (selectionBox) selectionBox.style.display = 'none';

    // Get full page data (including text/html/links)
    const pageData = getPageData();
    const payload = {
        rect: rect,
        devicePixelRatio: window.devicePixelRatio || 1,
        url: pageData.url,
        title: pageData.title,
        lang: pageData.lang,
        description: pageData.description,
        keywords: pageData.keywords,
        links: pageData.links,
        // ** NOTE: text and html from pageData are NOT needed for area capture **
        // ** Background script only needs the rect and context metadata/links **
    };

    setTimeout(() => {
        chrome.runtime.sendMessage({
            type: "CAPTURE_AREA_FROM_CONTENT",
            payload: payload
        }, (response) => {
            if (chrome.runtime.lastError) {
                 console.error("Error sending capture message:", chrome.runtime.lastError.message);
            } else if (response && response.success) {
                 console.log("Area capture request sent successfully.");
            } else {
                 console.error("Background script failed capture request:", response?.error);
            }
            cleanupSelectionMode();
        });
    }, 50);
}

/** Handles the keydown event, specifically listening for ESC to cancel selection. */
function handleKeyDown(event) {
    if (event.key === "Escape" && isSelecting) {
        console.log("Selection cancelled by ESC key.");
        cleanupSelectionMode();
    }
}

/** Removes the selection overlay, selection box, and associated event listeners. */
function cleanupSelectionMode() {
    console.log("Cleaning up selection mode UI.");
    if (selectionOverlay) {
        selectionOverlay.removeEventListener('mousedown', handleMouseDown);
        selectionOverlay.removeEventListener('mousemove', handleMouseMove);
        selectionOverlay.removeEventListener('mouseup', handleMouseUp);
        selectionOverlay.remove();
        selectionOverlay = null;
    }
    if (selectionBox) {
        selectionBox.remove();
        selectionBox = null;
    }
    document.removeEventListener('keydown', handleKeyDown);
    isSelecting = false;
}

console.log("WebInsight Content Script listeners attached.");
