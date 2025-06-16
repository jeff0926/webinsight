// js/lib/db.js
// This script provides a comprehensive interface for interacting with the WebInsight
// extension's IndexedDB database. It handles database initialization, schema upgrades,
// and provides CRUD (Create, Read, Update, Delete) operations for various data entities
// including content items, tags, and their relationships.

// --- Configuration Constants ---

/**
 * The name of the IndexedDB database used by the extension.
 * @type {string}
 */
const DB_NAME = 'WebInsightDB';

/**
 * The current version of the database schema.
 * This version number is crucial for triggering the `onupgradeneeded` event
 * when changes to the database structure (object stores, indexes) are made.
 * @type {number}
 */
const DB_VERSION = 2; // Current version includes contentItems, tags, and contentTags stores.

/**
 * The name of the object store for saved content items (pages, selections, screenshots, PDFs, etc.).
 * @type {string}
 */
const CONTENT_STORE_NAME = 'contentItems';

/**
 * The name of the object store for unique tags. Each tag has an ID and a name.
 * @type {string}
 */
const TAG_STORE_NAME = 'tags';

/**
 * The name of the object store for managing the many-to-many relationship
 * between content items and tags. It stores pairs of (contentId, tagId).
 * @type {string}
 */
const CONTENT_TAG_STORE_NAME = 'contentTags';

// --- Database Instance ---

/**
 * Holds the global connection instance to the IndexedDB database.
 * It's initialized by `initDB()` and reused for subsequent operations
 * to avoid repeatedly opening the database.
 * @type {IDBDatabase | null}
 */
let db = null;

/**
 * Initializes the IndexedDB database.
 * This function opens a connection to the database. If the database does not exist,
 * it's created. If the version number specified is higher than the existing database's
 * version, an upgrade process is triggered (`onupgradeneeded`).
 * It ensures that the database schema (object stores and indexes) is correctly set up.
 *
 * @returns {Promise<IDBDatabase>} A promise that resolves with the active `IDBDatabase` instance
 *                                 once the connection is successfully established and ready.
 *                                 Rejects if there's an error opening or upgrading the database.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        // If a database connection instance already exists, resolve with it immediately.
        if (db) {
            console.log("WebInsightDB: Reusing existing database connection.");
            return resolve(db);
        }
        console.log(`WebInsightDB: Opening database ${DB_NAME}, version ${DB_VERSION}...`);

        // Request to open the database with the specified name and version.
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // --- Event Handlers for DB Open Request ---

        /**
         * Handles errors that occur during the database opening process.
         * @param {Event} event - The error event.
         */
        request.onerror = (event) => {
            console.error("WebInsightDB: Database error during open request:", event.target.error);
            reject(`Database error: ${event.target.error?.message || 'Unknown error'}`);
        };

        /**
         * Handles successful opening of the database.
         * Stores the database instance globally and sets up a general error handler for the connection.
         * @param {Event} event - The success event.
         */
        request.onsuccess = (event) => {
            db = event.target.result; // Store the database connection.
            console.log("WebInsightDB: Database opened successfully.");

            // Attach a general error handler to the active database connection.
            // This catches errors that occur after the DB is opened, not related to a specific transaction.
            db.onerror = (errorEvent) => {
                 console.error("WebInsightDB: Unhandled database connection error:", errorEvent.target.error);
            };
            resolve(db); // Resolve the promise with the database instance.
        };

        /**
         * Handles database upgrades or initial creation.
         * This event is triggered if the database version specified in `indexedDB.open()`
         * is higher than the version of the existing database, or if the database
         * does not yet exist (in which case `event.oldVersion` will be 0).
         * All schema changes (creating/deleting object stores, creating/deleting indexes)
         * MUST be done within this event handler.
         * @param {IDBVersionChangeEvent} event - The upgrade event, containing `oldVersion` and `newVersion`.
         */
        request.onupgradeneeded = (event) => {
            console.log(`WebInsightDB: Upgrade needed. Old version: ${event.oldVersion}, New version: ${event.newVersion}.`);
            const tempDb = event.target.result; // The database instance during upgrade.

            // The transaction for schema changes is automatically created for onupgradeneeded.
            const transaction = event.target.transaction;
             if (!transaction) {
                  const errorMsg = "WebInsightDB: Upgrade transaction is missing during onupgradeneeded!";
                  console.error(errorMsg);
                  reject(event.target.error ? `Upgrade failed: ${event.target.error.message}` : errorMsg);
                  return;
             }

             // Attach handlers to the upgrade transaction itself for better debugging.
             transaction.onerror = (errorEvent) => {
                  console.error("WebInsightDB: Error during upgrade transaction:", errorEvent.target.error);
                  // The main request.onerror will likely also fire.
             };
             transaction.onabort = (abortEvent) => {
                  console.error("WebInsightDB: Upgrade transaction aborted:", abortEvent.target.error);
             };
             transaction.oncomplete = () => {
                  console.log("WebInsightDB: Upgrade transaction completed successfully.");
             };

            // --- Schema Definition for contentItems Store ---
            let contentStore;
            if (!tempDb.objectStoreNames.contains(CONTENT_STORE_NAME)) {
                console.log(`WebInsightDB: Creating object store: ${CONTENT_STORE_NAME}`);
                contentStore = tempDb.createObjectStore(CONTENT_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                // Define indexes for the contentItems store.
                contentStore.createIndex('type', 'type', { unique: false }); // For filtering by content type.
                contentStore.createIndex('url', 'url', { unique: false });   // For lookups by source URL.
                contentStore.createIndex('createdAt', 'createdAt', { unique: false }); // For sorting by creation date.
                console.log(`WebInsightDB: Object store ${CONTENT_STORE_NAME} created with indexes (type, url, createdAt).`);
            } else {
                // If the store exists, get a reference to it via the upgrade transaction.
                contentStore = transaction.objectStore(CONTENT_STORE_NAME);
                console.log(`WebInsightDB: Object store ${CONTENT_STORE_NAME} already exists.`);
                // Specific upgrade logic for V1 to V2: Remove old 'tags' index from contentItems.
                // In V1, tags were stored as an array on the content item. V2 uses a separate linking table.
                if (event.oldVersion < 2 && contentStore.indexNames.contains('tags')) {
                    try {
                        console.log(`WebInsightDB: Attempting to remove old 'tags' index from ${CONTENT_STORE_NAME} store (V1 -> V2 upgrade).`);
                        contentStore.deleteIndex('tags');
                        console.log("WebInsightDB: Old 'tags' index removed successfully.");
                    } catch (e) {
                         console.error("WebInsightDB: Error removing old 'tags' index during upgrade:", e);
                         // This error might not be critical if the index doesn't exist or other issues occur.
                    }
                }
            }

            // --- Schema Definition for tags Store ---
            if (!tempDb.objectStoreNames.contains(TAG_STORE_NAME)) {
                console.log(`WebInsightDB: Creating object store: ${TAG_STORE_NAME}`);
                const tagStore = tempDb.createObjectStore(TAG_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                // Index on 'name' for fast tag lookups and to enforce uniqueness of tag names.
                tagStore.createIndex('name', 'name', { unique: true });
                console.log(`WebInsightDB: Object store ${TAG_STORE_NAME} created with unique index on 'name'.`);
            } else {
                 console.log(`WebInsightDB: Object store ${TAG_STORE_NAME} already exists.`);
                 // Future: Handle index changes or data migration for this store if needed in new versions.
            }

            // --- Schema Definition for contentTags Store (Junction Table) ---
            if (!tempDb.objectStoreNames.contains(CONTENT_TAG_STORE_NAME)) {
                console.log(`WebInsightDB: Creating object store: ${CONTENT_TAG_STORE_NAME}`);
                // Uses a compound key [contentId, tagId] to ensure each content-tag link is unique.
                const contentTagStore = tempDb.createObjectStore(CONTENT_TAG_STORE_NAME, { keyPath: ['contentId', 'tagId'] });
                // Index on 'contentId' to quickly find all tags for a specific content item.
                contentTagStore.createIndex('contentId', 'contentId', { unique: false });
                // Index on 'tagId' to quickly find all content items associated with a specific tag.
                contentTagStore.createIndex('tagId', 'tagId', { unique: false });
                console.log(`WebInsightDB: Object store ${CONTENT_TAG_STORE_NAME} created with compound key and indexes on 'contentId' and 'tagId'.`);
            } else {
                 console.log(`WebInsightDB: Object store ${CONTENT_TAG_STORE_NAME} already exists.`);
                 // Future: Handle index changes or data migration for this store if needed.
            }

            console.log("WebInsightDB: Database schema upgrade/creation logic finished.");
        }; // End of onupgradeneeded
    }); // End of Promise
} // End of initDB

// --- Content Item Methods ---

/**
 * Adds a content item to the `contentItems` object store in the database.
 * It automatically sets a `createdAt` timestamp if one is not provided.
 * Note: This function no longer handles a `tags` array directly on the item object;
 * tagging is managed separately via `linkTagToContent`. Any `item.tags` property
 * will be deleted before saving to align with the V2 schema.
 *
 * @param {object} item - The content item object to add. Expected to have properties
 *                        like `type`, `content`, `url`, `title`, etc.
 * @returns {Promise<number>} A promise that resolves with the ID (primary key) of the
 *                            newly added content item. Rejects if an error occurs.
 * @async
 */
async function addContentItem(item) {
    const dbInstance = await initDB(); // Ensure DB is initialized.
    return new Promise((resolve, reject) => {
        // Start a read-write transaction on the contentItems store.
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONTENT_STORE_NAME);

        // V2 Schema: Remove direct 'tags' property if it exists from older code.
        delete item.tags;
        // Ensure 'createdAt' timestamp exists.
        if (!item.createdAt) {
            item.createdAt = new Date().toISOString();
        }

        const request = store.add(item); // Add the item to the store.

        request.onsuccess = (event) => {
            console.log("WebInsightDB: Item added successfully with ID:", event.target.result);
            resolve(event.target.result); // Resolve with the new item's ID.
        };
        request.onerror = (event) => {
            console.error("WebInsightDB: Error adding content item:", event.target.error);
            reject(new Error(`Error adding item: ${event.target.error?.message || 'Unknown error'}`));
        };
        transaction.onerror = (event) => { // Catch broader transaction errors.
            console.error("WebInsightDB: Add Content Item transaction error:", event.target.error);
            // The request.onerror likely caught this already, but this is a fallback.
        };
    });
}

/**
 * Retrieves all content items from the `contentItems` object store.
 *
 * @returns {Promise<Array<object>>} A promise that resolves with an array of all
 *                                   content item objects. Resolves with an empty array
 *                                   if the store is empty or if an error occurs (after logging).
 * @async
 */
async function getAllContentItems() {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_STORE_NAME);
        const request = store.getAll(); // Request to get all items.

        request.onsuccess = (event) => {
            resolve(event.target.result || []); // Return result or empty array if undefined/null.
        };
        request.onerror = (event) => {
            console.error("WebInsightDB: Error getting all content items:", event.target.error);
            reject(new Error(`Error getting all items: ${event.target.error?.message || 'Unknown error'}`));
        };
    });
}

/**
 * Updates an existing content item in the `contentItems` object store.
 * The item is identified by its ID. The `updates` object should contain
 * the fields and new values to apply to the item.
 * Note: This function does not handle direct tag updates on the item object.
 *
 * @param {number} id - The ID of the content item to update.
 * @param {object} updates - An object containing the key-value pairs to update on the item.
 *                           e.g., `{ title: "New Title", analysis: { ... } }`.
 * @returns {Promise<number>} A promise that resolves with the ID of the updated item
 *                            (should be the same as the input ID). Rejects if the item
 *                            is not found or if an error occurs.
 * @async
 */
async function updateContentItem(id, updates) {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONTENT_STORE_NAME);

        // First, retrieve the existing item.
        const getRequest = store.get(id);
        getRequest.onsuccess = (event) => {
            const item = event.target.result;
            if (!item) {
                return reject(new Error(`Item with ID ${id} not found for update.`));
            }

            // V2 Schema: Remove direct 'tags' property from updates if present.
            delete updates.tags;

            // Preserve original ID, apply updates, then restore original ID to prevent changing the keyPath value.
            const originalId = item.id;
            Object.assign(item, updates); // Apply new values to the retrieved item.
            item.id = originalId; // Ensure the keyPath 'id' is not accidentally changed by updates.

            const updateRequest = store.put(item); // Put the modified item back into the store.
            updateRequest.onsuccess = (putEvent) => {
                console.log(`WebInsightDB: Item ${id} updated successfully. Resulting key: ${putEvent.target.result}`);
                resolve(putEvent.target.result); // Resolve with the ID of the updated item.
            };
            updateRequest.onerror = (putEvent) => {
                console.error(`WebInsightDB: Error putting updated item ${id}:`, putEvent.target.error);
                reject(new Error(`Error updating item: ${putEvent.target.error?.message || 'Unknown error'}`));
            };
        };
        getRequest.onerror = (event) => {
            console.error(`WebInsightDB: Error retrieving item ${id} for update:`, event.target.error);
            reject(new Error(`Error retrieving item for update: ${event.target.error?.message || 'Unknown error'}`));
        };
        transaction.onerror = (event) => {
            console.error("WebInsightDB: Update Content Item transaction error:", event.target.error);
        };
    });
}

/**
 * Deletes a content item from the `contentItems` store and also removes all its
 * associated links from the `contentTags` (junction) store.
 * This ensures data consistency by removing orphaned links.
 *
 * @param {number} id - The ID of the content item to delete.
 * @returns {Promise<void>} A promise that resolves when the item and its links
 *                          have been successfully deleted. Rejects if an error occurs.
 * @async
 */
async function deleteContentItem(id) {
    const dbInstance = await initDB();
    return new Promise(async (resolve, reject) => {
        // Use a transaction spanning both stores for atomicity.
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME, CONTENT_TAG_STORE_NAME], 'readwrite');
        const contentStore = transaction.objectStore(CONTENT_STORE_NAME);
        const contentTagStore = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const contentTagIndex = contentTagStore.index('contentId'); // Index for finding links by contentId.

        let overallError = null; // To capture any error that occurs.
        const deletionPromises = []; // Array to hold promises for individual delete operations.

        // 1. Promise to delete the main content item.
        deletionPromises.push(new Promise((res, rej) => {
            const request = contentStore.delete(id);
            request.onsuccess = res;
            request.onerror = (e) => { overallError = e.target.error; rej(overallError); };
        }));

        // 2. Promise to delete all links associated with this content item.
        deletionPromises.push(new Promise((res, rej) => {
            const cursorRequest = contentTagIndex.openCursor(IDBKeyRange.only(id)); // Cursor for all links with this contentId.
            const linkDeletionSubPromises = [];
            cursorRequest.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    // For each link found, create a promise to delete it.
                    linkDeletionSubPromises.push(new Promise((subRes, subRej) => {
                        const deleteLinkRequest = cursor.delete();
                        deleteLinkRequest.onsuccess = subRes;
                        deleteLinkRequest.onerror = (ev) => { overallError = ev.target.error; subRej(overallError); };
                    }));
                    cursor.continue(); // Move to the next link.
                } else {
                    // No more links, resolve this part of the deletion process once all sub-deletions complete.
                    Promise.all(linkDeletionSubPromises).then(res).catch(rej);
                }
            };
            cursorRequest.onerror = (e) => { overallError = e.target.error; rej(overallError); };
        }));

        // Handle transaction completion and errors.
        transaction.oncomplete = () => {
            if (overallError) {
                console.error(`WebInsightDB: Error during delete transaction for item ${id}:`, overallError);
                reject(new Error(`Deletion failed: ${overallError.message || 'Unknown error'}`));
            } else {
                console.log(`WebInsightDB: Item ${id} and its associated links deleted successfully.`);
                resolve();
            }
        };
        transaction.onerror = (e) => { // This catches errors if the transaction itself fails.
            console.error(`WebInsightDB: Transaction error during delete for item ${id}:`, e.target.error);
            reject(new Error(`Deletion transaction failed: ${e.target.error?.message || 'Unknown transaction error'}`));
        };

        // Await all individual deletion operations. If any fails, overallError should be set.
        try {
            await Promise.all(deletionPromises);
        } catch (error) {
            // This catch is mostly for errors in promise setup, as IndexedDB errors are handled by onsuccess/onerror.
            console.error("WebInsightDB: Error awaiting deletion promises for item:", id, error);
            // The transaction.oncomplete/onerror should ultimately handle the rejection.
        }
    });
}

/**
 * Retrieves multiple content items from the database based on an array of their IDs.
 *
 * @param {Array<number>} contentIds - An array of content item IDs to retrieve.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of found
 *                                   content item objects. Items not found are silently
 *                                   omitted from the result. If input is invalid or
 *                                   empty, resolves with an empty array.
 * @async
 */
async function getContentItemsByIds(contentIds) {
    // Validate input: ensure it's an array and not empty.
    if (!Array.isArray(contentIds) || contentIds.length === 0) {
        return Promise.resolve([]);
    }
    // Filter for valid numeric IDs.
    const validContentIds = contentIds.filter(id => typeof id === 'number');
    if (validContentIds.length === 0) {
        return Promise.resolve([]);
    }

    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_STORE_NAME);
        const items = []; // Array to store found items.
        let completedRequests = 0; // Counter for completed get requests.

        // Handle potential transaction errors.
        transaction.onerror = (event) => {
            console.error("WebInsightDB: Transaction error in getContentItemsByIds:", event.target.error);
            reject(new Error(`Transaction error: ${event.target.error?.message || 'Unknown error'}`));
        };
        transaction.onabort = (event) => { // Less common, but good to handle.
            console.error("WebInsightDB: Transaction aborted in getContentItemsByIds:", event.target.error);
            reject(new Error(`Transaction aborted: ${event.target.error?.message || 'Unknown error'}`));
        };

        // Iterate over each valid ID and create a get request.
        validContentIds.forEach(id => {
            const request = store.get(id);
            request.onsuccess = (event) => {
                if (event.target.result) { // If item is found, add to array.
                    items.push(event.target.result);
                } else {
                    console.warn(`WebInsightDB: Content item with ID ${id} not found during batch retrieval.`);
                }
                completedRequests++;
                // If all requests have completed, resolve the promise.
                if (completedRequests === validContentIds.length) {
                    resolve(items);
                }
            };
            request.onerror = (event) => { // Handle error for individual get request.
                console.error(`WebInsightDB: Error fetching content item ID ${id} in batch:`, event.target.error);
                completedRequests++; // Still count as completed to not hang the promise.
                if (completedRequests === validContentIds.length) {
                    resolve(items); // Resolve with items found so far.
                }
            };
        });

        // Safety net: if validContentIds was somehow empty after filtering (though caught earlier).
        if (validContentIds.length === 0) {
            resolve([]);
        }
    });
}


// --- Tag Management Methods ---

/**
 * Adds a new tag to the `tags` object store if it doesn't already exist (case-sensitive).
 * If the tag name already exists, it returns the ID of the existing tag.
 * Tag names are trimmed of whitespace before processing.
 *
 * @param {string} tagName - The name of the tag to add.
 * @returns {Promise<number>} A promise that resolves with the tag's ID (either new or existing).
 *                            Rejects if the tagName is invalid or if a database error occurs.
 * @async
 */
async function addTag(tagName) {
    // Validate tagName: must be a non-empty string.
    if (!tagName || typeof tagName !== 'string' || tagName.trim().length === 0) {
        return Promise.reject(new Error("Invalid tag name provided. Tag name must be a non-empty string."));
    }
    const trimmedTagName = tagName.trim(); // Use trimmed version.
    const dbInstance = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(TAG_STORE_NAME);
        const index = store.index('name'); // Use 'name' index for checking existence.

        // Check if tag already exists.
        const getRequest = index.get(trimmedTagName);
        getRequest.onsuccess = (event) => {
            const existingTag = event.target.result;
            if (existingTag) {
                // Tag exists, resolve with its ID.
                console.log(`WebInsightDB: Tag "${trimmedTagName}" already exists with ID: ${existingTag.id}`);
                resolve(existingTag.id);
            } else {
                // Tag does not exist, add it.
                console.log(`WebInsightDB: Adding new tag: "${trimmedTagName}"`);
                const addRequest = store.add({ name: trimmedTagName });
                addRequest.onsuccess = (addEvent) => {
                    console.log(`WebInsightDB: Tag "${trimmedTagName}" added successfully with ID: ${addEvent.target.result}`);
                    resolve(addEvent.target.result); // Resolve with the new tag's ID.
                };
                addRequest.onerror = (addEvent) => {
                    console.error(`WebInsightDB: Error adding new tag "${trimmedTagName}":`, addEvent.target.error);
                    reject(new Error(`Error adding tag: ${addEvent.target.error?.message || 'Unknown error'}`));
                };
            }
        };
        getRequest.onerror = (event) => {
            console.error(`WebInsightDB: Error checking for existing tag "${trimmedTagName}":`, event.target.error);
            reject(new Error(`Error checking for tag: ${event.target.error?.message || 'Unknown error'}`));
        };
        transaction.onerror = (event) => {
            console.error("WebInsightDB: Add Tag transaction error:", event.target.error);
        };
    });
}

/**
 * Retrieves a specific tag object (including its ID and name) by its name.
 * The search is case-sensitive and uses a trimmed version of the provided tagName.
 *
 * @param {string} tagName - The name of the tag to retrieve.
 * @returns {Promise<object|null>} A promise that resolves with the tag object `{id, name}`
 *                                 if found, or `null` if no tag with that name exists.
 *                                 Rejects on database error.
 * @async
 */
async function getTagByName(tagName) {
    if (!tagName || typeof tagName !== 'string') { // Basic validation.
        console.warn("WebInsightDB: Invalid tagName provided to getTagByName.");
        return Promise.resolve(null);
    }
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(TAG_STORE_NAME);
        const index = store.index('name'); // Use 'name' index for lookup.
        const request = index.get(tagName.trim()); // Search using trimmed name.

        request.onsuccess = (event) => {
            resolve(event.target.result || null); // Resolve with tag object or null.
        };
        request.onerror = (event) => {
            console.error(`WebInsightDB: Error getting tag by name "${tagName}":`, event.target.error);
            reject(new Error(`Error getting tag by name: ${event.target.error?.message || 'Unknown error'}`));
        };
    });
}

/**
 * Retrieves all unique tags stored in the `tags` object store.
 *
 * @returns {Promise<Array<object>>} A promise that resolves with an array of tag objects
 *                                   (each object having `id` and `name` properties).
 *                                   Resolves with an empty array if no tags exist or on error.
 * @async
 */
async function getAllTags() {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(TAG_STORE_NAME);
        const request = store.getAll(); // Request to get all tags.

        request.onsuccess = (event) => {
            resolve(event.target.result || []); // Resolve with array of tags or empty array.
        };
        request.onerror = (event) => {
            console.error("WebInsightDB: Error getting all tags:", event.target.error);
            reject(new Error(`Error getting all tags: ${event.target.error?.message || 'Unknown error'}`));
        };
    });
}

/**
 * Deletes a tag from the `tags` store and also removes all its associated links
 * from the `contentTags` (junction) store to maintain data integrity.
 *
 * @param {number} tagId - The ID of the tag to delete.
 * @returns {Promise<void>} A promise that resolves when the tag and its links
 *                          have been successfully deleted. Rejects if an error occurs
 *                          or if the tagId is invalid.
 * @async
 */
async function deleteTag(tagId) {
    if (typeof tagId !== 'number') {
        return Promise.reject(new Error("Invalid tagId provided for deletion. Must be a number."));
    }
    const dbInstance = await initDB();
    return new Promise(async (resolve, reject) => {
        // Transaction spans both 'tags' and 'contentTags' stores for atomicity.
        const transaction = dbInstance.transaction([TAG_STORE_NAME, CONTENT_TAG_STORE_NAME], 'readwrite');
        const tagStore = transaction.objectStore(TAG_STORE_NAME);
        const contentTagStore = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const contentTagByTagIdIndex = contentTagStore.index('tagId'); // Index to find links by tagId.

        let overallError = null; // To capture any error during the multi-step deletion.
        const deletionPromises = []; // Array for promises of individual delete operations.

        // 1. Promise to delete the tag itself from the 'tags' store.
        deletionPromises.push(new Promise((res, rej) => {
            const request = tagStore.delete(tagId);
            request.onsuccess = res;
            request.onerror = (e) => { overallError = e.target.error; rej(overallError); };
        }));

        // 2. Promise to delete all links associated with this tagId from 'contentTags' store.
        deletionPromises.push(new Promise((res, rej) => {
            // Use a cursor to iterate over all links matching the tagId.
            const cursorRequest = contentTagByTagIdIndex.openCursor(IDBKeyRange.only(tagId));
            const linkDeletionSubPromises = [];
            cursorRequest.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    // For each link found, create a promise to delete it.
                    linkDeletionSubPromises.push(new Promise((subRes, subRej) => {
                        const deleteLinkRequest = cursor.delete();
                        deleteLinkRequest.onsuccess = subRes;
                        deleteLinkRequest.onerror = (ev) => { overallError = ev.target.error; subRej(overallError); };
                    }));
                    cursor.continue(); // Move to the next link.
                } else {
                    // No more links, resolve this part once all sub-deletions complete.
                    Promise.all(linkDeletionSubPromises).then(res).catch(rej);
                }
            };
            cursorRequest.onerror = (e) => { overallError = e.target.error; rej(overallError); };
        }));

        // Handle overall transaction completion and errors.
        transaction.oncomplete = () => {
            if (overallError) {
                console.error(`WebInsightDB: Error during delete transaction for tag ${tagId}:`, overallError);
                reject(new Error(`Tag deletion failed: ${overallError.message || 'Unknown error'}`));
            } else {
                console.log(`WebInsightDB: Tag ${tagId} and its associated links deleted successfully.`);
                resolve();
            }
        };
        transaction.onerror = (e) => {
            console.error(`WebInsightDB: Transaction error during delete for tag ${tagId}:`, e.target.error);
            reject(new Error(`Tag deletion transaction failed: ${e.target.error?.message || 'Unknown error'}`));
        };

        // Await all individual deletion operations.
        try {
            await Promise.all(deletionPromises);
        } catch (error) {
            // Errors in promise setup or from individual operations if not caught by their .onerror
            console.error("WebInsightDB: Error awaiting tag and/or link deletion promises for tagId:", tagId, error);
            // The transaction's oncomplete/onerror should ultimately handle rejection.
        }
    });
}

/**
 * Retrieves multiple tag objects from the database based on an array of their IDs.
 *
 * @param {Array<number>} tagIds - An array of tag IDs to retrieve.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of found
 *                                   tag objects (each with `id` and `name`). Tags not
 *                                   found are silently omitted. If input is invalid or
 *                                   empty, resolves with an empty array.
 * @async
 */
async function getTagsByIds(tagIds) {
    // Validate input: ensure it's an array and not empty.
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
        return Promise.resolve([]);
    }
    // Filter for valid numeric IDs.
    const validTagIds = tagIds.filter(id => typeof id === 'number');
    if (validTagIds.length === 0) {
        return Promise.resolve([]);
    }

    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(TAG_STORE_NAME);
        const tags = []; // Array to store found tags.
        let completedRequests = 0; // Counter for completed get requests.

        transaction.onerror = (event) => {
            console.error("WebInsightDB: Transaction error in getTagsByIds:", event.target.error);
            reject(new Error(`Transaction error: ${event.target.error?.message || 'Unknown error'}`));
        };
        transaction.onabort = (event) => {
            console.error("WebInsightDB: Transaction aborted in getTagsByIds:", event.target.error);
            reject(new Error(`Transaction aborted: ${event.target.error?.message || 'Unknown error'}`));
        };

        // Iterate over each valid ID and create a get request for it.
        validTagIds.forEach(id => {
            const request = store.get(id);
            request.onsuccess = (event) => {
                if (event.target.result) { // If tag is found, add to array.
                    tags.push(event.target.result);
                } else {
                    console.warn(`WebInsightDB: Tag with ID ${id} not found during batch retrieval.`);
                }
                completedRequests++;
                // If all requests have completed, resolve the promise.
                if (completedRequests === validTagIds.length) {
                    resolve(tags);
                }
            };
            request.onerror = (event) => { // Handle error for individual get request.
                console.error(`WebInsightDB: Error fetching tag ID ${id} in batch:`, event.target.error);
                completedRequests++; // Still count as completed.
                if (completedRequests === validTagIds.length) {
                    resolve(tags); // Resolve with tags found so far.
                }
            };
        });

        // Safety net: if validTagIds was somehow empty after filtering.
        if (validTagIds.length === 0) {
            resolve([]);
        }
    });
}


// --- Content-Tag Linking Methods ---

/**
 * Creates a link (association) between a content item and a tag in the `contentTags`
 * (junction) object store. This store uses a compound key `[contentId, tagId]`
 * which ensures that each link is unique.
 * It assumes `contentId` and `tagId` are valid IDs corresponding to existing records
 * in their respective stores (`contentItems` and `tags`).
 *
 * @param {number} contentId - The ID of the content item to link.
 * @param {number} tagId - The ID of the tag to link.
 * @returns {Promise<Array<number>>} A promise that resolves with the compound key `[contentId, tagId]`
 *                                   of the newly created link. If the link already exists
 *                                   (ConstraintError), it resolves with the existing key, treating
 *                                   it as a non-critical duplicate attempt. Rejects on other errors.
 * @async
 */
async function linkTagToContent(contentId, tagId) {
    // Validate input types.
    if (typeof contentId !== 'number' || typeof tagId !== 'number') {
        return Promise.reject(new Error("Invalid contentId or tagId. Both must be numbers."));
    }
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const link = { contentId: contentId, tagId: tagId }; // The object to store.
        const request = store.add(link);

        request.onsuccess = (event) => {
            console.log(`WebInsightDB: Linked content ${contentId} with tag ${tagId}. Key:`, event.target.result);
            resolve(event.target.result); // Resolve with the compound key.
        };
        request.onerror = (event) => {
            // If the error is a ConstraintError, it means the link (compound key) already exists.
            // This is often not a critical error in linking logic, so resolve rather than reject.
            if (event.target.error?.name === 'ConstraintError') {
                console.warn(`WebInsightDB: Link between content ${contentId} and tag ${tagId} already exists.`);
                resolve([contentId, tagId]); // Resolve with the key that would have been added.
            } else {
                console.error(`WebInsightDB: Error linking content ${contentId} with tag ${tagId}:`, event.target.error);
                reject(new Error(`Error linking tag: ${event.target.error?.message || 'Unknown error'}`));
            }
        };
        transaction.onerror = (event) => {
            console.error("WebInsightDB: Link Tag to Content transaction error:", event.target.error);
        };
    });
}

/**
 * Removes a link (association) between a content item and a tag from the
 * `contentTags` (junction) object store using their compound key.
 *
 * @param {number} contentId - The ID of the content item in the link.
 * @param {number} tagId - The ID of the tag in the link.
 * @returns {Promise<void>} A promise that resolves when the link has been successfully
 *                          removed. Rejects if an error occurs or if IDs are invalid.
 * @async
 */
async function unlinkTagFromContent(contentId, tagId) {
    if (typeof contentId !== 'number' || typeof tagId !== 'number') {
        return Promise.reject(new Error("Invalid contentId or tagId for unlinking. Both must be numbers."));
    }
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        // Use the compound key [contentId, tagId] for deletion.
        const request = store.delete([contentId, tagId]);

        request.onsuccess = (event) => {
            console.log(`WebInsightDB: Unlinked content ${contentId} from tag ${tagId}.`);
            resolve(); // Resolve (void) on successful deletion.
        };
        request.onerror = (event) => {
            console.error(`WebInsightDB: Error unlinking content ${contentId} from tag ${tagId}:`, event.target.error);
            reject(new Error(`Error unlinking tag: ${event.target.error?.message || 'Unknown error'}`));
        };
        transaction.onerror = (event) => {
            console.error("WebInsightDB: Unlink Tag from Content transaction error:", event.target.error);
        };
    });
}

/**
 * Retrieves all tag IDs associated with a specific content item ID.
 * It queries the `contentTags` store using the `contentId` index.
 *
 * @param {number} contentId - The ID of the content item for which to find linked tag IDs.
 * @returns {Promise<Array<number>>} A promise that resolves with an array of tag IDs.
 *                                   Resolves with an empty array if no tags are linked,
 *                                   the contentId is invalid, or an error occurs.
 * @async
 */
async function getTagIdsByContentId(contentId) {
    if (typeof contentId !== 'number') {
        console.warn("WebInsightDB: Invalid contentId passed to getTagIdsByContentId. Must be a number.");
        return Promise.resolve([]); // Return empty array for invalid input.
    }
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const index = store.index('contentId'); // Use the 'contentId' index.
        // Get all link objects matching the contentId.
        const request = index.getAll(contentId);

        request.onsuccess = (event) => {
            const links = event.target.result || []; // Array of link objects {contentId, tagId}.
            const tagIds = links.map(link => link.tagId); // Extract only the tagId from each link.
            resolve(tagIds);
        };
        request.onerror = (event) => {
            console.error(`WebInsightDB: Error getting tags for content ID ${contentId}:`, event.target.error);
            reject(new Error(`Error getting tags by content ID: ${event.target.error?.message || 'Unknown error'}`));
        };
    });
}

/**
 * Retrieves all content IDs associated with a specific tag ID.
 * It queries the `contentTags` store using the `tagId` index.
 *
 * @param {number} tagId - The ID of the tag for which to find linked content IDs.
 * @returns {Promise<Array<number>>} A promise that resolves with an array of content IDs.
 *                                   Resolves with an empty array if no content is linked,
 *                                   the tagId is invalid, or an error occurs.
 * @async
 */
async function getContentIdsByTagId(tagId) {
    if (typeof tagId !== 'number') {
        console.warn("WebInsightDB: Invalid tagId passed to getContentIdsByTagId. Must be a number.");
        return Promise.resolve([]); // Return empty array for invalid input.
    }
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const index = store.index('tagId'); // Use the 'tagId' index.
        // Get all link objects matching the tagId.
        const request = index.getAll(tagId);

        request.onsuccess = (event) => {
            const links = event.target.result || []; // Array of link objects {contentId, tagId}.
            const contentIds = links.map(link => link.contentId); // Extract only the contentId.
            resolve(contentIds);
        };
        request.onerror = (event) => {
            console.error(`WebInsightDB: Error getting content for tag ID ${tagId}:`, event.target.error);
            reject(new Error(`Error getting content IDs by tag ID: ${event.target.error?.message || 'Unknown error'}`));
        };
    });
}

/**
 * Retrieves all link entries (i.e., all content-tag associations)
 * from the `contentTags` object store.
 * This function can be useful for debugging, data export, or complex relationship analysis.
 *
 * @returns {Promise<Array<object>>} A promise that resolves with an array of link objects,
 *                                   where each object is `{contentId, tagId}`.
 *                                   Resolves with an empty array if the store is empty or on error.
 * @async
 */
async function getAllContentTags() {
    const dbInstance = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction([CONTENT_TAG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONTENT_TAG_STORE_NAME);
        const request = store.getAll(); // Request to get all entries from the store.

        request.onsuccess = (event) => {
            resolve(event.target.result || []); // Resolve with array of links or empty array.
        };
        request.onerror = (event) => {
            console.error("WebInsightDB: Error getting all contentTags entries:", event.target.error);
            reject(new Error(`Error getting all contentTags: ${event.target.error?.message || 'Unknown error'}`));
        };
    });
}


// --- Database Initialization on Script Load ---
// Call initDB when the script loads to ensure the database is ready for use as early as possible.
// Any errors during this initial, non-critical phase are logged to the console.
initDB().catch(error => {
    console.error("WebInsightDB: Critical error during initial database setup on script load:", error);
    // Depending on the extension's needs, this might trigger a notification or specific error state.
});

// --- Exports ---
// Export all functions to be used by other modules/scripts in the extension.
export {
    initDB, // Core initialization function.
    // Content Item CRUD methods:
    addContentItem,
    getAllContentItems,
    updateContentItem,
    deleteContentItem,
    getContentItemsByIds,
    // Tag Management CRUD methods:
    addTag,
    getTagByName,
    getAllTags,
    deleteTag,
    getTagsByIds,
    // Linking (Content-Tag relationship) methods:
    linkTagToContent,
    unlinkTagFromContent,
    getTagIdsByContentId,
    getContentIdsByTagId,
    getAllContentTags // Function to get all raw link entries.
};
