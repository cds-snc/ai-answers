import mongoose from 'mongoose';

const expectedDim = Number(process.env.EMBEDDING_DIM || 2000);

function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}
function validVector(vec) {
  return Array.isArray(vec) && vec.length > 0 && vec.every(isFiniteNumber);
}

const vectorValidators = [
  {
    validator: validVector,
    message: 'Vector must be a non-empty array of finite numbers',
  },
  {
    // optional: enforce a specific dimension if EMBEDDING_DIM is set
    validator: (arr) => !expectedDim || arr.length === expectedDim,
    message: (props) =>
      `Vector length ${props.value?.length} != expected ${expectedDim}`,
  },
];

const embeddingSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    interactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interaction', required: true },
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    answerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Answer', required: true },

    // QA-level vector used by the 'qa_vector_index'
    questionsAnswerEmbedding: { type: [Number], required: true, validate: vectorValidators },

    // Legacy fields (kept for backwards compatibility; not used for search in Option B)
    questionEmbedding: { type: [Number], required: false, default: undefined },
    questionsEmbedding: { type: [Number], required: false, default: undefined },
    answerEmbedding: { type: [Number], required: false, default: undefined },

    // Denormalized retrieval metadata for DocDB 8 pre-filtered QA searches.
    pageLanguage: { type: String, required: false, default: undefined },
    interactionLanguage: { type: String, required: false, default: undefined },
    expertFeedbackId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpertFeedback', required: false, default: undefined },
    expertFeedbackTotalScore: { type: Number, required: false, default: undefined },
    expertFeedbackCreatedAt: { type: Date, required: false, default: undefined },
    expertFeedbackNeverStale: { type: Boolean, required: false, default: undefined },

  },
  {
    collection: 'embeddings',
    timestamps: true,
    versionKey: false,
    id: false,
  }
);

// Indexes to speed up lookups used by vector/search services
// - interactionId: used to join embeddings -> interactions and filter by interaction set
// - chatId: used when resolving/chat-level filters
embeddingSchema.index({ interactionId: 1 });
embeddingSchema.index({ chatId: 1 });
embeddingSchema.index({ expertFeedbackId: 1, pageLanguage: 1, expertFeedbackTotalScore: 1, expertFeedbackCreatedAt: 1 });
embeddingSchema.index({ expertFeedbackId: 1, interactionLanguage: 1, expertFeedbackTotalScore: 1, expertFeedbackCreatedAt: 1 });

export const Embedding =
  mongoose.models.Embedding || mongoose.model('Embedding', embeddingSchema);
