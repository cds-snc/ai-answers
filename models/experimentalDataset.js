import mongoose from 'mongoose';

const ExperimentalDatasetSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxLength: 255
    },
    description: { type: String, default: '', maxLength: 2000 },
    type: {
        type: String,
        required: true,
        enum: ['question-only', 'qa-pair', 'evaluation-set', 'batch-output']
    },
    rowCount: { type: Number, default: 0 },
    columns: [{
        name: { type: String, required: true },
        type: { type: String, enum: ['string', 'number', 'boolean', 'json'] }
    }],
    sourceType: {
        type: String,
        enum: ['upload', 'promoted-from-batch'],
        default: 'upload'
    },
    sourceBatchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExperimentalBatch'
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    contentHash: { type: String, index: true },
}, {
    timestamps: true,
    versionKey: false
});

// Indexes
ExperimentalDatasetSchema.index(
    { name: 1 },
    { unique: true, collation: { locale: 'en', strength: 2 } }
);
ExperimentalDatasetSchema.index({ createdAt: -1 });
ExperimentalDatasetSchema.index({ type: 1 });

export const ExperimentalDataset = mongoose.models.ExperimentalDataset || mongoose.model('ExperimentalDataset', ExperimentalDatasetSchema);
