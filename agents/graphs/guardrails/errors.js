import { BLOCK_TYPE } from './blockTypes.js';

class GuardrailBlockError extends Error {
  constructor(message, blockType = null) {
    super(message);
    this.name = 'GuardrailBlockError';
    this.blockType = blockType;
  }
}

class RedactionError extends GuardrailBlockError {
  constructor(message, redactedText, redactedItems, blockType = null) {
    super(message, blockType);
    this.name = 'RedactionError';
    this.redactedText = redactedText;
    this.redactedItems = redactedItems;
  }
}

class ShortQueryValidation extends GuardrailBlockError {
  constructor(message, userMessage, fallbackUrl) {
    super(message, BLOCK_TYPE.TOO_SHORT);
    this.name = 'ShortQueryValidation';
    this.userMessage = userMessage;
    this.fallbackUrl = fallbackUrl;
  }
}

export { GuardrailBlockError, RedactionError, ShortQueryValidation };
