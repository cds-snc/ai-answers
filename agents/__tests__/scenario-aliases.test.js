import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCENARIO_ALIASES, resolveScenarioKey } from '../prompts/scenarios/scenario-aliases.js';
import { departments_EN } from '../prompts/scenarios/departments_EN.js';
import { departments_FR } from '../prompts/scenarios/departments_FR.js';

const scenariosDir = path.dirname(fileURLToPath(import.meta.resolve('../prompts/scenarios/scenario-aliases.js')));

// Mirrors the path derivation in systemPrompt.js
const scenarioFileFor = (abbrKey) => {
    const dashed = abbrKey.toLowerCase().replace(/\s+/g, '-');
    return path.join(scenariosDir, `context-${dashed}`, `${dashed}-scenarios.js`);
};

const aliasEntries = Object.entries(SCENARIO_ALIASES);
const enKeys = new Set(departments_EN.map((d) => d.abbrKey));
const frKeys = new Set(departments_FR.map((d) => d.abbrKey));

describe('SCENARIO_ALIASES', () => {
    it.each(aliasEntries)('%s is a real abbrKey in departments_EN and departments_FR', (aliasKey) => {
        expect(enKeys.has(aliasKey)).toBe(true);
        expect(frKeys.has(aliasKey)).toBe(true);
    });

    it.each(aliasEntries)('%s resolves to a canonical abbrKey that has a scenario file', (_aliasKey, canonicalKey) => {
        expect(enKeys.has(canonicalKey)).toBe(true);
        expect(fs.existsSync(scenarioFileFor(canonicalKey))).toBe(true);
    });

    it.each(aliasEntries)('%s is documented in the header comment of the scenario file it loads', (aliasKey, canonicalKey) => {
        const source = fs.readFileSync(scenarioFileFor(canonicalKey), 'utf8');
        const header = source.slice(0, source.search(/^export /m));
        expect(header).toContain(aliasKey);
    });

    it('has no alias chains — every target is canonical, never itself an alias', () => {
        const chained = aliasEntries.filter(([, canonicalKey]) => canonicalKey in SCENARIO_ALIASES);
        expect(chained).toEqual([]);
    });

    it('never aliases a department that has its own scenario file', () => {
        const shadowed = aliasEntries.filter(([aliasKey]) => fs.existsSync(scenarioFileFor(aliasKey)));
        expect(shadowed).toEqual([]);
    });
});

describe('resolveScenarioKey', () => {
    it('maps an aliased abbrKey to its canonical abbrKey', () => {
        expect(resolveScenarioKey('BIZPAL-PERLE')).toBe('ISED-ISDE');
        expect(resolveScenarioKey('AGPAL')).toBe('AAFC-AAC');
    });

    it('returns unaliased keys unchanged', () => {
        expect(resolveScenarioKey('CRA-ARC')).toBe('CRA-ARC');
        expect(resolveScenarioKey('NOT-A-DEPARTMENT')).toBe('NOT-A-DEPARTMENT');
        expect(resolveScenarioKey('')).toBe('');
    });
});
