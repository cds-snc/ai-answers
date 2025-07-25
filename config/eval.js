const config = {
    thresholds: {
        questionAnswerSimilarity: 0.75, // Minimum similarity score for question-answer pairs to be considered similar
        answerSimilarity: 0.7, // Minimum similarity score for answers to be considered similar
        sentenceSimilarity: 0.75 // Minimum similarity score for individual sentences to be considered similar
    },
    searchLimits: {
        similarEmbeddings: 20, // Maximum number of similar embeddings to retrieve
        topAnswerMatches: 10 // Maximum number of top answer matches to consider
    },
    penalties: {
        sentenceCountDifference: 0.05 // Penalty factor for each sentence count difference
    },
    biases: {
        recencyWeight: 0.1 // Weight for recency bias in favor of newer embeddings
    },
    embedBatchProcessingDuration: 10, // Duration in seconds to process interactions
    evalBatchProcessingDuration: 10, // Duration in seconds to process evaluations (changed from 10 to 30)
    // Timeout in seconds for finding similar embeddings before giving up (10 minutes)
    similarEmbeddingsTimeLimit: 600,
    evalConcurrency: 1
};

export default config;
