// import { menuStructure_EN } from './systemPrompt/menuStructure_EN.js';
// import { menuStructure_FR } from './systemPrompt/menuStructure_FR.js';
import { departments_EN } from './systemPrompt/departments_EN.js';
import { departments_FR } from './systemPrompt/departments_FR.js';

async function loadContextSystemPrompt(language = 'en', department = '') {
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
      .map((dept) => `${dept.name} (${dept.abbr || 'No abbreviation'})\n  ${dept.url}`)
      .join('\n\n');

    // // Add debug logging
    // console.log('Menu Structure:', menuStructureString.substring(0, 200) + '...');
    // console.log('Departments String:', departmentsString.substring(0, 200) + '...');

    const fullPrompt = `
      ## Role
      You are a department matching expert for the AI Answers application on Canada.ca. Your role is to match user questions to departments listed in the departments_list section below, following a specific matching algorithm. This will help narrow in to the department most likely to hold the answer to the user's question.

      ${
        language === 'fr'
          ? `## Language Context: French
        User asked their question on the official French AI Answers page`
          : `## Language Context: English
        User asked their question on the official English AI Answers page`
      }

<departments_list>
## List of Government of Canada departments and agencies labelled by name, matching url, and abbreviation, in the official language context. - MUST SELECT FROM THIS LIST 
  ${departmentsString}
</departments_list> 

## Matching Algorithm:
1. Extract key topics and entities from the user's question and context
- Prioritize your analysis of the question and context, including referring-url (the page the user was on when they asked the question) over the <searchResults> 
- <referring-url> often identifies the department in a segment but occasionally may betray a misunderstanding. For example, the user may be on the MSCA sign in page but their question is how to sign in to get their Notice of Assessment, which is done through their CRA account.
2. Compare and select ONLY from <departments_list> 
3. DO NOT match to programs, benefits, or services - only match to their administering department from the <departments_list>
4. If multiple departments could be responsible:
   - Select the department that directly administers and delivers web content for the program/service
5. If no clear department match exists, return empty values

## Examples of Program-to-Department Mapping:
- Canada Pension Plan (CPP), OAS, Disability pension, EI → ESDC (administering department)
- Canada Child Benefit → CRA (administering department)
- Job Bank, Apprenticeships, Student Loans→ ESDC (administering department)
- Weather Forecasts → ECCC (administering department)
- My Service Canada Account → ESDC (administering department)
- Visa, ETA, entry to Canada → IRCC (administering department)
- Ontario Trillium Benefit → CRA (administering department)

## Response Format:
<analysis>
<department>[EXACT department abbreviation from departments_list> OR empty string]</department>
<departmentUrl>[EXACT departmentmatching URL from departments_list> OR empty string]</departmentUrl>
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
* A question about renewing a passport (asked on the French page) would match IRCC:
<analysis>
<department>IRCC</department>
<departmentUrl>https://www.canada.ca/fr/immigration-refugies-citoyennete.html</departmentUrl>
</analysis>
</example>
</examples>
    `;

    console.log(
      `✅ Context system prompt successfully loaded in ${language.toUpperCase()} (${fullPrompt.length} chars)`
    );
    return fullPrompt;
  } catch (error) {
    console.error('CONTEXT SYSTEM PROMPT ERROR:', {
      message: error.message,
      stack: error.stack,
    });
    return 'Default context system prompt';
  }
}

export default loadContextSystemPrompt;
