// js/lib/db.js (Truly Complete v3 - Includes getAllContentTags)

// --- Configuration ---
const DB_NAME = 'WebInsightDB';
const DB_VERSION = 2; // Keep version 2
const CONTENT_STORE_NAME = 'contentItems';
const TAG_STORE_NAME = 'tags'; // New store for unique tags
const CONTENT_TAG_STORE_NAME = 'contentTags'; // New store for relationships

// --- Database Instance ---
let db = null; // Holds the database connection instance

/**
 * Initializes the IndexedDB database.
 * Creates or upgrades the object stores and indexes if needed.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        // If connection already exists, resolve immediately
        if (db) {
            return resolve(db);
        }
        console.log(`Opening database ${DB_NAME} version ${DB_VERSION}...`);

        // Request to open the database
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // --- Event Handlers ---

        // Error handler for connection request
        request.onerror = (event) => {
            console.error("Database error during open:", event.target.error);
            reject(`Database error: ${event.target.error}`);
        };

        // Success handler for connection request
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("Database opened successfully.");
            // Add a general error handler for the connection itself after opening
            db.onerror = (event) => {
                 console.error("Unhandled Database connection error:", event.target.error);
            };
            // Run a one-time migration to merge duplicate tags that differ only by case
            // This is safe to run asynchronously and will not block DB open.
            try {
                mergeDuplicateTags()
                    .then(() => console.log("Duplicate tag migration complete."))
                    .catch((err) => console.error("Duplicate tag migration failed:", err));
            } catch (e) {
                console.error("Error scheduling duplicate tag migration:", e);
            }
            resolve(db);
        };

        // --- Upgrade Handler (Runs only when DB version changes or DB is first created) ---
        request.onupgradeneeded = (event) => {
            console.log(`Database upgrade needed: Upgrading to version ${DB_VERSION}.`);
            const tempDb = event.target.result;
            // Get transaction from the event, crucial for modifying schema within onupgradeneeded
            const transaction = event.target.transaction;
             if (!transaction) {
                  console.error("Upgrade transaction is missing!");
                  // Reject or handle error appropriately
                  if(event.target.error) reject(`Upgrade failed: ${event.target.error}`);
                  else reject("Upgrade failed: Transaction not available.");
                  return;
             }
             // Add error handling for the upgrade transaction itself
             transaction.onerror = (event) => {
                  console.error("Error during upgrade transaction:", event.target.error);
             };
             transaction.onabort = (event) => {
                  console.error("Upgrade transaction aborted:", event.target.error);
             };
             transaction.oncomplete = () => {
                  console.log("Upgrade transaction completed.");
             };


            // --- Handle contentItems Store ---
            // Check if store exists, create if not (should usually exist from v1)
            let contentStore;
            if (!tempDb.objectStoreNames.contains(CONTENT_STORE_NAME)) {
                console.log(`Creating object store: ${CONTENT_STORE_NAME}`);
                contentStore = tempDb.createObjectStore(CONTENT_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                // Create necessary indexes if creating fresh
                contentStore.createIndex('type', 'type', { unique: false });
                contentStore.createIndex('url', 'url', { unique: false });
                contentStore.createIndex('createdAt', 'createdAt', { unique: false });
                console.log(`Object store ${CONTENT_STORE_NAME} created with indexes.`);
            } else {
                // Get existing store via the upgrade transaction
                contentStore = transaction.objectStore(CONTENT_STORE_NAME);
                console.log(`Object store ${CONTENT_STORE_NAME} found.`);
                // ** Remove the old 'tags' index if it exists from v1 **
                if (contentStore.indexNames.contains('tags')) {
                    try {
                        console.log("Attempting to remove old 'tags' index from contentItems store.");
                        contentStore.deleteIndex('tags');
                        console.log("Old 'tags' index removed successfully.");
                    } catch (e) {
                         console.error("Error removing old 'tags' index:", e);
                         // Decide how to handle this - potentially ignore if non-critical
                    }
                }
            }

            // --- Create/Update tags Store ---
            if (!tempDb.objectStoreNames.contains(TAG_STORE_NAME)) {
                console.log(`Creating object store: ${TAG_STORE_NAME}`);
                const tagStore = tempDb.createObjectStore(TAG_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                // Index on 'name' for fast lookups and uniqueness enforcement
                tagStore.createIndex('name', 'name', { unique: true });
                console.log(`Object store ${TAG_STORE_NAME} created with unique index on 'name'.`);
            } else {
                 console.log(`Object store ${TAG_STORE_NAME} already exists.`);
                 // Handle potential index changes in future versions if needed
            }

            // --- Create/Update contentTags Store ---
            if (!tempDb.objectStoreNames.contains(CONTENT_TAG_STORE_NAME)) {
                console.log(`Creating object store: ${CONTENT_TAG_STORE_NAME}`);
                // Use a compound key to ensure each content-tag pair is unique
                const contentTagStore = tempDb.createObjectStore(CONTENT_TAG_STORE_NAME, { keyPath: ['contentId', 'tagId'] });
                // Index on contentId to quickly find all tags for a piece of content
                contentTagStore.createIndex('contentId', 'contentId', { unique: false });
                // Index on tagId to quickly find all content for a tag
                contentTagStore.createIndex('tagId', 'tagId', { unique: false });
                console.log(`Object store ${CONTENT_TAG_STORE_NAME} created with indexes on 'contentId' and 'tagId'.`);
            } else {
                 console.log(`Object store ${CONTENT_TAG_STORE_NAME} already exists.`);
                 // Handle potential index changes in future versions if needed
            }

            console.log("Database schema upgrade logic finished.");
        }; // End of onupgradeneeded
    }); // End of Promise
} // End of initDB

// --- Content Item Methods ---

// --- NEW: Backup and Restore Database Functions ---

/**
 * Clears all data from all object stores within a single transaction.
 * @returns {Promise<void>} A promise that resolves when all stores are empty.
 */
async function clearAllData() {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME, TAG_STORE_NAME, CONTENT_TAG_STORE_NAME], 'readwrite');
        transaction.oncomplete = () => {
            console.log("All stores cleared successfully.");
            resolve();
        };
        transaction.onerror = (event) => {
            console.error("Error clearing data:", event.target.error);
            reject(`Transaction error during clear: ${event.target.error}`);
        };

        const contentStore = transaction.objectStore(CONTENT_STORE_NAME);
        contentStore.clear();

        const tagStore = transaction.objectStore(TAG_STORE_NAME);
        tagStore.clear();

        const contentTagStore = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        contentTagStore.clear();
    });
}

/**
 * Imports a full dataset into the database. Assumes the database is empty.
 * @param {object} data - The backup object containing contentItems, tags, and contentTags arrays.
 * @returns {Promise<void>} A promise that resolves when all data has been imported.
 */
async function bulkImportData(data) {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME, TAG_STORE_NAME, CONTENT_TAG_STORE_NAME], 'readwrite');
        
        transaction.oncomplete = () => {
            console.log("Bulk data import transaction completed.");
            resolve();
        };
        transaction.onerror = (event) => {
            console.error("Error during bulk import:", event.target.error);
            reject(`Transaction error during import: ${event.target.error}`);
        };

        if (data.contentItems && data.contentItems.length > 0) {
            const contentStore = transaction.objectStore(CONTENT_STORE_NAME);
            data.contentItems.forEach(item => contentStore.add(item));
        }
        if (data.tags && data.tags.length > 0) {
            const tagStore = transaction.objectStore(TAG_STORE_NAME);
            data.tags.forEach(tag => tagStore.add(tag));
        }
        if (data.contentTags && data.contentTags.length > 0) {
            const contentTagStore = transaction.objectStore(CONTENT_TAG_STORE_NAME);
            data.contentTags.forEach(link => contentTagStore.add(link));
        }
    });
}


/**
 * Adds a content item to the database.
 * NOTE: Does NOT handle the 'tags' array anymore. Tagging is done separately via linkTagToContent.
 * @param {object} item - The content item to add (excluding tags array).
 * @returns {Promise<number>} Promise resolving with the ID of the newly added item.
 */
async function addContentItem(item) {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONTENT_STORE_NAME);
        delete item.tags; // Remove old field if present
        if (!item.createdAt) item.createdAt = new Date().toISOString();
        const request = store.add(item);
        request.onsuccess = (event) => { console.log("Item added successfully with ID:", event.target.result); resolve(event.target.result); };
        request.onerror = (event) => { console.error("Error adding content item:", event.target.error); reject(`Error adding item: ${event.target.error}`); };
        transaction.onerror = (event) => { console.error("Add Content Item transaction error:", event.target.error); };
    });
}

/**
 * Retrieves all content items from the database.
 * @returns {Promise<Array<object>>} Promise resolving with an array of all content items.
 */
async function getAllContentItems() {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result || []);
        request.onerror = (event) => { console.error("Error getting all content items:", event.target.error); reject(`Error getting all items: ${event.target.error}`); };
    });
}

/**
 * Updates an existing content item in the database.
 * NOTE: Does not handle the 'tags' array.
 * @param {number} id - The ID of the item to update.
 * @param {object} updates - An object containing the fields and new values to update.
 * @returns {Promise<number>} Promise resolving with the ID of the updated item.
 */
async function updateContentItem(id, updates) {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONTENT_STORE_NAME);
        const getRequest = store.get(id);
        getRequest.onsuccess = (event) => {
            const item = event.target.result;
            if (!item) return reject(new Error(`Item with ID ${id} not found for update.`));
            delete updates.tags; // Remove old field if present in updates
            const originalId = item.id; Object.assign(item, updates); item.id = originalId;
            const updateRequest = store.put(item);
            updateRequest.onsuccess = (event) => { console.log(`Item ${id} updated successfully.`); resolve(event.target.result); };
            updateRequest.onerror = (event) => { console.error(`Error putting updated item ${id}:`, event.target.error); reject(`Error updating item: ${event.target.error}`); };
        };
        getRequest.onerror = (event) => { console.error(`Error retrieving item ${id} for update:`, event.target.error); reject(`Error retrieving item for update: ${event.target.error}`); };
        transaction.onerror = (event) => { console.error("Update Content Item transaction error:", event.target.error); };
    });
}

/**
 * Deletes a content item AND its associated tag links.
 * @param {number} id - The ID of the content item to delete.
 * @returns {Promise<void>} Promise resolving on successful deletion.
 */
async function deleteContentItem(id) {
    const dbInstance = await initDB();
    return new Promise(async (resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME, CONTENT_TAG_STORE_NAME], 'readwrite');
        const contentStore = transaction.objectStore(CONTENT_STORE_NAME);
        const contentTagStore = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const contentTagIndex = contentTagStore.index('contentId');
        let deleteError = null;
        const deletionPromises = [];
        // Delete main item
        deletionPromises.push(new Promise((res, rej) => { const req = contentStore.delete(id); req.onsuccess = res; req.onerror = (e) => { deleteError = e.target.error; rej(deleteError); }; }));
        // Delete links
        deletionPromises.push(new Promise((res, rej) => { const cursorReq = contentTagIndex.openCursor(IDBKeyRange.only(id)); const linkDelPromises = []; cursorReq.onsuccess = (e) => { const cursor = e.target.result; if (cursor) { linkDelPromises.push(new Promise((subRes, subRej) => { const delReq = cursor.delete(); delReq.onsuccess = subRes; delReq.onerror = (ev) => { deleteError = ev.target.error; subRej(deleteError); }; })); cursor.continue(); } else { Promise.all(linkDelPromises).then(res).catch(rej); } }; cursorReq.onerror = (e) => { deleteError = e.target.error; rej(deleteError); }; }));
        // Handle transaction
        transaction.oncomplete = () => { if (deleteError) { console.error(`Error during delete transaction for item ${id}:`, deleteError); reject(`Deletion failed: ${deleteError}`); } else { console.log(`Item ${id} and links deleted.`); resolve(); } };
        transaction.onerror = (e) => { console.error(`Transaction error during delete for item ${id}:`, e.target.error); reject(`Deletion transaction failed: ${e.target.error}`); };
        try { await Promise.all(deletionPromises); } catch (error) { console.error("Error awaiting deletion promises:", error); }
    });
}

/**
 * Retrieves multiple content items by their IDs.
 * @param {Array<number>} contentIds - An array of content item IDs.
 * @returns {Promise<Array<object>>} Promise resolving with an array of content item objects.
 */
async function getContentItemsByIds(contentIds) {
    if (!Array.isArray(contentIds) || contentIds.length === 0) return Promise.resolve([]);
    const validContentIds = contentIds.filter(id => typeof id === 'number');
    if (validContentIds.length === 0) return Promise.resolve([]);

    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_STORE_NAME);
        const items = [];
        let completedRequests = 0;

        transaction.onerror = (event) => { console.error("Transaction error in getContentItemsByIds:", event.target.error); reject(`Transaction error: ${event.target.error}`); };
        transaction.onabort = (event) => { console.error("Transaction aborted in getContentItemsByIds:", event.target.error); reject(`Transaction aborted: ${event.target.error}`); };

        validContentIds.forEach(id => {
            const request = store.get(id);
            request.onsuccess = (event) => {
                if (event.target.result) items.push(event.target.result);
                else console.warn(`Content item with ID ${id} not found.`);
                completedRequests++;
                if (completedRequests === validContentIds.length) resolve(items);
            };
            request.onerror = (event) => {
                console.error(`Error fetching content item ID ${id}:`, event.target.error);
                completedRequests++;
                if (completedRequests === validContentIds.length) resolve(items);
            };
        });
         if (validContentIds.length === 0) resolve([]); // Should be caught earlier, but safe check
    });
}


// --- Tag Management Methods ---
/**
 * Adds a new tag if it doesn't exist, or returns the existing tag's ID.
 * @param {string} tagName - The name of the tag (case-sensitive, trimmed).
 * @returns {Promise<number>} Promise resolving with the tag's ID (new or existing).
 */
async function addTag(tagName) {
    if (!tagName || typeof tagName !== 'string' || tagName.trim().length === 0) return Promise.reject(new Error("Invalid tag name."));
    const trimmedTagName = tagName.trim();
    // Normalize tags for canonical storage/lookup (make tags case-insensitive)
    const normalizedTagName = trimmedTagName.toLowerCase();
    // TEMP LOG: trace db.addTag invocation (with stack)
    console.log("db.addTag called with:", { original: trimmedTagName, normalized: normalizedTagName });
    console.trace("db.addTag trace");
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME], 'readwrite');
        transaction.oncomplete = () => { console.log(`addTag transaction complete for: "${trimmedTagName}"`); };
        const store = transaction.objectStore(TAG_STORE_NAME);
        const index = store.index('name');
        // Look up by the normalized form
        const getRequest = index.get(normalizedTagName);
        getRequest.onsuccess = (event) => {
            const existingTag = event.target.result;
            if (existingTag) {
                console.log(`Tag "${trimmedTagName}" (normalized: "${normalizedTagName}") exists (ID: ${existingTag.id})`);
                resolve(existingTag.id);
            } else {
                console.log(`Adding new tag: "${trimmedTagName}" (normalized: "${normalizedTagName}")`);
                // Store the normalized name as the canonical 'name' value
                const addRequest = store.add({ name: normalizedTagName });
                addRequest.onsuccess = (addEvent) => {
                    console.log(`Tag "${normalizedTagName}" added (ID: ${addEvent.target.result})`);
                    resolve(addEvent.target.result);
                };
                addRequest.onerror = (addEvent) => {
                    console.error(`Error adding tag "${normalizedTagName}":`, addEvent.target.error);
                    reject(`Error adding tag: ${addEvent.target.error}`);
                };
            }
        };
        getRequest.onerror = (event) => {
            console.error(`Error checking tag "${trimmedTagName}":`, event.target.error);
            if (event.target && event.target.error && event.target.error.stack) console.error(event.target.error.stack);
            reject(`Error checking tag: ${event.target.error}`);
        };
        transaction.onerror = (event) => { console.error("Add tag transaction error:", event && event.target && event.target.error ? event.target.error : event); if (event && event.target && event.target.error && event.target.error.stack) console.error(event.target.error.stack); };
    });
}

/**
 * Retrieves a tag object by its name.
 * @param {string} tagName - The name of the tag.
 * @returns {Promise<object|null>} Promise resolving with the tag object {id, name} or null if not found.
 */
async function getTagByName(tagName) {
    if (!tagName || typeof tagName !== 'string') return Promise.resolve(null);
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(TAG_STORE_NAME);
        const index = store.index('name');
        // Normalize lookup to match stored canonical form
        const lookupName = tagName.trim().toLowerCase();
        const request = index.get(lookupName);
        request.onsuccess = (event) => resolve(event.target.result || null);
        request.onerror = (event) => { console.error(`Error getting tag by name "${tagName}":`, event.target.error); reject(`Error getting tag: ${event.target.error}`); };
    });
}

/**
 * Retrieves all unique tags from the database.
 * @returns {Promise<Array<object>>} Promise resolving with an array of tag objects [{id, name}, ...].
 */
async function getAllTags() {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(TAG_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result || []);
        request.onerror = (event) => { console.error("Error getting all tags:", event.target.error); reject(`Error getting all tags: ${event.target.error}`); };
    });
}

/**
 * Deletes a tag and all its associations with content items.
 * @param {number} tagId - The ID of the tag to delete.
 * @returns {Promise<void>} Promise resolving on successful deletion.
 */
async function deleteTag(tagId) {
    if (typeof tagId !== 'number') return Promise.reject(new Error("Invalid tagId."));
    const dbInstance = await initDB();
    return new Promise(async (resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME, CONTENT_TAG_STORE_NAME], 'readwrite');
        const tagStore = transaction.objectStore(TAG_STORE_NAME);
        const contentTagStore = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const contentTagIndex = contentTagStore.index('tagId');
        let deleteError = null;
        const deletionPromises = [];
        deletionPromises.push(new Promise((res, rej) => { const req = tagStore.delete(tagId); req.onsuccess = res; req.onerror = (e) => { deleteError = e.target.error; rej(deleteError); }; }));
        deletionPromises.push(new Promise((res, rej) => { const cursorReq = contentTagIndex.openCursor(IDBKeyRange.only(tagId)); const linkDelPromises = []; cursorReq.onsuccess = (e) => { const cursor = e.target.result; if (cursor) { linkDelPromises.push(new Promise((subRes, subRej) => { const delReq = cursor.delete(); delReq.onsuccess = subRes; delReq.onerror = (ev) => { deleteError = ev.target.error; subRej(deleteError); }; })); cursor.continue(); } else { Promise.all(linkDelPromises).then(res).catch(rej); } }; cursorReq.onerror = (e) => { deleteError = e.target.error; rej(deleteError); }; }));
        transaction.oncomplete = () => { if (deleteError) { console.error(`Error during delete transaction for tag ${tagId}:`, deleteError); reject(`Tag deletion failed: ${deleteError}`); } else { console.log(`Tag ${tagId} and links deleted.`); resolve(); } };
        transaction.onerror = (e) => { console.error(`Transaction error during delete for tag ${tagId}:`, e.target.error); reject(`Tag deletion transaction failed: ${e.target.error}`); };
        try { await Promise.all(deletionPromises); } catch (error) { console.error("Error awaiting tag/link deletion:", error); }
    });
}

/**
 * Retrieves multiple tag objects by their IDs.
 * @param {Array<number>} tagIds - An array of tag IDs to retrieve.
 * @returns {Promise<Array<object>>} Promise resolving with an array of tag objects [{id, name}, ...]. Returns empty array if input is empty or invalid.
 */
async function getTagsByIds(tagIds) {
    if (!Array.isArray(tagIds) || tagIds.length === 0) return Promise.resolve([]);
    const validTagIds = tagIds.filter(id => typeof id === 'number');
    if (validTagIds.length === 0) return Promise.resolve([]);
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(TAG_STORE_NAME);
        const tags = [];
        let completedRequests = 0;
        transaction.onerror = (event) => { console.error("Transaction error in getTagsByIds:", event.target.error); reject(`Transaction error: ${event.target.error}`); };
        transaction.onabort = (event) => { console.error("Transaction aborted in getTagsByIds:", event.target.error); reject(`Transaction aborted: ${event.target.error}`); };
        validTagIds.forEach(id => {
            const request = store.get(id);
            request.onsuccess = (event) => { if (event.target.result) tags.push(event.target.result); else console.warn(`Tag with ID ${id} not found.`); completedRequests++; if (completedRequests === validTagIds.length) resolve(tags); };
            request.onerror = (event) => { console.error(`Error fetching tag ID ${id}:`, event.target.error); completedRequests++; if (completedRequests === validTagIds.length) resolve(tags); };
        });
         if (validTagIds.length === 0) resolve([]); // Should be caught earlier, but safe check
    });
}


// --- Content-Tag Linking Methods ---
/**
 * Creates a link between a content item and a tag in the junction table.
 * Assumes contentId and tagId are valid IDs corresponding to existing records.
 * @param {number} contentId - The ID of the content item.
 * @param {number} tagId - The ID of the tag.
 * @returns {Promise<Array<number>>} Promise resolving with the compound key [contentId, tagId].
 */
async function linkTagToContent(contentId, tagId) {
    if (typeof contentId !== 'number' || typeof tagId !== 'number') return Promise.reject(new Error("Invalid contentId or tagId."));
    // TEMP LOG: trace db.linkTagToContent invocation (with stack)
    console.log("db.linkTagToContent called with:", { contentId, tagId });
    console.trace("db.linkTagToContent trace");
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readwrite');
        transaction.oncomplete = () => { console.log(`linkTagToContent transaction complete for: [contentId:${contentId}, tagId:${tagId}]`); };
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const link = { contentId: contentId, tagId: tagId };
        const request = store.add(link);
        request.onsuccess = (event) => { console.log(`Linked content ${contentId} with tag ${tagId}. Key:`, event.target.result); resolve(event.target.result); };
        request.onerror = (event) => { if (event && event.target && event.target.error && event.target.error.name === 'ConstraintError') { console.warn(`Link between ${contentId} and ${tagId} already exists.`); resolve([contentId, tagId]); } else { console.error(`Error linking ${contentId} and ${tagId}:`, event && event.target && event.target.error ? event.target.error : event); if (event && event.target && event.target.error && event.target.error.stack) console.error(event.target.error.stack); reject(`Error linking tag: ${event && event.target && event.target.error ? event.target.error : event}`); } };
        transaction.onerror = (event) => { console.error("Link Tag transaction error:", event && event.target && event.target.error ? event.target.error : event); if (event && event.target && event.target.error && event.target.error.stack) console.error(event.target.error.stack); };
    });
}

/**
 * Removes a link between a content item and a tag from the junction table.
 * @param {number} contentId - The ID of the content item.
 * @param {number} tagId - The ID of the tag.
 * @returns {Promise<void>} Promise resolving on successful unlinking.
 */
async function unlinkTagFromContent(contentId, tagId) {
    if (typeof contentId !== 'number' || typeof tagId !== 'number') return Promise.reject(new Error("Invalid contentId or tagId."));
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const request = store.delete([contentId, tagId]);
        request.onsuccess = (event) => { console.log(`Unlinked content ${contentId} from tag ${tagId}.`); resolve(); };
        request.onerror = (event) => { console.error(`Error unlinking ${contentId} from ${tagId}:`, event.target.error); reject(`Error unlinking tag: ${event.target.error}`); };
        transaction.onerror = (event) => { console.error("Unlink Tag transaction error:", event.target.error); };
    });
}

/**
 * Retrieves all tag IDs associated with a specific content item ID.
 * @param {number} contentId - The ID of the content item.
 * @returns {Promise<Array<number>>} Promise resolving with an array of tag IDs.
 */
async function getTagIdsByContentId(contentId) {
    if (typeof contentId !== 'number') { console.warn("Invalid contentId passed to getTagIdsByContentId"); return Promise.resolve([]); }
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const index = store.index('contentId');
        const request = index.getAll(contentId);
        request.onsuccess = (event) => { const links = event.target.result || []; const tagIds = links.map(link => link.tagId); resolve(tagIds); };
        request.onerror = (event) => { console.error(`Error getting tags for content ${contentId}:`, event.target.error); reject(`Error getting tags: ${event.target.error}`); };
    });
}

/**
 * Retrieves all content IDs associated with a specific tag ID.
 * @param {number} tagId - The ID of the tag.
 * @returns {Promise<Array<number>>} Promise resolving with an array of content IDs.
 */
async function getContentIdsByTagId(tagId) {
    if (typeof tagId !== 'number') { console.warn("Invalid tagId passed to getContentIdsByTagId"); return Promise.resolve([]); }
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const index = store.index('tagId');
        const request = index.getAll(tagId);
        request.onsuccess = (event) => { const links = event.target.result || []; const contentIds = links.map(link => link.contentId); resolve(contentIds); };
        request.onerror = (event) => { console.error(`Error getting content for tag ${tagId}:`, event.target.error); reject(`Error getting content IDs: ${event.target.error}`); };
    });
}

/**
 * Retrieves all link entries from the contentTags store.
 * Useful for debugging or seeing all relationships.
 * @returns {Promise<Array<object>>} Promise resolving with an array of link objects [{contentId, tagId}, ...].
 */
async function getAllContentTags() {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const request = store.getAll();
        request.onsuccess = (event) => {
            resolve(event.target.result || []);
        };
        request.onerror = (event) => {
            console.error("Error getting all contentTags:", event.target.error);
            reject(`Error getting all contentTags: ${event.target.error}`);
        };
    });
}


// --- Initialization ---
initDB().catch(console.error);

/**
 * Migration helper: find tags that differ only by case and merge them.
 * Strategy:
 * - Group tags by their lowercased name
 * - For groups with >1 tag, choose a canonical tag (prefer an already-lowercased name, else lowest id)
 * - Re-link all content from duplicate tags to the canonical tag, then delete the duplicate tag record
 */
async function mergeDuplicateTags() {
    try {
        const tags = await getAllTags();
        if (!tags || tags.length === 0) return;
        const groups = new Map();
        for (const t of tags) {
            const key = (t.name || "").toString().trim().toLowerCase();
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(t);
        }

        for (const [key, group] of groups.entries()) {
            if (group.length <= 1) continue;
            // Prefer a tag whose stored name is already lowercase, else pick lowest id
            let canonical = group.find(g => g.name === (g.name || '').toLowerCase());
            if (!canonical) {
                canonical = group.reduce((a, b) => (a.id < b.id ? a : b));
            }
            const duplicates = group.filter(g => g.id !== canonical.id);
            console.log(`Merging ${duplicates.length} duplicate tag(s) into canonical tag '${canonical.name}' (ID ${canonical.id})`);

            for (const dup of duplicates) {
                try {
                    const contentIds = await getContentIdsByTagId(dup.id);
                    // Link each content to canonical tag
                    await Promise.all((contentIds || []).map(cid => linkTagToContent(cid, canonical.id).catch(e => { console.warn(`Could not link content ${cid} to tag ${canonical.id}:`, e); })));
                    // Now delete the duplicate tag record
                    await deleteTag(dup.id).catch(e => { console.warn(`Could not delete duplicate tag ${dup.id}:`, e); });
                    console.log(`Duplicate tag ${dup.id} removed.`);
                } catch (e) {
                    console.error(`Error merging duplicate tag ${dup.id}:`, e);
                }
            }
        }
    } catch (error) {
        console.error("mergeDuplicateTags error:", error);
        throw error;
    }
}

// --- Exports ---
export {
    initDB,
    // Content Item Methods
    addContentItem, getAllContentItems, updateContentItem, deleteContentItem, getContentItemsByIds,
    // Tag Methods
    addTag, getTagByName, getAllTags, deleteTag, getTagsByIds,
    // Linking Methods
    linkTagToContent, unlinkTagFromContent, getTagIdsByContentId, getContentIdsByTagId,
    getAllContentTags, // Export the new function
    // New exports for backup/restore
    clearAllData,
    bulkImportData
};
