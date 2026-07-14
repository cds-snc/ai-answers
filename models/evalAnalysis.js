import mongoose from 'mongoose';

const Schema = mongoose.Schema;

// One document per "Run eval analysis" execution on the partner dashboard.
// Stores a compact snapshot of the analyzed eval rows so classification chunks
// operate on stable data even if evals change mid-run, and so past reports can
// be re-displayed without re-running any LLM calls.
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
        enum: ['running', 'classifying', 'synthesizing', 'complete', 'error'],
        default: 'running'
    },
    progress: {
        classified: { type: Number, required: false, default: 0 },
        total: { type: Number, required: false, default: 0 }
    },
    evalCount: { type: Number, required: false, default: 0 },
    // Rows with a missing/blank totalScore: excluded from score stats,
    // reported in the header.
    excludedCount: { type: Number, required: false, default: 0 },
    // Compact snapshot of the analyzed rows (see EvalAnalysisService.toCompactRow).
    rows: { type: [Schema.Types.Mixed], required: false, default: [] },
    // Tier 1 deterministic stats (evaluator table, EN/FR comparison, etc.).
    stats: { type: Schema.Types.Mixed, required: false, default: null },
    // Program groups proposed by the classification pass.
    programs: { type: [String], required: false, default: [] },
    // Tier 2 cross-tab of score categories by program group and by action.
    crossTab: { type: Schema.Types.Mixed, required: false, default: null },
    // Tier 3 narrative sections, generated in `language`.
    insights: { type: Schema.Types.Mixed, required: false, default: null },
    requestedBy: { type: String, required: false, default: '' },
    error: { type: String, required: false, default: '' }
}, {
    timestamps: true, versionKey: false,
    id: false,
});

evalAnalysisSchema.index({ department: 1, createdAt: -1 });

export const EvalAnalysis = mongoose.models.EvalAnalysis || mongoose.model('EvalAnalysis', evalAnalysisSchema);
