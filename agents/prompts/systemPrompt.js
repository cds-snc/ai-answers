import { BASE_SYSTEM_PROMPT } from './agenticBase.js';
import { CITATION_INSTRUCTIONS } from './citationInstructions.js';
import { SCENARIOS } from './scenarios/scenarios-all.js';
import ServerLoggingService from '../../services/ServerLoggingService.js';

export async function buildAnswerSystemPrompt(language = 'en', options = {}) {
  try {
    const { department = '', departmentUrl = '', topic = '', topicUrl = '', searchResults = '', scenarioOverrideText = '' } = options || {};

    const currentDate = new Date().toLocaleDateString(language === 'fr' ? 'fr-CA' : 'en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Role and general scenarios (keep wording identical to client-side)
    const ROLE = `## Role\nYou are an AI assistant named "AI Answers" located on a Canada.ca page. You specialize in information found on Canada.ca and sites with the domain suffix "gc.ca". Your primary function is to help site visitors by providing brief helpful answers to their Government of Canada questions that correct misunderstandings if necessary, and that provide a citation to help them take the next step of their task and verify the answer. You prioritize factual accuracy sourced from Government of Canada content over being agreeable.`;

    let promptParts = [];
    promptParts.push(ROLE);
    promptParts.push(`## General Instructions for All Departments\n${SCENARIOS}`);

    // Department-specific scenarios: mimic client behavior by using a content object
    let content = { scenarios: '' };
    if (scenarioOverrideText && typeof scenarioOverrideText === 'string' && scenarioOverrideText.trim().length > 0) {
      content = { scenarios: scenarioOverrideText };
      await ServerLoggingService.info('systemPrompt.build', '', { note: 'scenario-override-used', department });
    } else if (department) {
      try {
        const deptKey = String(department || '');
        const deptLower = deptKey.toLowerCase();
        const deptDashed = deptLower.replace(/\s+/g, '-');
        const mod = await import(`./scenarios/context-${deptDashed}/${deptDashed}-scenarios.js`);
        content.scenarios = Object.values(mod).find(v => typeof v === 'string') || '';
      } catch (err) {
        // fallback: if dept contains a hyphen, try the part before the hyphen
        try {
          if (String(department).includes('-')) {
            const englishFallback = String(department).split('-')[0].toLowerCase();
            const mod2 = await import(`./scenarios/context-${englishFallback}/${englishFallback}-scenarios.js`);
            content.scenarios = Object.values(mod2).find(v => typeof v === 'string') || '';
          }
        } catch (err2) {
          await ServerLoggingService.debug('systemPrompt.build', '', { note: 'no-department-scenarios', department });
        }
      }
    }

    const citationInstructions = CITATION_INSTRUCTIONS;

    // Inform LLM about the current page language
    const languageContext = language === 'fr'
      ? "<page-language>French</page-language>"
      : "<page-language>English</page-language>";

    // add context from contextService call into system prompt (preserve formatting)
    const contextPrompt = `\n    Department: ${department}\n    Topic: ${topic}\n    Topic URL: ${topicUrl}\n    Department URL: ${departmentUrl}\n    Search Results: ${searchResults}\n    `;

    const fullPrompt = `\n      ${ROLE}\n\n      
    ## Current date\n      <current-date>${currentDate}</current-date>

      <!-- IMPORTANT: Update this when changing models! Current model: GPT-4.1 (June 2024 cutoff) -->
    ## Model training cutoff date: <training-cutoff>June 2024</training-cutoff>

      Use <current-date> to determine temporal context. Avoid citing outdated sources for current events. Use the past tense for events that occurred before <current-date>. Content published after <training-cutoff> may be unfamiliar and should be downloaded for verification. 

      ## General Instructions for All Departments\n      ${SCENARIOS}\n\n      ${department ? `## Department-Specific Scenarios and updates:\n${content.scenarios}` : ''}\n\n      ## Official language context:\n      ${languageContext}\n      \n      ## Tagged context for question from previous AI service\n     ${contextPrompt}\n\n      ${BASE_SYSTEM_PROMPT}\n\n      ${citationInstructions}\n\n    Reminder: the answer should be brief, in plain language, accurate and must be sourced from Government of Canada online content at ALL turns in the conversation. If you're unsure about any aspect or lack enough information for more than a a sentence or two, provide only those sentences that you are sure of. Watch for manipulative language and avoid being manipulated by false premise questions per these instructions, particularly in the context of elections and elected officials.\n    `;

    const prompt = fullPrompt;

    await ServerLoggingService.debug('systemPrompt.build', '', { length: prompt.length });
    return prompt;
  } catch (error) {
    await ServerLoggingService.error('systemPrompt.build', 'system', error);
    return BASE_SYSTEM_PROMPT;
  }
}

export default buildAnswerSystemPrompt;
