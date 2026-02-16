// js/lib/metadata.js
// Utility for extracting standardized metadata from a page/document

/**
 * Extracts common metadata fields from a given DOM Document.
 * Supports HTML <meta>, OpenGraph, Twitter Cards, and <html lang>.
 *
 * @param {Document} doc - The DOM document to extract from.
 * @returns {object} Metadata object with standardized fields.
 */
export function extractPageMetadata(doc) {
  if (!doc || typeof doc.querySelector !== "function") {
    console.warn("[Metadata] Invalid document passed to extractor.");
    return {};
  }

  const getMeta = (selector) => doc.querySelector(selector)?.getAttribute("content") || null;

  return {
    lang: doc.documentElement.lang || null,

    // Standard meta
    metaDescription: getMeta('meta[name="description"]'),

    // OpenGraph
    og: {
      title: getMeta('meta[property="og:title"]'),
      description: getMeta('meta[property="og:description"]'),
      image: getMeta('meta[property="og:image"]'),
      siteName: getMeta('meta[property="og:site_name"]'),
      type: getMeta('meta[property="og:type"]'),
    },

    // Twitter Cards
    twitter: {
      title: getMeta('meta[name="twitter:title"]'),
      description: getMeta('meta[name="twitter:description"]'),
      image: getMeta('meta[name="twitter:image"]'),
    },
  };
}

/**
 * Merges extracted metadata into a content item object.
 * Useful when saving to IndexedDB or preparing JSON exports.
 *
 * @param {object} item - The content item object (page, selection, screenshot, etc.).
 * @param {object} metadata - Metadata object from extractPageMetadata().
 * @returns {object} Updated item with merged metadata fields.
 */
export function mergeMetadataIntoItem(item, metadata) {
  if (!item || typeof item !== "object") return item;
  if (!metadata || typeof metadata !== "object") return item;

  return {
    ...item,
    lang: metadata.lang || item.lang || null,
    metaDescription: metadata.metaDescription || item.metaDescription || null,
    og: metadata.og || item.og || {},
    twitter: metadata.twitter || item.twitter || {},
  };
}
