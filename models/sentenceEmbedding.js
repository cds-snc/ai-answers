// models/sentenceEmbedding.js
import mongoose from 'mongoose';

const expectedDim = Number(process.env.EMBEDDING_DIM || 2000);

function isFiniteNumber(x) {
  return typeof x === 'number' && Number.isFinite(x);
}
function validVector(vec) {
  return Array.isArray(vec) && vec.length > 0 && vec.every(isFiniteNumber);
}

const vectorValidators = [
  { validator: validVector, message: 'Vector must be a non-empty array of finite numbers' },
  { validator: arr => !expectedDim || arr.length === expectedDim,
    message: props => `Vector length ${props.value?.length} != expected ${expectedDim}` },
];

const sentenceEmbeddingSchema = new mongoose.Schema(
  {
    parentEmbeddingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Embedding', required: true, index: true },
    sentenceIndex: { type: Number, required: true, min: 0 },
    embedding: { type: [Number], required: true, validate: vectorValidators },
    createdAt: { type: Date, default: () => new Date() },
  },
  {
    collection: 'sentence_embeddings',
    versionKey: false,
    id: false,
  }
);

export const SentenceEmbedding =
  mongoose.models.SentenceEmbedding ||
  mongoose.model('SentenceEmbedding', sentenceEmbeddingSchema);
