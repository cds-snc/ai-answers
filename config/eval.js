const config = {
    thresholds: {
        questionAnswerSimilarity: 0.85, // Minimum similarity score for question-answer pairs to be considered similar
        answerSimilarity: 0.8, // Minimum similarity score for answers to be considered similar
        sentenceSimilarity: 0.9 // Minimum similarity score for individual sentences to be considered similar
    },
    searchLimits: {
        similarEmbeddings: 20, // Maximum number of similar embeddings to retrieve
        topAnswerMatches: 5 // Maximum number of top answer matches to consider
    },
    penalties: {
        sentenceCountDifference: 0.05 // Penalty factor for each sentence count difference
    },
    biases: {
        recencyWeight: 0.1 // Weight for recency bias in favor of newer embeddings
    },    embedBatchProcessingDuration: 10, // Duration in seconds to process interactions
    evalBatchProcessingDuration: 10 // Vercel: 4 minutes (Pro limit), CDS: 6.7 minutes
};

export default config;