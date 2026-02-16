// js/data_viewer.js - Logic for the IndexedDB data viewer page

// --- DOM References ---
const contentItemsCodeEl = document.getElementById('contentItemsJson');
const tagsCodeEl = document.getElementById('tagsJson');
const contentTagsCodeEl = document.getElementById('contentTagsJson');
const refreshBtn = document.getElementById('refreshDataBtn');
const exportBtns = document.querySelectorAll('.exportBtn');
// NEW: Graph Container
const graphContainerEl = document.getElementById('knowledgeGraphContainer'); 

// --- Functions ---

/** * Fetches data for a specific store and displays it (existing function)
 * @param {string} messageType - The message type to send to the background script.
 * @param {HTMLElement} targetElement - The <code> element to display the JSON in.
 */
function fetchStoreData(messageType, targetElement) {
    if (!targetElement) return;

    chrome.runtime.sendMessage({ type: messageType }, (response) => {
        if (response && response.success && Array.isArray(response.payload)) {
            const jsonData = JSON.stringify(response.payload, null, 2);
            targetElement.textContent = jsonData;
            targetElement.style.color = '';
        } else {
            const errorMsg = response?.error || `Failed to load data for ${messageType}.`;
            console.error(`Error fetching data for ${messageType}:`, errorMsg);
            targetElement.textContent = `Error: ${errorMsg}`;
            targetElement.style.color = 'red';
        }
    });
}

/** * Fetches all data and triggers both JSON display and Graph rendering (AN-3) 
 */
async function loadAllDataAndRenderGraph() {
    console.log("Loading all data for viewer and graph rendering...");
    
    // Set loading states for raw data
    if (contentItemsCodeEl) contentItemsCodeEl.textContent = 'Loading...';
    if (tagsCodeEl) tagsCodeEl.textContent = 'Loading...';
    if (contentTagsCodeEl) contentTagsCodeEl.textContent = 'Loading...';
    if (graphContainerEl) graphContainerEl.textContent = 'Fetching data for graph...';

    // 1. Fetch data from all three stores via async messages
    const [contentResponse, tagsResponse, contentTagsResponse] = await Promise.all([
        sendMessageAsync({ type: "GET_ALL_SAVED_CONTENT" }),
        sendMessageAsync({ type: "GET_ALL_TAGS" }),
        sendMessageAsync({ type: "GET_ALL_CONTENT_TAGS" })
    ]);

    // 2. Display raw JSON data (existing logic)
    if (contentResponse.success) contentItemsCodeEl.textContent = JSON.stringify(contentResponse.payload, null, 2);
    if (tagsResponse.success) tagsCodeEl.textContent = JSON.stringify(tagsResponse.payload, null, 2);
    if (contentTagsResponse.success) contentTagsCodeEl.textContent = JSON.stringify(contentTagsResponse.payload, null, 2);
    
    // 3. Render Knowledge Graph
    if (contentResponse.success && tagsResponse.success && contentTagsResponse.success) {
        console.log(`[Graph] Fetched ${contentResponse.payload.length} items, ${tagsResponse.payload.length} tags, ${contentTagsResponse.payload.length} links.`);
        
        try {
            const { nodes, edges } = transformDataToGraph(
                contentResponse.payload,
                tagsResponse.payload,
                contentTagsResponse.payload
            );
            
            renderKnowledgeGraph(nodes, edges);
            
        } catch (error) {
            console.error("[Graph] Transformation or rendering failed:", error);
            if (graphContainerEl) graphContainerEl.textContent = `Graph Error: ${error.message}`;
        }
    } else {
        const errorMsg = "Failed to fetch all necessary data for graph.";
        console.error(`[Graph] ${errorMsg}`);
        if (graphContainerEl) graphContainerEl.textContent = errorMsg;
    }
}

/**
 * Transforms IndexedDB data into Vis-Network format (nodes and edges) (AN-3)
 */
function transformDataToGraph(contentItems, tags, contentTags) {
    const nodes = [];
    const edges = [];
    const contentNodeIds = new Set();
    const tagNodeIds = new Set();

    console.log("[Graph] Starting data transformation...");

    // --- 1. Create Content Nodes ---
    contentItems.forEach(item => {
        // Ensure ID is valid for Vis-Network
        const nodeId = `C${item.id}`; 
        contentNodeIds.add(nodeId);
        nodes.push({
            id: nodeId,
            label: item.title ? item.title.substring(0, 30) + '...' : `Item ${item.id}`,
            group: 'Content',
            shape: 'dot',
            title: `Item ID: ${item.id}\nType: ${item.type}\nURL: ${item.url}`
        });
    });
    console.log(`[Graph] Created ${nodes.length} Content Nodes.`);

    // --- 2. Create Tag Nodes ---
    tags.forEach(tag => {
        const nodeId = `T${tag.id}`; 
        tagNodeIds.add(nodeId);
        nodes.push({
            id: nodeId,
            label: tag.name,
            group: 'Tag',
            shape: 'box',
            title: `Tag ID: ${tag.id}\nName: ${tag.name}`
        });
    });
    console.log(`[Graph] Created ${tagNodeIds.size} Tag Nodes.`);

    // --- 3. Create Edges (Links) ---
    contentTags.forEach(link => {
        const sourceId = `C${link.contentId}`;
        const targetId = `T${link.tagId}`;

        // Ensure both linked nodes actually exist (robustness check)
        if (contentNodeIds.has(sourceId) && tagNodeIds.has(targetId)) {
            edges.push({
                from: sourceId,
                to: targetId,
                arrows: 'to', // Tagging is unidirectional: Content -> Tag
                title: 'Tagged With',
                color: { inherit: 'from' }
            });
        }
    });
    console.log(`[Graph] Created ${edges.length} Edges (Links).`);

    return { nodes, edges };
}


/**
 * Initializes and renders the Vis-Network graph (AN-3)
 */
function renderKnowledgeGraph(nodes, edges) {
    if (!graphContainerEl) return;
    
    // Clear the loading message
    graphContainerEl.textContent = ''; 

    // Vis-Network data structure
    const data = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    };
    
    // Vis-Network options (simplified and styled for debug view)
    const options = {
        // Enable basic interaction
        interaction: {
            hover: true,
            tooltipDelay: 200
        },
        // Grouping for visual distinction
        groups: {
            Content: { color: { background: '#0366d6', border: '#005cc5' }, font: { color: 'white' } },
            Tag: { color: { background: '#28a745', border: '#218838' }, font: { color: 'white' } }
        },
        nodes: {
            shape: 'dot',
            size: 10,
            font: {
                size: 12,
                face: 'sans-serif'
            },
            borderWidth: 2
        },
        edges: {
            arrows: {
                to: {enabled: true, scaleFactor: 0.5}
            },
            color: {
                color: '#8b949e',
                highlight: '#e3b341'
            },
            width: 1
        },
        // Physics for layout
        physics: {
            enabled: true,
            barnesHut: {
                // Settings for a balanced, spread-out layout
                gravitationalConstant: -2000,
                centralGravity: 0.1,
                springLength: 100,
                springConstant: 0.04,
                damping: 0.09
            },
            solver: 'barnesHut'
        }
    };
    
    // Create the network
    const network = new vis.Network(graphContainerEl, data, options);
    
    console.log(`[Graph] Vis-Network rendered successfully with ${nodes.length} nodes and ${edges.length} edges.`);
    
    // Add logging for stability after physics stabilize
    network.once('stabilized', () => {
        console.log('[Graph] Network physics stabilized.');
    });
    
    // Make the network instance globally accessible for console debugging
    window.visNetworkInstance = network; 
}


// --- Utility Functions ---

/** Helper to promisify chrome.runtime.sendMessage */
function sendMessageAsync(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, resolve);
    });
}

/**
 * Creates a JSON file from data and triggers a download. (Existing function)
 * @param {Array|Object} data - The data to export.
 * @param {string} filename - The desired filename (e.g., 'data.json').
 */
function downloadJson(data, filename) {
    const jsonString = JSON.stringify(data, null, 2); 
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a); 
    URL.revokeObjectURL(url); 
    console.log(`Data export triggered for download as ${filename}`);
}

/**
 * Fetches data for the specified store and triggers a download. (Existing function)
 * @param {Event} event - The click event object.
 */
function handleExportClick(event) {
    const button = event.target;
    const messageType = button.dataset.messagetype; 
    const filename = button.dataset.filename;    

    if (!messageType || !filename) {
        console.error("Export button is missing data-messagetype or data-filename attribute.");
        return;
    }

    console.log(`Export requested for ${messageType}...`);
    button.textContent = 'Exporting...'; 
    button.disabled = true; 

    chrome.runtime.sendMessage({ type: messageType }, (response) => {
        if (response && response.success && Array.isArray(response.payload)) {
            downloadJson(response.payload, filename);
        } else {
            const errorMsg = response?.error || `Failed to fetch data for export (${messageType}).`;
            console.error(`Export Error for ${messageType}:`, errorMsg);
            alert(`Error exporting data: ${errorMsg}`); 
        }
        button.textContent = 'Export JSON';
        button.disabled = false;
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', loadAllDataAndRenderGraph); // Use the new function on load
if (refreshBtn) {
    refreshBtn.addEventListener('click', loadAllDataAndRenderGraph); // Use the new function on refresh
}

exportBtns.forEach(btn => {
    btn.addEventListener('click', handleExportClick);
});

console.log("Data viewer script loaded.");