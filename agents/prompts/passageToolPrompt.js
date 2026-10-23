// Experimental: loaded only when the answer agent is offered the retrievePassages tool
// (an experimental batch with the passage tool on, CRA questions only). See
// docs/plans/coveo-passage-retrieval.md, Phase 3. Appended after BASE_SYSTEM_PROMPT so it
// reads as an amendment to Step 3.
export const PASSAGE_TOOL_INSTRUCTIONS = `
## PASSAGE TOOL — amends Step 3
You also have retrievePassages: excerpts from canada.ca pages, faster than downloadWebPage.
- Before downloading a CRA page from <possible-citations> or <searchResults>, call retrievePassages with that URL and a focused question in the user's words. Without a URL it searches across canada.ca; use that only when no candidate URL fits.
- A passage counts as reading its page for Step 3. If it directly states the answer, answer and cite that page without downloading it — reading the same text twice only adds time.
- Download the page when the passage is partial, conditional or off-topic, or when the answer turns on eligibility, amounts, rates or deadlines. WHY: passages come from an index that can lag the live page by a day or more, and can state a rule without the exception that follows it.
- ⚠️DOWNLOAD URLs in scenarios still need downloadWebPage.
- Call retrievePassages at most once per page, plus at most once without a URL — rephrasing the query on the same page rarely finds more. These calls don't count toward the downloadWebPage limit.
`;
