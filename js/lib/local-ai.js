// js/lib/local-ai.js - Simple keyword-based AI for service worker context
// Designed for WebInsight's side panel architecture

/**
 * LocalAI class with keyword-based tag suggestions
 * Works in Chrome extension service worker context
 * Integrates with existing side panel UI and IndexedDB storage
 */
class LocalAI {
    constructor() {
        this.modelReady = false;
        this.isLoading = false;
        this.initialized = false;
        
        // Keyword processing configuration
        this.stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
            'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
            'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'from', 'up', 'about',
            'into', 'over', 'after', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
            'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
            'just', 'now', 'here', 'there', 'when', 'where', 'why', 'how', 'what', 'which', 'who'
        ]);
    }

    /**
     * Initialize the simple AI system
     */
    async initialize() {
        if (this.modelReady) {
            console.log("[LocalAI] Already initialized");
            return { message: "AI already initialized" };
        }

        if (this.isLoading) {
            console.log("[LocalAI] Already loading");
            return { message: "AI initialization in progress" };
        }

        try {
            this.isLoading = true;
            console.log("[LocalAI] Initializing keyword-based AI system...");
            
            // Simulate brief initialization
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.modelReady = true;
            this.initialized = true;
            this.isLoading = false;
            
            console.log("[LocalAI] Keyword-based AI initialized successfully");
            return { 
                message: "AI initialized successfully",
                type: "keyword-based",
                capabilities: ["tag_suggestions", "similarity_matching", "keyword_extraction"]
            };
            
        } catch (error) {
            this.isLoading = false;
            this.modelReady = false;
            console.error("[LocalAI] Initialization failed:", error);
            throw error;
        }
    }

    /**
     * Check if AI is ready
     */
    isReady() {
        return this.modelReady && this.initialized;
    }

    /**
     * Get memory and status information
     */
    getMemoryInfo() {
        return {
            modelLoaded: this.modelReady,
            memoryUsage: this.modelReady ? "~1MB" : "0MB",
            status: this.isLoading ? "loading" : (this.modelReady ? "ready" : "not initialized"),
            type: "keyword-based",
            embeddingDimension: 100
        };
    }

    /**
     * Generate keyword-based "embedding" for text
     */
    async embed(text) {
        if (!this.isReady()) {
            throw new Error("AI not initialized. Call initialize() first.");
        }

        if (!text || typeof text !== 'string') {
            throw new Error("Invalid text input for embedding");
        }

        try {
            // Extract and process keywords
            const keywords = this.extractKeywords(text);
            const embedding = this.createEmbeddingVector(keywords);
            
            console.log(`[LocalAI] Generated embedding for text (${keywords.length} keywords)`);
            return embedding;
            
        } catch (error) {
            console.error("[LocalAI] Error generating embedding:", error);
            throw new Error(`Failed to generate embedding: ${error.message}`);
        }
    }

    /**
     * Generate embeddings for multiple texts
     */
    async embedBatch(texts) {
        if (!this.isReady()) {
            throw new Error("AI not initialized. Call initialize() first.");
        }

        if (!Array.isArray(texts)) {
            throw new Error("Input must be an array of texts");
        }

        const embeddings = [];
        for (const text of texts) {
            try {
                const embedding = await this.embed(text);
                embeddings.push(embedding);
            } catch (error) {
                console.warn(`[LocalAI] Failed to embed text: ${text.substring(0, 50)}`);
                embeddings.push(null);
            }
        }
        
        return embeddings;
    }

    /**
     * Calculate cosine similarity between two embedding vectors
     */
    cosineSimilarity(embedding1, embedding2) {
        if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
            throw new Error("Embeddings must be arrays");
        }

        if (embedding1.length !== embedding2.length) {
            throw new Error("Embedding dimensions must match");
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

        if (norm1 === 0 || norm2 === 0) {
            return 0;
        }

        return dotProduct / (norm1 * norm2);
    }

    /**
     * Suggest tags based on content similarity to existing tags
     */
    async suggestTags(content, existingTags, threshold = 0.3, maxSuggestions = 5) {
        if (!this.isReady()) {
            throw new Error("AI not initialized for tag suggestions");
        }

        if (!content || typeof content !== 'string') {
            throw new Error("Invalid content for tag suggestions");
        }

        if (!Array.isArray(existingTags) || existingTags.length === 0) {
            console.log("[LocalAI] No existing tags to compare against");
            return [];
        }

        try {
            console.log(`[LocalAI] Analyzing content for tag suggestions (${existingTags.length} existing tags)`);
            
            // Generate embedding for the content
            const contentEmbedding = await this.embed(content);
            
            // Calculate similarities with all existing tags
            const similarities = [];
            
            for (const tag of existingTags) {
                try {
                    // Ensure tag has an embedding
                    if (!tag.embedding || !Array.isArray(tag.embedding)) {
                        console.warn(`[LocalAI] Tag "${tag.name}" missing embedding, generating...`);
                        tag.embedding = await this.embed(tag.name);
                    }
                    
                    // Calculate similarity
                    const similarity = this.cosineSimilarity(contentEmbedding, tag.embedding);
                    
                    if (similarity >= threshold) {
                        similarities.push({
                            id: tag.id,
                            name: tag.name,
                            similarity: similarity
                        });
                    }
                } catch (error) {
                    console.warn(`[LocalAI] Error processing tag "${tag.name}":`, error);
                }
            }
            
            // Sort by similarity (highest first) and limit results
            const suggestions = similarities
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, maxSuggestions);
            
            console.log(`[LocalAI] Generated ${suggestions.length} tag suggestions (threshold: ${threshold})`);
            return suggestions;

        } catch (error) {
            console.error("[LocalAI] Error suggesting tags:", error);
            throw new Error(`Failed to suggest tags: ${error.message}`);
        }
    }

    /**
     * Extract meaningful keywords from text
     */
    extractKeywords(text) {
        if (typeof text !== 'string') return [];
        
        // Normalize text
        const normalized = text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
            .replace(/\s+/g, ' ')      // Normalize whitespace
            .trim();
        
        if (!normalized) return [];
        
        // Split into words and filter
        const words = normalized.split(' ')
            .filter(word => word.length >= 3)           // At least 3 characters
            .filter(word => !this.stopWords.has(word))  // Remove stop words
            .filter(word => !/^\d+$/.test(word))        // Remove pure numbers
            .filter(word => word.length <= 20);         // Remove very long strings
        
        // Count word frequency
        const frequency = {};
        words.forEach(word => {
            frequency[word] = (frequency[word] || 0) + 1;
        });
        
        // Get unique words sorted by frequency, then alphabetically
        const keywords = Object.entries(frequency)
            .sort((a, b) => {
                // First sort by frequency (descending)
                if (b[1] !== a[1]) return b[1] - a[1];
                // Then alphabetically for ties
                return a[0].localeCompare(b[0]);
            })
            .slice(0, 15)  // Top 15 most frequent keywords
            .map(([word, freq]) => word);
        
        return keywords;
    }

    /**
     * Create a numerical vector from keywords using consistent hashing
     */
    createEmbeddingVector(keywords) {
        const vectorSize = 100;  // Fixed size for consistency
        const vector = new Array(vectorSize).fill(0);
        
        if (keywords.length === 0) {
            return vector;  // Return zero vector for empty input
        }
        
        // Map each keyword to multiple vector positions using different hash functions
        keywords.forEach((keyword, index) => {
            // Use multiple hash functions for better distribution
            const hash1 = this.stringHash(keyword) % vectorSize;
            const hash2 = this.stringHash(keyword + 'salt') % vectorSize;
            const hash3 = this.stringHash('prefix' + keyword) % vectorSize;
            
            // Weight based on keyword position (earlier keywords are more important)
            const weight = 1.0 / (index + 1);
            
            // Increment multiple positions with weights
            vector[hash1] += weight;
            vector[hash2] += weight * 0.7;
            vector[hash3] += weight * 0.5;
        });
        
        // Normalize the vector to unit length
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= magnitude;
            }
        }
        
        return vector;
    }

    /**
     * Simple but consistent string hash function
     */
    stringHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return Math.abs(hash);
    }

    /**
     * Normalize tag name for consistency (matches existing pattern)
     */
    normalizeTagName(tagName) {
        if (typeof tagName !== 'string') {
            return '';
        }

        return tagName
            .trim()
            .toLowerCase()
            .replace(/[-_\s]+/g, ' ')
            .replace(/[^a-z0-9\s]/g, '')
            .split(' ')
            .filter(word => word.length > 0)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Find similar content based on embeddings
     */
    async findSimilarContent(queryEmbedding, contentItems, threshold = 0.4, maxResults = 10) {
        if (!Array.isArray(queryEmbedding) || !Array.isArray(contentItems)) {
            throw new Error("Invalid parameters for similarity search");
        }

        const similarities = [];

        for (const item of contentItems) {
            if (!item.embedding || !Array.isArray(item.embedding)) {
                continue;
            }

            try {
                const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);
                
                if (similarity >= threshold) {
                    similarities.push({
                        ...item,
                        similarity: similarity
                    });
                }
            } catch (error) {
                console.warn(`[LocalAI] Error calculating similarity for item ${item.id}:`, error);
            }
        }

        return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);
    }

    /**
     * Clean up resources
     */
    async dispose() {
        this.modelReady = false;
        this.initialized = false;
        this.isLoading = false;
        
        console.log("[LocalAI] Resources cleaned up");
    }
}

// Create and export singleton instance
const localAI = new LocalAI();

export { localAI };