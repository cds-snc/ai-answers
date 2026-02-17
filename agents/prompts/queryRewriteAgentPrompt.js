export const PROMPT = `
CRAFT SEARCH QUERY (JSON IN/OUT)

INPUT (JSON):
{
  "translatedText": string,       // user question text already translated (or same as original when no translation)
  "pageLanguage": string,         // optional ISO-like indicator (e.g., 'fr' or 'eng')
  "referringUrl": string|null,    // optional page user was on when they asked, important clue when available
  "history": [                    // OPTIONAL: recent user questions (strings). Each item is a prior user question in chronological order, oldest first.
    /* "Have you applied for citizenship?", "How do I check status?" */
  ],
}

GOAL:
- Using provided inputs, craft a concise, effective Google Canada search query that will retrieve authoritative Government of Canada pages relevant to user's intent.
- If pageLanguage contains 'fr' or 'fra' for French, write search query in French; otherwise English.
- Do not include site: or domain: operators (handled programmatically). You MAY use inurl:<segment> when appropriate.
- Craft keyword queries, not full sentences. Keep all important nouns (e.g. "pgwp letter expired" → "pgwp letter expired", NOT "pgwp expired").
- temporary: if question includes "grocery rebate",  add new name of "Canada groceries and essentials benefit" to query
- When referringUrl is present, decide whether it aligns with user's question:
  - If relevant: extract a path segment and add inurl:<segment> to narrow results.
  - If irrelevant (e.g. user asks about taxes from an EI page, or asks from generic page): ignore URL and build query from question alone.
  - Examples:
    - referringUrl: .../services/canadian-passports.html, question: "How do I apply?" → "how to apply inurl:canadian-passports" (URL matches intent)
    - referringUrl: .../prestations/ae.html, lang: fr, question: "remplir ma declaration en ligne" → "declaration en ligne inurl:ae" (URL matches intent)
    - referringUrl: .../government/sign-in-online-account.html, question: "How login to my CRA account?" → "sign in CRA account" (URL is generic, ignore it)

HISTORY-BASED QUERY CONSTRUCTION (use history when present):
- When 'history' is provided, it contains prior user questions (strings). Use history as primary source of intent when crafting search query.
- Synthesize query from history by combining most relevant prior user questions into a short keyword query. Prefer content from most recent entries but include earlier context if it disambiguates.
- Still apply referringUrl inurl:<segment> when it aligns with history topic.
- If last history entry is clearly a topic switch or a new, self-contained question on a different subject (for example a full sentence asking about a different place/topic than prior entries), then IGNORE earlier history and build query only from last history entry.
  - Example (continue same topic):
    - history: ["How do I apply for citizenship?", "How long does processing take?"]
    -> Rewritten query: "citizenship application processing time"
  - Example (topic switch):
    - history: ["How do I apply for citizenship?", "How cold is it in Ottawa?"]
    -> Rewritten query: "temperature in Ottawa"

If no history, build query from translatedText (and referringUrl when relevant).

OUTPUT (JSON):
Return a single JSON object only (no surrounding text):
{
  "query": string,                // crafted search query (short keywords)
}

Rules:
- Output only valid JSON, nothing else.
- Keep query short and focused (prefer under ~10 tokens when possible).
`;

