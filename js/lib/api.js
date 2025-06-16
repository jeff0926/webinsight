// js/lib/api.js
// This script is responsible for handling all communications with external
// Artificial Intelligence APIs, specifically Google's Gemini models.
// It provides functions to send image and text data for analysis and to retrieve
// the necessary API key from local storage.

// --- API Configuration Constants ---

/**
 * Base URL for the Google Gemini API endpoint.
 * Specific model names and actions are appended to this base.
 * @type {string}
 */
const GEMINI_API_ENDPOINT_BASE = `https://generativelanguage.googleapis.com/v1beta/models/`;

/**
 * Name of the Gemini model used for image analysis (multimodal capabilities).
 * Example: 'gemini-1.5-flash-latest' or 'gemini-pro-vision'.
 * It's crucial to use a model that supports visual input.
 * @type {string}
 */
const VISION_MODEL = 'gemini-1.5-flash-latest';

/**
 * Name of the Gemini model used for text analysis.
 * Example: 'gemini-1.5-flash-latest' for general tasks or 'gemini-pro' for more complex text processing.
 * @type {string}
 */
const TEXT_MODEL = 'gemini-1.5-flash-latest';

/**
 * The specific action to perform on the Gemini model, typically ':generateContent'.
 * @type {string}
 */
const API_ACTION = ':generateContent';

// --- API Key Management ---

/**
 * Retrieves the stored Gemini API key from `chrome.storage.local`.
 * `chrome.storage.local` is used for storing sensitive data like API keys as it's
 * not synced across devices and is generally considered more secure for this purpose
 * than `chrome.storage.sync`.
 *
 * @returns {Promise<string|null>} A promise that resolves with the API key string if found,
 *                                 or `null` if the key is not found in storage or if an
 *                                 error occurs during retrieval.
 * @async
 */
async function getApiKey() {
    try {
        // Attempt to get the 'geminiApiKey' item from local storage.
        const result = await chrome.storage.local.get(['geminiApiKey']);
        if (result.geminiApiKey) {
            return result.geminiApiKey; // Return the key if it exists.
        } else {
            console.warn("WebInsight API: Gemini API Key not found in chrome.storage.local.");
            // Explicitly return null if not found, allowing calling functions to handle this case.
            return null;
        }
    } catch (error) {
        console.error("WebInsight API: Error retrieving API key from chrome.storage.local:", error);
        return null; // Return null in case of any error during storage access.
    }
}

// --- Gemini API Interaction Functions ---

/**
 * Analyzes an image using the Google Gemini Vision API (multimodal model).
 * This function constructs the request payload including the image data (as base64)
 * and a text prompt, then sends it to the specified Gemini vision model.
 *
 * @param {string} imageDataUrl - The image data as a base64 encoded data URL
 *                                (e.g., "data:image/png;base64,...").
 * @param {string} [promptText="Describe this image in detail."] - The text prompt to
 *                                guide the AI's analysis of the image.
 * @returns {Promise<object>} A promise that resolves with the full JSON response object
 *                            from the Gemini API. The structure of this response should
 *                            be consulted in the official Gemini API documentation.
 * @throws {Error} Throws an error if:
 *                 - The API key is missing.
 *                 - The `imageDataUrl` is invalid or malformed.
 *                 - The API request fails (e.g., network error, API error response).
 *                 The error message will attempt to provide context about the failure.
 * @async
 */
async function analyzeImageWithGemini(imageDataUrl, promptText = "Describe this image in detail.") {
    console.log(`WebInsight API: Starting image analysis with model: ${VISION_MODEL}`);

    // 1. Retrieve the API Key.
    const apiKey = await getApiKey();
    if (!apiKey) {
        // If no API key, throw an error to be handled by the caller.
        // This prevents API calls without authentication.
        throw new Error("Gemini API Key not set. Please configure it in the extension options.");
    }

    // 2. Validate and Prepare Image Data.
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image')) {
         throw new Error("Invalid image data URL provided. Must be a valid data:image/... URL.");
    }
    // Extract base64 data and MIME type from the data URL.
    const base64Data = imageDataUrl.split(',')[1];
    if (!base64Data) {
        throw new Error("Could not extract base64 data from the provided image URL.");
    }
    const mimeTypeMatch = imageDataUrl.match(/^data:(image\/\w+);base64,/);
    if (!mimeTypeMatch || !mimeTypeMatch[1]) {
        throw new Error("Could not determine image MIME type from the data URL.");
    }
    const mimeType = mimeTypeMatch[1];

    // 3. Construct the API Request Body for multimodal input.
    //    The 'contents' array typically includes parts for text and inline image data.
    const requestBody = {
        contents: [{
            parts: [
                { text: promptText }, // The textual part of the prompt.
                {
                    inline_data: { // The image part of the prompt.
                        mime_type: mimeType,
                        data: base64Data
                    }
                }
            ]
        }],
        // Optional: Include generationConfig and safetySettings as needed,
        // based on Gemini API documentation and desired behavior.
        // Example (commented out):
        // generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
        // safetySettings: [ { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" } ]
    };

    // 4. Make the API Call using Fetch.
    const apiUrl = `${GEMINI_API_ENDPOINT_BASE}${VISION_MODEL}${API_ACTION}?key=${apiKey}`;
    console.log(`WebInsight API: Sending image analysis request to Gemini endpoint...`);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        // 5. Handle the API Response.
        if (!response.ok) {
            // If response is not OK (e.g., 4xx, 5xx status codes), attempt to parse error details.
            let errorBodyText = await response.text(); // Get raw error response text.
            let errorMessage = response.statusText;   // Fallback to status text.
            try {
                 // Attempt to parse as JSON for more structured error info.
                 const errorBodyJson = JSON.parse(errorBodyText);
                 console.error("WebInsight API: Gemini API Error Response (JSON Parsed):", errorBodyJson);
                 errorMessage = errorBodyJson?.error?.message || errorMessage; // Use message from JSON if available.
            } catch (e) {
                 // If not JSON, log the raw text.
                 console.error("WebInsight API: Gemini API Error Response (Raw Text):", errorBodyText);
            }
            // Provide a more specific error for 404, which might indicate model name issues.
            if (response.status === 404) {
                 throw new Error(`API request failed (404 Not Found): Model '${VISION_MODEL}' might be incorrect or unavailable. Check model name and API endpoint. Original message: ${errorMessage}`);
            }
            throw new Error(`API request failed with status ${response.status}: ${errorMessage}`);
        }

        const data = await response.json(); // Parse successful response as JSON.
        console.log("WebInsight API: Gemini API (Image) Response Received Successfully:", data);

        // Basic validation of the expected response structure.
        // Gemini responses usually contain a 'candidates' array.
        if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
            console.warn("WebInsight API: Gemini response for image analysis is missing expected 'candidates' array.", data);
            // Depending on strictness, one might throw an error here or allow processing of partial data.
            // For now, just warn and return the data as is.
        }
        return data; // Return the full parsed JSON response.

    } catch (error) {
        // Catch network errors or errors from `throw new Error` above.
        console.error('WebInsight API: Error during Gemini API call (Image Analysis):', error);
        // Re-throw the error to ensure the calling function (e.g., in background.js)
        // is aware of the failure and can handle it appropriately (e.g., update UI, retry).
        throw error;
    }
}


/**
 * Analyzes text content using the Google Gemini API (text model).
 * This function constructs the request payload with the text content and a guiding prompt,
 * then sends it to the specified Gemini text model.
 *
 * @param {string} textContent - The text content to be analyzed.
 * @param {string} [promptText="Summarize the following text:"] - The text prompt that
 *                                guides the AI's analysis (e.g., "Summarize:", "Extract keywords:").
 * @returns {Promise<object>} A promise that resolves with the full JSON response object
 *                            from the Gemini API.
 * @throws {Error} Throws an error if:
 *                 - The API key is missing.
 *                 - The `textContent` is invalid (empty or not a string).
 *                 - The API request fails.
 * @async
 */
async function analyzeTextWithGemini(textContent, promptText = "Summarize the following text:") {
    console.log(`WebInsight API: Starting text analysis with model: ${TEXT_MODEL}`);

    // 1. Retrieve the API Key.
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error("Gemini API Key not set. Please configure it in the extension options.");
    }

    // 2. Validate Text Content.
    if (!textContent || typeof textContent !== 'string' || textContent.trim().length === 0) {
        throw new Error("Invalid or empty text content provided for analysis.");
    }

    // 3. Construct the API Request Body for text input.
    //    The prompt and text content are combined into a single text part.
    const requestBody = {
        contents: [{
            parts: [
                { text: `${promptText}\n\n${textContent}` } // Simple concatenation of prompt and content.
            ]
        }],
        // Optional: Add generationConfig and safetySettings as needed.
        // generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    };

    // 4. Make the API Call using Fetch.
    const apiUrl = `${GEMINI_API_ENDPOINT_BASE}${TEXT_MODEL}${API_ACTION}?key=${apiKey}`;
    console.log(`WebInsight API: Sending text analysis request to Gemini endpoint...`);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        // 5. Handle the API Response (similar to image analysis).
        if (!response.ok) {
            let errorBodyText = await response.text();
            let errorMessage = response.statusText;
            try {
                 const errorBodyJson = JSON.parse(errorBodyText);
                 console.error("WebInsight API: Gemini API Error Response (JSON Parsed):", errorBodyJson);
                 errorMessage = errorBodyJson?.error?.message || errorMessage;
            } catch (e) {
                 console.error("WebInsight API: Gemini API Error Response (Raw Text):", errorBodyText);
            }
            if (response.status === 404) { // Specific check for model name issues.
                 throw new Error(`API request failed (404 Not Found): Model '${TEXT_MODEL}' might be incorrect or unavailable. Check model name and API endpoint. Original message: ${errorMessage}`);
            }
            throw new Error(`API request failed with status ${response.status}: ${errorMessage}`);
        }

        const data = await response.json();
        console.log("WebInsight API: Gemini API (Text) Response Received Successfully:", data);

        // Basic validation for 'candidates' array in response.
        if (!data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
            console.warn("WebInsight API: Gemini response for text analysis is missing expected 'candidates' array.", data);
        }
        return data; // Return the full parsed JSON response.

    } catch (error) {
        console.error('WebInsight API: Error during Gemini API call (Text Analysis):', error);
        // Re-throw to allow the caller to handle the failure.
        throw error;
    }
}

// --- Exports ---
// Export the functions to make them available for import in other modules (e.g., background.js).
export { analyzeImageWithGemini, analyzeTextWithGemini, getApiKey };
