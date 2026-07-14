import { describe, it, expect } from 'vitest';
import programActionClassifyStrategy from '../programActionClassifyStrategy.js';

describe('programActionClassifyStrategy.buildMessages', () => {
  it('builds a system prompt plus a JSON user payload with all inputs', () => {
    const messages = programActionClassifyStrategy.buildMessages({
      question: 'How do I apply for CPP?',
      answer: 'You can apply for the Canada Pension Plan online...',
      department: 'EDSC-ESDC',
      citationUrl: 'https://www.canada.ca/en/services/benefits/publicpensions/cpp.html',
      referringUrl: 'https://www.canada.ca/en/services/benefits.html',
      seedPrograms: ['Canada Pension Plan'],
      actions: [{ action: 'Apply', synonyms: ['Request'] }]
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('PROGRAM');
    expect(messages[0].content).toContain('ACTION');
    const payload = JSON.parse(messages[1].content);
    expect(payload.question).toBe('How do I apply for CPP?');
    expect(payload.department).toBe('EDSC-ESDC');
    expect(payload.citation_url).toContain('cpp.html');
    expect(payload.referring_url).toContain('benefits.html');
    expect(payload.seed_programs).toEqual(['Canada Pension Plan']);
    expect(payload.actions).toEqual([{ action: 'Apply', synonyms: ['Request'] }]);
  });

  it('defaults missing request fields to empty values', () => {
    const messages = programActionClassifyStrategy.buildMessages();
    const payload = JSON.parse(messages[1].content);
    expect(payload.question).toBe('');
    expect(payload.seed_programs).toEqual([]);
    expect(payload.actions).toEqual([]);
  });
});

describe('programActionClassifyStrategy.parse', () => {
  it('parses a plain JSON object response', () => {
    const result = programActionClassifyStrategy.parse({
      content: '{"program": "Canada Pension Plan", "action": "Apply"}',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5
    });
    expect(result.program).toBe('Canada Pension Plan');
    expect(result.action).toBe('Apply');
    expect(result.model).toBe('m');
  });

  it('parses JSON wrapped in code fences and surrounding prose', () => {
    const result = programActionClassifyStrategy.parse({
      content: '```json\nHere you go: {"program": "Old Age Security", "action": "unknown"}\n```',
      model: 'm'
    });
    expect(result.program).toBe('Old Age Security');
    expect(result.action).toBe('unknown');
  });

  it('returns nulls when the response is not parseable JSON', () => {
    const result = programActionClassifyStrategy.parse({ content: 'not json at all', model: 'm' });
    expect(result.program).toBeNull();
    expect(result.action).toBeNull();
  });

  it('returns nulls for missing or blank fields', () => {
    const result = programActionClassifyStrategy.parse({ content: '{"program": "  "}', model: 'm' });
    expect(result.program).toBeNull();
    expect(result.action).toBeNull();
  });
});
