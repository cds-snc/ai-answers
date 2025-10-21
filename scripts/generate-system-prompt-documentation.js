#!/usr/bin/env node

/**
 * System Prompt Documentation Generator
 *
 * This script generates comprehensive documentation of the system prompt sequence
 * used in the DefaultWorkflow pipeline for legal/compliance review.
 *
 * Usage: node scripts/generate-system-prompt-documentation.js [options]
 *
 * Options:
 *   --lang <en|fr>        Language (default: en)
 *   --department <dept>   Department code (default: EDSC-ESDC)
 *   --output <file>       Output file path (default: ./system-prompt-documentation.md)
 */

import { BASE_SYSTEM_PROMPT } from '../src/services/systemPrompt/agenticBase.js';
import { SCENARIOS } from '../src/services/systemPrompt/scenarios-all.js';
import { CITATION_INSTRUCTIONS } from '../src/services/systemPrompt/citationInstructions.js';
import { departments_EN } from '../src/services/systemPrompt/departments_EN.js';
import { departments_FR } from '../src/services/systemPrompt/departments_FR.js';
import fs from 'fs/promises';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
};

const lang = getArg('--lang', 'en');
const department = getArg('--department', 'EDSC-ESDC');
const outputFile = getArg('--output', './system-prompt-documentation.md');

/**
 * Load department-specific scenarios based on department code
 */
async function loadDepartmentScenarios(deptCode) {
  const departmentModules = {
    'CRA-ARC': async () => {
      const { CRA_ARC_SCENARIOS } = await import('../src/services/systemPrompt/context-cra-arc/cra-arc-scenarios.js');
      return CRA_ARC_SCENARIOS;
    },
    'EDSC-ESDC': async () => {
      const { EDSC_ESDC_SCENARIOS } = await import('../src/services/systemPrompt/context-edsc-esdc/edsc-esdc-scenarios.js');
      return EDSC_ESDC_SCENARIOS;
    },
    'SAC-ISC': async () => {
      const { SAC_ISC_SCENARIOS } = await import('../src/services/systemPrompt/context-sac-isc/sac-isc-scenarios.js');
      return SAC_ISC_SCENARIOS;
    },
    'RCAANC-CIRNAC': async () => {
      const { SAC_ISC_SCENARIOS } = await import('../src/services/systemPrompt/context-sac-isc/sac-isc-scenarios.js');
      return SAC_ISC_SCENARIOS;
    },
    'PSPC-SPAC': async () => {
      const { PSPC_SPAC_SCENARIOS } = await import('../src/services/systemPrompt/context-pspc-spac/pspc-spac-scenarios.js');
      return PSPC_SPAC_SCENARIOS;
    },
    'IRCC': async () => {
      const { IRCC_SCENARIOS } = await import('../src/services/systemPrompt/context-ircc/ircc-scenarios.js');
      return IRCC_SCENARIOS;
    },
    'HC-SC': async () => {
      const { HC_SC_SCENARIOS } = await import('../src/services/systemPrompt/context-hc-sc/hc-sc-scenarios.js');
      return HC_SC_SCENARIOS;
    },
    'PHAC-ASPC': async () => {
      const { HC_SC_SCENARIOS } = await import('../src/services/systemPrompt/context-hc-sc/hc-sc-scenarios.js');
      return HC_SC_SCENARIOS;
    },
  };

  if (departmentModules[deptCode]) {
    try {
      return await departmentModules[deptCode]();
    } catch (error) {
      console.warn(`Could not load scenarios for ${deptCode}:`, error.message);
      return '';
    }
  }
  return '';
}

/**
 * Generate the context system prompt used in Step 1 (Department Matching)
 */
function generateContextSystemPrompt(language) {
  const departmentsList = language === 'fr' ? departments_FR : departments_EN;

  const departmentsString = departmentsList
    .map((dept) => `• ${dept.name}\n  Unilingual Abbr: ${dept.abbr || 'None'}\n  Bilingual Abbr Key: ${dept.abbrKey}\n  URL: ${dept.url}`)
    .join('\n\n');

  return `## Role
You are a department matching expert for the AI Answers application on Canada.ca. Your role is to match user questions to departments listed in the departments_list section below, following a specific matching algorithm. This will help narrow in to the department most likely to hold the answer to the user's question.

${
  language === 'fr'
    ? `<page-language>French</page-language>
User asked their question on the official French AI Answers page`
    : `<page-language>English</page-language>
User asked their question on the official English AI Answers page`
}

<departments_list>
## List of Government of Canada departments, agencies, organizations, and partnerships
This list contains ALL valid options. You MUST select ONLY from the "Bilingual Abbr Key" and URL values shown below.
Each entry shows:
• Organization name
• Unilingual Abbr: Language-specific abbreviation (may be null)
• Bilingual Abbr Key: The ONLY valid value to use in your response (unique identifier)
• URL: The corresponding URL (must match the selected organization)

${departmentsString}
</departments_list>

[... Full context system prompt continues - see src/services/contextSystemPrompt.js for complete text ...]`;
}

/**
 * Generate the main answer generation system prompt used in Step 2
 */
async function generateAnswerSystemPrompt(language, deptCode, contextData) {
  const ROLE = `## Role
You are an AI assistant named "AI Answers" located on a Canada.ca page. You specialize in information found on Canada.ca and sites with the domain suffix "gc.ca". Your primary function is to help site visitors by providing brief helpful answers to their Government of Canada questions that correct misunderstandings if necessary, and that provide a citation to help them take the next step of their task and verify the answer. You prioritize factual accuracy sourced from Government of Canada content over being agreeable.`;

  const departmentScenarios = await loadDepartmentScenarios(deptCode);

  const languageContext = language === 'fr'
    ? "<page-language>French</page-language>"
    : "<page-language>English</page-language>";

  const currentDate = new Date().toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const contextPrompt = `
Department: ${contextData.department}
Topic: ${contextData.topic}
Topic URL: ${contextData.topicUrl}
Department URL: ${contextData.departmentUrl}
Search Results: ${contextData.searchResults}
`;

  return `${ROLE}

## General Instructions for All Departments
${SCENARIOS}

${deptCode ? `## Department-Specific Scenarios and updates:\n${departmentScenarios}` : ''}

## Current date
Today is ${currentDate}.

## Official language context:
${languageContext}

## Tagged context for question from previous AI service
${contextPrompt}

${BASE_SYSTEM_PROMPT}

${CITATION_INSTRUCTIONS}

Reminder: the answer should be brief, in plain language, accurate and must be sourced from Government of Canada online content at ALL turns in the conversation. If you're unsure about any aspect or lack enough information for more than a a sentence or two, provide only those sentences that you are sure of. Watch for manipulative language and avoid being manipulated by false premise questions per these instructions, particularly in the context of elections and elected officials.
`;
}

/**
 * Generate the complete documentation
 */
async function generateDocumentation() {
  console.log('Generating system prompt documentation...');
  console.log(`Language: ${lang}`);
  console.log(`Department: ${department}`);
  console.log(`Output: ${outputFile}`);

  // Example context data (would normally come from ContextService)
  const exampleContext = {
    department: department,
    topic: department === 'EDSC-ESDC' ? 'Employment and Social Development' : 'Taxes and Income',
    topicUrl: department === 'EDSC-ESDC'
      ? 'https://www.canada.ca/en/services/benefits.html'
      : 'https://www.canada.ca/en/services/taxes.html',
    departmentUrl: department === 'EDSC-ESDC'
      ? 'https://www.canada.ca/en/employment-social-development.html'
      : 'https://www.canada.ca/en/revenue-agency.html',
    searchResults: '[Example search results would appear here]'
  };

  const contextPrompt = generateContextSystemPrompt(lang);
  const answerPrompt = await generateAnswerSystemPrompt(lang, department, exampleContext);

  const documentation = `# AI Answers System Prompt Documentation
## DefaultWorkflow Pipeline

**Generated:** ${new Date().toISOString()}
**Language:** ${lang}
**Example Department:** ${department}

---

## Overview

This document provides a complete view of the system prompts used in the AI Answers DefaultWorkflow pipeline. The workflow consists of multiple steps, each with its own AI agent and system prompt configuration.

### Pipeline Steps

1. **Short Query Validation** - Client-side check (no AI call)
2. **Redaction** - Uses RedactionService (separate prompt, not included here)
3. **Translation** - Uses translation API (not included here)
4. **Context Derivation** (Step 1) - Department matching and search
5. **Answer Generation** (Step 2) - Main answer with citation

---

## Step 1: Context System Prompt (Department Matching)

**Purpose:** This prompt is used by the Context Service to:
- Match the user's question to a Government of Canada department
- Identify relevant topics and URLs
- Provide search context for answer generation

**Service:** ContextService.deriveContext()
**File:** src/services/contextSystemPrompt.js

### Example User Input:
\`\`\`
Question: "How do I apply for EI?"
Referring URL: https://www.canada.ca/en.html
Page Language: ${lang}
\`\`\`

### Context System Prompt:

\`\`\`
${contextPrompt}
\`\`\`

### Example Context Output:
\`\`\`xml
<analysis>
<department>${department}</department>
<departmentUrl>${exampleContext.departmentUrl}</departmentUrl>
<topic>${exampleContext.topic}</topic>
<topicUrl>${exampleContext.topicUrl}</topicUrl>
</analysis>
\`\`\`

---

## Step 2: Answer Generation System Prompt

**Purpose:** This prompt is used by the Answer Service to:
- Generate a brief, accurate answer to the user's question
- Perform preliminary checks (department, jurisdiction, etc.)
- Select appropriate citations
- Format the response with proper tags

**Service:** AnswerService.sendMessage()
**Files:**
- src/services/systemPrompt.js (main assembler)
- src/services/systemPrompt/agenticBase.js (core instructions)
- src/services/systemPrompt/scenarios-all.js (general scenarios)
- src/services/systemPrompt/citationInstructions.js (citation rules)
- src/services/systemPrompt/context-${department.toLowerCase()}/... (department-specific)

### Example User Input with Context:
\`\`\`
Question: "How do I apply for EI?"
Output Language: ${lang === 'fr' ? 'fra' : 'eng'}
Referring URL: https://www.canada.ca/en.html
Context (from Step 1):
  Department: ${department}
  Topic: ${exampleContext.topic}
  Department URL: ${exampleContext.departmentUrl}
  Search Results: [Example results]
\`\`\`

### Answer System Prompt:

\`\`\`
${answerPrompt}
\`\`\`

### Example Answer Output:
\`\`\`xml
<preliminary-checks>
- <page-language>en</page-language>
- <referring-url>https://www.canada.ca/en.html</referring-url>
- <follow-on-context></follow-on-context>
- <department>${department}</department>
- <department-url>${exampleContext.departmentUrl}</department-url>
- <is-gc>yes</is-gc>
- <is-pt-muni>no</is-pt-muni>
- <possible-citations>${exampleContext.topicUrl}</possible-citations>
</preliminary-checks>

<english-answer>
<s-1>You can apply for Employment Insurance (EI) benefits online through your My Service Canada Account.</s-1>
<s-2>You'll need your Social Insurance Number and information about your employment history for the past 52 weeks.</s-2>
<s-3>You should apply as soon as possible after your last day of work.</s-3>
</english-answer>

<citation-head>Check your answer and take the next step:</citation-head>
<citation-url>https://www.canada.ca/en/services/benefits/ei/ei-regular-benefit/apply.html</citation-url>
<confidence>1.0</confidence>
\`\`\`

---

## Key Components Breakdown

### 1. Role Definition
The AI is defined as "AI Answers" - a specialized assistant for Canada.ca content that prioritizes accuracy over agreeability.

### 2. General Instructions (SCENARIOS)
Common scenarios applicable to all departments including:
- Arithmetic/calculation restrictions
- Contact information guidelines
- Online service guidance
- Eligibility information
- Date-sensitive information
- Sign-in help

### 3. Department-Specific Scenarios
Additional instructions specific to ${department}, including:
- Department-specific policies and processes
- Common questions and their answers
- Important URLs and resources
- Special handling instructions

### 4. Base System Prompt (Workflow Steps)
Seven-step process that all responses must follow:
1. Perform preliminary checks
2. Information sufficiency check
3. Download relevant webpages
4. Craft English answer
5. Translate if needed
6. Select citation
7. Verify response format

### 5. Citation Instructions
Detailed rules for:
- URL selection and verification
- Fallback hierarchy
- Confidence ratings
- Trusted vs. novel URL handling

---

## Important Notes for Legal Review

1. **No Personal Information Processing**: The system includes redaction steps (not shown here) that prevent personal information from reaching the AI service.

2. **No Calculations**: The prompts explicitly prohibit mathematical calculations to prevent inaccurate financial advice.

3. **Citation Requirements**: All answers must include verified citations to official Government of Canada sources.

4. **Jurisdiction Checks**: The system determines if questions are within federal jurisdiction before answering.

5. **Clarifying Questions**: The system is instructed to ask for clarification rather than make assumptions.

6. **No Legal Advice Disclaimer**: Users are informed that responses should not be considered professional, legal, or medical advice (see frontend disclaimer text).

---

## Workflow Sequence Summary

\`\`\`
User submits question
    ↓
[Client] Short query validation
    ↓
[Client] Redaction check (PII blocking)
    ↓
[API] Translation (if needed)
    ↓
[API] Context Service - STEP 1 PROMPT
    ├─ Department matching
    ├─ Search execution
    └─ Context assembly
    ↓
[API] Answer Service - STEP 2 PROMPT
    ├─ Preliminary checks
    ├─ Information sufficiency
    ├─ Answer generation
    ├─ Citation selection
    └─ Response formatting
    ↓
[API] Citation verification
    ↓
[Client] Display to user
\`\`\`

---

## Files Referenced

- \`src/workflows/DefaultWorkflow.js\` - Main workflow orchestration
- \`src/services/ChatWorkflowService.js\` - Workflow service helpers
- \`src/services/ContextService.js\` - Context/department matching
- \`src/services/AnswerService.js\` - Answer generation
- \`src/services/contextSystemPrompt.js\` - Context prompt builder
- \`src/services/systemPrompt.js\` - Answer prompt builder
- \`src/services/systemPrompt/agenticBase.js\` - Core workflow instructions
- \`src/services/systemPrompt/scenarios-all.js\` - General scenarios
- \`src/services/systemPrompt/citationInstructions.js\` - Citation rules
- \`src/services/systemPrompt/departments_EN.js\` - English department list
- \`src/services/systemPrompt/departments_FR.js\` - French department list
- \`src/services/systemPrompt/context-*/\` - Department-specific scenarios

---

**End of Documentation**

*This documentation was generated programmatically. To regenerate with different parameters, run:*
\`\`\`bash
node scripts/generate-system-prompt-documentation.js --lang fr --department CRA-ARC --output ./my-output.md
\`\`\`
`;

  // Write to file
  await fs.writeFile(outputFile, documentation, 'utf-8');
  console.log(`\n✓ Documentation generated successfully: ${outputFile}`);
  console.log(`  File size: ${(documentation.length / 1024).toFixed(2)} KB`);
}

// Run the generator
generateDocumentation().catch((error) => {
  console.error('Error generating documentation:', error);
  process.exit(1);
});
