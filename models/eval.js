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

// Reuse the sentenceMatchTrace schema and extend minimally to capture agent-based choices
sentenceMatchTraceSchema.add({
    // Optional: candidate sentences considered by the agent for this source sentence
    candidateChoices: [{
        text: { type: String, required: false, default: '' },
        matchedInteractionId: { type: Schema.Types.ObjectId, ref: 'Interaction', required: false, default: null },
        matchedChatId: { type: String, required: false, default: '' },
        matchedSentenceIndex: { type: Number, required: false },
        similarity: { type: Number, required: false },
        // Compressed checks output from sentenceCompare agent for this candidate
        // Shape: { numbers: {p:'p'|'f', r?}, dates_times: {...}, ... }
        checks: { type: Schema.Types.Mixed, required: false, default: null }
    }],
    // Index of the candidate chosen by the agent (into candidateChoices); null when agent not used
    agentSelectedIndex: { type: Number, required: false, default: null },
    // Short explanation or tag about the agent selection
    agentSelectionExplanation: { type: String, required: false, default: '' }
});

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
    // Store fallback candidate answer and citation text for traceability
    fallbackCandidateAnswerText: { type: String, required: false, default: '' },
    fallbackCandidateCitation: { type: String, required: false, default: '' },
    matchedCitationInteractionId: { type: String, required: false, default: '' }, // Citation match trace (interactionId string)
    matchedCitationChatId: { type: String, required: false, default: '' }, // Citation match trace
    // Sentence-compare agent usage (top-level)
    sentenceCompareUsed: { type: Boolean, required: false, default: false },
    sentenceCompareMeta: {
        provider: { type: String, required: false, default: '' },
        model: { type: String, required: false, default: '' },
        inputTokens: { type: Number, required: false, default: null },
        outputTokens: { type: Number, required: false, default: null },
        latencyMs: { type: Number, required: false, default: null }
    },
    // Fallback-compare agent usage (top-level)
    fallbackCompareUsed: { type: Boolean, required: false, default: false },
    fallbackCompareMeta: {
        provider: { type: String, required: false, default: '' },
        model: { type: String, required: false, default: '' },
        inputTokens: { type: Number, required: false, default: null },
        outputTokens: { type: Number, required: false, default: null },
        latencyMs: { type: Number, required: false, default: null }
    },
    fallbackCompareChecks: { type: Schema.Types.Mixed, required: false, default: null },
    fallbackCompareRaw: { type: Schema.Types.Mixed, required: false, default: null }
}, { 
    timestamps: true, 
    versionKey: false,
    id: false
});

export const Eval = mongoose.models.Eval || mongoose.model('Eval', evalSchema);
