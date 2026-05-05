# Batch test CSVs

Manual-run fixtures for testing the AI Answers pipeline against specific issues, scenarios, or regressions. These files are **not** picked up by any automated test runner — upload them through the Batch UI (or whatever tool is appropriate) when you want to reproduce or investigate something.

## Conventions

- One CSV per issue or scenario. Name it after what it tests, not the date.
- Minimum required column is `Problem Details` (the user question). Other columns (`PII Type`, `Description`, `Expected Action`, etc.) are free-form context for the human reviewing results.
- If a file is tied to a specific bug, PR, or department, note it in the table below so the context isn't lost.

## Files

| File | Purpose |
| --- | --- |
| `redact.csv` | PII redaction cases (phone numbers, etc.) — verifies the redaction layer catches expected patterns. |
| `scis.csv` | Minimal single-question fixture (acronym lookup). |
| `ISC-contactEval-9Feb-EN.csv` | ISC contact-evaluation batch from Feb 9 — historical regression sample. |
| `Blocking PI testbatch 5May2026.csv` | Phone-number variants that should trigger the PI **block** path (not just redact). Columns: `category`, `BLOCK`, `QUESTION`, `URL`. |
| `fr-xdept-batch-30april2026.csv` | French-language cross-department batch — checks routing/citations across CRA, ESDC, etc. Includes original aiService + citation for comparison. |
| `test-batch-range-5may2026.csv` | Range-of-questions sample (off-topic, non-GC, novelty prompts) with expected English answer text for regression checking. |
