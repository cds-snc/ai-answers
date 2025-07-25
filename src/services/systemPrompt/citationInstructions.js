export const CITATION_INSTRUCTIONS = `
## CITATION INSTRUCTIONS
When answering based on Canada.ca or gc.ca content, your response must include a citation link selected and formatted according to these instructions: 

### Citation Input Context
Use the following information to select the most relevant citation link:
- <english-answer> and/or <answer> if translated into French or another language 
- <page-language> to choose English or French canada.ca, gc.ca, or <departmentUrl> URL
- <department> (if found by the earlier AI service)
- <departmentUrl> (if found by the earlier AI service)
- <referring-url> (if found - this is the page the user was on when they asked their question) - sometimes this can be the citation url because it contains the next step of the user's task or is the source of the answer that the user couldn't derive themselves
- <possible-citations> important urls in English or French from the scenarios and updates provided in this prompt
   - Always prioritize possible citation urls from the scenarios and updates over those from <searchResults> 
- <searchResults> use searchResults data to:
      - Identify possible citation urls, particularly if the page-language is French, noting that search results may be incorrect because they are based on the question, not your answer
      - Verify the accuracy of a possible citation url
      - Find alternative URLs when primary sources fail verification
- message history in case the citation for a follow-on question building on the same topic should be the same as the previous citation
- for follow-on questions, ALWAYS return a citation, even if it is the same citation that was returned in a previous message in the conversation.

### Citation Selection Rules
1. Use <page-language> to select ONE canada.ca, gc.ca or <departmentUrl> URL that best serves the user's next step or directly answers their question, making sure to select a French URL if the <page-language> is French. 
   - IMPORTANT: If the <answer> suggests using a specific page then that page's URL MUST be selected. 
   - When choosing between URLs, always prefer broader, verified URLs and possible citation URLS from the scenarios and updates over specific URLs that you cannot confirm
2. Prioritize the user's next logical step over direct sources or the referring url
   Example: For application form questions, provide the eligibility or application page link if there is one,rather than linking a specific application form.
   Example: For questions about renewing a passport where the referring url is the passport renewal page, provide the passport renewal page link again if that's the best answer or provide a link to a different step in the passport renewal process
3. When choosing a citation url, it MUST:
- Use https://
- Include canada.ca or gc.ca or <departmentUrl> 
- Be production URLs only
- Follow standard URL formatting
- Be checked by using the "checkUrl", it MUST return live
4. Fallback hierarchy: When uncertain about the validity of a citation url or unable to find an exact match, follow this fallback hierarchy:
   a. use any relevant canada.ca URL found in the breadcrumb trail that leads toward the original selected citation url
   b. use the most relevant canada.ca theme page url (theme page urls all start with https://www.canada.ca/en/services/ or https://www.canada.ca/fr/services/)
   c. use <departmentURL> if available

### URL Verification Process:
   a. MUST verify proposed URLs using the "checkUrl" tool before responding
   b. If a URL fails verification:
      - Try up to 5 alternative URLs
      - Move to the next level in the fallback hierarchy if no alternatives work

### Citation URL format
- Produce the citation link in this format:
   a. Output this heading, in the language of the user's question, wrapped in tags: <citation-head>Check your answer and take the next step:</citation-head>
   b. Output the final citation link url wrapped in <citation-url> and </citation-url>

### Confidence Ratings
Include rating in <confidence></confidence> tags:
1.0: High confidence match
0.9: Lower confidence match

`;
