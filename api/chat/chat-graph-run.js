import { SettingsService } from '../../services/SettingsService.js';
import { withChatSession } from '../../middleware/chat-session.js';
import ConversationIntegrityService from '../../services/ConversationIntegrityService.js';
import { withOptionalUser } from '../../middleware/auth.js';
import { getGraphApp } from '../../agents/graphs/registry.js';
import { graphRequestContext } from '../../agents/graphs/requestContext.js';
import { MODEL_VALUES } from '../../src/config/workflows.js';

const REQUIRED_METHOD = 'POST';

function writeEvent(res, event, data) {
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (_e) {
    // Client may have disconnected after receiving the result; ignore write
    // failures so the graph can finish running (notably persistNode).
  }
}

export function setStreamingHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');

  // Make sure Node pushes small SSE frames immediately.
  res.socket?.setNoDelay?.(true);
  res.flushHeaders?.();
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

  // Include any server-provided history signature so clients can persist it
  if (error?.historySignature) {
    base.historySignature = error.historySignature;
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

  // When REQUIRE_AUTH_FOR_CHAT is enabled (sandbox), block unauthenticated users
  if (process.env.REQUIRE_AUTH_FOR_CHAT === 'true' && !req.isAuthenticated()) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const { graph: clientGraph, input } = req.body || {};

  if (typeof input !== 'object' || input === null) {
    return res.status(400).json({ message: 'input must be an object' });
  }

  // Ensure the graph uses the validated/generated chatId from the session middleware
  input.chatId = req.chatId;

  // Server-side Workflow Resolution
  let graphName;
  const defaultWorkflow = SettingsService.get('workflow.default') || 'GenericGraph';

  if (req.user) {
    // Authenticated users can choose their workflow, fallback to default if not provided
    graphName = (typeof clientGraph === 'string' && clientGraph.trim())
      ? clientGraph.trim()
      : defaultWorkflow;
  } else {
    // Unauthenticated users are FORCED to use the system default workflow
    // ignoring any client-provided value to prevent unauthorized graph usage
    graphName = defaultWorkflow;
  }

  // Server-side Model Resolution
  // The model.default setting decouples model choice from workflow choice.
  // Workflows no longer need to hardcode a model — the server injects it here.
  // Falls back to the first MODEL_VALUES entry when model.default hasn't been
  // saved yet (e.g. first deploy before an admin visits Settings).
  const defaultModel = SettingsService.get('model.default') || MODEL_VALUES[0];
  if (!req.user) {
    // Unauthenticated users: forced to use the system default model
    input.selectedAI = defaultModel;
  } else if (!input.selectedAI) {
    // Authenticated users: use default model when client didn't explicitly set one
    input.selectedAI = defaultModel;
  }

  const graphApp = await getGraphApp(graphName);
  if (!graphApp) {
    // Fallback to DefaultWithVectorGraph if the resolved name is invalid/missing
    const fallbackApp = await getGraphApp('DefaultWithVectorGraph');
    if (fallbackApp) {
      // Log warning but proceed with fallback
      if (console && console.warn) console.warn(`Unknown graph '${graphName}', falling back to DefaultWithVectorGraph`);
    } else {
      return res.status(404).json({ message: `Unknown graph: ${graphName}` });
    }
  }
  const appToRun = graphApp || await getGraphApp('DefaultWithVectorGraph');

  const forwardedHeaders = buildForwardedHeaders(req.headers || {});

  setStreamingHeaders(res);

  res.write(': connected\n\n');

  // Send periodic SSE comments to prevent proxies (e.g. Akamai) from dropping
  // idle connections during long LLM calls (GPT-5.1 reasoning can take 60-120s).
  let keepAliveTimer = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_e) { clearInterval(keepAliveTimer); }
  }, 15000);

  let resultSent = false;
  let streamError = null;

  const handlers = {
    onStatus: (status) => {
      if (status) {
        writeEvent(res, 'status', { status, graph: graphName });
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
    const store = { headers: forwardedHeaders, user: req.user, onStatus: handlers.onStatus };
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
      const stream = await appToRun.stream(input, { streamMode: 'updates' });
      // Drain the full stream — do NOT break after emitting the result.
      // The `result` is emitted by verifyNode, but persistNode runs after and
      // saves the Chat to MongoDB. Breaking early cancels the async iterator
      // and can leave persistNode unfinished, causing items to be silently
      // dropped from the DB.
      for await (const update of stream) {
        traverseForUpdates(update, handlers);
      }
    });
  } catch (err) {
    streamError = err;
    if (!resultSent) {
      try {
        // If the graph error did not include a server-signed historySignature,
        // attempt to compute a fallback signature from the provided input so
        // the client can persist a consistent token for subsequent requests.
        if (!err.historySignature) {
          try {
            const convo = Array.isArray(input.conversationHistory) ? input.conversationHistory : [];
            const userMsg = input.userMessage || '';
            const finalHistory = [...convo, { sender: 'user', text: userMsg }];
            err.historySignature = ConversationIntegrityService.calculateSignature(finalHistory);
          } catch (_sigErr) {
            // ignore signature generation failures
          }
        }
        writeEvent(res, 'error', buildGraphErrorPayload(err));
      } catch (_e) {
        // fallback to minimal message if serialization fails
        writeEvent(res, 'error', { message: err?.message || 'Graph execution failed' });
      }
      resultSent = true;
    }
  } finally {
    clearInterval(keepAliveTimer);
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

export default withOptionalUser(withChatSession(handler));
