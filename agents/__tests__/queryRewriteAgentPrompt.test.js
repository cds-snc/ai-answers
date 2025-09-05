import { PROMPT } from '../prompts/queryRewriteAgentPrompt.js';
import { describe, it, expect } from 'vitest';

describe('queryRewriteAgentPrompt', () => {
  it('mentions translatedText and pageLanguage and JSON "query" output', () => {
    expect(PROMPT).toContain('translatedText');
    expect(PROMPT).toContain('pageLanguage');
    expect(PROMPT).toContain('"query"');
  });
});
