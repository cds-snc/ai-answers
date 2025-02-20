import mongoose from 'mongoose';

const InteractionSchema = new mongoose.Schema(
  {
    interactionId: {
      type: String,
      required: false,
      default: '',
    },
    referringUrl: { type: String, required: false, default: '' },
    responseTime: {
      type: String,
      required: false,
      default: '',
    },
    answer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Answer',
      default: null,
    },
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },
    expertFeedback: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpertFeedback',
      default: null,
    },
    context: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Context',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    id: false,
  }
);

export const Interaction =
  mongoose.models.Interaction || mongoose.model('Interaction', InteractionSchema);
