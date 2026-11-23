import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// One document per "Run eval analysis" execution on the partner dashboard.
// Stores the computed stats and the insights so past reports can be
// re-displayed without re-running any LLM calls.
//
// v1 docs also stored a `rows` snapshot, a `programs` list, `progress` and a
// `crossTab`, with statuses 'classifying'/'synthesizing'. Those paths are no
// longer written; `crossTab` stays in the schema so old reports still render
// it, and reads use .lean(), so the other old fields don't need declaring.
const evalAnalysisSchema = new Schema({
    department: { type: String, required: true },
    startDate: { type: Date, required: false, default: null },
    endDate: { type: Date, required: false, default: null },
    // Raw filter snapshot as applied on the dashboard when the run started.
    filters: { type: Schema.Types.Mixed, required: false, default: {} },
    // Dashboard language at run time; the narrative is generated in this
    // language only (switching languages requires a re-run).
    language: { type: String, required: true, default: 'en' },
    status: {
        type: String,
        required: true,
        enum: ['running', 'complete', 'error'],
        default: 'running'
    },
    evalCount: { type: Number, required: false, default: 0 },
    // Rows with a missing/blank totalScore: excluded from score stats,
    // reported in the header.
    excludedCount: { type: Number, required: false, default: 0 },
    // Deterministic stats (evaluator table, EN/FR comparison, etc.).
    stats: { type: Schema.Types.Mixed, required: false, default: null },
    // How many rows the insights call was sent, of how many in scope
    // (MAX_INSIGHT_ROWS caps the sent counts), for "based on N of M".
    insightInput: {
        nonPerfectTotal: { type: Number, required: false, default: 0 },
        nonPerfectSent: { type: Number, required: false, default: 0 },
        contentIssueTotal: { type: Number, required: false, default: 0 },
        contentIssueSent: { type: Number, required: false, default: 0 }
    },
    // v1 only: scores by program—action group. Not written by new runs.
    crossTab: { type: Schema.Types.Mixed, required: false, default: null },
    // Narrative sections from the insights call, generated in `language`.
    insights: { type: Schema.Types.Mixed, required: false, default: null },
    requestedBy: { type: String, required: false, default: '' },
    error: { type: String, required: false, default: '' }
}, {
    timestamps: true, versionKey: false,
    id: false,
});

evalAnalysisSchema.index({ department: 1, createdAt: -1 });

export const EvalAnalysis = mongoose.models.EvalAnalysis || mongoose.model('EvalAnalysis', evalAnalysisSchema);
