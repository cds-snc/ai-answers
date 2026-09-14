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
    appVersion: { type: String, required: false, default: '' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    // Chat assignment (issue #1656): a partner/admin hands this chat to one
    // partner user for review. Single assignee at a time - assigning again
    // overwrites the previous assignment rather than keeping history.
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedOn: { type: Date, default: null },
    // Length capped in api/chat/chat-assign.js (ASSIGN_NOTE_MAX_LENGTH,
    // src/constants/chatAssign.js) - that's the real enforcement, since
    // findOneAndUpdate there doesn't run Mongoose validators by default.
    // maxlength here is defense-in-depth for any other write path.
    assignedNotes: { type: String, default: '', maxlength: 500 },
}, {
    timestamps: true,
    versionKey: false,
    id: false,
});

// Middleware to handle cascading delete of interactions when a chat is deleted
ChatSchema.pre('deleteOne', { document: true, query: false }, async function () {
    // Delete all interactions associated with this chat
    const Interaction = mongoose.model('Interaction');
    await Interaction.deleteMany({ _id: { $in: this.interactions } });
});

// Also handle query-based deletions (e.g. Model.deleteOne(query), findOneAndDelete)
// so cascade works regardless of the deletion method used.
ChatSchema.pre('deleteOne', { document: false, query: true }, async function () {
    const filter = this.getFilter();
    const chat = await this.model.findOne(filter).select('interactions').lean();
    if (!chat || !chat.interactions || chat.interactions.length === 0) return;
    const Interaction = mongoose.model('Interaction');
    await Interaction.deleteMany({ _id: { $in: chat.interactions } });
});

ChatSchema.pre('findOneAndDelete', async function () {
    const filter = this.getFilter();
    const chat = await this.model.findOne(filter).select('interactions').lean();
    if (!chat || !chat.interactions || chat.interactions.length === 0) return;
    const Interaction = mongoose.model('Interaction');
    await Interaction.deleteMany({ _id: { $in: chat.interactions } });
});

// Indexes to speed up lookups from interaction -> chat and filtering by pageLanguage
ChatSchema.index({ interactions: 1 });
ChatSchema.index({ pageLanguage: 1 });
ChatSchema.index({ createdAt: 1 });
ChatSchema.index({ user: 1 });
// chatId had no index at all until this was added (schema declaration only -
// this doesn't prove the index exists on the deployed DocumentDB cluster,
// see AGENTS.md's DocumentDB compatibility section). Every exact-match
// lookup (db-chat.js's Chat.findOne({ chatId })) was already an unindexed
// full collection scan; db-chat-search.js's new partial-match $regex search
// makes that same gap matter more.
ChatSchema.index({ chatId: 1 });
// AccountPage's "Assigned to me" table looks this up per signed-in user.
ChatSchema.index({ assignedTo: 1 });

export const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);
