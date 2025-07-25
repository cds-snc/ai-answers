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

export const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);