export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// One tag or text run per line, indented by nesting depth. Not a real XML
// parser - display only, never parsed back - a flat open/close/text walk
// is enough to nest it the way real markup reads.
function prettyPrintXml(xml) {
  const tokens = xml.match(/<[^>]+>|[^<]+/g) || [];
  let depth = 0;
  const lines = [];

  for (const rawToken of tokens) {
    const token = rawToken.trim();
    if (!token) continue;

    const isClosing = token.startsWith('</');
    const isSelfClosing = token.endsWith('/>');
    const isOpening = token.startsWith('<') && !isClosing && !isSelfClosing;

    if (isClosing) {
      depth = Math.max(0, depth - 1);
    }

    lines.push('  '.repeat(depth) + token);

    if (isOpening) {
      depth += 1;
    }
  }

  return lines.join('\n');
}

export function formatMetadataValue(data) {
  const value = data ?? {};

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      return {
        formattedContent: prettyPrintXml(trimmed),
        isXML: true,
      };
    }

    try {
      return {
        formattedContent: JSON.stringify(JSON.parse(value), null, 2),
        isXML: false,
      };
    } catch {
      return {
        formattedContent: value,
        isXML: false,
      };
    }
  }

  return {
    formattedContent: JSON.stringify(value, null, 2),
    isXML: false,
  };
}

// Mongo bookkeeping, never useful for reading a trace - and the cause of a
// raw ObjectId sometimes rendering as a wall of "buffer": {"0": 106, ...}
// noise. Stripped recursively - subdocuments (e.g. a stageTimeline entry)
// carry their own _id too.
function stripMongoIds(value) {
  if (Array.isArray(value)) {
    return value.map(stripMongoIds);
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === '_id') continue;
      result[key] = stripMongoIds(entry);
    }
    return result;
  }
  return value;
}

// Compact (single-line) form for one metadata value, used only to decide
// whether it's short enough to show inline - objects/arrays get a plain
// JSON.stringify, primitives print as themselves. The full, expanded
// <details> view always pretty-prints instead.
function formatMetadataPairValue(value) {
  if (value == null) return String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Judged per field, not a pair count - a short scalar field (pageLanguage,
// model, inputTokens...) shows in full regardless of how many siblings it
// has; a field whose own value is a large nested blob (context,
// cleanedHistory, stageTimeline...) collapses even if it's the only one.
// ~5 wrapped lines in the metadata column, measured in characters.
const LONG_VALUE_THRESHOLD = 300;

// One long value's own <details> - a bare <b>key:</b> label line (same as
// every short field), with the content moved into a "View {key}" disclosure
// below it instead of a preview crammed next to the label. Pretty-printed +
// syntax-highlighted once open.
function buildValueDetailsHtml(key, rawValue, { seeFullFieldLabel, seeFullValueLabel }) {
  const labelHtml = key != null ? `<div class="metadata-pair"><b>${escapeHtml(key)}:</b></div>` : '';
  const summaryText = key != null ? seeFullFieldLabel.replace('{key}', key) : seeFullValueLabel;
  const { formattedContent, isXML } = formatMetadataValue(rawValue);
  const codeHtml = `<pre><code class="language-${isXML ? 'xml' : 'json'}">${escapeHtml(formattedContent)}</code></pre>`;

  return `${labelHtml}
    <details class="metadata-more">
      <summary>${escapeHtml(summaryText)}</summary>
      ${codeHtml}
    </details>`;
}

// <english-answer> is always present (agenticBase.js Step 4); a translated
// answer adds a second, generic <answer> tag (Step 5 - there's no literal
// "<french-answer>"). The value can be the raw tagged string directly, or
// nested one level down under an "answer" field's own .content property.
const ANSWER_TAGS = ['english-answer', 'answer'];

// Which tag is present, as a label only - not its content.
function detectAnswerTag(rawValue) {
  const source =
    typeof rawValue === 'string'
      ? rawValue
      : rawValue && typeof rawValue === 'object' && typeof rawValue.content === 'string'
        ? rawValue.content
        : null;
  if (source == null) return null;

  return ANSWER_TAGS.find((tag) => source.includes(`<${tag}>`)) ?? null;
}

// Any field whose value (directly, or nested one level under its own
// .content) is tagged this way gets the same treatment: just the tag name
// (<english-answer> or <answer>) sits beside the label - the answer text
// itself stays entirely inside the disclosure below. Always labelled
// "View answer" regardless of whether the key holding it was "content" or
// "answer".
function buildAnswerFieldHtml(key, value, labels) {
  const tag = detectAnswerTag(value);
  if (tag == null) {
    return null;
  }

  const labelHtml = `<div class="metadata-pair"><b>${escapeHtml(key)}:</b> ${escapeHtml(`<${tag}>`)}</div>`;
  const summaryText = labels.seeFullFieldLabel.replace('{key}', 'answer');
  const { formattedContent, isXML } = formatMetadataValue(value);
  const codeHtml = `<pre><code class="language-${isXML ? 'xml' : 'json'}">${escapeHtml(formattedContent)}</code></pre>`;

  return `${labelHtml}
    <details class="metadata-more">
      <summary>${escapeHtml(summaryText)}</summary>
      ${codeHtml}
    </details>`;
}

export function buildMetadataCellHtml(data, labels) {
  const stripped = stripMongoIds(data);

  // A bare string has no key - one unnamed value to check.
  if (typeof stripped === 'string') {
    if (stripped.length <= LONG_VALUE_THRESHOLD) {
      const { formattedContent, isXML } = formatMetadataValue(stripped);
      const codeHtml = `<pre><code class="language-${isXML ? 'xml' : 'json'}">${escapeHtml(formattedContent)}</code></pre>`;
      return `<div class="metadata-cell">${codeHtml}</div>`;
    }
    return `<div class="metadata-cell">${buildValueDetailsHtml(null, stripped, labels)}</div>`;
  }

  const isEmpty =
    stripped == null || (typeof stripped === 'object' && Object.keys(stripped).length === 0);
  if (isEmpty) {
    return '';
  }

  const entries = Array.isArray(stripped) ? stripped.map((v, i) => [i, v]) : Object.entries(stripped);

  const rowsHtml = entries
    .map(([key, value]) => {
      const answerHtml = buildAnswerFieldHtml(key, value, labels);
      if (answerHtml != null) {
        return answerHtml;
      }
      const compact = formatMetadataPairValue(value);
      return compact.length <= LONG_VALUE_THRESHOLD
        ? `<div class="metadata-pair"><b>${escapeHtml(key)}:</b> ${escapeHtml(compact)}</div>`
        : buildValueDetailsHtml(key, value, labels);
    })
    .join('');

  return `<div class="metadata-cell">${rowsHtml}</div>`;
}

export function buildStepTimeline(logs) {
  if (!logs || logs.length === 0) return null;

  const sorted = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let runStartTs = null;
  let graphName = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const msg = typeof sorted[i].message === 'string' ? sorted[i].message : '';
    if (msg.startsWith('Starting ')) {
      runStartTs = new Date(sorted[i].createdAt).getTime();
      graphName = msg.replace(/^Starting /, '');
      break;
    }
  }

  const runLogs =
    runStartTs != null
      ? sorted.filter((log) => new Date(log.createdAt).getTime() >= runStartTs)
      : sorted;

  const stepMap = new Map();
  const toolCompletions = [];
  let workflowComplete = null;

  for (const log of runLogs) {
    const msg = typeof log.message === 'string' ? log.message : '';

    if (msg === 'Workflow complete') {
      workflowComplete = {
        ts: new Date(log.createdAt).getTime(),
        totalResponseTime: log.metadata?.totalResponseTime ?? null,
      };
      continue;
    }

    const toolMatch = msg.match(/^Tool execution completed:\s+(\S+)/);
    if (toolMatch && typeof log.metadata?.duration === 'number') {
      toolCompletions.push({
        ts: new Date(log.createdAt).getTime(),
        tool: toolMatch[1],
        duration: log.metadata.duration,
      });
      continue;
    }

    const m = msg.match(/^node:(\S+)\s+(input|output)$/);
    if (!m) continue;

    const [, stepName, kind] = m;
    if (!stepMap.has(stepName)) stepMap.set(stepName, { name: stepName });

    const entry = stepMap.get(stepName);
    const ts = new Date(log.createdAt).getTime();
    if (kind === 'input' && entry.input == null) entry.input = ts;
    if (kind === 'output') entry.output = ts;
  }

  if (stepMap.size === 0 && runStartTs == null) return null;

  const anchor =
    runStartTs ??
    Math.min(...Array.from(stepMap.values()).map((entry) => entry.input ?? Infinity));
  if (!Number.isFinite(anchor)) return null;

  const totalMs =
    workflowComplete?.totalResponseTime ??
    (workflowComplete?.ts != null ? workflowComplete.ts - anchor : null);

  const steps = Array.from(stepMap.values())
    .map((entry) => ({
      name: entry.name,
      startRel: entry.input != null ? entry.input - anchor : null,
      endRel: entry.output != null ? entry.output - anchor : null,
      duration: entry.input != null && entry.output != null ? entry.output - entry.input : null,
      input: entry.input,
      output: entry.output,
    }))
    .sort((a, b) => (a.startRel ?? Infinity) - (b.startRel ?? Infinity));

  const answerStep = steps.find((step) => step.name === 'answer');
  if (answerStep && answerStep.input != null && answerStep.output != null) {
    const downloads = toolCompletions.filter(
      (tool) =>
        tool.tool === 'downloadWebPage' &&
        tool.ts >= answerStep.input &&
        tool.ts <= answerStep.output
    );
    const downloadCount = downloads.length;
    const downloadDuration = downloads.reduce((sum, tool) => sum + tool.duration, 0);

    if (downloadCount > 0) {
      answerStep.breakdown = {
        downloadCount,
        downloadDuration,
        generationDuration: Math.max(0, answerStep.duration - downloadDuration),
      };
    }
  }

  const persistStep = steps.find((step) => step.name === 'persist');
  const verifyStep = steps.find((step) => step.name === 'verify');
  let userPerceivedMs = null;

  if (persistStep?.startRel != null) {
    userPerceivedMs = persistStep.startRel;
  } else if (verifyStep?.endRel != null) {
    userPerceivedMs = verifyStep.endRel;
  } else if (totalMs != null) {
    userPerceivedMs = totalMs;
  }

  return {
    graphName,
    totalMs,
    userPerceivedMs,
    pctDenom: userPerceivedMs ?? totalMs,
    steps: steps.filter((step) => step.name !== 'persist'),
  };
}
