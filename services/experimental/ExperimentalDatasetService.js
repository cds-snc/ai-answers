import crypto from 'crypto';
import xlsx from 'xlsx';
import { ExperimentalDataset } from '../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../models/experimentalDatasetRow.js';

const escapeRegex = (input = '') => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class ValidationError extends Error {
    constructor(errors) {
        super('Validation failed');
        this.errors = errors;
        this.name = 'ValidationError';
    }
}

export class DuplicateError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DuplicateError';
    }
}

class ExperimentalDatasetService {
    /**
     * Validate uploaded file and create dataset with rows.
     */
    async createFromUpload(fileBuffer, mimetype, metadata, userId) {
        // Parse file
        const rows = this._parseFile(fileBuffer, mimetype);

        // Validate structure
        const validation = this._validateRows(rows, metadata.type);
        if (!validation.valid) {
            throw new ValidationError(validation.errors);
        }

        // Check for duplicate name
        const existing = await ExperimentalDataset.findOne({
            name: { $regex: `^${escapeRegex(metadata.name)}$`, $options: 'i' }
        });
        if (existing) {
            throw new DuplicateError(`Dataset "${metadata.name}" already exists`);
        }

        // Duplicate-content warning (non-blocking by default)
        const contentHash = this._computeContentHash(rows);
        const existingByContent = await ExperimentalDataset.findOne({ contentHash });
        const duplicateContentWarning = existingByContent ? {
            existingDatasetId: existingByContent._id,
            existingName: existingByContent.name,
        } : null;

        // Create dataset and rows
        let dataset;
        try {
            const datasets = await ExperimentalDataset.create([{
                ...metadata,
                rowCount: rows.length,
                columns: this._inferColumns(rows),
                contentHash,
                createdBy: userId,
            }]);
            dataset = datasets[0];

            const datasetRows = rows.map((row, idx) => ({
                experimentalDataset: dataset._id,
                rowIndex: idx + 1,
                pairKey: this._buildPairKey(row, metadata.pairKeyColumn),
                data: row,
            }));

            await ExperimentalDatasetRow.insertMany(datasetRows);
            return { dataset, warning: duplicateContentWarning };
        } catch (err) {
            if (err?.code === 11000) {
                throw new DuplicateError(`Dataset "${metadata.name}" already exists`);
            }
            // Cleanup on failure
            if (dataset) {
                await ExperimentalDataset.findByIdAndDelete(dataset._id);
                await ExperimentalDatasetRow.deleteMany({ experimentalDataset: dataset._id });
            }
            throw err;
        }
    }

    _parseFile(buffer, mimetype) {
        try {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rawRows = xlsx.utils.sheet_to_json(worksheet);

            // DocumentDB/MongoDB 5.0+ don't permit top-level Mixed keys with dots or dollars
            // We must rewrite any offending column headers to underscores.
            return rawRows.map(row => {
                const sanitizedRow = {};
                for (const [key, value] of Object.entries(row)) {
                    // Replace all dots and dollars
                    const safeKey = key.replace(/[.$]/g, '_');
                    sanitizedRow[safeKey] = value;
                }
                return sanitizedRow;
            });
        } catch (err) {
            throw new Error(`Failed to parse file: ${err.message}`);
        }
    }

    _validateRows(rows, type) {
        const errors = [];
        const requiredColumns = {
            'question-only': ['question'],
            'qa-pair': ['question', 'answer'],
            'evaluation-set': ['question', 'answer'],
        };

        const required = requiredColumns[type] || [];
        if (rows.length === 0) {
            errors.push('File contains no data rows');
        }

        if (rows.length > 0) {
            const firstRow = rows[0];
            for (const col of required) {
                const hasCol = Object.keys(firstRow).some(
                    k => k.toLowerCase() === col.toLowerCase()
                );
                if (!hasCol) {
                    errors.push(`Missing required column: "${col}"`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    _computeContentHash(rows) {
        const str = JSON.stringify(rows);
        return crypto.createHash('sha256').update(str).digest('hex');
    }

    _inferColumns(rows) {
        if (rows.length === 0) return [];
        const firstRow = rows[0];
        return Object.keys(firstRow).map(key => ({
            name: key,
            type: typeof firstRow[key] === 'object' ? 'json' : typeof firstRow[key]
        }));
    }

    _buildPairKey(row, pairKeyColumn) {
        if (pairKeyColumn && row[pairKeyColumn]) {
            return String(row[pairKeyColumn]);
        }

        // Fallback: question-number pairing or hash
        const question = row.question || row.Question || '';
        const numMatch = question.match(/^(\d{1,3})\.\s*/);
        if (numMatch) {
            return numMatch[1].padStart(3, '0');
        }

        return crypto.createHash('md5').update(question.toLowerCase().trim()).digest('hex');
    }

    async list(options = {}) {
        const { page = 1, limit = 20 } = options;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            ExperimentalDataset.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
            ExperimentalDataset.countDocuments()
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    async deleteDataset(id) {
        const existing = await ExperimentalDataset.findById(id);
        if (!existing) return false;

        // Delete rows first, then the dataset
        await ExperimentalDatasetRow.deleteMany({ experimentalDataset: id });
        await ExperimentalDataset.findByIdAndDelete(id);
        return true;
    }
}

export default new ExperimentalDatasetService();
