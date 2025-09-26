import { getGraphApp } from '../../agents/graphs/registry.js';
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
    const stream = await graphApp.stream(input, { streamMode: 'updates' });
    for await (const update of stream) {
      traverseForUpdates(update, handlers);
      if (resultSent) {
        break;
      }
    }
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
}

export default withSession(handler);
