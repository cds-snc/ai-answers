// Strategies for the partner eval-analysis program classification (Tier 2).
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

const PROGRAM_PROPOSAL_PROMPT = `You are analyzing questions asked to a Government of Canada AI assistant so a team of expert evaluators can spot patterns by program.

Propose a set of program groups that partitions the sample questions by the government program (or subject) users were asking about. Name the program, not the activity: a separate pass tags what the user was trying to do (apply, sign in, change contact information…), so "Canada child benefit" is right and "Updating address with CRA" is wrong — the action half would be redundant. Aim for groups specific enough that score differences between them are actionable (a named program or subject — not "general inquiries"), but broad enough that most groups will collect several questions. 5-15 groups is the useful range. The seed vocabulary shows the granularity wanted; use its names when they fit the sample, but derive groups from the questions themselves — do not include seed entries nothing was asked about. Citation and referring URLs are strong clues to the program. Account groups (CRA Account, My Service Canada Account, IRCC account…) are for questions about using the account itself — sign in, register, recover access; a question about a program seen inside an account belongs with the program.

Respond with ONLY a JSON object: {"programs": ["...", "..."]}. Program group names in English, max 6 words each.`;

// request: { department, seedPrograms: string[], sampleRows: [{ q, cite, ref }] }
export const evalAnalysisProgramsStrategy = {
  buildMessages: (request = {}) => {
    const { department = '', seedPrograms = [], sampleRows = [] } = request;
    return [
      { role: 'system', content: PROGRAM_PROPOSAL_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          department,
          seed_vocabulary: seedPrograms,
          sample_questions: sampleRows.map((r) => ({ question: r.q, citation_url: r.cite, referring_url: r.ref }))
        })
      }
    ];
  },
  parse: (normalized) => {
    const { parsed, raw } = extractJson(normalized?.content, '{', '}');
    const programs = Array.isArray(parsed?.programs)
      ? parsed.programs.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
      : null;
    return {
      programs,
      raw,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens
    };
  }
};

const CLASSIFY_PROMPT = `You are tagging questions asked to a Government of Canada AI assistant so evaluators can cross-tabulate expert scores by program and by what the user was trying to do.

For each row, pick the best-fitting program group from the provided program list and the best-fitting action from the provided action list (synonyms show phrasing variants). Citation and referring URLs are strong clues for the program. An account group (CRA Account, My Service Canada Account, IRCC account…) fits only when the task is using the account itself — sign in, register, recover access; a question about a program seen inside an account gets the program. Use "Other" only when nothing fits — a loose fit beats an unclassified row.

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
