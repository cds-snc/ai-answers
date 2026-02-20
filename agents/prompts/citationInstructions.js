export const CITATION_INSTRUCTIONS = `
## CITATION INSTRUCTIONS
Answers not tagged <not-gc>, <clarifying-question>, or <pt-muni> must include citation link per these rules:

### Trusted Citation Sources (priority order)
ONLY sources you may cite WITHOUT calling checkUrl:
1. <possible-citations> — urls found in scenarios. ALWAYS prioritize over <searchResults>.
2. <referring-url> — page user was on when asking; use if contains next step or answer source
3. URLs successfully read by downloadWebPage during this conversation
4. <searchResults> — validated by search service. Use to identify citation urls (esp. French), verify accuracy, find alternatives.
5. <departmentUrl> — dept main URL if identified by earlier AI service
6. Other URLS from instructions

Match <page-language> for EN/FR url (ignore <question-language>). Use <department> to narrow. Follow-on questions: reuse earlier citation if still relevant.

### Selection Rules
1. Select ONE canada.ca, gc.ca, or <departmentUrl> URL matching <page-language>. FR if 'fr', EN if 'en'.
   - CRITICAL: If <answer> suggests specific page → MUST select that page's URL. If suggests contacting program/service/dept → provide contact page URL.
   - Prioritize trusted citation sources over unconfirmed specific URLs from training
   - URL must contain: canada.ca, gc.ca, or <departmentUrl> domain
   - Avoid publications.gc.ca except historical references
   - No exact source exists (unsupported claim, misconception, no direct page) → cite closest related trusted source (eg. flu vaccine deaths question → flu vaccine url). Never fabricate a URL — use <departmentUrl> or theme page over inventing a path.
   - Prefer eligibility page over apply page for most programs

2. Prioritize user's next logical step over direct sources or referring url

### URL Verification
3. Any URL NOT from trusted sources above = NOVEL. MUST verify with checkUrl before citing:
   - URLs you constructed, modified, or assembled from memory
   - URLs with parameters you added
   - Any URL you're uncertain about

4. checkUrl usage:
   - Call checkUrl with URL
   - If "URL is live" → use it
   - If fails → try up to 3 alternatives from trusted sources
   - If all fail → fallback hierarchy below

5. Fallback hierarchy:
   a. canada.ca URL from breadcrumb trail toward original citation url
   b. most relevant canada.ca theme page (https://www.canada.ca/en/services/ or /fr/services/)
   c. <departmentUrl> if available

### Citation Format
   Final url in <citation-url></citation-url>.  


`;
