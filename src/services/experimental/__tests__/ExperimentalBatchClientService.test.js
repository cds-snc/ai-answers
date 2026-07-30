import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExperimentalBatchClientService } from '../ExperimentalBatchClientService.js';
import AuthService from '../../AuthService.js';

vi.mock('../../AuthService.js', () => ({
    default: {
        fetch: vi.fn()
    }
}));

vi.mock('../../utils/apiToUrl.js', () => ({
    getApiUrl: vi.fn(path => `/api/${path}`)
}));

describe('ExperimentalBatchClientService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('exportBatch', () => {
        it('should call fetch with default format and return JSON data', async () => {
            const mockData = [{ id: 1 }];
            AuthService.fetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockData)
            });

            const result = await ExperimentalBatchClientService.exportBatch('batch-123');

            expect(AuthService.fetch).toHaveBeenCalledWith(
                expect.stringContaining('experimental-batch-export/batch-123?format=json')
            );
            expect(result).toEqual(mockData);
        });

        it('should return a blob when format is excel', async () => {
            const mockBlob = new Blob(['test'], { type: 'application/vnd.ms-excel' });
            AuthService.fetch.mockResolvedValue({
                ok: true,
                blob: vi.fn().mockResolvedValue(mockBlob)
            });

            const result = await ExperimentalBatchClientService.exportBatch('batch-123', 'excel');

            expect(AuthService.fetch).toHaveBeenCalledWith(
                expect.stringContaining('experimental-batch-export/batch-123?format=excel')
            );
            expect(result).toBeInstanceOf(Blob);
        });

        it('should throw error when fetch fails', async () => {
            AuthService.fetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            await expect(ExperimentalBatchClientService.exportBatch('batch-123'))
                .rejects.toThrow('Failed to export batch: 500 Internal Server Error');
        });
    });

    describe('exportChatLogs', () => {
        it('should request the comparison export and return a blob', async () => {
            const mockBlob = new Blob(['test'], { type: 'application/vnd.ms-excel' });
            AuthService.fetch.mockResolvedValue({
                ok: true,
                blob: vi.fn().mockResolvedValue(mockBlob)
            });

            const result = await ExperimentalBatchClientService.exportChatLogs('current-batch', 'baseline-batch');

            expect(AuthService.fetch).toHaveBeenCalledWith(
                expect.stringContaining('experimental-batch-chat-logs-export/current-batch?baselineRunId=baseline-batch')
            );
            expect(result).toBeInstanceOf(Blob);
        });

        it('should throw a helpful error when export fails', async () => {
            AuthService.fetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: vi.fn().mockResolvedValue({ error: 'Export failed' })
            });

            await expect(ExperimentalBatchClientService.exportChatLogs('current-batch'))
                .rejects.toThrow('Export failed');
        });
    });

    describe('listDatasets', () => {
        it('sends DataTables pagination, search, and sorting parameters to the API', async () => {
            AuthService.fetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ data: [], recordsTotal: 12, recordsFiltered: 1 })
            });

            await ExperimentalBatchClientService.listDatasets(1, 10, {
                start: 10,
                length: 10,
                search: 'benefits',
                orderBy: 'name',
                orderDir: 'asc'
            });

            expect(AuthService.fetch).toHaveBeenCalledWith(
                '/api/experimental/experimental-dataset-list?page=1&limit=10&start=10&length=10&search=benefits&orderBy=name&orderDir=asc'
            );
        });
    });
});
