import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { parseString } from 'fast-csv';
import { extname } from 'node:path';
import { ExperimentalDataset } from '../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../models/experimentalDatasetRow.js';
import { ExperimentalBatch } from '../../models/experimentalBatch.js';

const escapeRegex = (input = '') => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const QUESTION_ALIASES = ['question', 'problemdetails', 'problem details'];
const CHAT_ID_ALIASES = ['chatid'];
const REFERRING_URL_ALIASES = ['referringurl', 'url'];

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
    async createFromUpload(fileBuffer, mimetype, metadata, userId, fileName = '') {
        // Parse file
        const parsedRows = await this._parseFile(fileBuffer, mimetype, fileName);
        const rows = parsedRows.map(row => this._normalizeUploadedRow(row, metadata.type));

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
                type: metadata.type || 'question-only',
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

    async _parseFile(buffer, mimetype, fileName = '') {
        try {
            const format = this._detectUploadFormat(mimetype, fileName);
            const rawRows = format === 'xlsx'
                ? await this._parseXlsx(buffer)
                : await this._parseCsv(buffer);

            return this._sanitizeParsedRows(rawRows);
        } catch (err) {
            throw new Error(`Failed to parse file: ${err.message}`);
        }
    }

    _detectUploadFormat(mimetype, fileName = '') {
        const extension = extname(String(fileName || '')).toLowerCase();
        if (extension === '.xls') {
            throw new Error('Legacy .xls files are not supported. Please upload .xlsx or .csv.');
        }

        if (extension === '.xlsx') {
            return 'xlsx';
        }

        if (extension === '.csv') {
            return 'csv';
        }

        const normalizedMime = String(mimetype || '').toLowerCase();
        if (normalizedMime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            return 'xlsx';
        }

        if (normalizedMime === 'text/csv' || normalizedMime === 'application/csv') {
            return 'csv';
        }

        throw new Error('Only .xlsx and .csv files are supported');
    }

    async _parseXlsx(buffer) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            return [];
        }

        const headerRow = worksheet.getRow(1);
        const columnCount = Math.max(headerRow.actualCellCount || 0, worksheet.columnCount || 0);
        if (columnCount === 0) {
            return [];
        }

        const headers = [];
        for (let col = 1; col <= columnCount; col++) {
            headers.push(this._sanitizeImportedKey(headerRow.getCell(col).value));
        }

        const rows = [];
        const lastRow = worksheet.actualRowCount || worksheet.rowCount || 0;
        for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const rawRow = {};
            for (let col = 0; col < headers.length; col++) {
                const header = headers[col];
                if (!header) {
                    continue;
                }

                rawRow[header] = this._normalizeCellValue(row.getCell(col + 1).value);
            }
            rows.push(rawRow);
        }

        return rows;
    }

    async _parseCsv(buffer) {
        const text = buffer.toString('utf8').replace(/^\uFEFF/, '');

        return await new Promise((resolve, reject) => {
            const rawRows = [];
            let headers = null;

            parseString(text, { headers: false, ignoreEmpty: true })
                .on('error', reject)
                .on('data', (row) => {
                    if (!headers) {
                        headers = row.map(header => this._sanitizeImportedKey(header));
                        return;
                    }

                    const rawRow = {};
                    for (let i = 0; i < headers.length; i++) {
                        const header = headers[i];
                        if (!header) {
                            continue;
                        }

                        rawRow[header] = this._normalizeCellValue(row[i]);
                    }
                    rawRows.push(rawRow);
                })
                .on('end', () => resolve(rawRows));
        });
    }

    _sanitizeParsedRows(rows) {
        return rows.map(row => {
            const sanitizedRow = {};
            for (const [key, value] of Object.entries(row)) {
                const safeKey = this._sanitizeImportedKey(key);
                if (!this._shouldImportColumn(safeKey, value)) {
                    continue;
                }
                sanitizedRow[safeKey] = value;
            }
            return sanitizedRow;
        }).filter(row => Object.keys(row).length > 0);
    }

    _sanitizeImportedKey(input = '') {
        const normalized = this._normalizeCellValue(input);
        if (normalized === undefined || normalized === null || typeof normalized === 'object') {
            return '';
        }

        return String(normalized).replace(/[.$]/g, '_').trim();
    }

    _normalizeCellValue(value) {
        if (value === undefined || value === null) {
            return value;
        }

        if (value instanceof Date) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(item => this._normalizeCellValue(item));
        }

        if (typeof value !== 'object') {
            return value;
        }

        if (Array.isArray(value.richText)) {
            return value.richText.map(part => part?.text ?? '').join('');
        }

        if (value.text !== undefined && value.text !== null) {
            return value.text;
        }

        if (value.hyperlink && value.text !== undefined) {
            return value.text;
        }

        if (value.result !== undefined) {
            return this._normalizeCellValue(value.result);
        }

        return value;
    }

    _validateRows(rows, type) {
        const errors = [];

        const requiredColumns = {
            'question-only': [
                { question: ['question', 'problemdetails', 'problem details'] }
            ],
            'qa-pair': [
                { question: ['question', 'problemdetails', 'problem details'] },
                'answer'
            ],
        };

        const required = requiredColumns[type] || requiredColumns['question-only'];
        if (rows.length === 0) {
            errors.push('File contains no data rows');
        }

        if (rows.length > 0) {
            const firstRow = rows[0];
            const keysNormalized = Object.keys(firstRow).map(k => this._normalizeColumnKey(k));

            for (const req of required) {
                let canonicalName = null;
                let alternatives = [];

                if (typeof req === 'string') {
                    canonicalName = req;
                    alternatives = [req];
                } else if (typeof req === 'object' && req !== null) {
                    canonicalName = Object.keys(req)[0];
                    alternatives = Array.isArray(req[canonicalName]) ? req[canonicalName] : [req[canonicalName]];
                }

                const altNormalized = alternatives.map(a => this._normalizeColumnKey(a));
                const hasCol = keysNormalized.some(k => altNormalized.includes(k));

                if (!hasCol) {
                    errors.push(`Missing required column: "${canonicalName || JSON.stringify(req)}"`);
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

    _normalizeColumnKey(input = '') {
        return String(input)
            .toLowerCase()
            .replace(/[\s_-]+/g, '')
            .trim();
    }

    _normalizeUploadedRow(row, type) {
        const normalized = { ...row };
        const questionKey = this._findColumnKey(normalized, QUESTION_ALIASES);

        if (questionKey && questionKey !== 'question') {
            normalized.question = normalized[questionKey];
            delete normalized[questionKey];
        }

        const answerKey = this._findColumnKey(normalized, ['answer', 'response', 'newanswer', 'comparison', 'comparisonanswer']);
        if (answerKey) {
            if (type === 'qa-pair') {
                normalized.answer = normalized[answerKey];
                if (answerKey !== 'answer') {
                    delete normalized[answerKey];
                }
            } else {
                delete normalized[answerKey];
            }
        }

        const chatIdKey = this._findColumnKey(normalized, CHAT_ID_ALIASES);
        if (chatIdKey) {
            normalized.chatId = normalized[chatIdKey];
            if (chatIdKey !== 'chatId') {
                delete normalized[chatIdKey];
            }
        }

        const referringUrlKey = this._findColumnKey(normalized, REFERRING_URL_ALIASES);
        if (referringUrlKey) {
            normalized.referringUrl = normalized[referringUrlKey];
            if (referringUrlKey !== 'referringUrl') {
                delete normalized[referringUrlKey];
            }
        }

        return normalized;
    }

    _shouldImportColumn(key, value) {
        if (!key) {
            return false;
        }

        if (/^__EMPTY(?:_\d+)?$/.test(key)) {
            return false;
        }

        if (value === undefined || value === null) {
            return false;
        }

        if (typeof value === 'string' && value.trim() === '') {
            return false;
        }

        return true;
    }

    _findColumnKey(row, aliases = []) {
        const normalizedAliases = aliases.map(alias => this._normalizeColumnKey(alias));
        return Object.keys(row).find(key => normalizedAliases.includes(this._normalizeColumnKey(key)));
    }

    _buildPairKey(row, pairKeyColumn) {
        if (pairKeyColumn) {
            const explicitKey = this._findColumnKey(row, [pairKeyColumn]);
            if (explicitKey && row[explicitKey]) {
                return String(row[explicitKey]);
            }
        }

        // Fallback: question-number pairing or hash
        const questionKey = this._findColumnKey(row, QUESTION_ALIASES);
        const question = questionKey ? row[questionKey] : '';
        const numMatch = question.match(/^(\d{1,3})\.\s*/);
        if (numMatch) {
            return numMatch[1].padStart(3, '0');
        }

        return crypto.createHash('md5').update(question.toLowerCase().trim()).digest('hex');
    }

    async getDatasetRows(datasetId, options = {}) {
        const { page = 1, limit = 50 } = options;
        const skip = (page - 1) * limit;

        const [rows, total] = await Promise.all([
            ExperimentalDatasetRow.find({ experimentalDataset: datasetId })
                .sort({ rowIndex: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ExperimentalDatasetRow.countDocuments({ experimentalDataset: datasetId })
        ]);

        return {
            rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    async list(options = {}) {
        const { page = 1, limit = 20 } = options;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            ExperimentalDataset.find()
                .populate('createdBy', 'email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ExperimentalDataset.countDocuments()
        ]);

        // Analysis run counts per dataset, so the list can show which
        // datasets have suite history at a glance.
        const runCounts = data.length > 0
            ? await ExperimentalBatch.aggregate([
                { $match: { type: 'analysis', 'config.datasetId': { $in: data.map(d => d._id) } } },
                { $group: { _id: '$config.datasetId', count: { $sum: 1 } } }
            ])
            : [];
        const countByDatasetId = new Map(runCounts.map(rc => [String(rc._id), rc.count]));

        return {
            data: data.map(d => {
                const obj = d.toObject();
                obj.runCount = countByDatasetId.get(String(d._id)) || 0;
                return obj;
            }),
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
