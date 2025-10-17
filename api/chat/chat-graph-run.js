import { getGraphApp } from '../../agents/graphs/registry.js';
import { graphRequestContext } from '../../agents/graphs/requestContext.js';
import { withSession } from '../../middleware/session.js';

const REQUIRED_METHOD = 'POST';

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function traverseForUpdates(value, handlers) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => traverseForUpdates(item, handlers));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'status') {
        handlers.onStatus?.(inner);
      } else if (key === 'result') {
        handlers.onResult?.(inner);
      } else {
        traverseForUpdates(inner, handlers);
      }
    }
  }
}

async function handler(req, res) {
  if (req.method !== REQUIRED_METHOD) {
    res.setHeader('Allow', [REQUIRED_METHOD]);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const { graph, input } = req.body || {};
  if (typeof graph !== 'string' || !graph.trim()) {
    return res.status(400).json({ message: 'graph is required' });
  }
  if (typeof input !== 'object' || input === null) {
    return res.status(400).json({ message: 'input must be an object' });
  }

  const name = graph.trim();
  const graphApp = await getGraphApp(name);
  if (!graphApp) {
    return res.status(404).json({ message: `Unknown graph: ${name}` });
  }

  const forwardedHeaders = buildForwardedHeaders(req.headers || {});

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(': connected\n\n');

  let resultSent = false;
  let streamError = null;

  const handlers = {
    onStatus: (status) => {
      if (status) {
        writeEvent(res, 'status', { status, graph: name });
      }
    },
    onResult: (result) => {
      if (!resultSent && result && result.answer && result.answer.answerType) {
        resultSent = true;
        writeEvent(res, 'result', result);
      }
    },
  };

  try {
    await graphRequestContext.run({ headers: forwardedHeaders }, async () => {
      const stream = await graphApp.stream(input, { streamMode: 'updates' });
      for await (const update of stream) {
        traverseForUpdates(update, handlers);
        if (resultSent) {
          break;
        }
      }
    });
  } catch (err) {
    streamError = err;
    if (!resultSent) {
      writeEvent(res, 'error', { message: err?.message || 'Graph execution failed' });
      resultSent = true;
    }
  } finally {
    if (!resultSent && !streamError) {
      writeEvent(res, 'error', { message: 'Graph completed without result payload' });
    }
    res.end();
  }

  function buildForwardedHeaders(headers) {
    const out = {};
    if (!headers) return out;

    const cookie = headers['cookie'];
    if (cookie) out['Cookie'] = cookie;

    const authorization = headers['authorization'];
    if (authorization) out['Authorization'] = authorization;

    const sessionToken = headers['x-session-token'];
    if (sessionToken) out['x-session-token'] = sessionToken;

    const fpId = headers['x-fp-id'];
    if (fpId) out['x-fp-id'] = fpId;

    const fpHash = headers['x-fp-hash'];
    if (fpHash) out['x-fp-hash'] = fpHash;

    const chatIdHeader = headers['x-chat-id'];
    if (chatIdHeader) out['x-chat-id'] = chatIdHeader;

    const bypass = headers['x-session-bypass'];
    if (bypass) out['x-session-bypass'] = bypass;

    return out;
  }
}

export default withSession(handler);
