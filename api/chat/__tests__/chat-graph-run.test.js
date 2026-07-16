import { describe, it, expect, vi } from 'vitest';
import chatGraphRunHandler, { setNdjsonHeaders, setStreamingHeaders } from '../chat-graph-run.js';

const mocks = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  getGraphApp: vi.fn(),
  recordRequest: vi.fn(),
}));

vi.mock('../../../services/SettingsService.js', () => ({
  SettingsService: {
    get: mocks.settingsGet,
  },
}));

vi.mock('../../../middleware/chat-session.js', () => ({
  withChatSession: (handler) => async (req, res) => {
    req.chatId = req.chatId || 'chat-from-session';
    return handler(req, res);
  },
}));

vi.mock('../../../middleware/auth.js', () => ({
  withOptionalUser: (handler) => handler,
}));

vi.mock('../../../services/ChatSessionService.js', () => ({
  default: {
    isManagementEnabled: vi.fn(() => true),
    recordRequest: mocks.recordRequest,
  },
}));

vi.mock('../../../agents/graphs/registry.js', () => ({
  getGraphApp: mocks.getGraphApp,
}));

vi.mock('../../../agents/graphs/requestContext.js', () => ({
  graphRequestContext: {
    run: async (_store, callback) => callback(),
  },
}));

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    chunks: [],
    socket: {
      setNoDelay: vi.fn(),
    },
    setHeader: vi.fn(function (key, value) {
      this.headers[key.toLowerCase()] = value;
    }),
    flushHeaders: vi.fn(),
    write: vi.fn(function (chunk) {
      this.chunks.push(chunk);
    }),
    status: vi.fn(function (statusCode) {
      this.statusCode = statusCode;
      return this;
    }),
    json: vi.fn(function (payload) {
      this.jsonPayload = payload;
      return this;
    }),
    end: vi.fn(),
  };
}

function createRequest() {
  return {
    method: 'POST',
    headers: {},
    sessionID: 'session-123',
    session: {
      visitorId: 'visitor-hash-123',
    },
    body: {
      graph: 'GenericGraph',
      input: {
        userMessage: 'question',
        conversationHistory: [],
      },
    },
    isAuthenticated: () => false,
  };
}

function setupGraphStream() {
  mocks.getGraphApp.mockResolvedValue({
    stream: async function* () {
      yield { init: { status: 'buildingContext' } };
      yield { verify: { result: { answer: { answerType: 'normal', content: 'done' } } } };
      yield { persist: { status: 'complete' } };
    },
  });
}

function mockSettingsTransport(transport) {
  mocks.settingsGet.mockImplementation((key) => {
    if (key === 'chat.transport') return transport;
    if (key === 'workflow.default') return 'GenericGraph';
    if (key === 'model.default') return 'openai-gpt51';
    return null;
  });
}

describe('setStreamingHeaders', () => {
  it('sets SSE-friendly headers and flushes immediately', () => {
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      socket: {
        setNoDelay: vi.fn(),
      },
    };

    setStreamingHeaders(res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-cache, no-store, no-transform, must-revalidate, proxy-revalidate'
    );
    expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(res.setHeader).toHaveBeenCalledWith('Surrogate-Control', 'no-store');
    expect(res.setHeader).toHaveBeenCalledWith('CDN-Cache-Control', 'no-store');
    expect(res.socket.setNoDelay).toHaveBeenCalledWith(true);
    expect(res.flushHeaders).toHaveBeenCalled();
  });
});

describe('chatGraphRunHandler transport setting', () => {
  it('streams SSE frames when chat.transport is sse', async () => {
    mockSettingsTransport('sse');
    setupGraphStream();
    const req = createRequest();
    const res = createResponse();

    await chatGraphRunHandler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(res.write).toHaveBeenCalledWith(': connected\n\n');
    expect(res.chunks.join('')).toContain('event: status\n');
    expect(res.chunks.join('')).toContain('data: {"status":"buildingContext"');
    expect(res.chunks.join('')).toContain('event: result\n');
    expect(res.chunks.join('')).toContain('"chatId":"chat-from-session"');
    expect(res.end).toHaveBeenCalled();
    expect(mocks.recordRequest).toHaveBeenCalledWith(
      'chat-from-session',
      expect.objectContaining({
        error: false,
        errorType: null,
      })
    );
  });

  it('streams NDJSON records when chat.transport is ndjson', async () => {
    mockSettingsTransport('ndjson');
    setupGraphStream();
    const req = createRequest();
    const res = createResponse();

    await chatGraphRunHandler(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson; charset=utf-8');

    const records = res.chunks
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'connected' }),
      expect.objectContaining({
        event: 'status',
        data: expect.objectContaining({ status: 'buildingContext' }),
      }),
      expect.objectContaining({
        event: 'result',
        data: expect.objectContaining({ chatId: 'chat-from-session' }),
      }),
    ]));
    expect(res.end).toHaveBeenCalled();
    expect(mocks.recordRequest).toHaveBeenCalledWith(
      'chat-from-session',
      expect.objectContaining({
        error: false,
        errorType: null,
      })
    );
  });

});

describe('setNdjsonHeaders', () => {
  it('sets chunked NDJSON-friendly headers and flushes immediately', () => {
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      socket: {
        setNoDelay: vi.fn(),
      },
    };

    setNdjsonHeaders(res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-cache, no-store, no-transform, must-revalidate, proxy-revalidate'
    );
    expect(res.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Expires', '0');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(res.setHeader).toHaveBeenCalledWith('Surrogate-Control', 'no-store');
    expect(res.setHeader).toHaveBeenCalledWith('CDN-Cache-Control', 'no-store');
    expect(res.socket.setNoDelay).toHaveBeenCalledWith(true);
    expect(res.flushHeaders).toHaveBeenCalled();
  });
});
