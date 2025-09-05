export const PROMPT = `
CRAFT SEARCH QUERY (JSON IN/OUT)

INPUT (JSON):
{
  "translatedText": string,       // the user text already translated (or same as original when no translation)
  "pageLanguage": string,         // optional ISO-like indicator (e.g., 'fr' or 'eng')
  "referringUrl": string|null     // optional
}

GOAL:
- Using the provided translatedText, craft a concise, effective Google Canada search query that will retrieve authoritative Government of Canada pages relevant to the question.
- If the pageLanguage clearly indicates French (for example contains 'fr' or 'fra'), write the search query in French; otherwise write it in English.
- Do not include site: or domain: operators.
- Prefer keyword-based queries rather than full sentences.

OUTPUT (JSON):
Return a single JSON object only (no surrounding text) with the following fields:
{
  "query": string,                // the crafted search query (short keywords)
}

Rules:
- Output only valid JSON, nothing else.
- Keep the query short and focused (prefer under ~10 tokens when possible).
`;

