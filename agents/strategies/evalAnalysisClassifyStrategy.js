// Strategies for the partner eval-analysis topic classification (Tier 2).
//
// NOTE FOR PROMPT MAINTAINERS: the prompt text below is new and has not been
// through the prompt-tuning process. It lives here (not in agents/prompts/)
// because it is analysis tooling, not part of the answer pipeline — but the
// wording should still be reviewed by Lisa Fast or Ryan Hyma before shipping.

// Shared JSON extraction: strip code fences, then take the outermost JSON
// object/array so stray prose around the payload doesn't break parsing.
const extractJson = (content, openChar, closeChar) => {
  let text = (content || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf(openChar);
  const end = text.lastIndexOf(closeChar);
  const candidate = start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
  try {
    return { parsed: JSON.parse(candidate), raw: text };
  } catch (e) {
    return { parsed: null, raw: text };
  }
};

const TOPIC_PROPOSAL_PROMPT = `You are analyzing questions asked to a Government of Canada AI assistant so a team of expert evaluators can spot  patterns by topic.

Propose a set of topic groups that partitions the sample questions by the program, service, or subject users were asking about. Name the thing, not the activity: a separate pass tags what the user was trying to do (apply, sign in, change contact information…), so "Canada child benefit" is right and "Updating address with CRA" is wrong — the action half would be redundant. Aim for groups specific enough that score differences between them are actionable (a named service, program or subject — not "general inquiries"), but broad enough that most groups will collect several questions. 5-15 groups is the useful range. The seed vocabulary shows the granularity wanted; use its names when they fit the sample, but derive groups from the questions themselves — do not include seed entries nothing was asked about. Citation and referring URLs are strong clues to the subject.

Respond with ONLY a JSON object: {"topics": ["...", "..."]}. Topic names in English, max 6 words each.`;

// request: { department, seedServices: string[], sampleRows: [{ q, cite, ref }] }
export const evalAnalysisTopicsStrategy = {
  buildMessages: (request = {}) => {
    const { department = '', seedServices = [], sampleRows = [] } = request;
    return [
      { role: 'system', content: TOPIC_PROPOSAL_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          department,
          seed_vocabulary: seedServices,
          sample_questions: sampleRows.map((r) => ({ question: r.q, citation_url: r.cite, referring_url: r.ref }))
        })
      }
    ];
  },
  parse: (normalized) => {
    const { parsed, raw } = extractJson(normalized?.content, '{', '}');
    const topics = Array.isArray(parsed?.topics)
      ? parsed.topics.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
      : null;
    return {
      topics,
      raw,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens
    };
  }
};

const CLASSIFY_PROMPT = `You are tagging questions asked to a Government of Canada AI assistant so evaluators can cross-tabulate expert scores by topic and by what the user was trying to do.

For each row, pick the best-fitting topic from the provided topic list and the best-fitting action from the provided action list (synonyms show phrasing variants). Citation and referring URLs are strong clues for the topic. Use "Other" only when nothing fits — a loose fit beats an unclassified row.

Respond with ONLY a JSON array, one entry per input row, same order: [{"id": "...", "topic": "...", "action": "..."}]. Values must come from the provided lists or be "Other".`;

// request: { topics: string[], actions: [{action, synonyms}], rows: [{ id, q, cite, ref }] }
export const evalAnalysisClassifyStrategy = {
  buildMessages: (request = {}) => {
    const { topics = [], actions = [], rows = [] } = request;
    return [
      { role: 'system', content: CLASSIFY_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          topics,
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
