import mongoose, { model } from 'mongoose';

const Schema = mongoose.Schema;

const contextSchema = new Schema({
    topic: { type: String, required: false, default: '' },
    topicUrl: { type: String, required: false, default: '' },
    department: { type: String, required: false, default: '' },
    departmentUrl: { type: String, required: false, default: '' },
    searchResults: { type: String, required: false, default: '' },
    inputTokens: { type: String, required: false, default: '' },
    outputTokens: { type: String, required: false, default: '' },
    model: { type: String, required: false, default: '' },
    searchProvider: { type: String, required: false, default: '' },
    searchQuery: { type: String, required: false, default: '' },
    translatedQuestion: { type: String, required: false, default: '' },
    originalLang: { type: String, required: false, default: '' },
}, {
    timestamps: true, versionKey: false,
    id: false,
});

export const Context = mongoose.models.Context || mongoose.model('Context', contextSchema);