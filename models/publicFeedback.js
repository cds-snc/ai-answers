import mongoose from 'mongoose';

const publicFeedbackSchema = new mongoose.Schema({
  feedback: { type: String, required: false, default: '' },
  publicFeedbackReason: { type: String, required: false, default: '' },
  publicFeedbackScore: { type: Number, required: false, default: null }
}, {
  timestamps: true,
  versionKey: false,
  id: false
});

export const PublicFeedback = mongoose.models.PublicFeedback || mongoose.model('PublicFeedback', publicFeedbackSchema);
