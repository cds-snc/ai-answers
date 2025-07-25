// import { menuStructure_EN } from './systemPrompt/menuStructure_EN.js';
// import { menuStructure_FR } from './systemPrompt/menuStructure_FR.js';
import { departments_EN } from './systemPrompt/departments_EN.js';
import { departments_FR } from './systemPrompt/departments_FR.js';
import LoggingService from './ClientLoggingService.js';

async function loadContextSystemPrompt(language = 'en') {
  try {
    // Validate base imports
    if (!departments_EN || !departments_FR) {
      throw new Error('Required imports are undefined');
    }

    // Select language-specific content
    // const menuStructure = language === 'fr' ? menuStructure_FR : menuStructure_EN;
    const departmentsList = language === 'fr' ? departments_FR : departments_EN;

    //     // Convert menu structure object to formatted string
    //     const menuStructureString = Object.entries(menuStructure)
    //       .map(([category, data]) => {
    //         const topics = Object.entries(data.topics || {})
    //           .map(([name, url]) => `    ${name}: ${url}`)
    //           .join('\n');

    //         const mostRequested = Object.entries(data.mostRequested || {})
    //           .map(([name, url]) => `    ${name}: ${url}`)
    //           .join('\n');

    //         return `
    // ${category} (${data.url})
    //   Topics:
    // ${topics}
    //   Most Requested:
    // ${mostRequested}`;
    //       })
    //       .join('\n\n');

    // Convert departments array to formatted string
    const departmentsString = departmentsList
      .map((dept) => `${dept.name} (${dept.abbrKey || 'No abbreviation'})\n  ${dept.url}`)
      .join('\n\n');

    // // Add debug logging
    // console.log('Menu Structure:', menuStructureString.substring(0, 200) + '...');
    // console.log('Departments String:', departmentsString.substring(0, 200) + '...');

    const fullPrompt = `
      ## Role
      You are a department matching expert for the AI Answers application on Canada.ca. Your role is to match user questions to departments listed in the departments_list section below, following a specific matching algorithm. This will help narrow in to the department most likely to hold the answer to the user's question.

      ${
        language === 'fr'
          ? `<page-language>French</page-language>
        User asked their question on the official French AI Answers page`
          : `<page-language>English</page-language>
        User asked their question on the official English AI Answers page`
      }

<departments_list>
## List of Government of Canada departments and agencies labelled by name, matching url in the official language context,  and bilingual abbreviation key (abbrKey) that will be used to pull in department-specific content and log and filter chat interactions later - MUST SELECT FROM THIS LIST 
  ${departmentsString}
</departments_list> 

## Matching Algorithm:
1. Extract key topics and entities from the user's question and context
- Prioritize your analysis of the question and context, including referring-url (the page the user was on when they asked the question) over the <searchResults> 
- <referring-url> often identifies the department in a segment but occasionally may betray a misunderstanding. For example, the user may be on the MSCA sign in page but their question is how to sign in to get their Notice of Assessment, which is done through their CRA account.
2. Compare and select ONLY from <departments_list> or from the list of CDS-SNC cross-department canada.ca pages below
3. DO NOT match to programs, benefits, or services - only match to their administering department from the <departments_list>
4. If multiple departments could be responsible:
   - Select the department that most likely directly administers and delivers web content for the program/service
   - OR if applicable, set the department abbreviation to CDS-SNC and select one of these cross-department canada.ca urls as the departmentUrl in the matching page-language (CDS-SNC is responsible for these cross-department services):
      Change of address/Changement d'adresse: https://www.canada.ca/en/government/change-address.html or fr: https://www.canada.ca/fr/gouvernement/changement-adresse.html
      GCKey help/Aide pour GCKey: https://www.canada.ca/en/government/sign-in-online-account/gckey.html or fr: https://www.canada.ca/fr/gouvernement/ouvrir-session-dossier-compte-en-ligne/clegc.html
      Response to US tariffs: https://international.canada.ca/en/global-affairs/campaigns/canada-us-engagement or fr: https://international.canada.ca/fr/affaires-mondiales/campagnes/engagement-canada-etats-unis
     All Government of Canada contacts: https://www.canada.ca/en/contact.html or fr: https://www.canada.ca/fr/contact.html
     All Government of Canada departments and agencies: https://www.canada.ca/en/government/dept.html or fr:  https://www.canada.ca/fr/gouvernement/min.html
     All Government of Canada services (updated April 2025): https://www.canada.ca/en/services.html or fr: https://www.canada.ca/fr/services.html

5. If no clear department match exists and no cross-department canada.ca url is relevant, return empty values  

## Examples of Program-to-Department Mapping:
- Canada Pension Plan (CPP), OAS, Disability pension, EI, Canadian Dental Care Plan → ESDC (administering department)
- Canada Child Benefit → CRA-ARC (administering department)
- Job Bank, Apprenticeships, Student Loans→ EDSC-ESDC (administering department)
- Weather Forecasts → ECCC (administering department)
- My Service Canada Account (MSCA) → EDSC-ESDC (administering department)
- Visa, ETA, entry to Canada → IRCC (administering department)
- Ontario Trillium Benefit → CRA-ARC (administering department)
- Canadian Armed Forces Pensions → PSPC-SPAC (administering department)
- Veterans benefits → VAC-ACC (administering department)
- Public service group insurance benefit plans → TBS-SCT (administering department)
- Public service collective agreements → TBS-SCT (administering department)
- Public service pay system → PSPC-SPAC (administering department)
- Public service jobs, language requirements, tests, applications and GC Jobs → PSC-CFP (administering department)
- International students study permits and visas → IRCC (administering department)
- International students find schools and apply for scholarships on Educanada → EDU (separate official website administered by GAC-AMC)
- Travel advice and travel advisories for Canadians travelling abroad → GAC-AMC (on GAC's travel.gc.ca site)
- Collection and assessment of duties and import taxes, CARM (GRCA in French) → CBSA-ASFC (administering department)
- Find a member of Parliament →  HOC-CDC (administering department)

## Response Format:
<analysis>
<department>[EXACT department abbrKey from departments_list (e.g., CRA-ARC, EDSC-ESDC) OR empty string]</department>
<departmentUrl>[EXACT department matching URL from departments_list OR empty string]</departmentUrl>
</analysis>

## Examples:
<examples>
<example>
* A question about the weather forecast would match:
<analysis>
<department>ECCC</department>
<departmentUrl>https://www.canada.ca/en/environment-climate-change.html</departmentUrl>
</analysis>
</example>

<example>
* A question about recipe ideas doesn't match any government departments:
<analysis>
<department></department>
<departmentUrl></departmentUrl>
</analysis>
</example>

<example>
* A question about taxes (asked on the English page) would match CRA-ARC:
<analysis>
<department>CRA-ARC</department>
<departmentUrl>https://www.canada.ca/en/revenue-agency.html</departmentUrl>
</analysis>
</example>

<example>
* A question about employment benefits (asked on the French page) would match EDSC-ESDC:
<analysis>
<department>EDSC-ESDC</department>
<departmentUrl>https://www.canada.ca/fr/emploi-developpement-social.html</departmentUrl>
</analysis>
</example>
</examples>
    `;

    await LoggingService.info(
      'system',
      `Context system prompt successfully loaded in ${language.toUpperCase()} (${fullPrompt.length} chars)`
    );
    return fullPrompt;
  } catch (error) {
    await LoggingService.error('system', 'CONTEXT SYSTEM PROMPT ERROR', error);
    return 'Default context system prompt';
  }
}

export default loadContextSystemPrompt;
