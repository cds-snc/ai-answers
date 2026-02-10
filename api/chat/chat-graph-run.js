import { SettingsService } from '../../services/SettingsService.js';
import { withChatSession } from '../../middleware/chat-session.js';
import { withOptionalUser } from '../../middleware/auth.js';
import { withBotProtection } from '../../middleware/bot-protection.js';
import { withRateLimiter } from '../../middleware/rate-limiter.js';
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

  const { graph: clientGraph, input } = req.body || {};

  if (typeof input !== 'object' || input === null) {
    return res.status(400).json({ message: 'input must be an object' });
  }

  // Ensure the graph uses the validated/generated chatId from the session middleware
  input.chatId = req.chatId;

  // Server-side Workflow Resolution
  let graphName;
  const defaultWorkflow = SettingsService.get('workflow.default') || 'DefaultGraph';

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

  // Map the configuration name (e.g. 'DefaultGraph') to the internal registry name if needed
  // (The registry uses keys like 'GenericWorkflowGraph', 'InstantAndQAGraph', etc. matching the setting values)
  // We need to ensure the setting value maps correctly to registry keys.
  // The SettingsService returns values like 'DefaultGraph', 'InstantAndQAGraph'.
  // The registry expects:
  // 'DefaultGraph' -> 'GenericWorkflowGraph' (special mapping from ChatWorkflowService legacy)
  // 'InstantAndQAGraph' -> 'InstantAndQAGraph'
  // 'GPT5MiniDefaultGraph' -> 'GPT5MiniDefaultGraph'
  // 'DefaultWithVectorGraph' -> 'DefaultWithVectorGraph'

  let registryName = graphName;
  if (graphName === 'DefaultGraph') {
    registryName = 'GenericWorkflowGraph';
  }

  const graphApp = await getGraphApp(registryName);
  if (!graphApp) {
    // Fallback to DefaultWithVectorGraph if the resolved name is invalid/missing
    const fallbackApp = await getGraphApp('DefaultWithVectorGraph');
    if (fallbackApp) {
      // Log warning but proceed with fallback
      if (console && console.warn) console.warn(`Unknown graph '${registryName}', falling back to DefaultWithVectorGraph`);
    } else {
      return res.status(404).json({ message: `Unknown graph: ${registryName}` });
    }
  }
  const appToRun = graphApp || await getGraphApp('DefaultWithVectorGraph');

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
      const stream = await appToRun.stream(input, { streamMode: 'updates' });
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

export default withOptionalUser(withRateLimiter(withBotProtection(withChatSession(handler))));
