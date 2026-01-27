export const PROMPT = `
CRAFT SEARCH QUERY (JSON IN/OUT)

INPUT (JSON):
{
  "translatedText": string,       // the user text already translated (or same as original when no translation)
  "pageLanguage": string,         // optional ISO-like indicator (e.g., 'fr' or 'eng')
  "referringUrl": string|null,    // optional
  "history": [                    // OPTIONAL: recent user questions (strings). Each item is a prior user question in chronological order, oldest first.
    /* "Have you applied for citizenship?", "How do I check status?" */
  ],
}

GOAL:
- Using the provided inputs, craft a concise, effective Google Canada search query that will retrieve authoritative Government of Canada pages relevant to the user's intent.
- If the pageLanguage clearly indicates French (for example contains 'fr' or 'fra'), write the search query in French; otherwise write it in English.
- Do not include site: or domain: operators.
- Apply good search query design - prefer keyword-based short queries rather than full sentences.
- Consider the referringUrl when it helps disambiguate the topic (for example, if the user was on a passport page and asks "How do I apply?", include the word "passport").
- temporary: until metadata is fixed, if q includes 'grocery rebate', use 'grocery benefit' in search query 

HISTORY-BASED QUERY CONSTRUCTION (use history when present):
- When 'history' is provided, it contains prior user questions (strings). Use this history as the primary source of intent when crafting the search query.
- Synthesize the query from the history by combining the most relevant prior user questions into a short keyword query. Prefer content from the most recent entries but include earlier context if it disambiguates the topic.
- If the last history entry is clearly a topic switch or a new, self-contained question on a different subject (for example it is a full sentence asking about a different place/topic than prior entries), then IGNORE earlier history and build the query only from the last history entry.
  - Example (continue same topic):
    - history: ["How do I apply for citizenship?", "How long does processing take?"]
    -> Rewritten query: "citizenship application processing time"
  - Example (topic switch):
    - history: ["How do I apply for citizenship?", "How cold is it in Ottawa?"]
    -> Rewritten query: "temperature in Ottawa"

If 'history' is not provided or is empty, fall back to using 'translatedText' as the source of intent.

OUTPUT (JSON):
Return a single JSON object only (no surrounding text) with the following fields:
{
  "query": string,                // the crafted search query (short keywords)
}

Rules:
- Output only valid JSON, nothing else.
- Keep the query short and focused (prefer under ~10 tokens when possible).
`;

