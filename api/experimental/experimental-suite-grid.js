import { ExperimentalDataset } from '../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../models/experimentalDatasetRow.js';
import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import { requireObjectIdString } from '../util/db-query.js';
import { getItemVerdict } from '../../src/utils/experimental/batchItems.js';

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
            .select('name description type category role rowCount')
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
            .select('name runLabel appVersion status createdAt config.analyzerIds config.analyzerId config.aiProvider config.workflow summary')
            .sort({ createdAt: -1 })
            .limit(MAX_RUNS)
            .lean();
        runs.reverse(); // oldest first: v0 at the top, latest run at the bottom

        const runIds = runs.map(run => run._id);
        const items = runIds.length > 0
            ? await ExperimentalBatchItem.find({ experimentalBatch: { $in: runIds } })
                .select('experimentalBatch rowIndex flagged match status')
                .lean()
            : [];

        const cells = {};
        for (const item of items) {
            const runId = String(item.experimentalBatch);
            if (!cells[runId]) cells[runId] = {};
            cells[runId][item.rowIndex] = { verdict: getItemVerdict(item) };
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
