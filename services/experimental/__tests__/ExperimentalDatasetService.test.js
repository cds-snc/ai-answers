import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import xlsx from 'xlsx';
import ExperimentalDatasetService, { ValidationError, DuplicateError } from '../ExperimentalDatasetService.js';
import { ExperimentalDataset } from '../../../models/experimentalDataset.js';
import { ExperimentalDatasetRow } from '../../../models/experimentalDatasetRow.js';

describe('ExperimentalDatasetService', () => {
    const userId = new mongoose.Types.ObjectId();

    beforeAll(async () => {
        const dbConnect = (await import('../../../api/db/db-connect.js')).default;
        await dbConnect();
    });

    afterEach(async () => {
        await ExperimentalDataset.deleteMany({});
        await ExperimentalDatasetRow.deleteMany({});
    });

    const createXlsxBuffer = (data) => {
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
        return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    };


    describe('createFromUpload', () => {
        it('should successfully create a dataset and rows from a valid XLSX', async () => {
            const data = [
                { question: 'What is IA?', answer: 'Intelligence Artificielle' },
                { question: 'How it works?', answer: 'Magic' }
            ];
            const buffer = createXlsxBuffer(data);
            const metadata = { name: 'Test Dataset', type: 'qa-pair' };

            const result = await ExperimentalDatasetService.createFromUpload(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', metadata, userId);

            expect(result.dataset).toBeDefined();
            expect(result.dataset.name).toBe('Test Dataset');
            expect(result.dataset.rowCount).toBe(2);
            expect(result.dataset.createdBy.toString()).toBe(userId.toString());

            const rows = await ExperimentalDatasetRow.find({ experimentalDataset: result.dataset._id });
            expect(rows).toHaveLength(2);
            expect(rows[0].data.question).toBe('What is IA?');
            expect(rows[1].data.answer).toBe('Magic');
        });

        it('should throw DuplicateError if name already exists', async () => {
            await ExperimentalDataset.create({ name: 'Existing', type: 'question-only' });
            const buffer = createXlsxBuffer([{ question: 'test' }]);

            await expect(ExperimentalDatasetService.createFromUpload(buffer, 'test', { name: 'Existing', type: 'question-only' }, userId))
                .rejects.toThrow(DuplicateError);
        });

        it('should enforce duplicate names case-insensitively', async () => {
            await ExperimentalDataset.create({ name: 'ExistingName', type: 'question-only' });
            const buffer = createXlsxBuffer([{ question: 'test' }]);

            await expect(ExperimentalDatasetService.createFromUpload(buffer, 'test', { name: 'existingname', type: 'question-only' }, userId))
                .rejects.toThrow(DuplicateError);
        });

        it('should throw ValidationError if required columns are missing', async () => {
            const buffer = createXlsxBuffer([{ something: 'else' }]);
            const metadata = { name: 'Invalid', type: 'qa-pair' };

            await expect(ExperimentalDatasetService.createFromUpload(buffer, 'test', metadata, userId))
                .rejects.toThrow(ValidationError);
        });

        it('should throw ValidationError if file is empty', async () => {
            const buffer = createXlsxBuffer([]);
            const metadata = { name: 'Empty', type: 'question-only' };

            await expect(ExperimentalDatasetService.createFromUpload(buffer, 'test', metadata, userId))
                .rejects.toThrow(ValidationError);
        });

        it('should return a duplicateContentWarning if content hash matches existing dataset', async () => {
            const data = [{ question: 'unique content' }];
            const buffer = createXlsxBuffer(data);

            // Create first
            await ExperimentalDatasetService.createFromUpload(buffer, 'test', { name: 'DS1', type: 'question-only' }, userId);

            // Create second with same content
            const result = await ExperimentalDatasetService.createFromUpload(buffer, 'test', { name: 'DS2', type: 'question-only' }, userId);

            expect(result.warning).not.toBeNull();
            expect(result.warning.existingName).toBe('DS1');
        });

        it('should cleanup created dataset if row insertion fails', async () => {
            const buffer = createXlsxBuffer([{ question: 'test' }]);

            // Force error on insertMany
            const spy = vi.spyOn(ExperimentalDatasetRow, 'insertMany').mockRejectedValue(new Error('DB Error'));

            await expect(ExperimentalDatasetService.createFromUpload(buffer, 'test', { name: 'Cleanup Test', type: 'question-only' }, userId))
                .rejects.toThrow('DB Error');

            const ds = await ExperimentalDataset.findOne({ name: 'Cleanup Test' });
            expect(ds).toBeNull();

            spy.mockRestore();
        });


        it('should correctly catch and wrap native DB duplication errors (code 11000)', async () => {
            const buffer = createXlsxBuffer([{ question: 'native error test' }]);

            // Mock a database level duplication error that escapes the initial regex check
            const mockDbError = new Error('E11000 duplicate key error collection');
            mockDbError.code = 11000;
            const createSpy = vi.spyOn(ExperimentalDataset, 'create').mockRejectedValue(mockDbError);

            await expect(
                ExperimentalDatasetService.createFromUpload(buffer, 'test', { name: 'Fallback Dupe', type: 'question-only' }, userId)
            ).rejects.toThrow(DuplicateError);

            createSpy.mockRestore();
        });

        it('should rename invalid column characters (dots/dollars) to prevent DocumentDB Operation Not Permitted (code 8) errors', async () => {
            const buffer = createXlsxBuffer([{
                question: 'Sanitize me',
                'invalid.name': 'has dot',
                '$cost': 500,
                'no problem': true
            }]);

            const result = await ExperimentalDatasetService.createFromUpload(
                buffer,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                { name: 'Sanitized DS', type: 'question-only' },
                userId
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
