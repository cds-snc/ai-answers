import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  redactedQuestion: { type: String, required: true, default: '' },
  language: { type: String, required: false, default: '' },
  englishQuestion: { type: String, required: false, default: '' },
}, {
  timestamps: true, versionKey: false,
  id: false,
});

export const Question = mongoose.models.Question || mongoose.model('Question', questionSchema);