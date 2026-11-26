import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../services/ServerLoggingService.js', () => ({
    default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SCENARIO_LOADERS, getScenarioLoader, findScenarioLoader } from '../prompts/scenarios/scenario-loaders.js';
import { SCENARIO_ALIASES } from '../prompts/scenarios/scenario-aliases.js';
import { buildAnswerSystemPrompt } from '../prompts/systemPrompt.js';

const scenariosDir = path.dirname(fileURLToPath(import.meta.resolve('../prompts/scenarios/scenario-loaders.js')));
const folderFor = (key) => `context-${key.toLowerCase()}`;
const contextFolders = fs.readdirSync(scenariosDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('context-'))
    .map((d) => d.name)
    .sort();
const registryEntries = Object.entries(SCENARIO_LOADERS);

// Payloads from AIA-017: path traversal, doubled-segment, query/fragment
// tricks, and prototype keys. None may resolve to a loader.
const HOSTILE_KEYS = [
    '../../../../etc/passwd',
    '../scenarios-all',
    'cra-arc/../cra-arc',
    // Under the old `./scenarios/context-${d}/${d}-scenarios.js` template this
    // resolved to agents/prompts/safety.js (the '#' turns the rest into a URL
    // fragment) and injected its string export as "department scenarios".
    'x/../../safety.js#',
    'CRA-ARC?x=1',
    'CRA-ARC#',
    ' CRA-ARC',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
];

describe('SCENARIO_LOADERS registry', () => {
    it('has exactly one entry per context-* scenario folder (a new partner folder must be registered)', () => {
        expect(registryEntries.map(([key]) => folderFor(key)).sort()).toEqual(contextFolders);
    });

    it.each(registryEntries)('%s loads the sole string export of its scenario file', async (key, loader) => {
        const mod = await import(path.join(scenariosDir, folderFor(key), `${key.toLowerCase()}-scenarios.js`));
        const strings = Object.values(mod).filter((v) => typeof v === 'string');
        expect(strings).toHaveLength(1);
        const text = await loader();
        expect(text.length).toBeGreaterThan(0);
        expect(text).toBe(strings[0]);
    });

    // The override editor can't import this registry (src/ can't import from
    // agents/), so it keeps its own list. Without this, a partner added here is
    // accepted by the API but never appears in the editor's dropdown.
    it('matches SUPPORTED_DEPARTMENTS in ScenarioOverridesPage.js', () => {
        const pageSource = fs.readFileSync(path.join(scenariosDir, '../../../src/pages/ScenarioOverridesPage.js'), 'utf8');
        const match = pageSource.match(/const SUPPORTED_DEPARTMENTS = \[([^\]]*)\]/);
        expect(match, 'SUPPORTED_DEPARTMENTS array literal not found in ScenarioOverridesPage.js').not.toBeNull();
        const pageKeys = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
        expect(pageKeys.sort()).toEqual(Object.keys(SCENARIO_LOADERS).sort());
    });

    it.each(Object.entries(SCENARIO_ALIASES))('alias %s → %s targets a registered key', (_alias, canonical) => {
        expect(getScenarioLoader(canonical)).not.toBeNull();
    });
});

describe('getScenarioLoader (exact) / findScenarioLoader (case-insensitive)', () => {
    it('getScenarioLoader matches canonical keys exactly', () => {
        expect(getScenarioLoader('CRA-ARC')).toBe(SCENARIO_LOADERS['CRA-ARC']);
        expect(getScenarioLoader('cra-arc')).toBeNull();
    });

    it('findScenarioLoader ignores case and spaces, like the old lowercased/dashed import path', () => {
        expect(findScenarioLoader('cra-arc')).toBe(SCENARIO_LOADERS['CRA-ARC']);
        expect(findScenarioLoader('CRA ARC')).toBe(SCENARIO_LOADERS['CRA-ARC']);
        expect(findScenarioLoader('NRCAN-RNCAN')).toBe(SCENARIO_LOADERS['NRCan-RNCan']);
    });

    it.each(HOSTILE_KEYS)('rejects %j', (key) => {
        expect(getScenarioLoader(key)).toBeNull();
        expect(findScenarioLoader(key)).toBeNull();
    });

    it.each([undefined, null, 42, {}, ['CRA-ARC']])('rejects non-string %j', (key) => {
        expect(getScenarioLoader(key)).toBeNull();
        expect(findScenarioLoader(key)).toBeNull();
    });
});

describe('buildAnswerSystemPrompt department scenarios (AIA-017)', () => {
    // Vite rewrites a template-literal import() into a glob of matching files,
    // so under vitest the old traversal payloads can't escape — they only did in
    // plain Node. This source check is what actually stops the sink coming back.
    it('systemPrompt.js never builds an import() specifier at runtime', () => {
        const source = fs.readFileSync(path.join(scenariosDir, '..', 'systemPrompt.js'), 'utf8');
        expect(source).not.toMatch(/import\(\s*[^'"\s)]/);
    });

    const DEPT_HEADING = '## Department-Specific Scenarios and updates:\n';
    const deptSection = (prompt) => {
        const start = prompt.indexOf(DEPT_HEADING);
        expect(start).toBeGreaterThan(-1);
        return prompt.slice(start + DEPT_HEADING.length, prompt.indexOf('## Official language context', start)).trim();
    };

    it('loads a registered department\'s scenarios', async () => {
        const prompt = await buildAnswerSystemPrompt('en', { department: 'CRA-ARC' });
        expect(deptSection(prompt)).toBe((await SCENARIO_LOADERS['CRA-ARC']()).trim());
    });

    it('loads the canonical scenarios for an aliased department', async () => {
        const prompt = await buildAnswerSystemPrompt('en', { department: 'BIZPAL-PERLE' });
        expect(deptSection(prompt)).toBe((await SCENARIO_LOADERS['ISED-ISDE']()).trim());
    });

    it('loads the canonical scenarios for an aliased department in another case', async () => {
        const prompt = await buildAnswerSystemPrompt('en', { department: 'bizpal-perle' });
        expect(deptSection(prompt)).toBe((await SCENARIO_LOADERS['ISED-ISDE']()).trim());
    });

    it('still loads scenarios when the LLM returns the key in another case', async () => {
        const prompt = await buildAnswerSystemPrompt('en', { department: 'cra-arc' });
        expect(deptSection(prompt)).toBe((await SCENARIO_LOADERS['CRA-ARC']()).trim());
    });

    it('loads nothing for an unknown department', async () => {
        const prompt = await buildAnswerSystemPrompt('en', { department: 'NOT-A-DEPARTMENT' });
        expect(deptSection(prompt)).toBe('');
    });

    it.each(HOSTILE_KEYS)('loads nothing for hostile department %j', async (department) => {
        const prompt = await buildAnswerSystemPrompt('en', { department });
        expect(deptSection(prompt)).toBe('');
    });

    it('prefers a scenario override over the registry', async () => {
        const prompt = await buildAnswerSystemPrompt('en', { department: 'CRA-ARC', scenarioOverrideText: 'OVERRIDE TEXT' });
        expect(deptSection(prompt)).toBe('OVERRIDE TEXT');
    });
});
