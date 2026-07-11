// Strategy for the partner eval-analysis synthesis pass (Tier 3): one call
// that turns the computed stats + explanation texts into narrative findings
// for the evaluator team, in the dashboard language.
//
// NOTE FOR PROMPT MAINTAINERS: the prompt text below is new and has not been
// through the prompt-tuning process. It lives here (not in agents/prompts/)
// because it is analysis tooling, not part of the answer pipeline — but the
// wording should still be reviewed by Lisa Fast or Ryan Hyma before shipping.

const INSIGHTS_PROMPT = `You are writing findings for a team of expert evaluators who score a Government of Canada AI assistant's answers. They want patterns they can act on, not a restatement of the dashboard.

You receive computed statistics (score categories, per-topic cross-tab, EN vs FR, per-evaluator rates) plus the raw expert explanations from every non-perfect evaluation and every content-issue flag. The numbers are authoritative: every quantitative claim you make must come from them — never estimate or invent a rate. Your value-add is reading the explanation texts: what do the deductions actually indicate (missing information, confusing wording, wrong citation page, outdated content, tone…)? Quote short fragments as evidence. Where the sample behind an observation is small, say so plainly rather than hedging everywhere.

Respond with ONLY a JSON object, all narrative text written in the language given in the request ("en" or "fr"):
{
  "overview": "2-3 sentences: the most important takeaways for this team",
  "topicPatterns": "which topic groups or actions collect deductions vs score perfectly, and what that suggests",
  "explanationThemes": [{"theme": "short label", "count": <rows exhibiting it>, "note": "what it indicates", "examples": ["short quote", "..."]}],
  "contentIssues": "whether the content-issue flags share a pattern (topic, style, tone) — or that there are none/too few",
  "languageComparison": "EN vs FR score differences worth noting, with the small-sample caveat if one language is thin",
  "evaluatorConsistency": "whether evaluators score consistently; name any flagged divergence factually and suggest a human look, not a conclusion"
}`;

// request: { language, department, dateRange, stats, crossTab,
//            lowScoreRows: [{q, score, category, expl, citeExpl, improve, lang, topic, action}],
//            contentIssueRows: [...same shape] }
export const evalAnalysisInsightsStrategy = {
  buildMessages: (request = {}) => {
    const {
      language = 'en',
      department = '',
      dateRange = null,
      stats = null,
      crossTab = null,
      lowScoreRows = [],
      contentIssueRows = []
    } = request;
    return [
      { role: 'system', content: INSIGHTS_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          language,
          department,
          date_range: dateRange,
          stats,
          cross_tab: crossTab,
          non_perfect_evaluations: lowScoreRows,
          content_issue_evaluations: contentIssueRows
        })
      }
    ];
  },
  parse: (normalized) => {
    let text = (normalized?.content || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const candidate = start !== -1 && end !== -1 && end > start ? text.slice(start, end + 1) : text;
    let insights = null;
    try {
      insights = JSON.parse(candidate);
    } catch (e) {
      // leave null; the service marks the run as error with partial results kept
    }
    return {
      insights,
      raw: text,
      model: normalized.model,
      inputTokens: normalized.inputTokens,
      outputTokens: normalized.outputTokens
    };
  }
};

export default evalAnalysisInsightsStrategy;
