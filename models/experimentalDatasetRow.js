import mongoose from 'mongoose';

const ExperimentalDatasetRowSchema = new mongoose.Schema({
    experimentalDataset: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExperimentalDataset',
        required: true,
    },
    rowIndex: { type: Number, required: true },
    pairKey: { type: String, index: true }, // Deterministic row-matching key for comparators
    data: { type: mongoose.Schema.Types.Mixed, required: true },
}, {
    timestamps: true,
    versionKey: false
});

ExperimentalDatasetRowSchema.index({ experimentalDataset: 1, rowIndex: 1 });
ExperimentalDatasetRowSchema.index({ experimentalDataset: 1, pairKey: 1 });

export const ExperimentalDatasetRow = mongoose.models.ExperimentalDatasetRow || mongoose.model('ExperimentalDatasetRow', ExperimentalDatasetRowSchema);
