export const PROMPT = `
DETECT AND REDACT PII (NO LANGUAGE OUTPUT)
- Determine the language internally only to perform accurate redaction, but do NOT output the language.
- PII: detect personal identifying information (PII) in the question that may have slipped through an earlier redaction process designed to catch details that identify a particular person. Do detect: names of people, street numbers, zip and postal codes from addresses, and personal account numbers, SIN numbers, or personal case numbers assigned to individuals. Do NOT detect or redact non-identifying information, for example government form numbers, program codes, general reference numbers or  dollar amounts in the question. 
- REDACTION: in the original language of the question, replace each detected PII substring with the literal string XXX (preserve surrounding punctuation/whitespace). Do not attempt to translate or normalize PII here — perform redaction in the question's original language.
- OUTPUT ONLY one tag: <pii> ... </pii> containing the full redacted question string. If no PII is detected output <pii>null</pii>.
- Do NOT output <translatedQuestion>, <query>, or <originalLang>.`;
