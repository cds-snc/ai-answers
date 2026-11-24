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

  it('restores the formula prefix when a batch CSV is parsed again', () => {
    const question = '- Apply online';
    const csv = serializeCsvRows([
      ['Problem Details', 'URL'],
      [question, '=1+1'],
      ["'hello", '+1 613-555-0100'],
    ]);

    expect(parseBatchCsv(csv)).toEqual([
      { REDACTEDQUESTION: question, URL: '=1+1' },
      { REDACTEDQUESTION: "'hello", URL: '+1 613-555-0100' },
    ]);
  });

  it('keeps an apostrophe that was already in front of a formula character', () => {
    const question = "'=hello";
    const note = "'-note";
    const csv = serializeCsvRows([
      ['Problem Details', "'=DETAILS"],
      [question, note],
    ]);

    expect(parseBatchCsv(csv)).toEqual([
      { REDACTEDQUESTION: question, "'=DETAILS": note },
    ]);
  });

  it('prefixes formula-leading text and still quotes special characters', () => {
    const csv = serializeCsvRows([
      ['question', 'score', 'note'],
      ['=HYPERLINK("http://evil.example")', -4, 'ok = fine'],
      ['+1+2', 0, ''],
      ['-2+3', false, null],
      ['@SUM(A1)', '', "already '=safe"],
      ['\t=1+1', '', ''],
      ['\r=1+1', '', ''],
      ['- bullet', '', "'=already-text"],
    ]);

    expect(csv).toBe(
      [
        'question,score,note',
        `"'=HYPERLINK(""http://evil.example"")",-4,ok = fine`,
        "'+1+2,0,",
        "'-2+3,false,",
        `'@SUM(A1),,already '=safe`,
        "'\t=1+1,,",
        `"'\r=1+1",,`,
        "'- bullet,,''=already-text",
      ].join('\r\n')
    );
  });

  it('checks text after null bytes are removed and after arrays are joined', () => {
    const csv = serializeCsvRows([
      ['question', 'labels', 'score', 'phone'],
      ['\u0000=HYPERLINK("http://evil.example")', ['\u0000=CMD()', 'kept'], -5, '+1 613-555-0100'],
      ['-5', '+42', 0, 'ok = fine'],
    ]);

    expect(csv).toBe(
      [
        'question,labels,score,phone',
        `"'=HYPERLINK(""http://evil.example"")","'=CMD(),kept",-5,'+1 613-555-0100`,
        '-5,+42,0,ok = fine',
      ].join('\r\n')
    );
    expect(csv).not.toContain('\u0000');
  });
});
