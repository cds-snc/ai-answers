import { ExperimentalDataset } from '../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../models/experimentalDatasetRow.js';
import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { requireObjectIdString } from '../util/db-query.js';
import { getItemVerdict } from '../../src/utils/experimental/batchItems.js';
import { BASELINE_ANSWER_ALIASES } from '../../services/experimental/datasetColumns.js';

// Analyzers whose per-item verdicts are meaningless without a comparison
// answer: similar-answer just reports "no baseline" (all green), no-analyzer
// never scores. Runs of these without reference answers or a baseline run are
// capture runs, not scored runs.
const REFERENCE_REQUIRED_ANALYZERS = ['similar-answer', 'no-analyzer'];

const hasReferenceAnswer = (row) => BASELINE_ANSWER_ALIASES
    .some(key => String(row?.data?.[key] || '').trim() !== '');

const resolveAnalyzerIds = (config = {}) => {
    if (Array.isArray(config.analyzerIds) && config.analyzerIds.length > 0) return config.analyzerIds;
    return config.analyzerId ? [config.analyzerId] : [];
};

// Bound the grid: the suite view shows the most recent runs (oldest first,
// like v0 -> vN). Older runs stay reachable from the analysis runs list.
const MAX_RUNS = 30;

const CASE_TYPES = ['control', 'edge', 'boundary'];

const normalizeCaseType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return CASE_TYPES.includes(normalized) ? normalized : '';
};

/**
 * GET /api/experimental/experimental-suite-grid?datasetId=...
 *
 * Everything the suite grid page needs in one call:
 * - tests: the dataset's rows in run order (position matches item.rowIndex)
 * - runs: analysis batches executed against the dataset, oldest first
 * - cells: per run, per test position, the item verdict
 */
async function handler(req, res) {
    try {
        let { datasetId } = req.query;
        datasetId = requireObjectIdString(datasetId, 'datasetId');

        const dataset = await ExperimentalDataset.findById(datasetId)
            .select('name description type category rowCount')
            .lean();
        if (!dataset) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        const rows = await ExperimentalDatasetRow.find({ experimentalDataset: datasetId })
            .sort({ rowIndex: 1 })
            .lean();

        // Position is 1-based over the sorted rows — the same order and
        // numbering ExperimentalBatchService uses when creating batch items.
        const tests = rows.map((row, idx) => ({
            position: idx + 1,
            testName: String(row.data?.testName || '').trim() || `Q${idx + 1}`,
            caseType: normalizeCaseType(row.data?.caseType),
            question: String(row.data?.question || '')
        }));

        const runs = await ExperimentalBatch.find({
            type: 'analysis',
            'config.datasetId': datasetId
        })
            .select('name runLabel appVersion status createdAt config.analyzerIds config.analyzerId config.aiProvider config.workflow config.baselineRunId config.trials summary')
            .sort({ createdAt: -1 })
            .limit(MAX_RUNS)
            .lean();
        runs.reverse(); // oldest first: v0 at the top, latest run at the bottom

        // Mark capture runs: nothing was compared, so their all-green cells
        // must not read as passes in the grid.
        const datasetHasReferenceAnswer = rows.some(hasReferenceAnswer);
        for (const run of runs) {
            const analyzerIds = resolveAnalyzerIds(run.config || {});
            run.referenceCapture = !datasetHasReferenceAnswer
                && !run.config?.baselineRunId
                && analyzerIds.length > 0
                && analyzerIds.every(id => REFERENCE_REQUIRED_ANALYZERS.includes(id));
        }

        const runIds = runs.map(run => run._id);
        const items = runIds.length > 0
            ? await ExperimentalBatchItem.find({ experimentalBatch: { $in: runIds } })
                .select('experimentalBatch rowIndex trialIndex flagged match status')
                .sort({ rowIndex: 1, trialIndex: 1 })
                .lean()
            : [];

        // A cell aggregates every trial of one question in one run:
        // trials[] in trial order, passCount (k) and total (n) for k/n.
        const cells = {};
        for (const item of items) {
            const runId = String(item.experimentalBatch);
            if (!cells[runId]) cells[runId] = {};
            const cell = cells[runId][item.rowIndex]
                || (cells[runId][item.rowIndex] = { trials: [], passCount: 0, total: 0 });
            const raw = getItemVerdict(item);
            // Non-terminal trials (pending/processing/...) render as missing.
            const verdict = ['pass', 'flagged', 'error'].includes(raw) ? raw : 'missing';
            cell.trials.push(verdict);
            cell.total += 1;
            if (verdict === 'pass') cell.passCount += 1;
        }

        // Aggregate verdict per cell: pass = every trial passed (pass^n),
        // mixed = some passed, flagged/error = none passed.
        for (const runCells of Object.values(cells)) {
            for (const cell of Object.values(runCells)) {
                if (cell.trials.every(v => v === 'missing')) {
                    cell.verdict = 'missing';
                } else if (cell.passCount === cell.total) {
                    cell.verdict = 'pass';
                } else if (cell.passCount > 0) {
                    cell.verdict = 'mixed';
                } else {
                    cell.verdict = cell.trials.includes('error') ? 'error' : 'flagged';
                }
            }
        }

        res.json({ dataset, tests, runs, cells });
    } catch (error) {
        console.error('Suite Grid Error:', error);
        res.status(500).json({ error: 'Failed to load suite grid' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
