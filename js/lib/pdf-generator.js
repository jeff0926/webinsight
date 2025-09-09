// js/lib/pdf-generator.js - PDF generation using Chrome DevTools Protocol

/**
 * Generates a PDF of the entire webpage using Chrome's DevTools Protocol.
 * This captures the full page content, not just the visible area.
 * 
 * @param {number} tabId - The ID of the tab to convert to PDF
 * @param {object} options - PDF generation options
 * @returns {Promise<string>} Base64 encoded PDF data
 */
async function generatePagePDF(tabId, options = {}) {
    console.log(`[PDF] Starting PDF generation for tab ${tabId}`);
    
    const defaultOptions = {
        landscape: false,
        displayHeaderFooter: false,
        printBackground: true,
        scale: 1,
        paperWidth: 8.5,
        paperHeight: 11,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        pageRanges: '',
        ignoreInvalidPageRanges: false,
        headerTemplate: '',
        footerTemplate: '',
        preferCSSPageSize: true,
        generateTaggedPDF: false,
        generateDocumentOutline: false
    };

    const pdfOptions = { ...defaultOptions, ...options };

    try {
        // Attach debugger to the tab
        console.log(`[PDF] Attaching debugger to tab ${tabId}`);
        await chrome.debugger.attach({ tabId }, "1.3");
        
        // Enable Page domain
        await chrome.debugger.sendCommand({ tabId }, "Page.enable");
        
        // Wait for page to be ready
        await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
        
        // Generate PDF
        console.log(`[PDF] Generating PDF with options:`, pdfOptions);
        const result = await chrome.debugger.sendCommand(
            { tabId }, 
            "Page.printToPDF", 
            pdfOptions
        );
        
        if (!result || !result.data) {
            throw new Error("PDF generation failed - no data returned");
        }
        
        console.log(`[PDF] PDF generated successfully (${result.data.length} characters)`);
        return result.data; // Base64 encoded PDF
        
    } catch (error) {
        console.error(`[PDF] Error generating PDF for tab ${tabId}:`, error);
        throw new Error(`PDF generation failed: ${error.message}`);
    } finally {
        // Always detach debugger
        try {
            await chrome.debugger.detach({ tabId });
            console.log(`[PDF] Debugger detached from tab ${tabId}`);
        } catch (detachError) {
            console.warn(`[PDF] Error detaching debugger:`, detachError);
        }
    }
}

/**
 * Converts base64 PDF data to a data URL for storage/display
 * @param {string} base64Data - Base64 encoded PDF data
 * @returns {string} PDF data URL
 */
function pdfToDataUrl(base64Data) {
    return `data:application/pdf;base64,${base64Data}`;
}

/**
 * Estimates PDF file size from base64 data
 * @param {string} base64Data - Base64 encoded PDF data
 * @returns {number} Estimated file size in bytes
 */
function estimatePDFSize(base64Data) {
    // Base64 encoding increases size by ~33%, so we reverse that calculation
    return Math.floor((base64Data.length * 3) / 4);
}

/**
 * Validates PDF generation options
 * @param {object} options - PDF options to validate
 * @returns {object} Validated and sanitized options
 */
function validatePDFOptions(options = {}) {
    const validated = {};
    
    // Boolean options
    if (typeof options.landscape === 'boolean') validated.landscape = options.landscape;
    if (typeof options.displayHeaderFooter === 'boolean') validated.displayHeaderFooter = options.displayHeaderFooter;
    if (typeof options.printBackground === 'boolean') validated.printBackground = options.printBackground;
    if (typeof options.preferCSSPageSize === 'boolean') validated.preferCSSPageSize = options.preferCSSPageSize;
    
    // Numeric options with ranges
    if (typeof options.scale === 'number' && options.scale >= 0.1 && options.scale <= 2) {
        validated.scale = options.scale;
    }
    
    if (typeof options.paperWidth === 'number' && options.paperWidth > 0) {
        validated.paperWidth = options.paperWidth;
    }
    
    if (typeof options.paperHeight === 'number' && options.paperHeight > 0) {
        validated.paperHeight = options.paperHeight;
    }
    
    // Margin options
    ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'].forEach(margin => {
        if (typeof options[margin] === 'number' && options[margin] >= 0) {
            validated[margin] = options[margin];
        }
    });
    
    // String options
    if (typeof options.pageRanges === 'string') validated.pageRanges = options.pageRanges;
    if (typeof options.headerTemplate === 'string') validated.headerTemplate = options.headerTemplate;
    if (typeof options.footerTemplate === 'string') validated.footerTemplate = options.footerTemplate;
    
    return validated;
}

/**
 * Creates PDF generation options for different use cases
 */
const PDFPresets = {
    // Standard document - good for most web pages
    standard: {
        landscape: false,
        printBackground: true,
        scale: 1,
        paperWidth: 8.5,
        paperHeight: 11,
        marginTop: 0.4,
        marginBottom: 0.4,
        marginLeft: 0.4,
        marginRight: 0.4,
        preferCSSPageSize: false
    },
    
    // Full page - no margins, respects CSS
    fullPage: {
        landscape: false,
        printBackground: true,
        scale: 1,
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,
        preferCSSPageSize: true
    },
    
    // Compact - smaller scale for fitting more content
    compact: {
        landscape: false,
        printBackground: true,
        scale: 0.8,
        paperWidth: 8.5,
        paperHeight: 11,
        marginTop: 0.2,
        marginBottom: 0.2,
        marginLeft: 0.2,
        marginRight: 0.2,
        preferCSSPageSize: false
    },
    
    // Landscape mode
    landscape: {
        landscape: true,
        printBackground: true,
        scale: 1,
        paperWidth: 11,
        paperHeight: 8.5,
        marginTop: 0.4,
        marginBottom: 0.4,
        marginLeft: 0.4,
        marginRight: 0.4,
        preferCSSPageSize: false
    }
};

// Export functions
export { 
    generatePagePDF, 
    pdfToDataUrl, 
    estimatePDFSize, 
    validatePDFOptions,
    PDFPresets 
};