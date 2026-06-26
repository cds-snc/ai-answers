import { describe, it, expect } from 'vitest';
import { parseBatchCsv, serializeCsvRows } from '../csv.js';

describe('spreadsheet csv helpers', () => {
  it('parses batch CSV rows with quoted values and normalized headers', () => {
    const entries = parseBatchCsv(
      'Problem Details,URL,REFERRINGURL\n"Hello, world","https://example.com","https://ref.example.com"\n"Quoted ""text""",,'
    );

    expect(entries).toEqual([
      {
        REDACTEDQUESTION: 'Hello, world',
        URL: 'https://example.com',
        REFERRINGURL: 'https://ref.example.com',
      },
      {
        REDACTEDQUESTION: 'Quoted "text"',
        URL: '',
        REFERRINGURL: '',
      },
    ]);
  });

  it('throws when the required question column is missing', () => {
    expect(() => parseBatchCsv('Name,URL\nExample,https://example.com')).toThrow('MISSING_QUESTION_COLUMN');
  });

  it('serializes CSV rows with escaping', () => {
    const csv = serializeCsvRows([
      ['Name', 'Value'],
      ['Alpha, Inc.', 'He said "yes"'],
    ]);

    expect(csv).toBe('Name,Value\r\n"Alpha, Inc.","He said ""yes"""');
  });
});
