// Loads a department's curated program vocabulary. Source of truth is a
// partner-editable Markdown table at
//   agents/prompts/scenarios/context-<dept-dashed>/<dept-dashed>-programs.md
// (English | Français), matching the scenario-file naming convention. When a
// department has no such file yet, we fall back to the legacy hardcoded arrays
// in programActionSeeds.js. English names anchor the classifier; the English→
// French map is available for display of program names to French users.
//
// Server-side only (reads from disk, cached per abbrKey). Not imported by the
// React build.

import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { PROGRAM_SEEDS_BY_DEPARTMENT } from './programActionSeeds.js';
import { resolveScenarioKey } from '../../agents/prompts/scenarios/scenario-aliases.js';

const SCENARIOS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../agents/prompts/scenarios');

// abbrKey -> { programs: [{ en, fr }], enToFr: Map<string,string> }
const cache = new Map();

// Merged English→French map across every department's .md (built once, lazily).
let mergedMapCache = null;

const deptDashed = (abbrKey) =>
  resolveScenarioKey(String(abbrKey || '')).toLowerCase().replace(/\s+/g, '-');

// Parse a GitHub-flavoured Markdown table with two columns (English | Français).
// Skips the header row and the |---|---| separator; ignores non-table lines.
export function parseProgramsMarkdown(text) {
  const rows = [];
  for (const line of (text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const [en, fr] = cells;
    if (!en) continue;
    if (/^:?-{2,}:?$/.test(en.replace(/\s/g, ''))) continue; // separator row
    const enLower = en.toLowerCase();
    if (enLower === 'english' && (fr.toLowerCase() === 'français' || fr.toLowerCase() === 'francais')) continue; // header
    rows.push({ en, fr });
  }
  return rows;
}

function load(abbrKey) {
  if (cache.has(abbrKey)) return cache.get(abbrKey);

  const dashed = deptDashed(abbrKey);
  const file = path.join(SCENARIOS_DIR, `context-${dashed}`, `${dashed}-programs.md`);

  let programs = null;
  try {
    programs = parseProgramsMarkdown(readFileSync(file, 'utf8'));
  } catch (e) {
    programs = null; // no file yet, or unreadable — fall back below
  }

  let entry;
  if (programs && programs.length > 0) {
    entry = { programs, enToFr: new Map(programs.map((p) => [p.en, p.fr])) };
  } else {
    const fallback = (PROGRAM_SEEDS_BY_DEPARTMENT[resolveScenarioKey(abbrKey)] || PROGRAM_SEEDS_BY_DEPARTMENT[abbrKey] || [])
      .map((en) => ({ en, fr: '' }));
    entry = { programs: fallback, enToFr: new Map() };
  }

  cache.set(abbrKey, entry);
  return entry;
}

// English program names for a department — the classifier seed vocabulary.
export function getSeedPrograms(abbrKey) {
  return load(abbrKey).programs.map((p) => p.en);
}

// English → French program-name map for a department (empty when the department
// still uses the legacy English-only seeds).
export function getProgramNameMap(abbrKey) {
  return load(abbrKey).enToFr;
}

// Merged English → French program-name map across every department that has a
// curated .md file. Lets a consumer localize a stored (English) program name for
// display without knowing which department produced it — e.g. the program-volume
// chart, whose rows may span departments when no department filter is applied.
export function getAllProgramNameMap() {
  if (mergedMapCache) return mergedMapCache;

  const merged = new Map();
  let entries = [];
  try {
    entries = readdirSync(SCENARIOS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('context-'))
      .map((d) => d.name);
  } catch (e) {
    entries = [];
  }

  for (const dir of entries) {
    const dashed = dir.replace(/^context-/, '');
    const file = path.join(SCENARIOS_DIR, dir, `${dashed}-programs.md`);
    try {
      for (const { en, fr } of parseProgramsMarkdown(readFileSync(file, 'utf8'))) {
        if (en && fr) merged.set(en, fr);
      }
    } catch (e) {
      // No programs file for this department yet — skip.
    }
  }

  mergedMapCache = merged;
  return merged;
}

// Test hook — the disk read is cached for the process lifetime.
export function _clearProgramSeedCache() {
  cache.clear();
  mergedMapCache = null;
}
