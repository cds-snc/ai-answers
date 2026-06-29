import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import ExperimentalDatasetService, { ValidationError, DuplicateError } from '../ExperimentalDatasetService.js';
import { ExperimentalDataset } from '../../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../../models/experimentalDatasetRow.js';
import { User } from '../../../models/user.js';

describe('ExperimentalDatasetService', () => {
    const userId = new mongoose.Types.ObjectId();

    beforeAll(async () => {
        const dbConnect = (await import('../../../api/db/db-connect.js')).default;
        await dbConnect();
    });

    afterEach(async () => {
        await ExperimentalDataset.deleteMany({});
        await ExperimentalDatasetRow.deleteMany({});
        await User.deleteMany({});
    });

    const createXlsxBuffer = async (data) => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Sheet1');

        if (data.length > 0) {
            ws.columns = Object.keys(data[0]).map(key => ({ header: key, key }));
            data.forEach(row => ws.addRow(row));
        }

        return Buffer.from(await wb.xlsx.writeBuffer());
    };

    const createXlsxBufferFromAoa = async (data) => {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Sheet1');
        data.forEach(row => ws.addRow(row));
        return Buffer.from(await wb.xlsx.writeBuffer());
    };

    const createCsvBuffer = (text) => Buffer.from(text, 'utf8');


    describe('createFromUpload', () => {
        it('should successfully create a dataset and rows from a valid XLSX', async () => {
            const data = [
                { question: 'What is IA?', answer: 'Intelligence Artificielle' },
                { question: 'How it works?', answer: 'Magic' }
            ];
            const buffer = await createXlsxBuffer(data);
            const metadata = { name: 'Test Dataset', type: 'qa-pair' };

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                metadata,
                userId,
                'test-dataset.xlsx'
            );

            expect(result.dataset).toBeDefined();
            expect(result.dataset.name).toBe('Test Dataset');
            expect(result.dataset.rowCount).toBe(2);
            expect(result.dataset.createdBy.toString()).toBe(userId.toString());

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows).toHaveLength(2);
            expect(rows[0].data.question).toBe('What is IA?');
            expect(rows[1].data.answer).toBe('Magic');
        });

        it('should successfully create a dataset and rows from a valid CSV', async () => {
            const buffer = createCsvBuffer([
                'question,answer',
                'What is IA?,Intelligence Artificielle',
                'How it works?,Magic'
            ].join('\n'));
            const metadata = { name: 'CSV Dataset', type: 'qa-pair' };

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'text/csv',
                metadata,
                userId,
                'csv-dataset.csv'
            );

            expect(result.dataset).toBeDefined();
            expect(result.dataset.name).toBe('CSV Dataset');
            expect(result.dataset.rowCount).toBe(2);

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows).toHaveLength(2);
            expect(rows[0].data.question).toBe('What is IA?');
            expect(rows[1].data.answer).toBe('Magic');
        });

        it('should normalize problem details into the canonical question field', async () => {
            const data = [
                { 'Problem Details': 'What is IA?', answer: 'Intelligence Artificielle' }
            ];
            const buffer = await createXlsxBuffer(data);
            const metadata = { name: 'Problem Details Dataset', type: 'qa-pair' };

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                metadata,
                userId,
                'problem-details.xlsx'
            );

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows).toHaveLength(1);
            expect(rows[0].data).toHaveProperty('question', 'What is IA?');
            expect(rows[0].data).not.toHaveProperty('Problem Details');
        });

        it('should normalize answer aliases into the canonical answer field', async () => {
            const data = [
                { question: 'What is IA?', NewAnswer: 'Intelligence Artificielle' }
            ];
            const buffer = await createXlsxBuffer(data);
            const metadata = { name: 'Answer Alias Dataset', type: 'qa-pair' };

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                metadata,
                userId,
                'answer-alias.xlsx'
            );

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows).toHaveLength(1);
            expect(rows[0].data).toHaveProperty('answer', 'Intelligence Artificielle');
            expect(rows[0].data).not.toHaveProperty('NewAnswer');
        });

        it('should normalize chatId and referringUrl aliases from spreadsheet uploads', async () => {
            const buffer = await createCsvBuffer([
                'ChatId,URL,Problem Details',
                '1234,https://www.sac-isc.gc.ca,What is SCIS?'
            ].join('\n'));
            const metadata = { name: 'Multi Turn Dataset', type: 'question-only' };

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'text/csv',
                metadata,
                userId,
                'multi-turn.csv'
            );

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows).toHaveLength(1);
            expect(rows[0].data).toHaveProperty('question', 'What is SCIS?');
            expect(rows[0].data).toHaveProperty('chatId', '1234');
            expect(rows[0].data).toHaveProperty('referringUrl', 'https://www.sac-isc.gc.ca');
        });

        it('should drop answer columns for question-only uploads', async () => {
            const data = [
                { question: 'What is IA?', answer: 'Intelligence Artificielle' }
            ];
            const buffer = await createXlsxBuffer(data);
            const metadata = { name: 'Question Only Dataset', type: 'question-only' };

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                metadata,
                userId,
                'question-only.xlsx'
            );

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows).toHaveLength(1);
            expect(rows[0].data).toHaveProperty('question', 'What is IA?');
            expect(rows[0].data).not.toHaveProperty('answer');
        });

        it('should reject legacy xls uploads', async () => {
            const buffer = createCsvBuffer('question\nlegacy\n');

            await expect(
                ExperimentalDatasetService.createFromUpload(
                    buffer,
                    'application/vnd.ms-excel',
                    { name: 'Legacy XLS', type: 'question-only' },
                    userId,
                    'legacy.xls'
                )
            ).rejects.toThrow(/xls/i);
        });

        it('should throw DuplicateError if name already exists', async () => {
            await ExperimentalDataset.create({ name: 'Existing', type: 'question-only' });
            const buffer = await createXlsxBuffer([{ question: 'test' }]);

            await expect(
                ExperimentalDatasetService.createFromUpload(
                    buffer,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    { name: 'Existing', type: 'question-only' },
                    userId,
                    'existing.xlsx'
                )
            ).rejects.toThrow(DuplicateError);
        });

        it('should enforce duplicate names case-insensitively', async () => {
            await ExperimentalDataset.create({ name: 'ExistingName', type: 'question-only' });
            const buffer = await createXlsxBuffer([{ question: 'test' }]);

            await expect(
                ExperimentalDatasetService.createFromUpload(
                    buffer,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    { name: 'existingname', type: 'question-only' },
                    userId,
                    'existing-name.xlsx'
                )
            ).rejects.toThrow(DuplicateError);
        });

        it('should throw ValidationError if required columns are missing', async () => {
            const buffer = await createXlsxBuffer([{ something: 'else' }]);
            const metadata = { name: 'Invalid', type: 'qa-pair' };

            await expect(
                ExperimentalDatasetService.createFromUpload(
                    buffer,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    metadata,
                    userId,
                    'invalid.xlsx'
                )
            ).rejects.toThrow(ValidationError);
        });

        it('should throw ValidationError if file is empty', async () => {
            const buffer = await createXlsxBuffer([]);
            const metadata = { name: 'Empty', type: 'question-only' };

            await expect(
                ExperimentalDatasetService.createFromUpload(
                    buffer,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    metadata,
                    userId,
                    'empty.xlsx'
                )
            ).rejects.toThrow(ValidationError);
        });

        it('should return a duplicateContentWarning if content hash matches existing dataset', async () => {
            const data = [{ question: 'unique content' }];
            const buffer = await createXlsxBuffer(data);

            // Create first
            await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                { name: 'DS1', type: 'question-only' },
                userId,
                'ds1.xlsx'
            );

            // Create second with same content
            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                { name: 'DS2', type: 'question-only' },
                userId,
                'ds2.xlsx'
            );

            expect(result.warning).not.toBeNull();
            expect(result.warning.existingName).toBe('DS1');
        });

        it('should cleanup created dataset if row insertion fails', async () => {
            const buffer = await createXlsxBuffer([{ question: 'test' }]);

            // Force error on insertMany
            const spy = vi.spyOn(ExperimentalDatasetRow, 'insertMany').mockRejectedValue(new Error('DB Error'));

            await expect(
                ExperimentalDatasetService.createFromUpload(
                    buffer,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    { name: 'Cleanup Test', type: 'question-only' },
                    userId,
                    'cleanup.xlsx'
                )
            ).rejects.toThrow('DB Error');

            const ds = await ExperimentalDataset.findOne({ name: 'Cleanup Test' });
            expect(ds).toBeNull();

            spy.mockRestore();
        });

        it('should correctly catch and wrap native DB duplication errors (code 11000)', async () => {
            const buffer = await createXlsxBuffer([{ question: 'native error test' }]);

            // Mock a database level duplication error that escapes the initial regex check
            const mockDbError = new Error('E11000 duplicate key error collection');
            mockDbError.code = 11000;
            const createSpy = vi.spyOn(ExperimentalDataset, 'create').mockRejectedValue(mockDbError);

            await expect(
                ExperimentalDatasetService.createFromUpload(
                    buffer,
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    { name: 'Fallback Dupe', type: 'question-only' },
                    userId,
                    'fallback-dupe.xlsx'
                )
            ).rejects.toThrow(DuplicateError);

            createSpy.mockRestore();
        });

        it('should rename invalid column characters (dots/dollars) to prevent DocumentDB Operation Not Permitted (code 8) errors', async () => {
            const buffer = await createXlsxBuffer([{
                question: 'Sanitize me',
                'invalid.name': 'has dot',
                '$cost': 500,
                'no problem': true
            }]);

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                { name: 'Sanitized DS', type: 'question-only' },
                userId,
                'sanitized.xlsx'
            );

            expect(result.dataset).toBeDefined();

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows).toHaveLength(1);

            // The row data should be sanitized (dots and dollars replaced by underscores)
            const rowData = rows[0].data;
            expect(rowData).toHaveProperty('invalid_name', 'has dot');
            expect(rowData).toHaveProperty('_cost', 500);
            expect(rowData['invalid.name']).toBeUndefined();
            expect(rowData['$cost']).toBeUndefined();
            expect(rowData).toHaveProperty('no problem', true); // Unaffected keys shouldn't be altered
        });

        it('should drop empty-header and empty-value columns during import', async () => {
            const buffer = await createXlsxBufferFromAoa([
                ['question', '', 'answer', 'notes'],
                ['What is IA?', 'hidden value', 'Intelligence Artificielle', ''],
                ['How it works?', '', 'Magic', '   ']
            ]);

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                { name: 'Clean Import', type: 'qa-pair' },
                userId,
                'clean-import.xlsx'
            );

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id }).sort({ rowIndex: 1 });
            expect(rows).toHaveLength(2);
            expect(rows[0].data).toHaveProperty('question', 'What is IA?');
            expect(rows[0].data).toHaveProperty('answer', 'Intelligence Artificielle');
            expect(rows[0].data).not.toHaveProperty('__EMPTY');
            expect(rows[0].data).not.toHaveProperty('notes');
            expect(rows[1].data).toHaveProperty('question', 'How it works?');
            expect(rows[1].data).toHaveProperty('answer', 'Magic');
            expect(rows[1].data).not.toHaveProperty('__EMPTY');
            expect(rows[1].data).not.toHaveProperty('notes');
        });
    });

    describe('getDatasetRows', () => {
        it('should return paginated rows for a specific dataset', async () => {
            const ds1 = await ExperimentalDataset.create({ name: 'DS 1', type: 'question-only' });
            const ds2 = await ExperimentalDataset.create({ name: 'DS 2', type: 'question-only' });

            await ExperimentalDatasetRow.create([
                { experimentalDataset: ds1._id, rowIndex: 1, data: { q: 'ds1-r1' } },
                { experimentalDataset: ds1._id, rowIndex: 2, data: { q: 'ds1-r2' } },
                { experimentalDataset: ds1._id, rowIndex: 3, data: { q: 'ds1-r3' } },
                { experimentalDataset: ds2._id, rowIndex: 1, data: { q: 'ds2-r1' } }
            ]);

            const result = await ExperimentalDatasetService.getDatasetRows(ds1._id, { page: 1, limit: 2 });

            expect(result.rows).toHaveLength(2);
            expect(result.rows[0].data.q).toBe('ds1-r1');
            expect(result.rows[1].data.q).toBe('ds1-r2');
            expect(result.total).toBe(3);
            expect(result.totalPages).toBe(2);

            // Second page
            const result2 = await ExperimentalDatasetService.getDatasetRows(ds1._id, { page: 2, limit: 2 });
            expect(result2.rows).toHaveLength(1);
            expect(result2.rows[0].data.q).toBe('ds1-r3');
        });
    });

    describe('list', () => {
        it('should return paginated results', async () => {
            await ExperimentalDataset.create([
                { name: 'DS1', type: 'question-only' },
                { name: 'DS2', type: 'question-only' },
                { name: 'DS3', type: 'question-only' }
            ]);

            const result = await ExperimentalDatasetService.list({ page: 1, limit: 2 });
            expect(result.data).toHaveLength(2);
            expect(result.total).toBe(3);
            expect(result.totalPages).toBe(2);
        });

        it('should populate createdBy email on listed datasets', async () => {
            const user = await User.create({
                email: 'uploader@example.com',
                password: 'password123',
                role: 'partner'
            });
            await ExperimentalDataset.create({
                name: 'DS With Owner',
                type: 'question-only',
                createdBy: user._id
            });

            const result = await ExperimentalDatasetService.list({ page: 1, limit: 20 });

            expect(result.data).toHaveLength(1);
            expect(result.data[0].createdBy.email).toBe('uploader@example.com');
        });
    });

    describe('deleteDataset', () => {
        it('should delete dataset and all associated rows', async () => {
            const ds = await ExperimentalDataset.create({ name: 'To Delete', type: 'question-only' });
            await ExperimentalDatasetRow.create([
                { experimentalDataset: ds._id, rowIndex: 1, data: { q: 1 } },
                { experimentalDataset: ds._id, rowIndex: 2, data: { q: 2 } }
            ]);

            await ExperimentalDatasetService.deleteDataset(ds._id);

            expect(await ExperimentalDataset.findById(ds._id)).toBeNull();
            expect(await ExperimentalDatasetRow.find({ experimentalDataset: ds._id })).toHaveLength(0);
        });

        it('should return false when deleting a non-existent dataset', async () => {
            const missingId = new mongoose.Types.ObjectId();
            const deleted = await ExperimentalDatasetService.deleteDataset(missingId);
            expect(deleted).toBe(false);
        });
    });

    describe('_buildPairKey', () => {
        it('should use pairKeyColumn if provided', () => {
            const row = { 'ID': 'ABC-123', question: 'test' };
            const key = ExperimentalDatasetService._buildPairKey(row, 'ID');
            expect(key).toBe('ABC-123');
        });

        it('should use zero-padded number if question starts with digit', () => {
            const row = { question: '5. What is this?' };
            const key = ExperimentalDatasetService._buildPairKey(row);
            expect(key).toBe('005');
        });

        it('should return md5 hash for arbitrary questions', () => {
            const row = { question: 'Tell me a story.' };
            const key = ExperimentalDatasetService._buildPairKey(row);
            expect(key).toHaveLength(32); // MD5 hex length
        });
    });
});
