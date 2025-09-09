// js/ai-worker.js - Dedicated content script for AI operations
// This runs in a webpage context where TensorFlow.js works reliably

/**
 * AI Worker - Handles TensorFlow.js operations in a content script context
 * Communicates with background script via chrome.runtime messaging
 */
class AIWorker {
    constructor() {
        this.model = null;
        this.modelReady = false;
        this.isLoading = false;
        this.tf = null;
        this.use = null;
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Will respond asynchronously
        });
        
        console.log("[AIWorker] Content script loaded and ready");
    }

    /**
     * Handle messages from background script
     */
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'AI_INITIALIZE':
                    const initResult = await this.initialize();
                    sendResponse({ success: true, result: initResult });
                    break;
                    
                case 'AI_EMBED':
                    const embedding = await this.embed(message.text);
                    sendResponse({ success: true, result: embedding });
                    break;
                    
                case 'AI_EMBED_BATCH':
                    const embeddings = await this.embedBatch(message.texts);
                    sendResponse({ success: true, result: embeddings });
                    break;
                    
                case 'AI_COSINE_SIMILARITY':
                    const similarity = this.cosineSimilarity(message.embedding1, message.embedding2);
                    sendResponse({ success: true, result: similarity });
                    break;
                    
                case 'AI_SUGGEST_TAGS':
                    const suggestions = await this.suggestTags(
                        message.content, 
                        message.existingTags, 
                        message.threshold, 
                        message.maxSuggestions
                    );
                    sendResponse({ success: true, result: suggestions });
                    break;
                    
                case 'AI_STATUS':
                    sendResponse({ 
                        success: true, 
                        result: {
                            isReady: this.modelReady,
                            isLoading: this.isLoading,
                            memoryInfo: this.getMemoryInfo()
                        }
                    });
                    break;
                    
                default:
                    sendResponse({ success: false, error: `Unknown AI message type: ${message.type}` });
            }
        } catch (error) {
            console.error('[AIWorker] Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Initialize TensorFlow.js and Universal Sentence Encoder
     */
    async initialize() {
        if (this.modelReady) {
            return { message: "Model already initialized" };
        }

        if (this.isLoading) {
            throw new Error("Model already loading");
        }

        try {
            this.isLoading = true;
            console.log("[AIWorker] Loading TensorFlow.js and USE...");

            // Load TensorFlow.js
            if (!window.tf) {
                await this.loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.15.0/dist/tf.min.js');
                this.tf = window.tf;
            }

            // Load Universal Sentence Encoder
            if (!window.use) {
                await this.loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/universal-sentence-encoder@1.3.3/dist/universal-sentence-encoder.min.js');
                this.use = window.use;
            }

            // Load the model (25MB download)
            console.log("[AIWorker] Loading USE model (25MB)...");
            this.model = await this.use.load();
            
            this.modelReady = true;
            this.isLoading = false;
            
            // Test with simple embedding
            const testEmbedding = await this.embed("test");
            console.log(`[AIWorker] Model ready. Embedding dimension: ${testEmbedding.length}`);
            
            return { 
                message: "Model initialized successfully", 
                embeddingDimension: testEmbedding.length 
            };
            
        } catch (error) {
            this.isLoading = false;
            this.modelReady = false;
            throw new Error(`Failed to initialize AI: ${error.message}`);
        }
    }

    /**
     * Load external script dynamically
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }

    /**
     * Generate embedding for text
     */
    async embed(text) {
        if (!this.modelReady) {
            throw new Error("Model not ready. Call initialize first.");
        }

        const normalizedText = this.normalizeText(text);
        const embeddings = await this.model.embed([normalizedText]);
        const embeddingArray = await embeddings.array();
        embeddings.dispose();
        
        return embeddingArray[0];
    }

    /**
     * Generate embeddings for multiple texts
     */
    async embedBatch(texts) {
        if (!this.modelReady) {
            throw new Error("Model not ready. Call initialize first.");
        }

        const normalizedTexts = texts.map(text => this.normalizeText(text));
        const embeddings = await this.model.embed(normalizedTexts);
        const embeddingArrays = await embeddings.array();
        embeddings.dispose();
        
        return embeddingArrays;
    }

    /**
     * Calculate cosine similarity
     */
    cosineSimilarity(embedding1, embedding2) {
        if (embedding1.length !== embedding2.length) {
            throw new Error("Embedding dimensions don't match");
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }

        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);

        if (norm1 === 0 || norm2 === 0) return 0;
        return dotProduct / (norm1 * norm2);
    }

    /**
     * Suggest tags based on content similarity
     */
    async suggestTags(content, existingTags, threshold = 0.6, maxSuggestions = 5) {
        if (!this.modelReady) {
            throw new Error("Model not ready for tag suggestions");
        }

        if (!existingTags || existingTags.length === 0) {
            return [];
        }

        // Generate embedding for content
        const contentEmbedding = await this.embed(content);
        
        // Calculate similarities
        const similarities = existingTags
            .map(tag => {
                if (!tag.embedding || !Array.isArray(tag.embedding)) {
                    return null;
                }
                
                const similarity = this.cosineSimilarity(contentEmbedding, tag.embedding);
                return {
                    id: tag.id,
                    name: tag.name,
                    similarity: similarity
                };
            })
            .filter(result => result !== null && result.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxSuggestions);

        return similarities;
    }

    /**
     * Normalize text for embedding
     */
    normalizeText(text) {
        if (typeof text !== 'string') return '';
        
        return text
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\-\.]/g, ' ')
            .trim()
            .substring(0, 1000);
    }

    /**
     * Get memory usage info
     */
    getMemoryInfo() {
        return {
            modelLoaded: this.modelReady,
            memoryUsage: this.modelReady ? "~25MB" : "0MB",
            status: this.isLoading ? "loading" : (this.modelReady ? "ready" : "not initialized")
        };
    }
}

// Initialize the AI worker if we're in a content script context
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    const aiWorker = new AIWorker();
}