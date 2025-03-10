import { BASE_SYSTEM_PROMPT } from './systemPrompt/agenticBase.js';
import { SCENARIOS } from './systemPrompt/scenarios-all.js';
import { CITATION_INSTRUCTIONS } from './systemPrompt/citationInstructions.js';
import LoggingService from './ClientLoggingService.js';

const ROLE = `## Role
You are an AI assistant named "AI Answers" located on a Canada.ca page. You specialize in information found on Canada.ca and sites with the domain suffix "gc.ca". Your primary function is to help site visitors by providing brief helpful answers to their Government of Canada questions that correct misunderstandings if necessary, and that provide a citation to help them take the next step of their task and verify the answer.`;

// Create a map of department-specific content imports
const departmentModules = {
  CRA: {
    getContent: async () => {
      const [{ CRA_UPDATES }, { CRA_SCENARIOS }] = await Promise.all([
        import('./systemPrompt/context-cra/cra-updates.js'),
        import('./systemPrompt/context-cra/cra-scenarios.js'),
      ]);
      return { updates: CRA_UPDATES, scenarios: CRA_SCENARIOS };
    },
  },
  ESDC: {
    getContent: async () => {
      const [{ ESDC_UPDATES }, { ESDC_SCENARIOS }] = await Promise.all([
        import('./systemPrompt/context-esdc/esdc-updates.js'),
        import('./systemPrompt/context-esdc/esdc-scenarios.js'),
      ]);
      return { updates: ESDC_UPDATES, scenarios: ESDC_SCENARIOS };
    },
  },
  ISC: {
    getContent: async () => {
      const [{ ISC_UPDATES }, { ISC_SCENARIOS }] = await Promise.all([
        import('./systemPrompt/context-isc/isc-updates.js'),
        import('./systemPrompt/context-isc/isc-scenarios.js'),
      ]);
      return { updates: ISC_UPDATES, scenarios: ISC_SCENARIOS };
    },
  },
  PSPC: {
    getContent: async () => {
      const [{ PSPC_UPDATES }, { PSPC_SCENARIOS }] = await Promise.all([
        import('./systemPrompt/context-pspc/pspc-updates.js'),
        import('./systemPrompt/context-pspc/pspc-scenarios.js'),
      ]);
      return { updates: PSPC_UPDATES, scenarios: PSPC_SCENARIOS };
    },
  },
  IRCC: {
    getContent: async () => {
      const [{ IRCC_UPDATES }, { IRCC_SCENARIOS }] = await Promise.all([
        import('./systemPrompt/context-ircc/ircc-updates.js'),
        import('./systemPrompt/context-ircc/ircc-scenarios.js'),
      ]);
      return { updates: IRCC_UPDATES, scenarios: IRCC_SCENARIOS };
    },
  },
};

async function loadSystemPrompt(language = 'en', context) {
  await LoggingService.info(
    'system',
    `Loading system prompt for language: ${language.toUpperCase()}, context: ${context}`
  );

  try {
    const { department } = context;

    // Load department content or use defaults
    const content =
      department && departmentModules[department]
        ? await departmentModules[department].getContent().catch((error) => {
            LoggingService.warn('system', `Failed to load content for ${department}:`, error);
            return { updates: '', scenarios: '' };
          })
        : { updates: '', scenarios: '' };

    const citationInstructions = CITATION_INSTRUCTIONS;

    // Inform LLM about the current page language
    const languageContext =
      language === 'fr'
        ? 'Language context: French.  The question was asked on the official French AI Answers page.'
        : 'Language context: English.  The question was asked on the official English AI Answers page.';

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

      ${department ? `## Department-Specific Updates\n${content.updates}` : ''}

      ${department ? `## Department-Specific Scenarios\n${content.scenarios}` : ''}

      ${citationInstructions}

    Reminder: the answer should be brief, in plain language, accurate and must be sourced from Canada.ca or gc.ca at all turns in the conversation. If you're unsure about any aspect or lack enough information for more than a a sentence or two, provide only those sentences that you are sure of.
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
