import mongoose from 'mongoose';

const InteractionSchema = new mongoose.Schema({
  interactionId: {
    type: String,
    required: false,
    default: ''
  },
  referringUrl: { type: String, required: false, default: '' },
  responseTime: {
    type: String,
    required: false,
    default: ''
  },
  answer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Answer',
    default: null
  },
  question: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    default: null
  },
  expertFeedback: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpertFeedback',
    default: null
  },
  publicFeedback: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PublicFeedback',
    default: null
  },
  autoEval: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Eval',
    default: null
  },
  context: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Context',
    default: null
  },
}, {
  timestamps: true,
  versionKey: false,
  id: false,
});

// Middleware to handle cascading delete of related documents when an interaction is deleted
InteractionSchema.pre('deleteMany', async function() {
  // Get the interactions that will be deleted
  const interactions = await this.model.find(this.getFilter());
  
  // Extract all the IDs of related documents
  const answerIds = interactions.map(i => i.answer).filter(Boolean);
  const questionIds = interactions.map(i => i.question).filter(Boolean);
  const expertFeedbackIds = interactions.map(i => i.expertFeedback).filter(Boolean);
  const publicFeedbackIds = interactions.map(i => i.publicFeedback).filter(Boolean);
  const contextIds = interactions.map(i => i.context).filter(Boolean);

  // Delete all related documents
  const Answer = mongoose.model('Answer');
  const Question = mongoose.model('Question');
  const ExpertFeedback = mongoose.model('ExpertFeedback');
  const PublicFeedback = mongoose.model('PublicFeedback');
  const Context = mongoose.model('Context');

  await Promise.all([
    Answer.deleteMany({ _id: { $in: answerIds } }),
    Question.deleteMany({ _id: { $in: questionIds } }),
    ExpertFeedback.deleteMany({ _id: { $in: expertFeedbackIds } }),
    PublicFeedback.deleteMany({ _id: { $in: publicFeedbackIds } }),
    Context.deleteMany({ _id: { $in: contextIds } })
  ]);
});

export const Interaction = mongoose.models.Interaction || mongoose.model('Interaction', InteractionSchema);