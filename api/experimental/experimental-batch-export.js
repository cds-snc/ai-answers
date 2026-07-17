import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';
import ExperimentalAnalyzerRegistry from '../../services/experimental/ExperimentalAnalyzerRegistry.js';

const stringifyComplexValue = (value) => {
    try {
        return JSON.stringify(value, (_key, innerValue) => {
            if (innerValue instanceof Date) {
                return innerValue.toISOString();
            }
            if (typeof innerValue === 'bigint') {
                return innerValue.toString();
            }
            return innerValue;
        });
    } catch (_err) {
        return String(value);
    }
};

const normalizeExcelValue = (value) => {
    if (value === null || value === undefined) {
        return value;
    }

    if (Buffer.isBuffer(value)) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    if (Array.isArray(value)) {
        return stringifyComplexValue(value);
    }

    if (typeof value === 'object') {
        if (typeof value.toHexString === 'function' || value._bsontype === 'ObjectId') {
            return value.toString();
        }
        return stringifyComplexValue(value);
    }

    return value;
};

const CORE_HEADERS = ['appVersion', 'question', 'answer', 'redactedAnswer', 'referenceAnswer', 'flagged'];
const ANALYZER_DEBUG_COLUMNS = new Set(['flagged', 'differenceFound']);

const resolveAnalyzerId = (config = {}) => {
    if (typeof config.analyzerId === 'string' && config.analyzerId.trim()) {
        return config.analyzerId.trim();
    }

    if (Array.isArray(config.analyzerIds)) {
        const firstAnalyzerId = config.analyzerIds
            .map((id) => String(id || '').trim())
            .find(Boolean);
        if (firstAnalyzerId) {
            return firstAnalyzerId;
        }
    }

    return '';
};

const buildOrderedHeaders = (flattenedItems, analyzerId = '', analyzerOutputColumns = []) => {
    const headerList = [];
    const headerSet = new Set();

    flattenedItems.forEach((item) => {
        Object.keys(item).forEach((key) => {
            if (!headerSet.has(key)) {
                headerSet.add(key);
                headerList.push(key);
            }
        });
    });

    const priorityHeaders = CORE_HEADERS.filter((header) => headerSet.has(header));
    const analysisPrefix = analyzerId ? `analysisResults.${analyzerId}.` : '';
    const analysisHeaders = [];

    if (analysisPrefix) {
        const orderedAnalyzerColumns = [
            ...analyzerOutputColumns.filter((column) => !ANALYZER_DEBUG_COLUMNS.has(column)),
            ...analyzerOutputColumns.filter((column) => ANALYZER_DEBUG_COLUMNS.has(column))
        ];
        const analysisSeen = new Set();

        orderedAnalyzerColumns.forEach((column) => {
            const header = `${analysisPrefix}${column}`;
            if (headerSet.has(header) && !analysisSeen.has(header)) {
                analysisHeaders.push(header);
                analysisSeen.add(header);
            }
        });

        headerList.forEach((header) => {
            if (header.startsWith(analysisPrefix) && !analysisSeen.has(header)) {
                analysisHeaders.push(header);
                analysisSeen.add(header);
            }
        });
    }

    const usedHeaders = new Set([...priorityHeaders, ...analysisHeaders]);
    const remainingHeaders = headerList.filter((header) => !usedHeaders.has(header));
    const dateHeaders = remainingHeaders.filter((header) =>
        flattenedItems.some((item) => item[header] instanceof Date)
    );
    const nonDateHeaders = remainingHeaders.filter((header) => !dateHeaders.includes(header));
    const tailHeaders = nonDateHeaders.filter((header) =>
        (header.startsWith('reference') && header !== 'referenceAnswer') || header.startsWith('originalData')
    );
    const regularHeaders = nonDateHeaders.filter((header) => !tailHeaders.includes(header));

    return [...priorityHeaders, ...analysisHeaders, ...regularHeaders, ...tailHeaders, ...dateHeaders];
};

/**
 * GET /api/experimental/batch-export/:id
 */
async function handler(req, res) {
    try {
        const { id } = req.params;
        const { format } = req.query;

        const batch = await ExperimentalBatch.findById(id)
            .select('appVersion config.analyzerId config.analyzerIds')
            .lean();
        const appVersion = batch?.appVersion || '';

        // Fetch all items
        const items = await ExperimentalBatchItem.find({ experimentalBatch: id })
            .sort({ rowIndex: 1, trialIndex: 1 })
            .lean();
        const exportItems = items.map(item => ({
            ...item,
            appVersion
        }));

        if (format === 'excel') {
            const ExcelJS = (await import('exceljs')).default;
            const flatten = (await import('flat')).flatten;

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Batch Results');

            if (exportItems.length > 0) {
                const analyzerId = resolveAnalyzerId(batch?.config || {});
                let analyzerOutputColumns = [];
                if (analyzerId) {
                    try {
                        const analyzerDef = await ExperimentalAnalyzerRegistry.get(analyzerId);
                        analyzerOutputColumns = Array.isArray(analyzerDef?.outputColumns)
                            ? analyzerDef.outputColumns
                            : [];
                    } catch (lookupError) {
                        console.warn('Batch export analyzer metadata lookup failed:', lookupError);
                    }
                }

                // Flatten and filter internal/buffer fields
                const flattenedItems = exportItems.map(item => {
                    const flatItem = flatten(item, { safe: true });
                    const filtered = { appVersion };

                    for (const key in flatItem) {
                        const val = flatItem[key];

                        // Exclude internal Mongo fields and buffer fields
                        if (key === 'appVersion') continue;
                        if (key === '_id' || key === 'experimentalBatch' || key === '__v') continue;
                        if (Buffer.isBuffer(val)) continue;

                        filtered[key] = normalizeExcelValue(val);
                    }
                    return filtered;
                });

                const orderedHeaders = buildOrderedHeaders(flattenedItems, analyzerId, analyzerOutputColumns);

                const columnConfigs = orderedHeaders.map(h => ({ header: h, key: h }));
                worksheet.columns = columnConfigs;
                worksheet.addRows(flattenedItems);

                // Auto-size columns based on content
                columnConfigs.forEach(conf => {
                    const column = worksheet.getColumn(conf.key);
                    let maxCharLength = 0;
                    if (conf.header) maxCharLength = Math.max(maxCharLength, conf.header.length);

                    column.eachCell({ includeEmpty: true }, (cell) => {
                        const val = cell.value;
                        if (val) {
                            const len = val.toString().length;
                            if (len > maxCharLength) maxCharLength = len;
                        }
                    });

                    // Limit max width to 100 characters to prevent excessive stretching for very long text
                    // Add a small buffer (e.g., 2 chars)
                    column.width = Math.min(100, maxCharLength + 2);
                });
            }

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=batch-${id}-results.xlsx`);
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        res.json(exportItems);
    } catch (error) {
        console.error('Batch Export Error:', error);
        res.status(500).json({ error: 'Failed to export batch' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
