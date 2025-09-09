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
// Returns url, title, lang, description, keywords, links, text, html
// PLUS identifiers: host, canonicalUrl, slug, siteName, section, author, publisher, datePublished, dateModified, contentType
function getPageData() {
  const doc = document;

  const getMeta = (sel) =>
    doc.querySelector(sel)?.getAttribute("content") || null;
  const getOG = (prop) =>
    doc.querySelector(`meta[property="${prop}"]`)?.getAttribute("content") ||
    null;

  const data = {
    url: window.location.href,
    title: doc.title || "Untitled Page",
    lang: doc.documentElement.lang || null,
    description: getMeta('meta[name="description"]'),
    keywords: getMeta('meta[name="keywords"]'),
    links: [],
    text: null,
    html: null,

    // identifiers (defaults; filled below)
    host: location.hostname || null,
    canonicalUrl: null,
    slug: null,
    siteName: null,
    section: null,
    author: null,
    publisher: null,
    datePublished: null,
    dateModified: null,
    contentType: null,
  };

  // Full text + HTML (best-effort)
  try {
    data.text = doc.body?.innerText || "";
  } catch {
    data.text = "";
  }
  try {
    data.html = doc.documentElement?.outerHTML || "";
  } catch {
    data.html = "";
  }

  // Canonical URL + slug
  try {
    const canonical =
      doc.querySelector('link[rel="canonical"]')?.href || data.url;
    data.canonicalUrl = canonical;
    try {
      const u = new URL(canonical);
      const parts = u.pathname.split("/").filter(Boolean);
      data.slug = decodeURIComponent(parts[parts.length - 1] || "") || null;
    } catch {}
  } catch {}

  // OpenGraph / Twitter hints
  data.siteName = getOG("og:site_name") || data.siteName;
  data.contentType = getOG("og:type") || data.contentType;
  data.section =
    getMeta('meta[name="article:section"]') ||
    getOG("article:section") ||
    data.section;

  // JSON-LD (Article/News/WebPage)
  try {
    const scripts = Array.from(
      doc.querySelectorAll('script[type="application/ld+json"]')
    );
    const flatten = (x) => (Array.isArray(x) ? x.flatMap(flatten) : [x]);

    for (const s of scripts) {
      let json;
      try {
        json = JSON.parse(s.textContent);
      } catch {
        continue;
      }
      const nodes = flatten(json);
      for (const node of nodes) {
        const types = node?.["@type"];
        const typeArr = (Array.isArray(types) ? types : [types]).filter(
          Boolean
        );
        if (!typeArr.length) continue;
        if (
          !["Article", "NewsArticle", "BlogPosting", "WebPage", "Report"].some(
            (t) => typeArr.includes(t)
          )
        )
          continue;

        data.contentType = data.contentType || typeArr[0];
        data.datePublished = data.datePublished || node.datePublished || null;
        data.dateModified = data.dateModified || node.dateModified || null;
        if (!data.section && node.articleSection)
          data.section = node.articleSection;

        const a = node.author;
        if (!data.author) {
          if (typeof a === "string") data.author = a;
          else if (a && typeof a === "object") data.author = a.name || null;
          else if (Array.isArray(a))
            data.author =
              a.find((x) => typeof x === "string") ||
              a.find((x) => x?.name)?.name ||
              null;
        }

        const p = node.publisher;
        if (!data.publisher) {
          if (typeof p === "string") data.publisher = p;
          else if (p && typeof p === "object") data.publisher = p.name || null;
        }

        if (
          !data.siteName &&
          node.publisher &&
          typeof node.publisher === "object" &&
          node.publisher.name
        ) {
          data.siteName = node.publisher.name;
        }
      }
    }
  } catch {}

  // Links (http/https only), filtered + capped
  try {
    const baseURI = doc.baseURI || location.origin;
    const skip = ["javascript:", "mailto:", "tel:", "data:"];
    const anchors = doc.body ? doc.body.querySelectorAll("a[href]") : [];
    anchors.forEach((a) => {
      const raw = a.getAttribute("href");
      if (!raw) return;
      const lower = raw.trim().toLowerCase();
      if (lower.startsWith("#") || skip.some((p) => lower.startsWith(p)))
        return;
      try {
        const url = new URL(raw, baseURI).href;
        if (!/^https?:/i.test(url)) return;
        data.links.push({
          text: (a.innerText || a.textContent || "").trim(),
          url,
        });
      } catch {}
    });
    if (data.links.length > 200) data.links = data.links.slice(0, 200);
  } catch {}

  return data;
}

// --- Selection Tool Listener (for text) ---
document.addEventListener("mouseup", handleTextSelection);

function handleTextSelection() {
  if (isSelecting) return;
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0) {
    console.log(
      "WebInsight: Text selected:",
      selectedText.substring(0, 100) + "..."
    );
  }
}

// --- Message Listener (from Background Script or Panel) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in content script:", message);

  switch (message.type) {
    case "GET_PAGE_DATA":
      try {
        const pageData = getPageData();
        sendResponse({ success: true, payload: pageData });
      } catch (error) {
        console.error("Error getting page data:", error);
        sendResponse({
          success: false,
          error: `Error getting page data: ${error.message}`,
        });
      }
      break; // Synchronous response

case "PING":
  sendResponse({ ok: true, from: "content", version: "v1" });
  break;


case "GET_LAST_SELECTION":
  try {
    const sel = window.getSelection().toString().trim();
    if (!sel) {
      sendResponse({ success: false, error: "No text currently selected." });
      break;
    }

    const pd = getPageData(); // includes identifiers + links

    // Dedupe & cap links to 20
    const links = Array.isArray(pd.links)
      ? (() => {
          const out = [];
          const seen = new Set();
          for (const l of pd.links) {
            if (!l || !l.url) continue;
            const url = (l.url || "").trim();
            if (!url || seen.has(url)) continue;
            seen.add(url);
            out.push({ text: (l.text || "").trim(), url });
            if (out.length >= 20) break;
          }
          return out;
        })()
      : [];

    sendResponse({
      success: true,
      payload: {
        selectionText: sel,

        // core metadata
        url: pd.url,
        title: pd.title,
        lang: pd.lang,
        description: pd.description,
        keywords: pd.keywords,

        // include links (top 20)
        links,

        // identifiers
        host: pd.host,
        canonicalUrl: pd.canonicalUrl,
        slug: pd.slug,
        siteName: pd.siteName,
        section: pd.section,
        author: pd.author,
        publisher: pd.publisher,
        datePublished: pd.datePublished,
        dateModified: pd.dateModified,
        contentType: pd.contentType
      }
    });
  } catch (e) {
    console.error("Error getting selection:", e);
    sendResponse({ success: false, error: `Error getting selection: ${e.message}` });
  }
  break;


// --- Area Selection UI and Logic ---
/** Creates and displays the overlay for area selection. */
function activateSelectionMode() {
  if (selectionOverlay) return; // Already active
  console.log("Activating area selection mode...");
  isSelecting = true;

  selectionOverlay = document.createElement("div");
  Object.assign(selectionOverlay.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(0, 50, 100, 0.1)",
    cursor: "crosshair",
    zIndex: "2147483647",
    userSelect: "none",
  });
  document.body.appendChild(selectionOverlay);

  selectionOverlay.addEventListener("mousedown", handleMouseDown);
  selectionOverlay.addEventListener("mousemove", handleMouseMove);
  selectionOverlay.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("keydown", handleKeyDown);
  console.log("Selection mode activated. Draw area or press ESC to cancel.");
}

/** Handles the mousedown event on the selection overlay. */
function handleMouseDown(event) {
  event.preventDefault();
  event.stopPropagation();
  startX = event.clientX;
  startY = event.clientY;

  selectionBox = document.createElement("div");
  Object.assign(selectionBox.style, {
    position: "fixed",
    left: startX + "px",
    top: startY + "px",
    width: "0px",
    height: "0px",
    border: "2px dashed #0366d6",
    backgroundColor: "rgba(3, 102, 214, 0.2)",
    pointerEvents: "none",
    zIndex: "2147483647",
    userSelect: "none",
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
  selectionBox.style.left = left + "px";
  selectionBox.style.top = top + "px";
  selectionBox.style.width = width + "px";
  selectionBox.style.height = height + "px";
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
    width: Math.abs(finalY - startY) === 0 ? 0 : Math.abs(finalX - startX),
    height: Math.abs(finalX - startX) === 0 ? 0 : Math.abs(finalY - startY),
  };

  const minSize = 5;
  if (rect.width < minSize || rect.height < minSize) {
    console.log("Selection too small, cancelled.");
    cleanupSelectionMode();
    return;
  }
  console.log("Area selected (viewport coordinates):", rect);

  if (selectionOverlay) selectionOverlay.style.display = "none";
  if (selectionBox) selectionBox.style.display = "none";

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
    // NOTE: text and html from pageData are NOT needed for area capture
  };

  setTimeout(() => {
    chrome.runtime.sendMessage(
      { type: "CAPTURE_AREA_FROM_CONTENT", payload },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending capture message:",
            chrome.runtime.lastError.message
          );
        } else if (response && response.success) {
          console.log("Area capture request sent successfully.");
        } else {
          console.error(
            "Background script failed capture request:",
            response?.error
          );
        }
        cleanupSelectionMode();
      }
    );
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
    selectionOverlay.removeEventListener("mousedown", handleMouseDown);
    selectionOverlay.removeEventListener("mousemove", handleMouseMove);
    selectionOverlay.removeEventListener("mouseup", handleMouseUp);
    selectionOverlay.remove();
    selectionOverlay = null;
  }
  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
  }
  document.removeEventListener("keydown", handleKeyDown);
  isSelecting = false;
}

console.log("WebInsight Content Script listeners attached.");
