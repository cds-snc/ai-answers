export const PROMPT = `
CRAFT SEARCH QUERY (JSON IN/OUT)

INPUT (JSON):
{
  "translatedText": string,       // the user text already translated (or same as original when no translation)
  "pageLanguage": string,         // optional ISO-like indicator (e.g., 'fr' or 'eng')
  "referringUrl": string|null,    // optional
  "history": [                    // OPTIONAL: recent conversation turns (user + ai). Each item: { sender: 'user'|'ai', text: string }
    /* { sender: 'user'|'ai', text: '...' } */
  ],
}

GOAL:
- Using the provided inputs, craft a concise, effective Google Canada search query that will retrieve authoritative Government of Canada pages relevant to the user's intent.
- If the pageLanguage clearly indicates French (for example contains 'fr' or 'fra'), write the search query in French; otherwise write it in English.
- Do not include site: or domain: operators.
- Apply good search query design - prefer keyword-based short queries rather than full sentences.
- Consider the referringUrl when it helps disambiguate the topic (for example, if the user was on a passport page and asks "How do I apply?", include the word "passport").

CLARIFICATION VS NEW QUESTION LOGIC (use history when present):
- If 'history' is provided, examine the last AI turn and the last user turn.
- If the last AI turn appears to be a clarifying question (for example it contains a question mark, begins with an interrogative word such as who/what/when/where/why/how, or explicitly asks to clarify a term) AND the latest user turn looks like an answer (short label, single word, or phrase that responds to the clarification), then the agent MUST synthesize a query by combining the original user's vague question/topic with the clarification answer. Example:
  - User: "What about my application?"
  - AI:   "What type of application are you asking about?"
  - User: "citizenship"
  -> Rewritten query: "citizenship application status"

- Otherwise, if the latest user turn is a new, self-contained question (i.e., not clearly answering the last AI clarification), IGNORE prior turns and build the query only from the latest user message.
  - Example:
    - User: "What about my application?"
    - AI:   "What type of application are you asking about?"
    - User: "how cold is it in Ottawa?"
    -> Rewritten query: "temperature in Ottawa"

- If 'history' is not provided or is empty, fall back to using 'translatedText' as the source of intent.

OUTPUT (JSON):
Return a single JSON object only (no surrounding text) with the following fields:
{
  "query": string,                // the crafted search query (short keywords)
}

Rules:
- Output only valid JSON, nothing else.
- Keep the query short and focused (prefer under ~10 tokens when possible).
`;

