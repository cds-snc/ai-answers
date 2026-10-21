import { describe, it, expect } from 'vitest';
import {
    citedPageReturned,
    parseProbeCsv,
    probeModesForRow,
    probeResultsToCsv,
    stripBatchNumbering,
} from '../passagesProbe.js';
import { parseDelimitedText } from '../../spreadsheets/csv.js';

const CRA_URL = 'https://www.canada.ca/en/revenue-agency/services/x.html';

// Same shape as a batch input export, including the BOM.
const EXPORT_CSV = '﻿chatId,createdAt,referringUrl,question,citationUrl,answer\n'
    + `c1,2025-10-22T12:33:46.248Z,https://www.canada.ca/en.html,01. Can I deposit to RRSP at age 72,${CRA_URL},"<s-1>No.</s-1>\n<s-2>Spousal RRSP may be possible.</s-2>"\n`
    + 'c2,2025-10-22T12:34:00.000Z,,"02. Question, with a comma",,No citation\n';

describe('passagesProbe', () => {
    it('strips batch numbering only at the start', () => {
        expect(stripBatchNumbering('01. Can I deposit to RRSP')).toBe('Can I deposit to RRSP');
        expect(stripBatchNumbering('What is form T2. Thanks')).toBe('What is form T2. Thanks');
        expect(stripBatchNumbering('2024 tax rates')).toBe('2024 tax rates');
    });

    it('reads question, citation URL and answer from a batch export', () => {
        expect(parseProbeCsv(EXPORT_CSV)).toEqual([
            { question: 'Can I deposit to RRSP at age 72', url: CRA_URL, answer: '<s-1>No.</s-1>\n<s-2>Spousal RRSP may be possible.</s-2>' },
            { question: 'Question, with a comma', url: '', answer: 'No citation' },
        ]);
    });

    it('throws a coded error when there is no question column', () => {
        expect(() => parseProbeCsv('chatId,answer\nc1,a\n')).toThrow(expect.objectContaining({ code: 'MISSING_QUESTION_COLUMN' }));
    });

    it('runs page mode only when the row has a URL', () => {
        expect(probeModesForRow({ url: CRA_URL })).toEqual(['page', 'open']);
        expect(probeModesForRow({ url: '' })).toEqual(['open']);
    });

    it('matches the cited page ignoring case, trailing slash, query and hash', () => {
        expect(citedPageReturned([{ url: `${CRA_URL.toUpperCase()}#s1` }], CRA_URL)).toBe(true);
        expect(citedPageReturned([{ url: 'https://www.canada.ca/en/revenue-agency/other.html' }], CRA_URL)).toBe(false);
        expect(citedPageReturned([{ url: CRA_URL }], '')).toBe(false);
    });

    it('writes one CSV line per call with the passages', () => {
        const csv = probeResultsToCsv([{
            question: 'Q', citationUrl: CRA_URL, goldenAnswer: 'A', lang: 'en', maxPassages: 10, mode: 'page', ok: true, status: 200, latencyMs: 120,
            passages: [{ score: 0.8, url: CRA_URL, text: 'Passage, with "quotes"' }],
        }]);
        const [header, row] = parseDelimitedText(csv);
        expect(header[0]).toBe('question');
        expect(row).toEqual([
            'Q', CRA_URL, 'A', 'en', '10', 'page', 'true', '', '', '200', '120', '1', 'true', `[0.8] ${CRA_URL}\nPassage, with "quotes"`,
        ]);
    });
});
