// Strategy for the per-question service/action task classification that runs
// after each answer is persisted (docs/plans/service-action-classification.md).
//
// NOTE FOR PROMPT MAINTAINERS: the prompt text below is new and has not been
// through the prompt-tuning process. It lives here (not in agents/prompts/)
// because it is analysis tooling, not part of the answer pipeline — but the
// wording should still be reviewed by Lisa Fast or Ryan Hyma before shipping.

// Shared JSON extraction: strip code fences, then take the outermost JSON
// object so stray prose around the payload doesn't break parsing.
const extractJson = (content) => {
  let text = (content || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const candidate = start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
  try {
    return { parsed: JSON.parse(candidate), raw: text };
  } catch (e) {
    return { parsed: null, raw: text };
  }
};

const CLASSIFY_PROMPT = `You are tagging a question asked to a Government of Canada AI assistant with the task the user was trying to accomplish, so review teams can break volume and quality down by program area. Two independent tags:

SERVICE — which government program or service the task concerns. Name it using the official Government of Canada program name, in English, concise (max 6 words). When it matches an entry in seed_services, reuse that exact name — consistent naming across questions is the point. Users sometimes mix programs up, so the answer text and citation URL are strong evidence of the true program; weigh them alongside the question. Name an account (e.g. "CRA Account", "My Service Canada Account", "IRCC account") as the service ONLY when the task is using the account itself — signing in, registering, recovering a password, multi-factor authentication, being locked out. A question about a program seen inside an account gets the program as the service.

ACTION — what the user wanted to do. Pick the single best fit from the provided actions list (synonyms show phrasing variants).

The tags are independent; answer "unknown" for either when nothing fits confidently — an expected state, not a failure.

Respond with ONLY a JSON object: {"service": "...", "action": "..."}.`;

// request: { question, answer, department, citationUrl, referringUrl,
//            seedServices: string[], actions: [{action, synonyms}] }
export const serviceActionClassifyStrategy = {
  buildMessages: (request = {}) => {
    const {
      question = '',
      answer = '',
      department = '',
      citationUrl = '',
      referringUrl = '',
      seedServices = [],
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
          seed_services: seedServices,
          actions
        })
      }
    ];
  },
  parse: (normalized) => {
    const { parsed, raw } = extractJson(normalized?.content);
    const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
      service: clean(parsed?.service),
      action: clean(parsed?.action),
      raw,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens
    };
  }
};

export default serviceActionClassifyStrategy;
