
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import stream from 'stream';
const { PassThrough } = stream;
import { Chat } from '../../../models/chat.js';

// Mock dependencies
vi.mock('../../db/db-connect.js', () => ({ default: vi.fn() }));

// Mock Chat model
vi.mock('../../../models/chat.js', () => ({
    Chat: {
        find: vi.fn(),
        aggregate: vi.fn(),
    }
}));

// Mock auth middleware (though we're calling handlers directly, useful if we import the default export)
vi.mock('../../../middleware/auth.js', () => ({
    authMiddleware: (handler) => handler,
    withProtection: (handler) => handler,
}));

// Import the handler *after* mocks
// Note: We need to import the internal handler if it's exported, or the default one.
// The file exports `chatExportHandler` implicitly via `export default function handler...`
// But we need the internal logical function for easier testing if possible, OR we test the default handler.
// Looking at the file content, `chatExportHandler` is not exported. We test the default handler.

import handler from '../chat-export-logs.js';

describe('chat-export-logs API', () => {
    let req, res;

    beforeEach(() => {
        vi.clearAllMocks();
        req = {
            method: 'GET',
            query: { view: 'default', format: 'xlsx' }
        };
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
            setHeader: vi.fn(),
            write: vi.fn(),
            end: vi.fn(),
            // Mock stream for ExcelJS
            on: vi.fn(),
            once: vi.fn(),
            emit: vi.fn(),
        };
        // ExcelJS needs a stream-like response object
        res.writable = true;
    });

    it('should include context.searchQuery in the default view export', async () => {
        // Mock data
        const mockChats = [
            {
                chatId: 'test-chat',
                interactions: [
                    {
                        interactionId: 'i1',
                        context: {
                            searchQuery: 'test query content',
                            searchResults: '[]'
                        },
                        answer: { content: 'ans' },
                        question: { question: 'q' },
                        expertFeedback: {},
                        publicFeedback: {},
                        autoEval: { expertFeedback: { totalScore: 1 } }
                    }
                ]
            }
        ];

        // Mock Chat.find to return our data
        Chat.find.mockReturnValue({
            populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(mockChats)
            })
        });

        // We need to capture the Excel output buffer to parse it and verify.
        // However, ExcelJS writes to the stream.
        // A simpler way for unit testing without parsing binary Excel is to 
        // mock ExcelJS or check if the headers contains 'context.searchQuery' 
        // by spying on ExcelJS addRow if possible, OR
        // Test CSV format which matches the headers and data row.

        req.query.format = 'csv';
        const writeSpy = vi.spyOn(res, 'write'); // Not used by fast-csv pipe? 
        // fast-csv pipes to res. We need to mock 'pipe' on the stream fast-csv creates.
        // Actually fast-csv `csvFormat` returns a stream that we pipe to res.

        // Let's rely on ExcelJS mocking since we probably want to verify the implementation logic rather than the library.
        // But the implementation imports ExcelJS. 

        // Easier: Use `format=json` which returns the flat object array!
        req.query.format = 'json';

        await handler(req, res);

        expect(res.json).toHaveBeenCalled();
        const responseData = res.json.mock.calls[0][0]; // First arg of first call

        expect(responseData).toHaveLength(1);
        const row = responseData[0];

        expect(row).toHaveProperty('context.searchQuery');
        expect(row['context.searchQuery']).toBe('test query content');
    });

    it('should include context.searchQuery in the tools view export', async () => {
        req.query.view = 'tools';
        req.query.format = 'json';

        // Mock data
        const mockChats = [
            {
                chatId: 'test-chat-tools',
                interactions: [
                    {
                        interactionId: 'i2',
                        context: {
                            searchQuery: 'tools query',
                            searchResults: '[]'
                        },
                        answer: { content: 'ans', tools: [] },
                        question: { question: 'q' },
                        expertFeedback: {},
                        publicFeedback: {},
                        autoEval: { expertFeedback: { totalScore: 1 } }
                    }
                ]
            }
        ];

        Chat.find.mockReturnValue({
            populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(mockChats)
            })
        });

        await handler(req, res);

        expect(res.json).toHaveBeenCalled();
        const responseData = res.json.mock.calls[0][0];

        expect(responseData).toHaveLength(1);
        const row = responseData[0];

        expect(row).toHaveProperty('context.searchQuery');
        expect(row['context.searchQuery']).toBe('tools query');
    });
});
