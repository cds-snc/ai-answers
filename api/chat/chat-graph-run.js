import { withSession } from '../../middleware/chat-session.js';
import { withOptionalUser } from '../../middleware/auth.js';
import { getGraphApp } from '../../agents/graphs/registry.js';
import { graphRequestContext } from '../../agents/graphs/requestContext.js';

const REQUIRED_METHOD = 'POST';

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildGraphErrorPayload(error) {
  const base = {
    name: error?.name || 'Error',
    message: error?.message || 'Graph execution failed',
  };

  if (error?.userMessage) {
    base.userMessage = error.userMessage;
  }

  const fallbackUrl = typeof error?.fallbackUrl === 'string'
    ? error.fallbackUrl
    : error?.searchUrl?.fallbackUrl || null;
  if (fallbackUrl) {
    base.fallbackUrl = fallbackUrl;
  }

  if (error?.searchUrl && typeof error.searchUrl === 'string') {
    base.searchUrl = error.searchUrl;
  } else if (error?.searchUrl?.fallbackUrl) {
    base.searchUrl = error.searchUrl.fallbackUrl;
  }

  if (error?.redactedText) {
    base.redactedText = error.redactedText;
  }
  if (error?.redactedItems) {
    base.redactedItems = error.redactedItems;
  }

  if (process.env.NODE_ENV !== 'production' && error?.stack) {
    base.stack = error.stack;
  }

  return base;
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
        // Include server-generated chatId so client can store it
        writeEvent(res, 'result', { ...result, chatId: req.chatId });
      }
    },
  };

  try {
    const store = { headers: forwardedHeaders, user: req.user };
    // Only enable graph event streaming for authenticated users
    if (req.user) {
      store.graphEventWriter = (eventName, data) => {
        try {
          writeEvent(res, eventName, data);
        } catch (_err) {
          // ignore writer errors
        }
      };
    }

    await graphRequestContext.run(store, async () => {
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
      try {
        writeEvent(res, 'error', buildGraphErrorPayload(err));
      } catch (_e) {
        // fallback to minimal message if serialization fails
        writeEvent(res, 'error', { message: err?.message || 'Graph execution failed' });
      }
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

    const userAgent = headers['user-agent'];
    if (userAgent) out['User-Agent'] = userAgent;

    return out;
  }
}

export default withOptionalUser(withSession(handler));
