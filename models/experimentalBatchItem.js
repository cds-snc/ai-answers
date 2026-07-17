import mongoose from 'mongoose';

const ExperimentalBatchItemSchema = new mongoose.Schema({
    experimentalBatch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExperimentalBatch',
        required: true,
    },
    rowIndex: { type: Number, required: true },
    // 1-based trial number when a run executes each question multiple times
    // (config.trials > 1). Items with the same rowIndex are trials of the
    // same question.
    trialIndex: { type: Number, default: 1 },

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
    chatId: { type: String },   // Current run chat id
    referenceChatId: { type: String },   // Chat id of the reference comparison row
    referringUrl: { type: String }, // Per-row referring URL context

    // For comparison inputs
    referenceAnswer: { type: String },
    // For expert-scorer runs with a selected baseline, retain the dataset's
    // canonical answer separately from the previous run's answer.
    goldenReferenceAnswer: { type: String },
    referenceAnalysisResults: { type: mongoose.Schema.Types.Mixed, default: {} },
    referenceMatch: { type: Boolean },
    referenceFlagged: { type: Boolean },

    // Analysis Results (Standardized)
    similarityScore: { type: Number },
    match: { type: Boolean },
    flagged: { type: Boolean, default: false },
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
