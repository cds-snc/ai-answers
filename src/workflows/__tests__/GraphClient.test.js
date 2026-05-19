import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
const mockGetVisitorId = vi.fn();
const mockSendStatusUpdate = vi.fn();

vi.mock('../../utils/apiToUrl.js', () => ({
  getApiUrl: vi.fn(() => '/api/chat/chat-graph-run'),
}));

vi.mock('../../services/AuthService.js', () => ({
  default: {
    fetch: mockFetch,
  },
}));

vi.mock('../../services/SessionService.js', () => ({
  default: {
    getVisitorId: mockGetVisitorId,
  },
}));

vi.mock('../../services/ChatWorkflowService.js', () => ({
  ChatWorkflowService: {
    sendStatusUpdate: mockSendStatusUpdate,
  },
  ShortQueryValidation: class ShortQueryValidation extends Error {},
  RedactionError: class RedactionError extends Error {},
}));

describe('GraphClient', () => {
  let GraphClient;
  let consoleDebugSpy;

  beforeEach(async () => {
    vi.resetModules();
    mockFetch.mockReset();
    mockGetVisitorId.mockReset().mockResolvedValue('visitor-1');
    mockSendStatusUpdate.mockReset();
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    ({ GraphClient } = await import('../GraphClient.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs status payload metadata and still resolves the final result', async () => {
    const encoded = new TextEncoder();
    const bodyText = [
      'event: status',
      'data: {"status":"searching","graph":"GenericGraph","serverSentAt":123,"sequence":1}',
      '',
      'event: result',
      'data: {"answer":{"answerType":"normal","content":"done"}}',
      '',
    ].join('\n');

    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: encoded.encode(bodyText) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };

    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn(() => 'text/event-stream; charset=utf-8'),
      },
      body: {
        getReader: () => reader,
      },
    });

    const client = new GraphClient('GenericGraph');
    const result = await client.processResponse(
      'chat-1',
      'question',
      'message-1',
      [],
      'en',
      '',
      '',
      'gpt-5',
      () => {},
      () => {},
      'google'
    );

    expect(result).toMatchObject({
      answer: {
        answerType: 'normal',
        content: 'done',
      },
    });
    expect(mockSendStatusUpdate).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/chat/chat-graph-run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/x-ndjson',
        }),
      })
    );
    expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty('Accept-Encoding');
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      '[chat-graph-run status]',
      expect.objectContaining({
        status: 'searching',
        graph: 'GenericGraph',
        serverSentAt: 123,
        sequence: 1,
      })
    );
  });

  it('parses NDJSON status events and resolves the final result', async () => {
    const encoded = new TextEncoder();
    const bodyText = [
      JSON.stringify({ event: 'status', data: { status: 'buildingContext', graph: 'GenericGraph', sequence: 1 } }),
      JSON.stringify({ event: 'result', data: { answer: { answerType: 'normal', content: 'done' } } }),
      '',
    ].join('\n');

    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: encoded.encode(bodyText) })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: vi.fn().mockResolvedValue(undefined),
    };

    mockFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn(() => 'application/x-ndjson; charset=utf-8'),
      },
      body: {
        getReader: () => reader,
      },
    });

    const client = new GraphClient('GenericGraph');
    const result = await client.processResponse(
      'chat-1',
      'question',
      'message-1',
      [],
      'en',
      '',
      '',
      'gpt-5',
      () => {},
      () => {},
      'google'
    );

    expect(result).toMatchObject({
      answer: {
        answerType: 'normal',
        content: 'done',
      },
    });
    expect(mockSendStatusUpdate).toHaveBeenCalledWith(expect.any(Function), 'buildingContext');
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      '[chat-graph-run status]',
      expect.objectContaining({
        status: 'buildingContext',
        graph: 'GenericGraph',
        sequence: 1,
      })
    );
  });
});
