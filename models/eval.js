import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// New sub-schema for sentence match traceability
const sentenceMatchTraceSchema = new Schema({
    sourceIndex: { type: Number, required: true }, // Index of the sentence in the current interaction's answer
    sourceSentenceText: { type: String, required: false, default: '' }, // Added: Actual text of the source sentence
    matchedInteractionId: { type: Schema.Types.ObjectId, ref: 'Interaction', required: false, default: null }, // ID of the interaction providing the expert feedback (optional for unmatched)
    matchedChatId: { type: String, required: false, default: '' }, // Store chatId string for traceability
    matchedSentenceIndex: { type: Number, required: false }, // Index of the sentence in the matched interaction's answer (optional for unmatched)
    matchedSentenceText: { type: String, required: false, default: '' }, // Actual text of the matched sentence
    matchedExpertFeedbackSentenceScore: { type: Number, required: false, default: null }, // Score given by expert for the matched sentence
    matchedExpertFeedbackSentenceExplanation: { type: String, required: false, default: '' }, // Explanation given by expert for the matched sentence
    similarity: { type: Number, required: false }, // Similarity score between source and matched sentence (optional for unmatched)
    matchStatus: { type: String, required: false, default: 'not_found' }, // 'matched', 'not_found', 'not_in_top_matches', etc.
    matchExplanation: { type: String, required: false, default: '' } // Explanation for why a match was not found or invalid
}, { _id: false });

const evalSchema = new Schema({
    expertFeedback: { 
        type: Schema.Types.ObjectId, 
        ref: 'ExpertFeedback',
        required: false
    },
    similarityScores: {
        sentences: [{ type: Number, required: false, default: 0 }],
        citation: { type: Number, required: false, default: 0 } // Added citation similarity
    },
    sentenceMatchTrace: [sentenceMatchTraceSchema], // Added traceability field
    processed: { type: Boolean, required: true, default: true }, // Flag to track if interaction has been processed
    hasMatches: { type: Boolean, required: true, default: false }, // Flag to track if matches were found
    // Top-level reason for no-match evaluations (optional)
    noMatchReasonType: { type: String, required: false, default: '' }, // e.g., 'no_qa_match', 'no_sentence_match', 'no_citation_match', etc.
    noMatchReasonMsg: { type: String, required: false, default: '' }, // Human-readable explanation for the no-match
    // Fallback logic fields
    fallbackType: { type: String, required: false, default: '' }, // e.g., 'qa-high-score'
    fallbackSourceChatId: { type: String, required: false, default: '' }, // chatId of the fallback source interaction
}, { 
    timestamps: true, 
    versionKey: false,
    id: false
});

export const Eval = mongoose.models.Eval || mongoose.model('Eval', evalSchema);