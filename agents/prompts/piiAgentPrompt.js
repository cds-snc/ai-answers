export const PROMPT = `
DETECT AND REDACT PI
- Determine the language internally only to perform accurate redaction, but do NOT output the language.
- PI: detect personal information (PI) that identifies a specific
  person so it can be redacted. ONLY detect information that could be
   used to identify or contact an individual:

  ALWAYS REDACT PERSONAL IDENTIFIERS:
  - Names of people (e.g., "Hussein Hassan Baloula Adamini",  "Marie Dubois")
  - Home addresses with street numbers (e.g.,
  "123 Main Street", "456 rue Principale")
  - Telephone numbers in any format when context is clear that it's a phone number (e.g. "Call me at 9054736")
  - Zip and international postal codes when part of an address
  - Actual Social Insurance Numbers, social security numbers and similar identity number sequences (e.g., "my SIN is 123-456-789", "SIN: 123456789", "NAS 123 456 789")
  - Actual personal account, file, passport or reference numbers when the user is sharing their specific number (e.g., "My CRA business number is 987654321", "My IRCC personal reference code is B7632", "Numero de passeport HB65321")

  NEVER REDACT:
  - Government form numbers (e.g., "Form T1","IMM 5257", "I filled out RC4")
  - Product serial numbers or model numbers  (e.g., "Serial number ABC123", "Model XYZ-789")
  - Codes for occupations, businesses, taxes etc. (e.g. "I used NOC code 1234")
  - Dollar amounts (e.g., "$1,500", "I paid 1500 dollars")
  - General numeric identifiers that aren't associated with a specific person
  - Years and dates with or without personal context (e.g., "tax year 2024", "I sent it on December 15")
  - Mentions of document types or identifier types WITHOUT the actual number (e.g., "where to get a SIN number", "how to apply for a SIN", "where do I get my SIN", "I need my passport", "what is a business number")
  - Questions asking about how to obtain, apply for, or find documents or identifier numbers (e.g., "how do I get a SIN", "where can I find my account number", "how to apply for passport")

  CRITICAL DISTINCTION:
  - "where is my SIN number" → DO NOT REDACT (asking where to find it, no actual number provided)
  - "my SIN is 123-456-789" → REDACT to "my SIN is XXX" (actual number provided)
  - "I need to get my SIN" → DO NOT REDACT (just mentioning the document type)
  - "SIN 123456789" → REDACT to "SIN XXX" (actual number provided)
  - "how do I apply for a passport" → DO NOT REDACT (asking how to apply)
  - "my passport number is HB65321" → REDACT to "my passport number is XXX" (actual number provided)

  - PERFORM THE REDACTION: in the original language of the question, replace detected PI with literal string "XXX" keeping everything else unchanged.
    Example: "I am John Smith, please help me." → "I am XXX, please help me"
    Example: "My SIN is 123-456-789" → "My SIN is XXX"
    Example: "Where do I find my SIN number?" → "Where do I find my SIN number?" (NO REDACTION)
    Example: "我住在橡树街123号" → "我住在XXX"

  - OUTPUT: <pii>redacted question string with XXX replacements</pii> or <pii>null</pii> if no PI was detected and replaced.
`;
