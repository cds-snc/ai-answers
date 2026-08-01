// Strategy for the partner eval-analysis program classification (Tier 2).
//
// NOTE FOR PROMPT MAINTAINERS: the prompt text below is new and has not been
// through the prompt-tuning process. It lives here (not in agents/prompts/)
// because it is analysis tooling, not part of the answer pipeline — but the
// wording should still be reviewed by Lisa Fast or Ryan Hyma before shipping.
// The URL / account rules are shared with the per-question classifier via
// programClassificationGuidance.js.

import { URL_EVIDENCE_RULE, ACCOUNT_RULE, ACTION_SELECTION_RULE, extractJson } from './programClassificationGuidance.js';

const CLASSIFY_PROMPT = `You are tagging questions asked to a Government of Canada AI assistant so evaluators can cross-tabulate expert scores by program and by what the user was trying to do.

For each row, pick the best-fitting program group from the provided program list and the best-fitting action from the provided action list. ${ACTION_SELECTION_RULE} ${URL_EVIDENCE_RULE} ${ACCOUNT_RULE} Use "Other" only when nothing fits — a loose fit beats an unclassified row.

Respond with ONLY a JSON array, one entry per input row, same order: [{"id": "...", "program": "...", "action": "..."}]. Values must come from the provided lists or be "Other".`;

// request: { programs: string[], actions: [{action, synonyms}], rows: [{ id, q, cite, ref }] }
export const evalAnalysisClassifyStrategy = {
  buildMessages: (request = {}) => {
    const { programs = [], actions = [], rows = [] } = request;
    return [
      { role: 'system', content: CLASSIFY_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          programs,
          actions,
          rows: rows.map((r) => ({ id: r.id, question: r.q, citation_url: r.cite, referring_url: r.ref }))
        })
      }
    ];
  },
  parse: (normalized) => {
    const { parsed, raw } = extractJson(normalized?.content, '[', ']');
    const assignments = Array.isArray(parsed)
      ? parsed.filter((a) => a && typeof a.id === 'string')
      : null;
    return {
      assignments,
      raw,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens
    };
  }
};

export default evalAnalysisClassifyStrategy;
