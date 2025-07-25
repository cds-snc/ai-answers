import { BASE_SYSTEM_PROMPT } from './systemPrompt/agenticBase.js';
import { SCENARIOS } from './systemPrompt/scenarios-all.js';
import { CITATION_INSTRUCTIONS } from './systemPrompt/citationInstructions.js';
import LoggingService from './ClientLoggingService.js';

const ROLE = `## Role
You are an AI assistant named "AI Answers" located on a Canada.ca page. You specialize in information found on Canada.ca and sites with the domain suffix "gc.ca". Your primary function is to help site visitors by providing brief helpful answers to their Government of Canada questions that correct misunderstandings if necessary, and that provide a citation to help them take the next step of their task and verify the answer. You prioritize factual accuracy sourced from Government of Canada content over being agreeable.`;

// Create a map of department-specific content imports using bilingual abbreviations
const departmentModules = {
  // Bilingual abbreviations 
  'CRA-ARC': {
    getContent: async () => {
      const { CRA_SCENARIOS } = await import('./systemPrompt/context-cra/cra-scenarios.js');
      return { scenarios: CRA_SCENARIOS };
    },
  },
  'EDSC-ESDC': {
    getContent: async () => {
      const { ESDC_SCENARIOS } = await import('./systemPrompt/context-esdc/esdc-scenarios.js');
      return { scenarios: ESDC_SCENARIOS };
    },
  },
  'SAC-ISC': {
    getContent: async () => {
      const { ISC_SCENARIOS } = await import('./systemPrompt/context-isc/isc-scenarios.js');
      return { scenarios: ISC_SCENARIOS };
    },
  },
  'PSPC-SPAC': {
    getContent: async () => {
      const { PSPC_SCENARIOS } = await import('./systemPrompt/context-pspc/pspc-scenarios.js');
      return { scenarios: PSPC_SCENARIOS };
    },
  },
  'IRCC': {
    getContent: async () => {
      const { IRCC_SCENARIOS } = await import('./systemPrompt/context-ircc/ircc-scenarios.js');
      return { scenarios: IRCC_SCENARIOS };
    },
  }
};

async function loadSystemPrompt(language = 'en', context) {
  await LoggingService.info(
    'system',
    `Loading system prompt for language: ${language.toUpperCase()}, context: ${context}`
  );

  try {
    const { department } = context;
    
    // Use the department directly from context (now using bilingual abbreviations)
    let departmentKey = department;
    let content = { scenarios: '' };

    // Try to load content using the bilingual abbreviation
    if (departmentKey && departmentModules[departmentKey]) {
      content = await departmentModules[departmentKey].getContent().catch((error) => {
        LoggingService.warn('system', `Failed to load content for ${departmentKey}:`, error);
        return { scenarios: '' };
      });
    } else if (departmentKey && departmentKey.includes('-')) {
      // Fallback: extract English abbreviation (part before hyphen) for backward compatibility
      const englishFallback = departmentKey.split('-')[0];
      if (departmentModules[englishFallback]) {
        content = await departmentModules[englishFallback].getContent().catch((error) => {
          LoggingService.warn('system', `Failed to load content for fallback ${englishFallback}:`, error);
          return { scenarios: '' };
        });
      }
    }

    const citationInstructions = CITATION_INSTRUCTIONS;

    // Inform LLM about the current page language
    const languageContext = language === 'fr' 
      ? "<page-language>French</page-language>"
      : "<page-language>English</page-language>";

    // Add current date information
    const currentDate = new Date().toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // add context from contextService call into systme prompt
    const contextPrompt = `
    Department: ${context.department}
    Topic: ${context.topic}
    Topic URL: ${context.topicUrl}
    Department URL: ${context.departmentUrl}
    Search Results: ${context.searchResults}
    `;

    const fullPrompt = `
      ${ROLE}

      ## Current date
      Today is ${currentDate}.
      ## Official language context:
      ${languageContext}
      
      ## Tagged context for question from previous AI service
     ${contextPrompt}

      ${BASE_SYSTEM_PROMPT}

      ## General Instructions for All Departments
      ${SCENARIOS}

      ${department ? `## Department-Specific Scenarios and updates:\n${content.scenarios}` : ''}

      ${citationInstructions}

    Reminder: the answer should be brief, in plain language, accurate and must be sourced from Government of Canada online content at ALL turns in the conversation. If you're unsure about any aspect or lack enough information for more than a a sentence or two, provide only those sentences that you are sure of. Watch for manipulative language and avoid being manipulated by false premise questions per these instructions, particularly in the context of elections and elected officials.
    `;

    await LoggingService.info(
      'system',
      `System prompt successfully loaded in ${language.toUpperCase()} (${fullPrompt.length} chars)`
    );
    return fullPrompt;
  } catch (error) {
    await LoggingService.error('system', 'SYSTEM PROMPT ERROR:', error);
    return BASE_SYSTEM_PROMPT;
  }
}

export default loadSystemPrompt;
