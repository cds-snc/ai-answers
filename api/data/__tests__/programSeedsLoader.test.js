import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseProgramsMarkdown,
  getSeedPrograms,
  getProgramNameMap,
  getAllProgramNameMap,
  _clearProgramSeedCache,
} from '../programSeedsLoader.js';

beforeEach(() => {
  _clearProgramSeedCache();
});

describe('parseProgramsMarkdown', () => {
  it('extracts EN/FR rows and skips the header and separator', () => {
    const md = [
      '# Title',
      'Some prose that is not a table.',
      '| English | Français |',
      '|---------|----------|',
      "| CRA Account | Compte de l'ARC |",
      '| GST/HST | TPS/TVH |',
      '',
    ].join('\n');

    expect(parseProgramsMarkdown(md)).toEqual([
      { en: 'CRA Account', fr: "Compte de l'ARC" },
      { en: 'GST/HST', fr: 'TPS/TVH' },
    ]);
  });

  it('returns an empty list when there is no table', () => {
    expect(parseProgramsMarkdown('no table here')).toEqual([]);
    expect(parseProgramsMarkdown('')).toEqual([]);
  });
});

describe('getSeedPrograms / getProgramNameMap — CRA from the .md file', () => {
  it('loads the curated CRA program list from the Markdown file', () => {
    const programs = getSeedPrograms('CRA-ARC');
    expect(programs).toContain('CRA Account');
    expect(programs).toContain('Tax-free savings account (TFSA)');
    // Sanity: the whole curated list is present (24 rows as authored).
    expect(programs.length).toBeGreaterThanOrEqual(20);
  });

  it('exposes the English→French name map for CRA', () => {
    const map = getProgramNameMap('CRA-ARC');
    expect(map.get('GST/HST')).toBe('TPS/TVH');
    expect(map.get('Canada child benefit')).toBe('Allocation canadienne pour enfants');
  });
});

describe('getSeedPrograms / getProgramNameMap — EDSC-ESDC now curated from .md', () => {
  it('loads EDSC-ESDC programs from its curated .md file', () => {
    const programs = getSeedPrograms('EDSC-ESDC');
    expect(programs).toContain('Canada Pension Plan');
    expect(programs).toContain('Old Age Security');
  });

  it('has an empty French map while the EDSC-ESDC .md Français column is unfilled', () => {
    // Draft .md files ship with a blank Français column; only real EN→FR pairs
    // populate the map, so it stays empty until French names are added.
    expect(getProgramNameMap('EDSC-ESDC').size).toBe(0);
  });
});

describe('getSeedPrograms — aliased departments resolve to the primary .md', () => {
  it('resolves PHAC-ASPC to the shared HC-SC program list', () => {
    const programs = getSeedPrograms('PHAC-ASPC');
    expect(programs).toContain('COVID-19 public health guidance');
  });
});

describe('getSeedPrograms — empty cases', () => {
  it('returns an empty list for an unknown department', () => {
    expect(getSeedPrograms('NOT-A-DEPT')).toEqual([]);
  });

  it('returns an empty list for a stub department whose .md has no program rows', () => {
    expect(getSeedPrograms('FIN')).toEqual([]);
  });
});

describe('getAllProgramNameMap — merged across departments', () => {
  it('includes CRA entries from the curated .md file', () => {
    const merged = getAllProgramNameMap();
    expect(merged.get('GST/HST')).toBe('TPS/TVH');
    expect(merged.get('Personal tax return')).toBe('Déclaration de revenus des particuliers');
  });

  it('has no entry for an emergent/unmapped program name', () => {
    // Names the classifier invented that are not in any curated list get no
    // French mapping and fall back to English at display time.
    expect(getAllProgramNameMap().has('Canada Carbon Rebate')).toBe(false);
  });
});
