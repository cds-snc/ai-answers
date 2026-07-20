import crypto from 'crypto';
import ExcelJS from 'exceljs';
import { parseString } from 'fast-csv';
import { extname } from 'node:path';
import { ExperimentalDataset } from '../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../models/experimentalDatasetRow.js';
import { ExperimentalBatch } from '../../models/experimentalBatch.js';
import { Interaction } from '../../models/interaction.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';
import { Chat } from '../../models/chat.js';
import { normalizeObjectId } from '../../api/util/db-query.js';
import { serializeCsvRows } from '../../src/utils/spreadsheets/csv.js';
import { EXPLICIT_REFERENCE_ANSWER_ALIASES, hasReferenceAnswerColumn } from './datasetColumns.js';
import QuestionVariationService from './QuestionVariationService.js';

const escapeRegex = (input = '') => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Keep in sync with the production batch upload (BatchService._extractQuestion)
// and the experimental runner (ExperimentalBatchService QUESTION_ALIASES) so a
// file that works for a batch also works as a dataset. Matching is
// case/space/underscore-insensitive, so redactedQuestion, REDACTED QUESTION,
// QUESTION etc. all resolve.
const QUESTION_ALIASES = ['question', 'redactedquestion', 'problemdetails', 'prompt'];
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
    _buildDateRange(startDate, endDate) {
        const start = new Date(`${startDate}T00:00:00.000Z`);
        const end = new Date(`${endDate}T23:59:59.999Z`);
        if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
            throw new Error('A valid date range is required');
        }
        return { createdAt: { $gte: start, $lte: end } };
    }

    async _getGoldenAnswerRows(startDate, endDate) {
        const dateFilter = this._buildDateRange(startDate, endDate);
        const perfectFeedback = await ExpertFeedback.find({ totalScore: 100 }).select('_id').lean();
        const candidateInteractions = await Interaction.find({
            ...dateFilter,
            expertFeedback: { $in: perfectFeedback.map(feedback => feedback._id) },
            question: { $exists: true, $ne: null },
            answer: { $exists: true, $ne: null }
        }).select('_id').lean();

        if (candidateInteractions.length === 0) return [];

        const chats = await Chat.find({
            interactions: { $in: candidateInteractions.map(interaction => interaction._id) }
        }).select('chatId interactions').lean();
        const chatInteractionIds = chats.flatMap(chat => chat.interactions || []);
        const interactions = await Interaction.find({ _id: { $in: chatInteractionIds } })
            .select('question answer referringUrl expertFeedback createdAt')
            .populate({ path: 'question', select: 'redactedQuestion' })
            .populate({ path: 'answer', select: 'content' })
            .populate({ path: 'expertFeedback', select: 'totalScore' })
            .lean();
        const interactionsById = new Map(interactions.map(interaction => [String(interaction._id), interaction]));
        const candidateInteractionIds = new Set(candidateInteractions.map(interaction => String(interaction._id)));
        const rows = [];

        for (const chat of chats) {
            const orderedTurns = (chat.interactions || [])
                .map(interactionId => interactionsById.get(String(interactionId)))
                .filter(Boolean);
            if (orderedTurns.length === 0) continue;
            const consecutivePerfectTurns = [];
            for (const turn of orderedTurns) {
                if (turn.expertFeedback?.totalScore !== 100) break;
                if (!turn.question?.redactedQuestion || !turn.answer?.content) break;
                consecutivePerfectTurns.push(turn);
            }
            const lastCandidateIndex = consecutivePerfectTurns.reduce(
                (lastIndex, turn, index) => candidateInteractionIds.has(String(turn._id)) ? index : lastIndex,
                -1
            );
            if (lastCandidateIndex < 0) continue;

            for (const turn of consecutivePerfectTurns.slice(0, lastCandidateIndex + 1)) {
                rows.push({
                    chatId: chat.chatId,
                    question: turn.question.redactedQuestion,
                    answer: turn.answer.content,
                    ...(turn.referringUrl ? { referringUrl: turn.referringUrl } : {})
                });
            }
        }

        return rows;
    }

    async _getFirstTurnGoldenAnswerRows(startDate, endDate) {
        const dateFilter = this._buildDateRange(startDate, endDate);
        const perfectFeedback = await ExpertFeedback.find({ totalScore: 100 }).select('_id').lean();
        const candidateInteractions = await Interaction.find({
            ...dateFilter,
            expertFeedback: { $in: perfectFeedback.map(feedback => feedback._id) },
            question: { $exists: true, $ne: null },
            answer: { $exists: true, $ne: null }
        }).select('_id').lean();

        if (candidateInteractions.length === 0) return [];

        const candidateIds = candidateInteractions.map(interaction => interaction._id);
        const candidateIdSet = new Set(candidateIds.map(String));
        const chats = await Chat.find({ interactions: { $in: candidateIds } })
            .select('chatId interactions')
            .lean();
        const firstTurnIds = chats.map(chat => chat.interactions?.[0]).filter(Boolean);
        const firstTurns = await Interaction.find({ _id: { $in: firstTurnIds } })
            .select('question answer referringUrl expertFeedback')
            .populate({ path: 'question', select: 'redactedQuestion' })
            .populate({ path: 'answer', select: 'content' })
            .populate({ path: 'expertFeedback', select: 'totalScore' })
            .lean();
        const firstTurnById = new Map(firstTurns.map(turn => [String(turn._id), turn]));

        return chats.flatMap(chat => {
            const firstTurnId = chat.interactions?.[0];
            const firstTurn = firstTurnById.get(String(firstTurnId));
            if (
                !firstTurn
                || !candidateIdSet.has(String(firstTurnId))
                || firstTurn.expertFeedback?.totalScore !== 100
                || !firstTurn.question?.redactedQuestion
                || !firstTurn.answer?.content
            ) {
                return [];
            }

            return [{
                chatId: chat.chatId,
                question: firstTurn.question.redactedQuestion,
                answer: firstTurn.answer.content,
                ...(firstTurn.referringUrl ? { referringUrl: firstTurn.referringUrl } : {})
            }];
        });
    }

    _normalizeOccurrences(value) {
        const occurrences = Number(value);
        if (!Number.isInteger(occurrences) || occurrences < 1 || occurrences > 10) {
            throw new Error('Occurrences per question must be an integer from 1 to 10');
        }
        return occurrences;
    }

    async previewGoldenAnswerDataset(startDate, endDate) {
        const rows = await this._getGoldenAnswerRows(startDate, endDate);
        return { rowCount: rows.length };
    }

    async previewInstantAnswerDataset(startDate, endDate, occurrencesPerQuestion) {
        const occurrences = this._normalizeOccurrences(occurrencesPerQuestion);
        const rows = await this._getFirstTurnGoldenAnswerRows(startDate, endDate);
        return { sourceRowCount: rows.length, rowCount: rows.length * occurrences };
    }

    async createGoldenAnswerDataset({ startDate, endDate, name, description, method, type, category, userId }) {
        const rows = await this._getGoldenAnswerRows(startDate, endDate);
        if (!name || method !== 'golden-answer' || type !== 'qa-pair') {
            throw new Error('Name, creation method, and question-and-answer dataset type are required');
        }
        const datasetName = String(name).trim();
        const enteredDescription = String(description || '').trim();
        const dateRangeDescription = `${startDate} to ${endDate}`;
        const existing = await ExperimentalDataset.findOne({ name: datasetName });
        if (existing) {
            throw new DuplicateError(`Dataset "${datasetName}" already exists`);
        }

        const dataRows = rows;

        const dataset = await ExperimentalDataset.create({
            name: datasetName,
            description: enteredDescription
                ? `${enteredDescription} (${dateRangeDescription})`
                : dateRangeDescription,
            type: 'qa-pair',
            category: String(category || '').trim(),
            rowCount: dataRows.length,
            columns: this._inferColumns(dataRows),
            sourceType: 'upload',
            contentHash: this._computeContentHash(dataRows),
            createdBy: userId
        });

        try {
            await ExperimentalDatasetRow.insertMany(dataRows.map((data, index) => ({
                experimentalDataset: dataset._id,
                rowIndex: index + 1,
                pairKey: this._buildPairKey(data),
                data
            })));
        } catch (err) {
            await ExperimentalDataset.findByIdAndDelete(dataset._id);
            throw err;
        }

        return { dataset };
    }

    async createInstantAnswerDataset({
        startDate,
        endDate,
        name,
        description,
        method,
        type,
        category,
        occurrencesPerQuestion,
        userId
    }) {
        if (!String(name || '').trim() || method !== 'instant-answer' || type !== 'qa-pair') {
            throw new Error('Name, creation method, and question-and-answer dataset type are required');
        }
        const occurrences = this._normalizeOccurrences(occurrencesPerQuestion);
        const datasetName = String(name).trim();
        const existing = await ExperimentalDataset.findOne({
            name: { $regex: `^${escapeRegex(datasetName)}$`, $options: 'i' }
        });
        if (existing) throw new DuplicateError(`Dataset "${datasetName}" already exists`);

        const sourceRows = await this._getFirstTurnGoldenAnswerRows(startDate, endDate);
        if (sourceRows.length === 0) throw new Error('No eligible first-turn golden answers were found');

        const variantsByRow = occurrences > 1
            ? await QuestionVariationService.createVariants(sourceRows, occurrences - 1)
            : sourceRows.map(() => []);
        const dataRows = sourceRows.flatMap((sourceRow, sourceIndex) => {
            const questions = [sourceRow.question, ...variantsByRow[sourceIndex]];
            return questions.map((question, occurrenceIndex) => ({
                chatId: `${sourceRow.chatId}::instant-answer-${occurrenceIndex + 1}`,
                sourceChatId: sourceRow.chatId,
                sourceQuestion: sourceRow.question,
                variationIndex: occurrenceIndex,
                question,
                answer: sourceRow.answer,
                ...(sourceRow.referringUrl ? { referringUrl: sourceRow.referringUrl } : {})
            }));
        });

        const enteredDescription = String(description || '').trim();
        const dateRangeDescription = `${startDate} to ${endDate}`;
        const dataset = await ExperimentalDataset.create({
            name: datasetName,
            description: enteredDescription
                ? `${enteredDescription} (${dateRangeDescription})`
                : dateRangeDescription,
            type: 'qa-pair',
            category: String(category || '').trim(),
            rowCount: dataRows.length,
            columns: this._inferColumns(dataRows),
            sourceType: 'upload',
            contentHash: this._computeContentHash(dataRows),
            createdBy: userId
        });

        try {
            await ExperimentalDatasetRow.insertMany(dataRows.map((data, index) => ({
                experimentalDataset: dataset._id,
                rowIndex: index + 1,
                pairKey: this._buildPairKey(data),
                data
            })));
        } catch (err) {
            await ExperimentalDataset.findByIdAndDelete(dataset._id);
            throw err;
        }

        return { dataset };
    }

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
                { question: QUESTION_ALIASES }
            ],
            'qa-pair': [
                { question: QUESTION_ALIASES },
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

        // Exported chat logs may contain either the normal answer or the PII-safe
        // answer. Prefer `answer` when both are present, but accept
        // `redactedAnswer` so exported logs can be uploaded as QA datasets.
        const answerKey = this._findColumnKey(normalized, [
            'answer',
            'redactedAnswer',
            'response'
        ]);
        const referenceKey = this._findColumnKey(normalized, EXPLICIT_REFERENCE_ANSWER_ALIASES);
        if (answerKey) {
            if (type === 'qa-pair') {
                normalized.answer = normalized[answerKey];
                if (answerKey !== 'answer') {
                    delete normalized[answerKey];
                }
            } else {
                delete normalized[answerKey];
            }
        } else if (type === 'qa-pair' && referenceKey) {
            // A reference-only QA row is still a valid QA pair. Keep the
            // explicit reference column and add the canonical answer field so
            // validation and the batch preparation path can consume it.
            normalized.answer = normalized[referenceKey];
        }

        if (type === 'question-only' && referenceKey) {
            delete normalized[referenceKey];
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
        const keys = Object.keys(row);
        // Alias order is significant for answer inputs: use the normal answer
        // when an export contains both `answer` and `redactedAnswer`.
        return normalizedAliases
            .map(alias => keys.find(key => this._normalizeColumnKey(key) === alias))
            .find(Boolean);
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
        datasetId = normalizeObjectId(datasetId);
        if (!datasetId) {
            throw new Error('Invalid datasetId');
        }

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

    async exportDataset(datasetId) {
        datasetId = normalizeObjectId(datasetId);
        if (!datasetId) {
            throw new Error('Invalid datasetId');
        }

        const dataset = await ExperimentalDataset.findById(datasetId).lean();
        if (!dataset) {
            return null;
        }

        const rows = await ExperimentalDatasetRow.find({ experimentalDataset: datasetId })
            .sort({ rowIndex: 1 })
            .lean();

        const headers = ['chatId', 'question', 'answer'];
        const csvRows = [
            headers,
            ...rows.map((row) => headers.map((header) => row.data?.[header] ?? ''))
        ];

        return {
            dataset,
            csvText: `\uFEFF${serializeCsvRows(csvRows)}`
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
                obj.hasReferenceAnswer = hasReferenceAnswerColumn(obj.columns);
                return obj;
            }),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    async deleteDataset(id) {
        id = normalizeObjectId(id);
        if (!id) {
            throw new Error('Invalid datasetId');
        }

        const existing = await ExperimentalDataset.findById(id);
        if (!existing) return false;

        // Delete rows first, then the dataset
        await ExperimentalDatasetRow.deleteMany({ experimentalDataset: id });
        await ExperimentalDataset.findByIdAndDelete(id);
        return true;
    }
}

export default new ExperimentalDatasetService();
