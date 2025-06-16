// js/lib/local-ai.js
// This script implements a lightweight, keyword-based local "AI" system.
// It's designed to work within the constraints of a Chrome extension's service worker
// or side panel context, where resource usage (memory, CPU) is a concern and
// loading large machine learning models might be impractical or slow.
//
// The core idea is to simulate text embeddings by:
// 1. Extracting significant keywords from text.
// 2. Generating a numerical vector (a pseudo-embedding) based on these keywords
//    using consistent hashing techniques.
// 3. Calculating similarity between these vectors using cosine similarity.
// This approach allows for basic tag suggestions and content similarity matching
// without relying on pre-trained deep learning models like TensorFlow.js's
// Universal Sentence Encoder, making it much smaller and faster to initialize.

/**
 * Implements a keyword-based approach for local AI functionalities such as
 * generating text "embeddings" (numerical vector representations based on keywords),
 * calculating similarity between texts, and suggesting tags.
 * This class is intended as a lightweight alternative to full-fledged ML models.
 */
class LocalAI {
    /**
     * Initializes the LocalAI instance, setting up initial state and configurations.
     * The constructor pre-defines a set of common English stop words used in keyword extraction.
     */
    constructor() {
        /**
         * Flag indicating whether the keyword-based system is considered ready for use.
         * Set to `true` after successful `initialize()` call.
         * @type {boolean}
         */
        this.modelReady = false;
        /**
         * Flag indicating if the initialization process is currently underway.
         * @type {boolean}
         */
        this.isLoading = false;
        /**
         * Flag indicating if `initialize()` has been successfully completed at least once.
         * @type {boolean}
         */
        this.initialized = false;
        
        /**
         * A set of common English stop words to be ignored during keyword extraction.
         * This helps in focusing on more meaningful terms from the text.
         * @type {Set<string>}
         */
        this.stopWords = new Set([
            // A comprehensive list of common English stop words.
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
            'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
            'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'from', 'up', 'down',
            'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
            'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
            'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
            'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'd',
            'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn', 'hadn',
            'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 'wasn',
            'weren', 'won', 'wouldn', // Contractions as stop words
            // Added more words based on common lists
            'about', 'above', 'after', 'below', 'between', 'into', 'during', 'before', 'through',
            'out', 'against', 'around', 'among', 'throughout', 'unto', 'until', 'upon', 'while'
        ]);
    }

    /**
     * Initializes the keyword-based AI system.
     * For this lightweight implementation, initialization is very fast and primarily involves
     * setting status flags. It simulates a brief setup delay.
     *
     * @returns {Promise<object>} A promise that resolves with an object indicating
     *                            the success and type of AI system initialized.
     *                            Example: `{ message: "AI initialized successfully", type: "keyword-based", ... }`
     * @throws {Error} If an unexpected error occurs during the simulated initialization.
     * @async
     */
    async initialize() {
        if (this.modelReady) {
            console.log("WebInsight LocalAI: System already initialized.");
            return { message: "AI system already initialized and ready." };
        }

        if (this.isLoading) {
            console.log("WebInsight LocalAI: Initialization already in progress.");
            return { message: "AI system initialization is currently in progress." };
        }

        try {
            this.isLoading = true;
            console.log("WebInsight LocalAI: Initializing keyword-based AI system...");
            
            // Simulate a brief initialization period (e.g., loading configurations, warming up)
            await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay, it's very lightweight.
            
            this.modelReady = true;  // Mark as ready.
            this.initialized = true; // Mark as initialized.
            this.isLoading = false;  // No longer loading.
            
            console.log("WebInsight LocalAI: Keyword-based AI system initialized successfully.");
            return { 
                message: "Keyword-based AI system initialized successfully.",
                type: "keyword-based", // Clearly state the type of AI.
                capabilities: ["tag_suggestions_keyword", "similarity_matching_keyword", "keyword_extraction"]
            };
            
        } catch (error) {
            this.isLoading = false;
            this.modelReady = false; // Ensure flags are reset on error.
            console.error("WebInsight LocalAI: Initialization failed:", error);
            throw error; // Re-throw the error to be handled by the caller.
        }
    }

    /**
     * Checks if the keyword-based AI system is initialized and ready for use.
     * @returns {boolean} `true` if the system is ready, `false` otherwise.
     */
    isReady() {
        return this.modelReady && this.initialized;
    }

    /**
     * Provides information about the status and memory usage of this keyword-based AI system.
     * Since it doesn't load large models, memory usage is minimal and reported as an estimate.
     * The "embeddingDimension" refers to the fixed size of the keyword-based vectors.
     *
     * @returns {object} An object containing status and pseudo-memory information:
     *  - `modelLoaded` (boolean): True if initialized.
     *  - `memoryUsage` (string): Estimated memory footprint (e.g., "~1MB").
     *  - `status` (string): Current status ("loading", "ready", "not initialized").
     *  - `type` (string): "keyword-based".
     *  - `embeddingDimension` (number): The dimensionality of the generated keyword vectors (100).
     */
    getMemoryInfo() {
        return {
            modelLoaded: this.modelReady,
            memoryUsage: this.modelReady ? "~0.1MB - 1MB" : "0MB", // Reflects small footprint
            status: this.isLoading ? "loading" : (this.modelReady ? "ready" : "not initialized"),
            type: "keyword-based",
            embeddingDimension: 100 // Matches `createEmbeddingVector` size.
        };
    }

    /**
     * Generates a keyword-based numerical "embedding" (vector) for a given text.
     * The process involves extracting keywords from the text and then creating a
     * fixed-size numerical vector based on these keywords using a hashing technique.
     * This is a lightweight simulation of embeddings produced by machine learning models.
     *
     * @param {string} text - The input text to generate an embedding for.
     * @returns {Promise<Array<number>>} A promise that resolves with an array of numbers
     *                                   representing the embedding vector.
     * @throws {Error} If the AI system is not initialized or if the input text is invalid.
     * @async
     */
    async embed(text) {
        if (!this.isReady()) {
            throw new Error("WebInsight LocalAI: System not initialized. Call initialize() before embedding.");
        }

        if (!text || typeof text !== 'string') {
            throw new Error("WebInsight LocalAI: Invalid text input provided for embedding. Text must be a non-empty string.");
        }

        try {
            // Extract keywords from the input text.
            const keywords = this.extractKeywords(text);
            // Create a numerical vector from these keywords.
            const embedding = this.createEmbeddingVector(keywords);
            
            console.log(`WebInsight LocalAI: Generated keyword-based embedding for text (extracted ${keywords.length} keywords).`);
            return embedding;
            
        } catch (error) {
            console.error("WebInsight LocalAI: Error generating keyword-based embedding:", error);
            throw new Error(`Failed to generate embedding: ${error.message}`);
        }
    }

    /**
     * Generates keyword-based "embeddings" for a batch of texts.
     * This method iterates over an array of text strings and calls `embed()` for each.
     * If embedding fails for a specific text, `null` is placed in the corresponding
     * position in the output array, and a warning is logged.
     *
     * @param {Array<string>} texts - An array of text strings to generate embeddings for.
     * @returns {Promise<Array<Array<number>|null>>} A promise that resolves with an array
     *                                                of embedding vectors. Each element is
     *                                                either an embedding vector or `null` if
     *                                                embedding failed for that text.
     * @throws {Error} If the AI system is not initialized or if the input is not an array.
     * @async
     */
    async embedBatch(texts) {
        if (!this.isReady()) {
            throw new Error("WebInsight LocalAI: System not initialized. Call initialize() before batch embedding.");
        }

        if (!Array.isArray(texts)) {
            throw new Error("WebInsight LocalAI: Input for embedBatch must be an array of text strings.");
        }

        const embeddings = [];
        for (const text of texts) {
            try {
                const embedding = await this.embed(text); // Generate embedding for each text.
                embeddings.push(embedding);
            } catch (error) {
                // Log a warning for the failed text but continue processing others.
                console.warn(`WebInsight LocalAI: Failed to embed text during batch processing (text starts with: "${text?.substring(0, 50)}..."):`, error.message);
                embeddings.push(null); // Push null for failed embeddings.
            }
        }
        
        console.log(`WebInsight LocalAI: Batch embedding completed. Processed ${texts.length} texts, successfully generated ${embeddings.filter(e => e !== null).length} embeddings.`);
        return embeddings;
    }

    /**
     * Calculates the cosine similarity between two numerical vectors (embeddings).
     * Cosine similarity measures the cosine of the angle between two vectors, providing
     * a score between -1 (exactly opposite) and 1 (exactly the same direction),
     * with 0 indicating orthogonality. It's commonly used to measure similarity
     * between text embeddings.
     *
     * @param {Array<number>} embedding1 - The first embedding vector.
     * @param {Array<number>} embedding2 - The second embedding vector.
     * @returns {number} The cosine similarity score, ranging from -1 to 1.
     *                   Returns 0 if either vector has a magnitude of 0 to prevent division by zero.
     * @throws {Error} If embeddings are not arrays or have different dimensions.
     */
    cosineSimilarity(embedding1, embedding2) {
        if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
            throw new Error("WebInsight LocalAI: Embeddings must be arrays for cosine similarity calculation.");
        }

        if (embedding1.length !== embedding2.length) {
            throw new Error("WebInsight LocalAI: Embedding dimensions must match for cosine similarity. " +
                            `Got ${embedding1.length} and ${embedding2.length}.`);
        }

        let dotProduct = 0;
        let norm1 = 0; // Magnitude of embedding1
        let norm2 = 0; // Magnitude of embedding2

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += (embedding1[i] || 0) * (embedding2[i] || 0); // Treat potential null/undefined as 0
            norm1 += (embedding1[i] || 0) * (embedding1[i] || 0);
            norm2 += (embedding2[i] || 0) * (embedding2[i] || 0);
        }

        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);

        // Prevent division by zero if either vector is a zero vector.
        if (norm1 === 0 || norm2 === 0) {
            return 0;
        }

        return dotProduct / (norm1 * norm2);
    }

    /**
     * Suggests relevant tags for a given piece of content by comparing its
     * keyword-based embedding with the embeddings of existing tags.
     * Tags with a similarity score above a specified threshold are returned,
     * sorted by similarity.
     *
     * @param {string} content - The text content for which to suggest tags.
     * @param {Array<object>} existingTags - An array of existing tag objects.
     *        Each object is expected to have `id`, `name`, and potentially an `embedding` property.
     *        If `embedding` is missing for a tag, it will be generated on-the-fly using its name.
     * @param {number} [threshold=0.3] - The minimum cosine similarity score for a tag to be considered relevant.
     * @param {number} [maxSuggestions=5] - The maximum number of tag suggestions to return.
     * @returns {Promise<Array<object>>} A promise that resolves with an array of suggested tag objects.
     *        Each suggested tag object includes `id`, `name`, and `similarity` score.
     *        Returns an empty array if no tags meet the threshold or if inputs are invalid.
     * @throws {Error} If the AI system is not initialized or if input `content` is invalid.
     * @async
     */
    async suggestTags(content, existingTags, threshold = 0.3, maxSuggestions = 5) {
        if (!this.isReady()) {
            throw new Error("WebInsight LocalAI: System not initialized. Call initialize() before suggesting tags.");
        }

        if (!content || typeof content !== 'string') {
            throw new Error("WebInsight LocalAI: Invalid content provided for tag suggestions. Content must be a non-empty string.");
        }

        if (!Array.isArray(existingTags) || existingTags.length === 0) {
            console.log("WebInsight LocalAI: No existing tags provided to compare against for suggestions.");
            return []; // No tags to suggest if none exist.
        }

        try {
            console.log(`WebInsight LocalAI: Analyzing content for tag suggestions (comparing against ${existingTags.length} existing tags).`);
            
            // Generate the embedding for the input content.
            const contentEmbedding = await this.embed(content);
            
            const similarities = []; // Array to store tags that meet the similarity threshold.
            
            for (const tag of existingTags) {
                try {
                    let tagEmbedding = tag.embedding;
                    // If a tag doesn't have a pre-computed embedding, generate one from its name.
                    if (!tagEmbedding || !Array.isArray(tagEmbedding)) {
                        console.warn(`WebInsight LocalAI: Tag "${tag.name}" (ID: ${tag.id}) is missing a pre-computed embedding. Generating one from its name.`);
                        tagEmbedding = await this.embed(tag.name); // Generate embedding for the tag name.
                        // Note: This on-the-fly embedding isn't persisted back to the tag object here.
                        // For performance, batch pre-computation of tag embeddings is recommended.
                    }
                    
                    // Calculate cosine similarity between content embedding and current tag's embedding.
                    const similarity = this.cosineSimilarity(contentEmbedding, tagEmbedding);
                    
                    if (similarity >= threshold) {
                        similarities.push({
                            id: tag.id,
                            name: tag.name,
                            similarity: similarity // Store the similarity score.
                        });
                    }
                } catch (error) {
                    // Log error for an individual tag but continue with others.
                    console.warn(`WebInsight LocalAI: Error processing tag "${tag.name}" (ID: ${tag.id}) for similarity:`, error.message);
                }
            }
            
            // Sort suggestions by similarity score in descending order and take the top N.
            const suggestions = similarities
                .sort((a, b) => b.similarity - a.similarity) // Sort highest similarity first.
                .slice(0, maxSuggestions);                 // Limit to maxSuggestions.
            
            console.log(`WebInsight LocalAI: Generated ${suggestions.length} tag suggestions (threshold: ${threshold}, max: ${maxSuggestions}).`);
            return suggestions;

        } catch (error) {
            console.error("WebInsight LocalAI: Error suggesting tags:", error);
            // Re-throw to allow caller to handle.
            throw new Error(`Failed to suggest tags: ${error.message}`);
        }
    }

    /**
     * Extracts meaningful keywords from a given text string.
     * The process involves:
     * 1. Normalizing the text (lowercase, remove punctuation, normalize whitespace).
     * 2. Splitting the text into words.
     * 3. Filtering words:
     *    - Minimum length (e.g., >= 3 characters).
     *    - Remove common stop words (using `this.stopWords` set).
     *    - Remove words that are purely numerical.
     *    - Maximum length (e.g., <= 20 characters) to avoid overly long "words".
     * 4. Counting the frequency of remaining words.
     * 5. Sorting words by frequency (descending) and then alphabetically for ties.
     * 6. Returning the top N (e.g., 15) most frequent keywords.
     *
     * @param {string} text - The input text from which to extract keywords.
     * @returns {Array<string>} An array of extracted keywords, sorted by significance.
     *                          Returns an empty array if the input text is invalid or yields no keywords.
     */
    extractKeywords(text) {
        if (typeof text !== 'string' || !text.trim()) {
            return []; // Return empty array for invalid or empty text.
        }
        
        // Normalize text: convert to lowercase, replace punctuation with spaces,
        // and normalize multiple spaces to single spaces.
        const normalized = text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')  // Replace non-alphanumeric (excluding underscore) and non-whitespace with space.
            .replace(/\s+/g, ' ')      // Collapse multiple whitespace characters into a single space.
            .trim();                   // Remove leading/trailing whitespace.
        
        if (!normalized) {
            return []; // Return empty if normalization results in an empty string.
        }
        
        // Split into words and apply filters.
        const words = normalized.split(' ')
            .filter(word => word.length >= 3)           // Filter: word length at least 3 characters.
            .filter(word => !this.stopWords.has(word))  // Filter: remove stop words.
            .filter(word => !/^\d+$/.test(word))        // Filter: remove words that are purely numbers.
            .filter(word => word.length <= 20);         // Filter: remove excessively long words (e.g., >20 chars).
        
        // Count word frequencies.
        const frequency = {};
        words.forEach(word => {
            frequency[word] = (frequency[word] || 0) + 1;
        });
        
        // Sort words: primary sort by frequency (descending), secondary by alphabetical order (ascending).
        // Then take the top 15 keywords.
        const keywords = Object.entries(frequency) // [word, count] pairs
            .sort((a, b) => {
                // Sort by frequency (descending).
                if (b[1] !== a[1]) return b[1] - a[1];
                // For ties in frequency, sort alphabetically (ascending).
                return a[0].localeCompare(b[0]);
            })
            .slice(0, 15)  // Get the top 15 most frequent keywords.
            .map(([word]) => word); // Extract just the word from the [word, count] pair.
        
        return keywords;
    }

    /**
     * Creates a fixed-size numerical vector (pseudo-embedding) from an array of keywords.
     * This method uses a consistent hashing approach to map keywords to indices in the vector.
     * Each keyword contributes to multiple positions in the vector with varying weights,
     * and its contribution is weighted by its position in the input keyword list
     * (earlier keywords are considered more important).
     * The resulting vector is then normalized to unit length.
     *
     * @param {Array<string>} keywords - An array of keywords extracted from text.
     * @returns {Array<number>} A normalized numerical vector of fixed size (100 dimensions)
     *                          representing the keywords. Returns a zero vector if no keywords are provided.
     */
    createEmbeddingVector(keywords) {
        const vectorSize = 100;  // Defines the dimensionality of the embedding vector.
        const vector = new Array(vectorSize).fill(0); // Initialize vector with zeros.
        
        if (!keywords || keywords.length === 0) {
            return vector;  // Return a zero vector if there are no keywords.
        }
        
        // Process each keyword to contribute to the vector.
        keywords.forEach((keyword, index) => {
            // Use multiple hash functions (derived from one simple hash) to map a keyword
            // to several positions in the vector. This helps in creating a more distributed representation.
            const hash1 = this.stringHash(keyword) % vectorSize;
            const hash2 = this.stringHash(keyword + 'salt1') % vectorSize; // Add salt for different hash results.
            const hash3 = this.stringHash('prefix' + keyword) % vectorSize; // Add prefix for another variation.
            
            // Weight keywords based on their order/importance (earlier keywords get higher weight).
            // This is a simple weighting scheme; more sophisticated schemes could be used.
            const weight = 1.0 / (index + 1);
            
            // Add weighted contributions to the vector at hashed positions.
            // Different hashes contribute with slightly different sub-weights.
            vector[hash1] = (vector[hash1] || 0) + weight;
            vector[hash2] = (vector[hash2] || 0) + weight * 0.75; // Slightly less weight for second hash.
            vector[hash3] = (vector[hash3] || 0) + weight * 0.5;  // Even less for third.
        });
        
        // Normalize the vector to unit length (L2 normalization).
        // This ensures that the vector's magnitude doesn't affect similarity calculations (e.g., cosine similarity).
        let magnitude = 0;
        for (const val of vector) {
            magnitude += val * val;
        }
        magnitude = Math.sqrt(magnitude);

        if (magnitude > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] /= magnitude;
            }
        }
        
        return vector;
    }

    /**
     * A simple but consistent string hashing function (djb2 variant).
     * It takes a string and produces a numerical hash value.
     * The result is made absolute to ensure positive indices when using modulo.
     *
     * @param {string} str - The input string to hash.
     * @returns {number} A non-negative integer hash value. Returns 0 for an empty string.
     */
    stringHash(str) {
        let hash = 5381; // Initial seed for djb2
        if (typeof str !== 'string' || str.length === 0) return 0; // Return 0 for non-string or empty.
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) + hash) + char; /* hash * 33 + char */
            hash = hash & hash; // Convert to 32-bit integer to keep it manageable.
        }
        
        return Math.abs(hash); // Ensure the hash is non-negative.
    }

    /**
     * Normalizes a tag name to a consistent format.
     * The normalization process includes:
     * 1. Trimming leading/trailing whitespace.
     * 2. Converting to lowercase.
     * 3. Replacing hyphens, underscores, and multiple spaces with a single space.
     * 4. Removing any characters that are not alphanumeric or whitespace.
     * 5. Splitting into words, filtering out empty words.
     * 6. Capitalizing the first letter of each word.
     * 7. Joining words back with a single space.
     * This helps in maintaining consistency for tags (e.g., "My Tag" and "my-tag" become "My Tag").
     *
     * @param {string} tagName - The tag name to normalize.
     * @returns {string} The normalized tag name. Returns an empty string if the input is not a string.
     */
    normalizeTagName(tagName) {
        if (typeof tagName !== 'string') {
            return ''; // Return empty string for non-string inputs.
        }

        return tagName
            .trim() // Remove leading/trailing whitespace.
            .toLowerCase() // Convert to lowercase.
            .replace(/[-_\s]+/g, ' ') // Replace hyphens, underscores, and multiple spaces with a single space.
            .replace(/[^a-z0-9\s]/g, '') // Remove all non-alphanumeric (and non-space) characters.
            .split(' ') // Split into words.
            .filter(word => word.length > 0) // Filter out any empty words resulting from multiple spaces.
            .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize first letter of each word.
            .join(' '); // Join words back with a single space.
    }

    /**
     * Finds content items that are similar to a given query embedding.
     * It calculates the cosine similarity between the query embedding and the
     * pre-computed (keyword-based) embedding of each content item.
     * Items with similarity above a specified threshold are returned, sorted by similarity.
     *
     * @param {Array<number>} queryEmbedding - The embedding vector of the query content/text.
     * @param {Array<object>} contentItems - An array of content item objects to search through.
     *        Each item is expected to have an `id` and an `embedding` property (its keyword-based vector).
     * @param {number} [threshold=0.4] - The minimum cosine similarity score for an item to be considered similar.
     * @param {number} [maxResults=10] - The maximum number of similar content items to return.
     * @returns {Promise<Array<object>>} A promise that resolves with an array of content items
     *        that are deemed similar, sorted by similarity score (descending). Each returned item
     *        object will also include a `similarity` property.
     * @throws {Error} If `queryEmbedding` or `contentItems` are not valid arrays.
     * @async
     */
    async findSimilarContent(queryEmbedding, contentItems, threshold = 0.4, maxResults = 10) {
        if (!Array.isArray(queryEmbedding)) {
            throw new Error("WebInsight LocalAI: Query embedding must be an array for similarity search.");
        }
        if (!Array.isArray(contentItems)) {
            throw new Error("WebInsight LocalAI: Content items must be an array for similarity search.");
        }

        const similarities = []; // Array to store items that meet the similarity threshold.

        for (const item of contentItems) {
            // Skip items that don't have a valid embedding.
            if (!item.embedding || !Array.isArray(item.embedding) || item.embedding.length === 0) {
                console.warn(`WebInsight LocalAI: Item ID ${item.id} skipped in similarity search due to missing or invalid embedding.`);
                continue;
            }

            try {
                // Calculate similarity between the query and the current item's embedding.
                const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);
                
                if (similarity >= threshold) {
                    // If similarity is above threshold, add item and its score to the list.
                    similarities.push({
                        ...item, // Spread existing item properties.
                        similarity: similarity // Add the similarity score.
                    });
                }
            } catch (error) {
                // Log error if similarity calculation fails for an item, but continue.
                console.warn(`WebInsight LocalAI: Error calculating similarity for item ID ${item.id}:`, error.message);
            }
        }

        // Sort results by similarity (highest first) and limit to maxResults.
        return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);
    }

    /**
     * "Disposes" of the LocalAI instance by resetting its state flags.
     * For this lightweight keyword-based system, there are no significant resources
     * like TensorFlow.js models to release from memory. This method primarily serves
     * to indicate that the instance is no longer considered "ready" or "initialized".
     *
     * @returns {Promise<void>} A promise that resolves once the state is reset.
     * @async
     */
    async dispose() {
        this.modelReady = false;
        this.initialized = false;
        this.isLoading = false;
        
        console.log("WebInsight LocalAI: Keyword-based AI system state has been reset (disposed).");
        // No actual complex resource cleanup needed for this simple version.
    }
}

/**
 * Singleton instance of the `LocalAI` class.
 * This ensures that only one instance of the keyword-based AI system is used
 * throughout the extension, maintaining a consistent state.
 * @type {LocalAI}
 */
const localAI = new LocalAI();

// Export the singleton instance for use in other parts of the extension.
export { localAI };