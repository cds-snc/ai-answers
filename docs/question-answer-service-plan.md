# QuestionAnswerService Plan

## Goal
Add a server-side QuestionAnswerService that retrieves similar questions with expert feedback, formats them with sentence-level feedback and citations, and injects them into the LLM context to improve answers.

## Requirements
- Only use interactions that have expert feedback (expertFeedback present).
- Prefer instructive items: use expertFeedbackComparison (lt/lte/eq) when expertFeedbackRating is provided; default comparison=lt for this service, default rating=null; threshold ~0.8, k ~3.
- Surface sentence-level feedback (sentence1–4 scores/explanations, harmful/contentIssue flags) plus citation info when available.
- Keep output concise and ready to drop into the system prompt.

## Data Sources
- Vector services: DocDBVectorService and IMVectorService via initVectorService().matchQuestions()
  - Both already return items with expertFeedbackId and propagate expertFeedbackRating (client sets it); ensure we filter to items with expertFeedbackId in QuestionAnswerService.
- Mongo models: Interaction (links to Answer and ExpertFeedback), Answer (content + citation), ExpertFeedback (sentence-level fields).

## Flow
1) QuestionAnswerService.getSimilarQuestionsContext(question, opts)
   - opts: { k=3, threshold=0.8, expertFeedbackRating=null|number, expertFeedbackComparison='lt'|'lte'|'eq', language=null }
   - Call initVectorService() then matchQuestions([question], opts).
   - Filter to results with expertFeedbackId and interactionId; slice to k.
   - Fetch Interactions by interactionId, populate Answer and ExpertFeedback.
   - Build formatted snippets per hit: Q, A (truncated), total score, sentence feedback bullets, citation URLs if present, and optional question flow (previous user turns) when available.
   - Return a joined string block; return empty string on no results.

2) Integration
   - AnswerGenerationService (or workflow entry) calls QuestionAnswerService before invoking the agent, passing user question and language.
   - Pass the formatted block to buildAnswerSystemPrompt via new option similarQuestions.
   - systemPrompt.js appends a section, e.g., "## Verified Similar Questions" containing the formatted block, before citation instructions.

## Formatting (draft)
For each hit:
- Q: <question text>
- Flow: <prior user questions leading to this turn> (when available)
- A: <answer text (trim to ~400 chars, ellipsis if longer)>
- Score: <expert totalScore/100>
- Feedback: sentence1..4 scores/explanations; include harmful/contentIssue flags if true.
- Citation: providedCitationUrl or aiCitationUrl when present.

## Edge Cases
- No matches -> return empty string.
- Missing answer or feedback -> skip that hit.
- Language filter: if language provided, rely on vector service language filtering when available; otherwise default.

## Next Steps
1) Implement services/QuestionAnswerService.js with the above logic.
2) Update agents/prompts/systemPrompt.js to accept similarQuestions.
3) Update services/AnswerGenerationService.js (or workflow resolver) to supply similarQuestions.
4) Optionally add tests around formatting and filtering.
