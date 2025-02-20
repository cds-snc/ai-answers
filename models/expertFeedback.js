import mongoose, { model } from 'mongoose';
const Schema = mongoose.Schema;

const expertFeedbackSchema = new Schema(
  {
    totalScore: { type: Number, required: false, default: -1 },
    sentence1Score: { type: Number, required: false, default: -1 },
    sentence2Score: { type: Number, required: false, default: -1 },
    sentence3Score: { type: Number, required: false, default: -1 },
    sentence4Score: { type: Number, required: false, default: -1 },
    citationScore: { type: Number, required: false, default: -1 },
    answerImprovement: { type: String, required: false, default: '' },
    expertCitationUrl: { type: String, required: false, default: '' },
    feedback: { type: String, required: false, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
    id: false,
  }
);

export const ExpertFeedback =
  mongoose.models.ExpertFeedback || mongoose.model('ExpertFeedback', expertFeedbackSchema);
