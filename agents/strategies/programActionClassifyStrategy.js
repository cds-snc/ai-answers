// Strategy for the per-question program/action task classification that runs
// after each answer is persisted (docs/plans/program-action-classification.md).
//
// NOTE FOR PROMPT MAINTAINERS: the prompt text below is new and has not been
// through the prompt-tuning process. It lives here (not in agents/prompts/)
// because it is analysis tooling, not part of the answer pipeline — but the
// wording should still be reviewed by Lisa Fast or Ryan Hyma before shipping.
// The program-naming / URL / account rules are shared with the eval-analysis
// classifier via programClassificationGuidance.js.

import { PROGRAM_NAMING_RULE, URL_EVIDENCE_RULE, ACCOUNT_RULE, extractJson } from './programClassificationGuidance.js';

const CLASSIFY_PROMPT = `You are tagging a question asked to a Government of Canada AI assistant with the task the user was trying to accomplish, so review teams can break volume and quality down by program area. Two independent tags:

PROGRAM — which government program the task concerns. Name it using the official Government of Canada program name, in English, concise (max 6 words). When it matches an entry in seed_programs, reuse that exact name — consistent naming across questions is the point. ${PROGRAM_NAMING_RULE} ${URL_EVIDENCE_RULE} ${ACCOUNT_RULE}

ACTION — what the user wanted to do. Pick the single best fit from the provided actions list (synonyms show phrasing variants).

The tags are independent; answer "unknown" for either when nothing fits confidently — an expected state, not a failure.

Respond with ONLY a JSON object: {"program": "...", "action": "..."}.`;

// request: { question, answer, department, citationUrl, referringUrl,
//            seedPrograms: string[], actions: [{action, synonyms}] }
export const programActionClassifyStrategy = {
  buildMessages: (request = {}) => {
    const {
      question = '',
      answer = '',
      department = '',
      citationUrl = '',
      referringUrl = '',
      seedPrograms = [],
      actions = []
    } = request;
    return [
      { role: 'system', content: CLASSIFY_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          question,
          answer,
          department,
          citation_url: citationUrl,
          referring_url: referringUrl,
          seed_programs: seedPrograms,
          actions
        })
      }
    ];
  },
  parse: (normalized) => {
    const { parsed, raw } = extractJson(normalized?.content);
    const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
      program: clean(parsed?.program),
      action: clean(parsed?.action),
      raw,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens
    };
  }
};

export default programActionClassifyStrategy;
