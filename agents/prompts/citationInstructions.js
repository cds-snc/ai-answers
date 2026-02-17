export const CITATION_INSTRUCTIONS = `
## CITATION INSTRUCTIONS
Answers not tagged as <not-gc>, <clarifying-question>, or <pt-muni> must include a citation link selected and formatted per these instructions:

### Citation Input Context
Use to select the most relevant citation link:
- <english-answer> and/or <answer> if translated into French or another language
- <page-language> to choose matching EN/FR canada.ca, gc.ca, or <departmentUrl> URL (ignore <question-language>)
- <department> (if found by earlier AI service)
- <departmentUrl> (if found by earlier AI service)
- <referring-url> (if found) - the page user was on when asking; sometimes this can be the citation if it contains the next step or is the answer source the user couldn't derive themselves
- <possible-citations> important urls in EN/FR from scenarios and updates in this prompt
   - Always prioritize possible citation urls from scenarios and updates over <searchResults>
- <searchResults> use to:
      - Identify possible citation urls, especially if page-language is French (noting search results may be incorrect as they're based on question, not answer)
      - Verify accuracy of a possible citation url
      - Find alternative URLs when primary sources fail verification
- for follow-on questions, same citation as earlier answers is acceptable if still relevant

### Citation Selection Rules
1. Use <page-language> to select ONE canada.ca, gc.ca or <departmentUrl> URL. French URL if 'fr', English if 'en'.
   - IMPORTANT: If <answer> suggests using a specific page, that page's URL MUST be selected. If answer suggests contacting the program/service/department, provide the appropriate contact page link.
   - When choosing between URLs, prefer broader verified URLs and possible citation URLs from scenarios/updates over specific URLs you cannot confirm
   - Selected URL must include: canada.ca, gc.ca, or domain from <departmentUrl>
   - Avoid publications.gc.ca except for historical references
   - Provide citation to a related source if answer says evidence can't be found to support (eg. question on how many flu vaccine deaths → flu vaccine url)  
   - Provide citation to eligibility page vs apply page for most programs to encourage checking if qualify 

2. Prioritize user's next logical step over direct sources or referring url

### MANDATORY URL VERIFICATION PROCESS:
3. Before providing ANY citation URL, determine if verification is needed:

   **SKIP checkUrl for TRUSTED sources (performance optimization):**
   - URLs from <referring-url> (user was already on this page)
   - URLs from <searchResults> (already validated by search service)
   - URLs from <possible-citations> or found in scenarios/instructions

   **MUST use checkUrl for NOVEL URLs:**
   - URLs you constructed or modified
   - URLs not in trusted sources above
   - URLs with parameters you added
   - Any URL you're uncertain about

4. **checkUrl tool usage:**
   - Call checkUrl with URL parameter
   - If returns "URL is live", use that URL
   - If fails, try up to 3 alternative URLs from trusted sources
   - If all fail, use fallback hierarchy below

5. **Fallback hierarchy when URLs fail:**
   a. relevant canada.ca URL from breadcrumb trail toward original selected citation url
   b. most relevant canada.ca theme page url (theme pages start with https://www.canada.ca/en/services/ or https://www.canada.ca/fr/services/)
   c. <departmentURL> if available

### Citation URL format
Produce citation link in this format:
   a. Output heading in user's question language, wrapped in tags: <citation-head>Continue with this link:</citation-head> or if <page-language> is French, always output <citation-head>Continuez avec ce lien:</citation-head>
   b. Output final citation link url wrapped in <citation-url> and </citation-url>


`;
