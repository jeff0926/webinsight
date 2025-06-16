// js/lib/pdf-generator.js
// This script provides functionalities for generating PDF documents from web pages
// within a Chrome extension. It primarily utilizes the Chrome DevTools Protocol (CDP)
// via `chrome.debugger` API to instruct the browser to print a page to PDF.
// It also includes helper functions for handling PDF data and defining preset options.

/**
 * @typedef {object} PDFOptions
 * @property {boolean} [landscape=false] - Whether to print in landscape orientation.
 * @property {boolean} [displayHeaderFooter=false] - Whether to display header and footer.
 * @property {boolean} [printBackground=true] - Whether to print background graphics.
 * @property {number} [scale=1] - Scale of the webpage rendering (1.0 is 100%).
 * @property {number} [paperWidth=8.5] - Paper width in inches.
 * @property {number} [paperHeight=11] - Paper height in inches.
 * @property {number} [marginTop=0] - Top margin in inches.
 * @property {number} [marginBottom=0] - Bottom margin in inches.
 * @property {number} [marginLeft=0] - Left margin in inches.
 * @property {number} [marginRight=0] - Right margin in inches.
 * @property {string} [pageRanges=''] - Paper ranges to print, e.g., '1-5, 8, 11-13'. Empty for all pages.
 * @property {boolean} [ignoreInvalidPageRanges=false] - Whether to silently ignore invalid page ranges.
 * @property {string} [headerTemplate=''] - HTML template for the print header.
 * @property {string} [footerTemplate=''] - HTML template for the print footer.
 * @property {boolean} [preferCSSPageSize=true] - Whether to prefer page size as defined by CSS.
 * @property {boolean} [generateTaggedPDF=false] - Whether to generate a tagged (accessible) PDF.
 * @property {boolean} [generateDocumentOutline=false] - Whether to generate a document outline (bookmarks).
 */

/**
 * A collection of predefined PDF generation option sets for common use cases.
 * These presets can be passed to `generatePagePDF` to simplify option configuration.
 * Each preset is an object conforming to {@link PDFOptions}.
 * @type {Object.<string, PDFOptions>}
 */
const PDFPresets = {
    // Standard document preset: Good for most web pages, portrait, with small margins.
    standard: {
        landscape: false,
        printBackground: true,
        scale: 1,
        paperWidth: 8.5, // Standard US Letter width
        paperHeight: 11, // Standard US Letter height
        marginTop: 0.4,
        marginBottom: 0.4,
        marginLeft: 0.4,
        marginRight: 0.4,
        preferCSSPageSize: false // Use specified paper size over CSS defined.
    },
    // Full page preset: No margins, respects CSS page size, good for exact captures.
    fullPage: {
        landscape: false,
        printBackground: true,
        scale: 1,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        preferCSSPageSize: true // Prioritize CSS defined page size.
    },
    // Compact preset: Smaller scale for fitting more content, portrait, with minimal margins.
    compact: {
        landscape: false,
        printBackground: true,
        scale: 0.8, // Reduced scale.
        paperWidth: 8.5,
        paperHeight: 11,
        marginTop: 0.2,
        marginBottom: 0.2,
        marginLeft: 0.2,
        marginRight: 0.2,
        preferCSSPageSize: false
    },
    // Landscape mode preset: Standard US Letter size in landscape orientation.
    landscape: {
        landscape: true,
        printBackground: true,
        scale: 1,
        paperWidth: 11, // Swapped width and height for landscape.
        paperHeight: 8.5,
        marginTop: 0.4,
        marginBottom: 0.4,
        marginLeft: 0.4,
        marginRight: 0.4,
        preferCSSPageSize: false
    }
};

/**
 * Generates a PDF of the entire webpage content of a given tab using the Chrome DevTools Protocol (CDP).
 * This function attaches the Chrome debugger to the specified tab, enables necessary CDP domains
 * (Page, Runtime), and then calls the `Page.printToPDF` command with the provided options.
 * It ensures the debugger is detached afterwards, regardless of success or failure.
 *
 * @param {number} tabId - The ID of the tab to be converted into a PDF.
 * @param {PDFOptions} [options={}] - An object containing PDF generation options.
 *                                    These options will override the default settings.
 *                                    See {@link PDFOptions} for available properties.
 *                                    Refer to Chrome DevTools Protocol `Page.printToPDF` documentation
 *                                    for detailed descriptions of each option.
 * @returns {Promise<string>} A promise that resolves with the base64 encoded string of the PDF data.
 * @throws {Error} Throws an error if any step of the PDF generation process fails,
 *                 including debugger attachment, command sending, or if the PDF data
 *                 is not returned by the API. The error message will provide context.
 * @async
 */
async function generatePagePDF(tabId, options = {}) {
    console.log(`WebInsight PDF: Starting PDF generation for tab ${tabId}`);

    // Default options for Page.printToPDF, aligned with CDP definitions.
    const defaultOptions = {
        landscape: false,
        displayHeaderFooter: false,
        printBackground: true,
        scale: 1,
        paperWidth: 8.5, // Inches
        paperHeight: 11, // Inches
        marginTop: 0,    // Inches
        marginBottom: 0, // Inches
        marginLeft: 0,   // Inches
        marginRight: 0,  // Inches
        pageRanges: '',  // e.g., '1-5, 8, 11-13'
        ignoreInvalidPageRanges: false,
        headerTemplate: '<div></div>', // Empty default, CDP requires valid HTML.
        footerTemplate: '<div></div>', // Empty default.
        preferCSSPageSize: false, // Changed default to false for more control via paperWidth/Height.
                                 // Set to true if you want CSS @page rules to dictate size.
        // Additional CDP v1.3+ options (ensure your Chrome version supports these if used)
        // transferMode: 'ReturnAsBase64', // Explicitly state return mode (usually default)
        // generateTaggedPDF: false,      // For accessibility
        // generateDocumentOutline: false // For PDF bookmarks
    };

    // Merge provided options with defaults. User options override defaults.
    const pdfOptions = { ...defaultOptions, ...options };
    // Ensure header/footer templates are valid HTML if empty, as CDP might require it.
    if (pdfOptions.displayHeaderFooter) {
        if (!pdfOptions.headerTemplate || pdfOptions.headerTemplate.trim() === "") pdfOptions.headerTemplate = "<div></div>";
        if (!pdfOptions.footerTemplate || pdfOptions.footerTemplate.trim() === "") pdfOptions.footerTemplate = "<div></div>";
    }


    try {
        // 1. Attach debugger to the target tab. Version "1.3" is commonly used for CDP.
        console.log(`WebInsight PDF: Attaching debugger to tab ${tabId} (CDP version 1.3)`);
        await chrome.debugger.attach({ tabId }, "1.3");
        
        // 2. Enable necessary CDP domains. Page domain is essential for printToPDF.
        //    Runtime might be implicitly needed or useful for other operations not done here.
        await chrome.debugger.sendCommand({ tabId }, "Page.enable");
        // Consider if Runtime.enable is strictly necessary for printToPDF alone.
        // await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
        
        // 3. Send the Page.printToPDF command with the configured options.
        console.log(`WebInsight PDF: Calling Page.printToPDF with options:`, pdfOptions);
        const result = await chrome.debugger.sendCommand(
            { tabId }, 
            "Page.printToPDF", 
            pdfOptions // Pass the merged options.
        );
        
        // Check if the result contains the base64 encoded PDF data.
        if (!result || !result.data) {
            throw new Error("PDF generation via CDP failed: no data returned from Page.printToPDF command.");
        }
        
        console.log(`WebInsight PDF: PDF generated successfully for tab ${tabId}. Data length: ${result.data.length}`);
        return result.data; // Return the base64 encoded PDF data.
        
    } catch (error) {
        console.error(`WebInsight PDF: Error during PDF generation for tab ${tabId}:`, error);
        // Construct a more informative error message.
        throw new Error(`PDF generation failed for tab ${tabId}: ${error.message}`);
    } finally {
        // 4. Always detach the debugger from the tab, whether PDF generation succeeded or failed.
        // This is crucial to release the tab from debugging mode and prevent issues.
        try {
            await chrome.debugger.detach({ tabId });
            console.log(`WebInsight PDF: Debugger detached successfully from tab ${tabId}`);
        } catch (detachError) {
            // Log a warning if detaching fails, but don't let it mask the primary error (if any).
            console.warn(`WebInsight PDF: Error detaching debugger from tab ${tabId}:`, detachError);
        }
    }
}

/**
 * Converts base64 encoded PDF data into a data URL string.
 * This format can be used, for example, to set the `href` for a download link
 * or as a source for an `<iframe>` or `<embed>` to display the PDF.
 *
 * @param {string} base64Data - The base64 encoded PDF data string.
 * @returns {string} A data URL string representing the PDF (e.g., "data:application/pdf;base64,...").
 */
function pdfToDataUrl(base64Data) {
    if (typeof base64Data !== 'string') {
        console.warn("WebInsight PDF: Invalid base64Data provided to pdfToDataUrl, expected string.");
        return ""; // Return empty or handle error as appropriate.
    }
    return `data:application/pdf;base64,${base64Data}`;
}

/**
 * Estimates the file size of a PDF from its base64 encoded data string.
 * Base64 encoding typically increases the original data size by approximately 33-37%.
 * This function provides a rough estimate of the original binary file size.
 *
 * @param {string} base64Data - The base64 encoded PDF data string.
 * @returns {number} An estimated file size in bytes. Returns 0 if input is invalid.
 */
function estimatePDFSize(base64Data) {
    if (typeof base64Data !== 'string' || base64Data.length === 0) {
        console.warn("WebInsight PDF: Invalid base64Data provided to estimatePDFSize.");
        return 0;
    }
    // The length of a base64 string is L.
    // Number of non-padding characters = L - (number of padding '=' characters, usually 0, 1, or 2).
    // Each base64 character represents 6 bits. So, L characters represent L*6 bits.
    // Original data size in bytes = (L * 6) / 8 = L * 3/4.
    // This formula is more accurate if padding is handled, but for a rough estimate:
    const lengthWithoutPadding = base64Data.replace(/=/g, '').length;
    return Math.floor((lengthWithoutPadding * 3) / 4);
}

/**
 * Validates and sanitizes an object of PDF generation options against a set of known
 * valid properties and their expected types or ranges.
 * Note: This function is provided for potential use if stricter option validation
 * is needed before passing to `generatePagePDF` or other contexts. Currently,
 * `generatePagePDF` uses its own default merging strategy.
 *
 * @param {PDFOptions} [options={}] - The PDF options object to validate.
 * @returns {Partial<PDFOptions>} A new object containing only the valid and sanitized options.
 *                                 Unsupported options are omitted.
 */
function validatePDFOptions(options = {}) {
    const validated = {}; // Object to hold validated options.
    
    // Validate boolean options.
    if (typeof options.landscape === 'boolean') validated.landscape = options.landscape;
    if (typeof options.displayHeaderFooter === 'boolean') validated.displayHeaderFooter = options.displayHeaderFooter;
    if (typeof options.printBackground === 'boolean') validated.printBackground = options.printBackground;
    if (typeof options.preferCSSPageSize === 'boolean') validated.preferCSSPageSize = options.preferCSSPageSize;
    
    // Validate numeric options with specific ranges.
    if (typeof options.scale === 'number' && options.scale >= 0.1 && options.scale <= 2) {
        validated.scale = options.scale; // Scale typically 0.1 to 2.0
    }
    
    // Validate paper dimensions (must be positive).
    if (typeof options.paperWidth === 'number' && options.paperWidth > 0) {
        validated.paperWidth = options.paperWidth;
    }
    if (typeof options.paperHeight === 'number' && options.paperHeight > 0) {
        validated.paperHeight = options.paperHeight;
    }
    
    // Validate margin options (must be non-negative).
    ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'].forEach(margin => {
        if (typeof options[margin] === 'number' && options[margin] >= 0) {
            validated[margin] = options[margin];
        }
    });
    
    // Validate string options (no specific format validation here, just type).
    if (typeof options.pageRanges === 'string') validated.pageRanges = options.pageRanges;
    if (typeof options.headerTemplate === 'string') validated.headerTemplate = options.headerTemplate;
    if (typeof options.footerTemplate === 'string') validated.footerTemplate = options.footerTemplate;
    
    // Note: `generateTaggedPDF` and `generateDocumentOutline` are not included here but are valid CDP options.
    // They could be added if explicit validation for them is desired.

    return validated;
}


// --- Exports ---
// Export the functions and presets to make them available for import in other modules.
export { 
    generatePagePDF, 
    pdfToDataUrl, 
    estimatePDFSize, 
    validatePDFOptions, // Note: validatePDFOptions is exported but not actively used by generatePagePDF internally.
    PDFPresets 
};