import mongoose from 'mongoose';

const ExperimentalBatchSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },

    // 'batch' (generation), 'analysis' (comparison/evaluator)
    type: { type: String, required: true, enum: ['batch', 'analysis'] },

    status: {
        type: String,
        required: true,
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },

    // Configuration for the run
    config: {
        // Shared
        aiProvider: { type: String, default: 'openai' },

        // For 'batch' type
        workflow: { type: String },
        searchProvider: { type: String },
        pageLanguage: { type: String, default: 'en' },

        // For 'analysis' type
        analyzerId: { type: String }, // e.g., 'semantic-comparison', 'bias-detection'
        analyzerConfig: { type: mongoose.Schema.Types.Mixed, default: {} }, // threshold, etc.
    },

    // Files metadata
    files: {
        // For single input (batch or single-evaluator)
        input: {
            filename: String,
            rowCount: Number,
            uploadedAt: Date
        },
        // For comparison input
        comparison: {
            filename: String,
            rowCount: Number,
            uploadedAt: Date
        }
    },

    // Execution Summary
    summary: {
        total: { type: Number, default: 0 },
        completed: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },

        // Analysis specific stats
        matches: { type: Number, default: 0 },
        differences: { type: Number, default: 0 },
        flagged: { type: Number, default: 0 },
    },

    error: { type: String }

}, {
    timestamps: true,
    versionKey: false
});

// Index for efficient listing
ExperimentalBatchSchema.index({ createdAt: -1 });
ExperimentalBatchSchema.index({ type: 1, status: 1 });

export const ExperimentalBatch = mongoose.models.ExperimentalBatch || mongoose.model('ExperimentalBatch', ExperimentalBatchSchema);
