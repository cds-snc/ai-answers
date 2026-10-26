import { describe, it, expect, vi } from 'vitest';
import chatGraphRunHandler, { setNdjsonHeaders, setStreamingHeaders } from '../chat-graph-run.js';

const mocks = vi.hoisted(() => ({
  settingsGet: vi.fn(),
  getGraphApp: vi.fn(),
  recordRequest: vi.fn(),
  batchFindById: vi.fn(),
  streamInput: null,
}));

vi.mock('../../db/db-connect.js', () => ({ default: vi.fn() }));

vi.mock('../../../models/batch.js', () => ({
  Batch: {
    findById: (id) => ({ lean: () => mocks.batchFindById(id) }),
  },
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
    stream: async function* (input) {
      mocks.streamInput = input;
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
    if (key === 'search.default') return 'google';
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

  it('uses the configured search provider for public chats', async () => {
    mockSettingsTransport('sse');
    mocks.settingsGet.mockImplementation((key) => {
      if (key === 'chat.transport') return 'sse';
      if (key === 'workflow.default') return 'GenericGraph';
      if (key === 'model.default') return 'openai-gpt51';
      if (key === 'search.default') return 'canadaca';
      return null;
    });
    setupGraphStream();
    const req = createRequest();
    req.body.input.searchProvider = 'google';

    await chatGraphRunHandler(req, createResponse());

    expect(mocks.streamInput.searchProvider).toBe('canadaca');
  });

  it('preserves the explicitly passed search provider for admin chats', async () => {
    mockSettingsTransport('sse');
    setupGraphStream();
    const req = createRequest();
    req.user = { userId: 'user-123', role: 'admin' };
    req.isAuthenticated = () => true;
    req.body.input.searchProvider = 'canadaca';

    await chatGraphRunHandler(req, createResponse());

    expect(mocks.streamInput.searchProvider).toBe('canadaca');
  });

  it('uses the configured search provider for invalid admin values', async () => {
    mocks.settingsGet.mockImplementation((key) => {
      if (key === 'chat.transport') return 'sse';
      if (key === 'workflow.default') return 'GenericGraph';
      if (key === 'model.default') return 'openai-gpt51';
      if (key === 'search.default') return 'canadaca';
      return null;
    });
    setupGraphStream();
    const req = createRequest();
    req.user = { userId: 'user-123', role: 'admin' };
    req.isAuthenticated = () => true;
    req.body.input.searchProvider = 'unsupported-provider';

    await chatGraphRunHandler(req, createResponse());

    expect(mocks.streamInput.searchProvider).toBe('canadaca');
  });

  it('runs the workflow, model and search provider an admin chose', async () => {
    mockSettingsTransport('sse');
    setupGraphStream();
    const req = createRequest();
    req.user = { userId: 'admin-1', role: 'admin' };
    req.isAuthenticated = () => true;
    req.body.graph = 'DefaultWithVectorGraph';
    req.body.input.selectedAI = 'openai-other';
    req.body.input.searchProvider = 'canadaca';

    await chatGraphRunHandler(req, createResponse());

    expect(mocks.getGraphApp).toHaveBeenLastCalledWith('DefaultWithVectorGraph');
    expect(mocks.streamInput.selectedAI).toBe('openai-other');
    expect(mocks.streamInput.searchProvider).toBe('canadaca');
  });

  it('ignores a partner\'s workflow, model and search provider and runs the system defaults', async () => {
    mockSettingsTransport('sse');
    setupGraphStream();
    const req = createRequest();
    req.user = { userId: 'partner-1', role: 'partner' };
    req.isAuthenticated = () => true;
    req.body.graph = 'DefaultWithVectorGraph';
    req.body.input.selectedAI = 'openai-other';
    req.body.input.searchProvider = 'canadaca';

    await chatGraphRunHandler(req, createResponse());

    expect(mocks.getGraphApp).toHaveBeenLastCalledWith('GenericGraph');
    expect(mocks.streamInput.selectedAI).toBe('openai-gpt51');
    expect(mocks.streamInput.searchProvider).toBe('google');
  });

  it('applies scenario overrides for the signed-in user, not the user ID the client sent', async () => {
    mockSettingsTransport('sse');
    setupGraphStream();
    const req = createRequest();
    req.user = { userId: 'partner-1', role: 'partner' };
    req.isAuthenticated = () => true;
    req.body.input.overrideUserId = 'someone-else';

    await chatGraphRunHandler(req, createResponse());

    expect(mocks.streamInput.overrideUserId).toBe('partner-1');
  });

  it('applies no scenario override for a signed-out user who sends a user ID', async () => {
    mockSettingsTransport('sse');
    setupGraphStream();
    const req = createRequest();
    req.body.input.overrideUserId = 'someone-else';

    await chatGraphRunHandler(req, createResponse());

    expect(mocks.streamInput.overrideUserId).toBeNull();
  });

  describe('batch questions', () => {
    const BATCH_ID = '64b7f0c2a1b2c3d4e5f60718';
    const savedBatch = {
      _id: BATCH_ID,
      workflow: 'DefaultWithVectorGraph',
      aiProvider: 'azure',
      searchProvider: 'canadaca',
      createdBy: 'partner-1',
    };

    function batchRequest(user) {
      const req = createRequest();
      req.user = user;
      req.isAuthenticated = () => !!user;
      req.body.batchId = BATCH_ID;
      // Whatever the client sends, the saved batch wins
      req.body.graph = 'GenericWithQAGraph';
      req.body.input.selectedAI = 'openai-gpt51';
      req.body.input.searchProvider = 'google';
      return req;
    }

    it('runs a partner\'s own batch with the settings saved on the batch', async () => {
      mockSettingsTransport('sse');
      setupGraphStream();
      mocks.batchFindById.mockResolvedValue(savedBatch);

      await chatGraphRunHandler(batchRequest({ userId: 'partner-1', role: 'partner' }), createResponse());

      expect(mocks.batchFindById).toHaveBeenCalledWith(BATCH_ID);
      expect(mocks.getGraphApp).toHaveBeenLastCalledWith('DefaultWithVectorGraph');
      expect(mocks.streamInput.selectedAI).toBe('azure');
      expect(mocks.streamInput.searchProvider).toBe('canadaca');
    });

    it('runs any batch for an admin with the settings saved on the batch', async () => {
      mockSettingsTransport('sse');
      setupGraphStream();
      mocks.batchFindById.mockResolvedValue(savedBatch);

      await chatGraphRunHandler(batchRequest({ userId: 'admin-1', role: 'admin' }), createResponse());

      expect(mocks.getGraphApp).toHaveBeenLastCalledWith('DefaultWithVectorGraph');
      expect(mocks.streamInput.selectedAI).toBe('azure');
    });

    it('uses the system defaults for settings the batch left on "use system settings"', async () => {
      mockSettingsTransport('sse');
      setupGraphStream();
      mocks.batchFindById.mockResolvedValue({ ...savedBatch, workflow: 'Default', aiProvider: '', searchProvider: '' });

      await chatGraphRunHandler(batchRequest({ userId: 'partner-1', role: 'partner' }), createResponse());

      expect(mocks.getGraphApp).toHaveBeenLastCalledWith('GenericGraph');
      expect(mocks.streamInput.selectedAI).toBe('openai-gpt51');
      expect(mocks.streamInput.searchProvider).toBe('google');
    });

    it.each([
      ['another partner\'s batch', { userId: 'partner-2', role: 'partner' }, savedBatch],
      ['a batch that does not exist', { userId: 'partner-1', role: 'partner' }, null],
      ['a signed-out user', undefined, savedBatch],
    ])('refuses %s without running anything', async (_label, user, found) => {
      mockSettingsTransport('sse');
      setupGraphStream();
      mocks.getGraphApp.mockClear();
      mocks.batchFindById.mockResolvedValue(found);
      const res = createResponse();

      await chatGraphRunHandler(batchRequest(user), res);

      expect(res.statusCode).toBe(403);
      expect(mocks.getGraphApp).not.toHaveBeenCalled();
    });

    it('refuses a batch ID that is not a valid ID without looking it up', async () => {
      mockSettingsTransport('sse');
      setupGraphStream();
      mocks.batchFindById.mockClear();
      const req = batchRequest({ userId: 'partner-1', role: 'partner' });
      req.body.batchId = { $ne: null };
      const res = createResponse();

      await chatGraphRunHandler(req, res);

      expect(res.statusCode).toBe(403);
      expect(mocks.batchFindById).not.toHaveBeenCalled();
    });
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
