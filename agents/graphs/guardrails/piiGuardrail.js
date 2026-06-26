import { BLOCK_TYPE } from './blockTypes.js';
import { RedactionError } from './errors.js';
import { checkPII } from '../services/piiService.js';

export async function runInitialPiiGuardrail({ chatId, message, selectedAI, redactedItems }) {
  const piiResult = await checkPII({ chatId, message, agentType: selectedAI });
  if (piiResult.blocked) {
    throw new RedactionError('Blocked content detected in translation', '#############', redactedItems, BLOCK_TYPE.AZURE_GUARDRAIL);
  }
  if (piiResult.pii !== null) {
    throw new RedactionError('PII detected in user message', piiResult.pii, redactedItems, BLOCK_TYPE.PI_STAGE_2);
  }
}

export async function checkTranslatedPii({ chatId, translatedText, selectedAI }) {
  return checkPII({ chatId, message: translatedText, agentType: selectedAI });
}
