import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  englishAnswer: { type: String, required: false, default: '' },
  content: { type: String, required: false, default: '' },
  sentences: [{ type: String, required: false, default: '' }],
  citation: { type: mongoose.Schema.Types.ObjectId, ref: 'Citation' },
  inputTokens: { type: String, required: false, default: '' },
  outputTokens: { type: String, required: false, default: '' },
  model: { type: String, required: false, default: '' },
  answerType: { type: String, required: false, default: '' },
  tools: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tool' }], // Reference Tool documents instead of storing directly
},{
  timestamps: true, versionKey: false,
  id: false,
});

export const Answer = mongoose.models.Answer || mongoose.model('Answer', answerSchema);
