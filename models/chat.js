import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
    chatId: { type: String, required: true },
    interactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Interaction',
        default: []
    }],
    aiProvider: { type: String, required: false, default: '' },
    searchProvider: { type: String, required: false, default: '' },
    pageLanguage: { type: String, required: false, default: '' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
},{
    timestamps: true,
    versionKey: false,
    id: false,
});

// Middleware to handle cascading delete of interactions when a chat is deleted
ChatSchema.pre('deleteOne', { document: true, query: false }, async function() {
    // Delete all interactions associated with this chat
    const Interaction = mongoose.model('Interaction');
    await Interaction.deleteMany({ _id: { $in: this.interactions } });
});

// Also handle query-based deletions (e.g. Model.deleteOne(query), findOneAndDelete)
// so cascade works regardless of the deletion method used.
ChatSchema.pre('deleteOne', { document: false, query: true }, async function() {
    const filter = this.getFilter();
    const chat = await this.model.findOne(filter).select('interactions').lean();
    if (!chat || !chat.interactions || chat.interactions.length === 0) return;
    const Interaction = mongoose.model('Interaction');
    await Interaction.deleteMany({ _id: { $in: chat.interactions } });
});

ChatSchema.pre('findOneAndDelete', async function() {
    const filter = this.getFilter();
    const chat = await this.model.findOne(filter).select('interactions').lean();
    if (!chat || !chat.interactions || chat.interactions.length === 0) return;
    const Interaction = mongoose.model('Interaction');
    await Interaction.deleteMany({ _id: { $in: chat.interactions } });
});

export const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);

// Indexes to speed up lookups from interaction -> chat and filtering by pageLanguage
ChatSchema.index({ interactions: 1 });
ChatSchema.index({ pageLanguage: 1 });