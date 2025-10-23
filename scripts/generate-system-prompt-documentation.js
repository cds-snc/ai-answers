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
import { PROMPT as PII_PROMPT } from '../agents/prompts/piiAgentPrompt.js';
import { PROMPT as TRANSLATION_PROMPT } from '../agents/prompts/translationPrompt.js';
import { PROMPT as QUERY_REWRITE_PROMPT } from '../agents/prompts/queryRewriteAgentPrompt.js';
import loadContextSystemPrompt from '../src/services/contextSystemPrompt.js';
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
    'TBS-SCT': async () => {
      const { TBS_SCT_SCENARIOS } = await import('../src/services/systemPrompt/context-tbs-sct/tbs-sct-scenarios.js');
      return TBS_SCT_SCENARIOS;
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

${deptCode ? `## Department-Specific Scenarios and updates:
**[EXAMPLE: ${deptCode} scenarios included below - see Step 6.5 for explanation]**
${departmentScenarios}
**[END OF ${deptCode}-SPECIFIC SCENARIOS]**
` : '**[NOTE: No department-specific scenarios available for this department]**'}

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

  let contextPrompt = await loadContextSystemPrompt(lang);

  // For documentation purposes, replace the full departments list with a summary note
  // This keeps the documentation file manageable while the live system uses the full list
  const departmentCount = lang === 'fr' ? departments_FR.length : departments_EN.length;
  const departmentListRegex = /(<departments_list>.*?<\/departments_list>)/s;
  const summaryNote = `<departments_list>
## List of Government of Canada departments, agencies, organizations, and partnerships

**Note:** The complete department list is dynamically loaded from departments_EN.js and departments_FR.js at runtime and contains ${departmentCount} entries. Each entry shows:
• Organization name
• Unilingual Abbr: Language-specific abbreviation (may be null)
• Bilingual Abbr Key: The ONLY valid value to use in your response (unique identifier)
• URL: The corresponding URL (must match the selected organization)
</departments_list>`;
  contextPrompt = contextPrompt.replace(departmentListRegex, summaryNote);

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

1. **Short Query Validation** - Client-side validation (no AI)
2. **Stage 1: Pattern-Based Redaction** - Rule-based filtering for profanity, threats, manipulation, and common PI patterns (no AI)
3. **Stage 2: AI PII Agent** - AI-powered detection of personal information that slipped through Stage 1
4. **Translation AI Agent** - AI-powered language detection and translation
5. **Search Query Generation AI Agent** - AI-powered query rewriting for search
6. **Context Derivation AI Agent** - AI-powered department matching and search context
7. **Answer Generation AI Agent** - AI-powered answer generation with citation
8. **Citation Verification** - URL validation and accessibility checking
9. **Display to User** - Final response rendering

---

## Step 3: AI PII Agent System Prompt

**Purpose:** This prompt is used to detect and redact personal information (PI) that slipped through Stage 1 pattern-based filtering. This is the second layer of privacy protection.

**Service:** PIIAgentService / ChatWorkflowService.processRedaction()
**File:** agents/prompts/piiAgentPrompt.js
**Note:** Step 1 (Short Query Validation) and Step 2 (Pattern-Based Redaction) do not use AI and are not detailed here.

### PII Detection Prompt:

\`\`\`
${PII_PROMPT}
\`\`\`

### Example Input/Output:

**Input:**
\`\`\`
"I am John Smith, my SIN is 123-456-789, and I live at 123 Main Street"
\`\`\`

**Output:**
\`\`\`xml
<pii>I am XXX, my SIN is XXX, and I live at XXX</pii>
\`\`\`

---

## Step 4: Translation AI Agent System Prompt

**Purpose:** This AI agent detects the original language and translates the user's question to English if needed.

**Service:** chat-translate API
**File:** agents/prompts/translationPrompt.js

### Translation Prompt:

\`\`\`
${TRANSLATION_PROMPT}
\`\`\`

### Example Input/Output:

**Input:**
\`\`\`json
{
  "text": "Comment puis-je demander l'AE?",
  "desired_language": "en",
  "translation_context": []
}
\`\`\`

**Output:**
\`\`\`json
{
  "originalLanguage": "fra",
  "translatedLanguage": "eng",
  "translatedText": "How do I apply for EI?",
  "noTranslation": false
}
\`\`\`

---

## Step 5: Search Query Generation AI Agent System Prompt

**Purpose:** This AI agent crafts an effective search query based on the translated question.

**Service:** search-context API
**File:** agents/prompts/queryRewriteAgentPrompt.js

### Query Rewrite Prompt:

\`\`\`
${QUERY_REWRITE_PROMPT}
\`\`\`

### Example Input/Output:

**Input:**
\`\`\`json
{
  "translatedText": "How do I apply for Employment Insurance?",
  "pageLanguage": "en",
  "referringUrl": "https://www.canada.ca/en.html"
}
\`\`\`

**Output:**
\`\`\`json
{
  "query": "apply Employment Insurance EI canada"
}
\`\`\`

---

## Step 6: Context Derivation AI Agent System Prompt

**Purpose:** This AI agent is used by the Context Service to:
- Match the user's question to a Government of Canada department
- Identify relevant topics and URLs
- Execute search and gather relevant content
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

## Step 6.5: Department-Specific Scenarios (Optional Enhancement)

**Purpose:** If the department identified in Step 6 has a partner scenario file, those department-specific instructions are added to the Answer Generation prompt.

**How It Works:**
- After the Context Derivation AI Agent identifies the department (e.g., "EDSC-ESDC", "CRA-ARC"), the system checks if that department has a custom scenario file
- If a scenario file exists, it's dynamically loaded and inserted into the Answer Generation prompt
- If no scenario file exists for that department, the Answer Generation proceeds with only the general scenarios

**Partner Departments with Custom Scenario Files (as of ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })}):**
- \`context-cra-arc/\` - Canada Revenue Agency (CRA-ARC)
- \`context-edsc-esdc/\` - Employment and Social Development Canada (EDSC-ESDC)
- \`context-hc-sc/\` - Health Canada (HC-SC) and Public Health Agency (PHAC-ASPC)
- \`context-ircc/\` - Immigration, Refugees and Citizenship Canada (IRCC)
- \`context-pspc-spac/\` - Public Services and Procurement Canada (PSPC-SPAC)
- \`context-sac-isc/\` - Indigenous Services Canada (SAC-ISC) and Crown-Indigenous Relations (RCAANC-CIRNAC)
- \`context-tbs-sct/\` - Treasury Board Secretariat (TBS-SCT)

**Note:** This is a growing list as new departments become partners and their scenario files are added to the system. The example below uses **EDSC-ESDC** as the department, so you'll see the EDSC-ESDC-specific scenarios included in the prompt. If a different department had been matched (or no scenario file existed for that department), that section would be different or omitted entirely.

**Files:** \`src/services/systemPrompt/context-{department}/\`

---

## Step 7: Answer Generation AI Agent System Prompt

**Purpose:** This AI agent is used by the Answer Service to:
- Generate a brief, accurate answer to the user's question
- Perform preliminary checks (department, jurisdiction, etc.)
- Use specialized tools (download web pages, validate URLs, generate context)
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

### 3. Department-Specific Scenarios (If Available)
Additional instructions specific to the matched department (in this example: ${department}):
- Department-specific policies and processes
- Common questions and their answers
- Important URLs and resources
- Special handling instructions

**Note:** Only partner departments with custom scenario files get this section. This is a growing list as new departments are onboarded. Currently available for: CRA-ARC, EDSC-ESDC, HC-SC, IRCC, PSPC-SPAC, SAC-ISC, and TBS-SCT. Other departments use only the general scenarios until their partner scenario files are created.

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

1. **Two-Stage Personal Information Protection**:
   - **Stage 1 (Pattern-Based)**: RedactionService blocks profanity, threats, manipulation attempts, and common PI patterns (phone numbers, emails, addresses, SIN numbers) before any AI processing
   - **Stage 2 (AI-Powered)**: AI PII Agent detects and redacts personal information that slipped through Stage 1, especially names and personal identifiers
   - Users are notified when PI is detected and asked to rephrase

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
[Step 1 - Client] Short query validation (no AI)
    ↓
[Step 2 - Client] Pattern-Based Redaction (no AI)
    ├─ Profanity filtering
    ├─ Threat detection
    ├─ Manipulation detection
    └─ Common PI pattern blocking
    ↓
[Step 3 - API] AI PII Agent
    └─ Detect and redact PI that slipped through
    ↓
[Step 4 - API] Translation AI Agent
    └─ Language detection and translation
    ↓
[Step 5 - API] Search Query Generation AI Agent
    └─ Craft optimized search query
    ↓
[Step 6 - API] Context Derivation AI Agent
    ├─ Department matching
    ├─ Search execution
    └─ Context assembly
    ↓
[Step 7 - API] Answer Generation AI Agent
    ├─ Preliminary checks
    ├─ Information sufficiency
    ├─ Download web pages (if needed)
    ├─ Answer generation
    ├─ Citation selection
    └─ Response formatting
    ↓
[Step 8 - API] Citation verification
    └─ URL validation and accessibility checking
    ↓
[Step 9 - Client] Display to user
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
