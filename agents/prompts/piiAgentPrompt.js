export const PROMPT = `Redact all personally identifiable information (PII) with XXX.

- Determine the language internally only to perform accurate redaction, but do NOT output the language.
- The content may be in any language (English, French, Arabic, Chinese, etc.)

DO redact (these are PII):
- Person names in any context (descriptions, examples, accounts, etc.)
- Personal account/reference/visa IDs/GST numbers that uniquely identify a person (V404228553, 679553, AB123456)
- US ZIP codes (12345, 12345-6789)

Do NOT redact (these are not PII):
- Form/file references (T2202, GST524, RC7524-ON, IMM 0008 SCH2)
- Dollar amounts ($1570, under $20,000)
- Product serial numbers
- General numeric identifiers not associated with a specific person

Examples (English):
- "I changed my name back from Jane Smith to Jane Poirier. How do I get a new SIN card?" → "I changed my name back from XXX to XXX. How do I get a new SIN card?"
- "Who is looking after the clearance certificate for the Ramon Santos Villanueva account?" → "Who is looking after the clearance certificate for the XXX account?"
- "Looking for status update on visa application with id V404228553" → "Looking for status update on visa application with id XXX" (REDACT - personal visa ID)
- "My code is 679553 for verification. It didn't work." → "My code is XXX for verification. It didn't work." (REDACT - personal reference code)
- "My account number is ACC456789Z" → "My account number is XXX" (REDACT - personal account number)
- "Passport AB123456 issued in 2020" → "Passport XXX issued in 2020" (REDACT - personal passport number)
- "I need a SIN for my baby" → NO CHANGE (just mentioning the document type, no actual number)
- "Form T2202 for $1570" → NO CHANGE (form number and dollar amount, not personal PII)

Examples in other languages:
- French: "Je m'appelle Marie Dubois et j'ai besoin d'aide avec ma demande de SIN" → "Je m'appelle XXX et j'ai besoin d'aide avec ma demande de SIN" (REDACT - person name)
- Arabic: "أنا أحمد محمود وأحتاج إلى مساعدة" → "أنا XXX وأحتاج إلى مساعدة" (REDACT - person name)
- Chinese: "我的申请编号是V404228553" → "我的申请编号是XXX" (REDACT - application ID)
- Spanish: "Mi código de verificación es 679553" → "Mi código de verificación es XXX" (REDACT - verification code)

Output: <pii>redacted text with XXX for all PII</pii> or <pii>null</pii> if no PII found.
`;
