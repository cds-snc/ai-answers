import { ExperimentalBatchItem } from '../../models/experimentalBatchItem.js';
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

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

/**
 * GET /api/experimental/batch-export/:id
 */
async function handler(req, res) {
    try {
        const { id } = req.params;
        const { format } = req.query;

        // Fetch all items
        const items = await ExperimentalBatchItem.find({ experimentalBatch: id })
            .sort({ rowIndex: 1 })
            .lean();

        if (format === 'excel') {
            const ExcelJS = (await import('exceljs')).default;
            const flatten = (await import('flat')).flatten;

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Batch Results');

            if (items.length > 0) {
                // Flatten and filter internal/buffer fields
                const flattenedItems = items.map(item => {
                    const flatItem = flatten(item, { safe: true });
                    const filtered = {};

                    for (const key in flatItem) {
                        const val = flatItem[key];

                        // Exclude internal Mongo fields and buffer fields
                        if (key === '_id' || key === 'experimentalBatch' || key === '__v') continue;
                        if (Buffer.isBuffer(val)) continue;

                        filtered[key] = normalizeExcelValue(val);
                    }
                    return filtered;
                });

                // Extract all unique headers
                const headers = new Set();
                flattenedItems.forEach(item => Object.keys(item).forEach(k => headers.add(k)));

                const headerList = Array.from(headers);
                const dateHeaders = headerList.filter((header) =>
                    flattenedItems.some((item) => item[header] instanceof Date)
                );
                const nonDateHeaders = headerList.filter((header) => !dateHeaders.includes(header));
                const orderedHeaders = [...nonDateHeaders, ...dateHeaders];

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

        res.json(items);
    } catch (error) {
        console.error('Batch Export Error:', error);
        res.status(500).json({ error: 'Failed to export batch' });
    }
}

export default function (req, res) {
    return withProtection(handler, authMiddleware, adminMiddleware)(req, res);
}
