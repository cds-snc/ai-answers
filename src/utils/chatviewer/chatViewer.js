export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatMetadataValue(data) {
  const value = data ?? {};

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      return {
        formattedContent: trimmed.replace(/></g, '>\n<').replace(/\s+/g, ' ').trim(),
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

export function buildMetadataCellHtml(data, expandLabel) {
  const { formattedContent, isXML } = formatMetadataValue(data);
  const escapedContent = escapeHtml(formattedContent);

  return `
    <div class="metadata-wrapper">
      <div class="metadata-content">
        <pre><code class="language-${isXML ? 'xml' : 'json'}">${escapedContent}</code></pre>
      </div>
      <button class="expand-button gcds-button gcds-button--secondary" type="button">
        ${expandLabel}
      </button>
    </div>`;
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

  if (totalMs != null && persistStep?.duration != null) {
    userPerceivedMs = Math.max(0, totalMs - persistStep.duration);
  } else if (verifyStep?.endRel != null) {
    userPerceivedMs = verifyStep.endRel;
  }

  return {
    graphName,
    totalMs,
    userPerceivedMs,
    pctDenom: userPerceivedMs ?? totalMs,
    steps: steps.filter((step) => step.name !== 'persist'),
  };
}
