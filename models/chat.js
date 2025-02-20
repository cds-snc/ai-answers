import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true },
    interactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Interaction',
        default: [],
      },
    ],
    aiProvider: { type: String, required: false, default: '' },
    searchProvider: { type: String, required: false, default: '' },
    pageLanguage: { type: String, required: false, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
    id: false,
  }
);

export const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);
