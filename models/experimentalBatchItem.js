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
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },

    // Common Inputs
    question: { type: String }, // Primary input for most things

    // For 'batch' generation results
    answer: { type: String },   // Generated answer

    // For 'comparison' inputs
    baselineAnswer: { type: String },
    comparisonAnswer: { type: String },

    // Analysis Results (Standardized)
    similarityScore: { type: Number },
    match: { type: Boolean },
    explanation: { type: String },

    // For other evaluators (extensible)
    evaluatorOutput: { type: mongoose.Schema.Types.Mixed }, // Arbitrary JSON results

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
