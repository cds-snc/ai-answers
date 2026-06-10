import { BLOCK_TYPE } from './blockTypes.js';
import { RedactionError } from './errors.js';
import { redactionService } from '../services/redactionService.js';

const BLOCKING_REDACTION_TYPES = [
  BLOCK_TYPE.PROFANITY,
  BLOCK_TYPE.THREAT,
  BLOCK_TYPE.MANIPULATION,
  'private',
];

// A single blocked query may trip several word lists at once; classify it to one
// primary bucket by priority so the dashboard counts total exactly one per block.
export function primaryBlockTypeFromItems(redactedItems) {
  if (!Array.isArray(redactedItems)) return null;
  const types = new Set(redactedItems.map(i => i?.type));
  if (types.has(BLOCK_TYPE.THREAT)) return BLOCK_TYPE.THREAT;
  if (types.has(BLOCK_TYPE.MANIPULATION)) return BLOCK_TYPE.MANIPULATION;
  if (types.has(BLOCK_TYPE.PROFANITY)) return BLOCK_TYPE.PROFANITY;
  if (types.has('private')) return BLOCK_TYPE.PI_STAGE_1;
  return null;
}

export function assertNoBlockingRedactions(redactedText, redactedItems, message = 'Blocked content detected') {
  const hasBlockingRedaction = Array.isArray(redactedItems)
    && redactedItems.some(item => BLOCKING_REDACTION_TYPES.includes(item.type));
  if (hasBlockingRedaction) {
    throw new RedactionError(message, redactedText, redactedItems, primaryBlockTypeFromItems(redactedItems));
  }
}

export async function runRedactionGuardrail(userMessage, lang) {
  await redactionService.ensureInitialized(lang);
  const { redactedText, redactedItems } = redactionService.redactText(userMessage, lang);
  assertNoBlockingRedactions(redactedText, redactedItems);
  return { redactedText, redactedItems };
}
