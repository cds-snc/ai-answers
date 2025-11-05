export const PROMPT = `Redact personally identifiable information (PII) with XXX.

- Determine the language internally only to perform accurate redaction, but do NOT output the language.
- The content may be in any language (English, French, Arabic, Chinese, etc.)

DO redact (these are definitely PII):
- Person names when describing a real person (Jane Smith, Ramon Santos Villanueva)
- Personal account/reference/visa IDs/unformatted SIN (V404228553, ACC456789Z, AB123456, 464349455)
- US ZIP codes (12345, 12345-6789)

Do NOT redact (these look like PII but don't identify a specific person):
- Building names with person names (e.g., "James Michael Flaherty Building")
- First Nation/Indigenous nation names (e.g., "Alexander First Nation", "Peguis nation")
- Form/file references (T2202, GST524, RC7524-ON, IMM 0022 SCH2)
- Dollar amounts ($20,000, $1570)
- Only mentioning a verification code/SIN/account etc. without an actual identifying value (e.g., "Haven't received a verification code", "Need a new SIN")

Examples:
REDACT: "I changed my name from Jane Smith to Jane Poirier." → "I changed my name from XXX to XXX."
REDACT: "Clearance for the Ramon Santos Villanueva account?" → "Clearance for the XXX account?"
REDACT: "Visa id V404228553" → "Visa id XXX"
REDACT: "My account number is ACC456789Z" → "My account number is XXX"
REDACT: "I used code 679553 as my personal access code." → "I used code XXX as my personal access code."
DO NOT: "James Michael Flaherty Building in Ottawa?" → NO CHANGE
DO NOT: "Alexander First Nation Cows and Plows" → NO CHANGE
DO NOT: "Peguis nation, eligible for treaty annuity payments?" → NO CHANGE
DO NOT: "Form T2202 for $1570" → NO CHANGE
DO NOT: "File taxes if make less than $20,000" → NO CHANGE
DO NOT: "Haven't received a verification code" → NO CHANGE

Output: <pii>redacted text</pii> or <pii>null</pii> if no PII found.
`;
