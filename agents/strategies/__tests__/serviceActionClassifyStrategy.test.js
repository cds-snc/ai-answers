import { describe, it, expect } from 'vitest';
import serviceActionClassifyStrategy from '../serviceActionClassifyStrategy.js';

describe('serviceActionClassifyStrategy.buildMessages', () => {
  it('builds a system prompt plus a JSON user payload with all inputs', () => {
    const messages = serviceActionClassifyStrategy.buildMessages({
      question: 'How do I apply for CPP?',
      answer: 'You can apply for the Canada Pension Plan online...',
      department: 'EDSC-ESDC',
      citationUrl: 'https://www.canada.ca/en/services/benefits/publicpensions/cpp.html',
      referringUrl: 'https://www.canada.ca/en/services/benefits.html',
      seedServices: ['Canada Pension Plan'],
      actions: [{ action: 'Apply', synonyms: ['Request'] }]
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('SERVICE');
    expect(messages[0].content).toContain('ACTION');
    const payload = JSON.parse(messages[1].content);
    expect(payload.question).toBe('How do I apply for CPP?');
    expect(payload.department).toBe('EDSC-ESDC');
    expect(payload.citation_url).toContain('cpp.html');
    expect(payload.referring_url).toContain('benefits.html');
    expect(payload.seed_services).toEqual(['Canada Pension Plan']);
    expect(payload.actions).toEqual([{ action: 'Apply', synonyms: ['Request'] }]);
  });

  it('defaults missing request fields to empty values', () => {
    const messages = serviceActionClassifyStrategy.buildMessages();
    const payload = JSON.parse(messages[1].content);
    expect(payload.question).toBe('');
    expect(payload.seed_services).toEqual([]);
    expect(payload.actions).toEqual([]);
  });
});

describe('serviceActionClassifyStrategy.parse', () => {
  it('parses a plain JSON object response', () => {
    const result = serviceActionClassifyStrategy.parse({
      content: '{"service": "Canada Pension Plan", "action": "Apply"}',
      model: 'm',
      inputTokens: 10,
      outputTokens: 5
    });
    expect(result.service).toBe('Canada Pension Plan');
    expect(result.action).toBe('Apply');
    expect(result.model).toBe('m');
  });

  it('parses JSON wrapped in code fences and surrounding prose', () => {
    const result = serviceActionClassifyStrategy.parse({
      content: '```json\nHere you go: {"service": "Old Age Security", "action": "unknown"}\n```',
      model: 'm'
    });
    expect(result.service).toBe('Old Age Security');
    expect(result.action).toBe('unknown');
  });

  it('returns nulls when the response is not parseable JSON', () => {
    const result = serviceActionClassifyStrategy.parse({ content: 'not json at all', model: 'm' });
    expect(result.service).toBeNull();
    expect(result.action).toBeNull();
  });

  it('returns nulls for missing or blank fields', () => {
    const result = serviceActionClassifyStrategy.parse({ content: '{"service": "  "}', model: 'm' });
    expect(result.service).toBeNull();
    expect(result.action).toBeNull();
  });
});
