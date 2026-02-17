import mongoose from 'mongoose';

const citationSchema = new mongoose.Schema({
    aiCitationUrl: { type: String, required: false, default: '' },
    providedCitationUrl: { type: String, required: false, default: '' },
    citationHead: { type: String, required: false, default: '' },
}, {
    timestamps: true, versionKey: false,
    id: false,
});

export const Citation = mongoose.models.Citation || mongoose.model('Citation', citationSchema);