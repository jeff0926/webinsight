// js/lib/api.js - Handles communication with Gemini API

// --- Configuration ---
// IMPORTANT: Verify the correct Gemini API endpoint and model names.
// Refer to the official Google AI documentation: https://ai.google.dev/docs
const GEMINI_API_ENDPOINT_BASE = `https://generativelanguage.googleapis.com/v1beta/models/`;
// Model for analyzing images (multimodal)
const VISION_MODEL = 'gemini-1.5-flash-latest';
// Model for analyzing text (can be Flash or Pro - Pro is better for complex text tasks)
const TEXT_MODEL = 'gemini-1.5-flash-latest'; // Start with Flash, consider Pro later
const API_ACTION = ':generateContent';

/**
 * Retrieves the stored Gemini API key from local storage.
 * Uses chrome.storage.local for better security than chrome.storage.sync.
 * @returns {Promise<string|null>} The API key string, or null if not found or an error occurs.
 */
async function getApiKey() {
    try {
        const result = await chrome.storage.local.get(['geminiApiKey']);
        if (result.geminiApiKey) {
            return result.geminiApiKey;
        } else {
            console.warn("Gemini API Key not found in storage.");
            // Return null, let the calling function handle the error appropriately
            return null;
        }
    } catch (error) {
        console.error("Error retrieving API key from chrome.storage.local:", error);
        return null; // Return null on error
    }
}

/**
 * Analyzes an image using the Google Gemini Vision API.
 * Sends the image data and a text prompt to the API.
 *
 * @param {string} imageDataUrl - The base64 encoded image data URL (e.g., "data:image/png;base64,...").
 * @param {string} [promptText="Describe this image in detail."] - The text prompt guiding the AI analysis.
 * @returns {Promise<object>} Promise resolving with the full JSON response object from the API.
 * @throws {Error} Throws an error if the API key is missing, data URL is invalid,
 * or the API request fails.
 */
async function analyzeImageWithGemini(imageDataUrl, promptText = "Describe this image in detail.") {
    console.log(`[API] Starting image analysis with model: ${VISION_MODEL}`);
    // 1. Get API Key
    const apiKey = await getApiKey();
    if (!apiKey) {
        // Throw an error that background.js can catch and handle (e.g., update item status)
        throw new Error("Gemini API Key not set. Please configure it in the extension options.");
    }

    // 2. Validate and Prepare Image Data
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image')) {
         throw new Error("Invalid image data URL provided.");
    }
    const base64Data = imageDataUrl.split(',')[1];
    if (!base64Data) {
        throw new Error("Could not extract base64 data from image URL.");
    }
    const mimeTypeMatch = imageDataUrl.match(/^data:(image\/\w+);base64,/);
    if (!mimeTypeMatch || !mimeTypeMatch[1]) {
        throw new Error("Could not determine image MIME type from data URL.");
    }
    const mimeType = mimeTypeMatch[1];

    // 3. Construct API Request Body for Multimodal Input
    const requestBody = {
        contents: [{
            parts: [
                { text: promptText },
                {
                    inline_data: {
                        mime_type: mimeType,
                        data: base64Data
                    }
                }
            ]
        }],
        // Optional Generation Config (Example - adjust as needed)
        // generationConfig: {
        //   temperature: 0.4,
        //   topK: 32,
        //   topP: 1,
        //   maxOutputTokens: 4096,
        // },
        // Optional Safety Settings (Example - adjust as needed)
        // safetySettings: [
        //   { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        //   // ... other categories
        // ]
    };

    // 4. Make the API Call using Fetch
    const apiUrl = `${GEMINI_API_ENDPOINT_BASE}${VISION_MODEL}${API_ACTION}?key=${apiKey}`;
    console.log(`[API] Sending image analysis request to Gemini API...`);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(requestBody),
        });

        // 5. Handle API Response
        if (!response.ok) {
            let errorBodyText = await response.text(); // Get raw text first
            let errorMessage = response.statusText;
            try {
                 const errorBodyJson = JSON.parse(errorBodyText);
                 console.error("[API] Gemini API Error Response Body:", errorBodyJson);
                 errorMessage = errorBodyJson?.error?.message || errorMessage;
            } catch (e) {
                 console.error("[API] Gemini API Error Response Text (not JSON):", errorBodyText);
            }
            // Throw specific error for 404 if model name is wrong again
            if (response.status === 404) {
                 throw new Error(`API request failed (404 Not Found): Model '${VISION_MODEL}' might be incorrect or unavailable. Check model name and API endpoint. Original message: ${errorMessage}`);
            }
            throw new Error(`API request failed with status ${response.status}: ${errorMessage}`);
        }

        const data = await response.json();
        console.log("[API] Gemini API Image Response Received:", data);
        // Basic validation of response structure
        if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
            console.warn("[API] Gemini response missing expected 'candidates' array.", data);
            // Decide if this should be an error or just return the incomplete data
            // throw new Error("Invalid response structure received from Gemini API (missing candidates).");
        }
        return data; // Return the full response object

    } catch (error) {
        console.error('[API] Error calling Gemini API (Image):', error);
        // Re-throw the error so the caller (background.js) knows it failed
        throw error;
    }
}


/**
 * Analyzes text using the Google Gemini API.
 * Sends text content and a prompt to the API.
 *
 * @param {string} textContent - The text content to analyze.
 * @param {string} [promptText="Summarize the following text:"] - The text prompt guiding the AI analysis.
 * @returns {Promise<object>} Promise resolving with the full JSON response object from the API.
 * @throws {Error} Throws an error if the API key is missing, text content is empty,
 * or the API request fails.
 */
async function analyzeTextWithGemini(textContent, promptText = "Summarize the following text:") {
    console.log(`[API] Starting text analysis with model: ${TEXT_MODEL}`);
    // 1. Get API Key
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error("Gemini API Key not set. Please configure it in the extension options.");
    }

    // 2. Validate Text Content
    if (!textContent || typeof textContent !== 'string' || textContent.trim().length === 0) {
        throw new Error("Invalid or empty text content provided for analysis.");
    }

    // 3. Construct API Request Body for Text Input
    const requestBody = {
        contents: [{
            parts: [
                // Combine prompt and content into a single text part, or use separate parts
                // depending on model best practices. Let's start simple:
                { text: `${promptText}\n\n${textContent}` }
            ]
        }],
        // Optional Generation Config (Example - adjust as needed)
        // generationConfig: {
        //   temperature: 0.7,
        //   topK: 40,
        //   topP: 0.95,
        //   maxOutputTokens: 1024,
        // },
        // Optional Safety Settings
        // safetySettings: [ ... ]
    };

    // 4. Make the API Call using Fetch
    const apiUrl = `${GEMINI_API_ENDPOINT_BASE}${TEXT_MODEL}${API_ACTION}?key=${apiKey}`;
    console.log(`[API] Sending text analysis request to Gemini API...`);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify(requestBody),
        });

        // 5. Handle API Response (Similar to image analysis)
        if (!response.ok) {
            let errorBodyText = await response.text();
            let errorMessage = response.statusText;
            try {
                 const errorBodyJson = JSON.parse(errorBodyText);
                 console.error("[API] Gemini API Error Response Body:", errorBodyJson);
                 errorMessage = errorBodyJson?.error?.message || errorMessage;
            } catch (e) {
                 console.error("[API] Gemini API Error Response Text (not JSON):", errorBodyText);
            }
            if (response.status === 404) {
                 throw new Error(`API request failed (404 Not Found): Model '${TEXT_MODEL}' might be incorrect or unavailable. Check model name and API endpoint. Original message: ${errorMessage}`);
            }
            throw new Error(`API request failed with status ${response.status}: ${errorMessage}`);
        }

        const data = await response.json();
        console.log("[API] Gemini API Text Response Received:", data);
        if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
            console.warn("[API] Gemini response missing expected 'candidates' array.", data);
            // throw new Error("Invalid response structure received from Gemini API (missing candidates).");
        }
        return data; // Return the full response object

    } catch (error) {
        console.error('[API] Error calling Gemini API (Text):', error);
        // Re-throw the error
        throw error;
    }
}

// --- Exports ---
export { analyzeImageWithGemini, analyzeTextWithGemini, getApiKey }; // Export the new function
