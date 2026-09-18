import mongoose from 'mongoose';
import { ASSIGN_NOTE_MAX_LENGTH } from '../src/constants/chatAssign.js';

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
  // If a short-circuit instant answer matched an existing chat/interaction,
  // store those optional IDs for traceability.
  instantAnswerChatId: {
    type: String,
    required: false,
    default: ''
  },
  instantAnswerInteractionId: {
    type: String,
    required: false,
    default: ''
  },
  workflow: {
    type: String,
    required: false,
    default: ''
  },
  appVersion: {
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
  // Question assignment (issue #1656): a partner/admin hands this question
  // to one partner user for review. Per question, not per chat - the
  // questions in one chat can belong to different departments and go to
  // different reviewers. Single assignee at a time; assigning an already-
  // assigned question is rejected (409 in chat-assign.js). No history kept.
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedOn: { type: Date, default: null },
  // Length enforced in chat-assign.js (findOneAndUpdate skips validators);
  // maxlength here is defense-in-depth for any other write path.
  assignedNotes: { type: String, default: '', maxlength: ASSIGN_NOTE_MAX_LENGTH },
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
InteractionSchema.pre('deleteMany', async function () {
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

// Indexes for quick lookup during dashboard aggregations
InteractionSchema.index({ expertFeedback: 1 });
InteractionSchema.index({ answer: 1 });
InteractionSchema.index({ autoEval: 1 });
InteractionSchema.index({ context: 1 });
InteractionSchema.index({ referringUrl: 1 });
InteractionSchema.index({ createdAt: 1 });
InteractionSchema.index({ question: 1 });
// AccountPage's assigned-questions table looks this up per signed-in user.
InteractionSchema.index({ assignedTo: 1 });

export const Interaction = mongoose.models.Interaction || mongoose.model('Interaction', InteractionSchema);
