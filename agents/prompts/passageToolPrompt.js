// Experimental: loaded only when the answer agent is offered the retrievePassages tool
// (an experimental batch with the passage tool on, CRA questions only, or an admin chat with
// the passage tool option on, any question). Any page URL can be
// passed; the passage index's scope is set on Coveo's side. See
// docs/plans/coveo-passage-retrieval.md, Phase 3. Appended after BASE_SYSTEM_PROMPT so it
// reads as an amendment to Step 3.
export const PASSAGE_TOOL_INSTRUCTIONS = `
## PASSAGE TOOL — amends Step 3
You also have retrievePassages: excerpts from canada.ca pages, faster than downloadWebPage.
- Before downloading a page from <possible-citations> or <searchResults>, call retrievePassages with that URL and a focused question in the user's words — even if you expect to download it. Without a URL it searches across canada.ca; use that only when no candidate URL fits.
- A passage counts as reading its page for Step 3, and as downloaded content wherever these instructions say to verify specifics. If it directly states the answer, including a date or amount, give it and cite that page without downloading it — reading the same text twice only adds time.
- Download the page only when the passage leaves the answer open: it lacks the specific date, amount or figure the question asks for, it's off-topic or cut off, it states a rule, amount or deadline without the conditions or exceptions around it, or it gives a yearly amount or rate without saying which year it applies to. WHY: a passage is an excerpt. It can separate a rule from its exception, and it often leaves out what pages keep in expandable sections and tables, such as payment dates. Don't answer around a missing fact (e.g. "sign in to check") when the page itself may state it.
- ⚠️DOWNLOAD URLs in scenarios still need downloadWebPage.
- Call retrievePassages at most once per page, plus at most once without a URL — rephrasing the query on the same page rarely finds more. These calls don't count toward the downloadWebPage limit.
`;
