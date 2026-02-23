import mongoose from 'mongoose';

const ExperimentalBatchItemSchema = new mongoose.Schema({
    experimentalBatch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExperimentalBatch',
        required: true,
    },
    rowIndex: { type: Number, required: true },

    // Status of this specific item
    status: {
        type: String,
        required: true,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refused', 'skipped'],
        default: 'pending'
    },

    // Common Inputs
    question: { type: String }, // Primary input for most things

    // For 'batch' generation results
    answer: { type: String },   // Generated answer
    chatId: { type: String },   // Added for reference
    referringUrl: { type: String }, // Per-row referring URL context

    // For 'comparison' inputs
    baselineAnswer: { type: String },
    comparisonAnswer: { type: String },

    // Analysis Results (Standardized)
    similarityScore: { type: Number },
    match: { type: Boolean },
    explanation: { type: String },

    // Multi-analyzer results
    analysisResults: { type: mongoose.Schema.Types.Mixed, default: {} }, // { [analyzerId]: result }
    analysisErrors: { type: mongoose.Schema.Types.Mixed, default: {} }, // { [analyzerId]: error }

    // For other evaluators (extensible)
    evaluatorOutput: { type: mongoose.Schema.Types.Mixed }, // Arbitrary JSON results

    // Outcome tracking
    outcomeCode: { type: String },
    outcomeText: { type: String },
    cancellationReason: { type: String },
    skipReason: { type: String },
    retryCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },

    // User input auditing
    originalData: { type: mongoose.Schema.Types.Mixed }, // The raw row data

    error: { type: String }

}, {
    timestamps: true,
    versionKey: false
});

// Compound index for efficient retrieval by batch
ExperimentalBatchItemSchema.index({ experimentalBatch: 1, rowIndex: 1 });

export const ExperimentalBatchItem = mongoose.models.ExperimentalBatchItem || mongoose.model('ExperimentalBatchItem', ExperimentalBatchItemSchema);
