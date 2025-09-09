// js/lib/google-drive.js - Google Drive API integration

// --- Configuration ---
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// --- State ---
let gapi = null;
let isGapiLoaded = false;
let isGisLoaded = false;
let tokenClient = null;

/**
 * Initializes the Google Drive API client
 * @returns {Promise<boolean>} Success status
 */
async function initializeGoogleDrive() {
    try {
        // Load Google APIs if not already loaded
        if (!isGapiLoaded) {
            await loadGoogleAPI();
        }
        
        console.log("Google Drive API initialized successfully");
        return true;
    } catch (error) {
        console.error("Failed to initialize Google Drive API:", error);
        return false;
    }
}

/**
 * Loads the Google API scripts
 * @returns {Promise<void>}
 */
function loadGoogleAPI() {
    return new Promise((resolve, reject) => {
        if (typeof window.gapi !== 'undefined') {
            gapi = window.gapi;
            isGapiLoaded = true;
            resolve();
            return;
        }

        // Load gapi script
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.onload = async () => {
            gapi = window.gapi;
            await gapi.load('client', async () => {
                await gapi.client.init({
                    discoveryDocs: [DISCOVERY_DOC],
                });
                isGapiLoaded = true;
                
                // Load GIS (Google Identity Services)
                const gisScript = document.createElement('script');
                gisScript.src = 'https://accounts.google.com/gsi/client';
                gisScript.onload = () => {
                    isGisLoaded = true;
                    resolve();
                };
                gisScript.onerror = reject;
                document.head.appendChild(gisScript);
            });
        };
        gapiScript.onerror = reject;
        document.head.appendChild(gapiScript);
    });
}

/**
 * Authenticates with Google Drive
 * @param {string} clientId - Google OAuth client ID
 * @returns {Promise<boolean>} Success status
 */
async function authenticateGoogleDrive(clientId) {
    try {
        if (!isGisLoaded) {
            throw new Error("Google Identity Services not loaded");
        }

        return new Promise((resolve, reject) => {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: (response) => {
                    if (response.error) {
                        console.error("Authentication error:", response.error);
                        reject(new Error(response.error));
                    } else {
                        console.log("Google Drive authentication successful");
                        resolve(true);
                    }
                },
            });

            tokenClient.requestAccessToken();
        });
    } catch (error) {
        console.error("Failed to authenticate with Google Drive:", error);
        throw error;
    }
}

/**
 * Checks if user is currently authenticated
 * @returns {boolean} Authentication status
 */
function isAuthenticated() {
    return gapi && gapi.client && gapi.client.getToken() !== null;
}

/**
 * Signs out from Google Drive
 */
function signOut() {
    if (gapi && gapi.client) {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token);
            gapi.client.setToken('');
        }
    }
}

/**
 * Creates a folder in Google Drive
 * @param {string} folderName - Name of the folder to create
 * @param {string} [parentId] - Parent folder ID (optional)
 * @returns {Promise<string>} Created folder ID
 */
async function createFolder(folderName, parentId = null) {
    try {
        const metadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
        };

        if (parentId) {
            metadata.parents = [parentId];
        }

        const response = await gapi.client.drive.files.create({
            resource: metadata,
        });

        console.log(`Folder "${folderName}" created with ID: ${response.result.id}`);
        return response.result.id;
    } catch (error) {
        console.error("Failed to create folder:", error);
        throw error;
    }
}

/**
 * Uploads a file to Google Drive
 * @param {string} fileName - Name of the file
 * @param {string} content - File content
 * @param {string} mimeType - MIME type of the file
 * @param {string} [folderId] - Parent folder ID (optional)
 * @returns {Promise<string>} Uploaded file ID
 */
async function uploadFile(fileName, content, mimeType, folderId = null) {
    try {
        const metadata = {
            name: fileName,
        };

        if (folderId) {
            metadata.parents = [folderId];
        }

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
        form.append('file', new Blob([content], {type: mimeType}));

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({
                'Authorization': `Bearer ${gapi.client.getToken().access_token}`
            }),
            body: form
        });

        const result = await response.json();
        console.log(`File "${fileName}" uploaded with ID: ${result.id}`);
        return result.id;
    } catch (error) {
        console.error("Failed to upload file:", error);
        throw error;
    }
}

/**
 * Downloads a file from Google Drive
 * @param {string} fileId - ID of the file to download
 * @returns {Promise<string>} File content
 */
async function downloadFile(fileId) {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });

        return response.body;
    } catch (error) {
        console.error("Failed to download file:", error);
        throw error;
    }
}

/**
 * Lists files in Google Drive
 * @param {string} [folderId] - Folder ID to list files from (optional)
 * @param {string} [query] - Search query (optional)
 * @returns {Promise<Array>} Array of file objects
 */
async function listFiles(folderId = null, query = null) {
    try {
        let searchQuery = "trashed=false";
        
        if (folderId) {
            searchQuery += ` and '${folderId}' in parents`;
        }
        
        if (query) {
            searchQuery += ` and ${query}`;
        }

        const response = await gapi.client.drive.files.list({
            q: searchQuery,
            fields: 'files(id, name, mimeType, createdTime, modifiedTime, size)',
        });

        return response.result.files || [];
    } catch (error) {
        console.error("Failed to list files:", error);
        throw error;
    }
}

/**
 * Deletes a file from Google Drive
 * @param {string} fileId - ID of the file to delete
 * @returns {Promise<boolean>} Success status
 */
async function deleteFile(fileId) {
    try {
        await gapi.client.drive.files.delete({
            fileId: fileId
        });

        console.log(`File with ID ${fileId} deleted successfully`);
        return true;
    } catch (error) {
        console.error("Failed to delete file:", error);
        throw error;
    }
}

/**
 * Exports WebInsight data to Google Drive
 * @param {Array} contentItems - Content items to export
 * @param {Array} tags - Tags to export
 * @param {Array} contentTags - Content-tag relationships to export
 * @param {string} [folderId] - Target folder ID (optional)
 * @returns {Promise<object>} Export result with file IDs
 */
async function exportWebInsightData(contentItems, tags, contentTags, folderId = null) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: "1.0",
            contentItems: contentItems,
            tags: tags,
            contentTags: contentTags
        };

        const fileName = `webinsight-backup-${timestamp}.json`;
        const content = JSON.stringify(exportData, null, 2);
        
        const fileId = await uploadFile(fileName, content, 'application/json', folderId);
        
        return {
            success: true,
            fileId: fileId,
            fileName: fileName,
            exportedAt: exportData.exportedAt
        };
    } catch (error) {
        console.error("Failed to export WebInsight data:", error);
        throw error;
    }
}

/**
 * Imports WebInsight data from Google Drive
 * @param {string} fileId - ID of the backup file to import
 * @returns {Promise<object>} Imported data
 */
async function importWebInsightData(fileId) {
    try {
        const content = await downloadFile(fileId);
        const data = JSON.parse(content);
        
        // Validate data structure
        if (!data.contentItems || !data.tags || !data.contentTags) {
            throw new Error("Invalid backup file format");
        }
        
        return {
            success: true,
            data: data
        };
    } catch (error) {
        console.error("Failed to import WebInsight data:", error);
        throw error;
    }
}

// --- Exports ---
export {
    initializeGoogleDrive,
    authenticateGoogleDrive,
    isAuthenticated,
    signOut,
    createFolder,
    uploadFile,
    downloadFile,
    listFiles,
    deleteFile,
    exportWebInsightData,
    importWebInsightData
};