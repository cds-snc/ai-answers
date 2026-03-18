#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const en = require('../src/locales/en.json');
const fr = require('../src/locales/fr.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenKeys(obj, prefix = '') {
  return Object.keys(obj).flatMap(k => {
    const full = prefix ? `${prefix}.${k}` : k;
    return typeof obj[k] === 'object' && obj[k] !== null
      ? flattenKeys(obj[k], full)
      : [full];
  });
}

/** Read all JS/TS source files under `dir`, returning { filePath, content }[]. */
function readAllJs(dir, skipDirs = new Set(['node_modules', 'locales', '.git', 'build', 'dist', 'coverage'])) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) readAllJs(full, skipDirs).forEach(f => files.push(f));
    } else if (entry.isFile() && /\.(js|jsx|ts|tsx|cjs|mjs)$/.test(entry.name)) {
      files.push({ filePath: full, content: fs.readFileSync(full, 'utf8') });
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Collect source files
//
// Directories scanned:
//   src/       — React components, pages, hooks, services, utils
//   agents/    — LangGraph pipeline, prompts, agent services
//   scripts/   — maintenance and utility scripts (including this one)
//   services/  — shared services called from both frontend and backend
//                (e.g. UrlValidationService.js which calls t())
//
// Directories confirmed to contain NO t()/safeT() calls (backend only):
//   api/, config/, middleware/, models/, seeds/, server/,
//   test/, tests/, __tests__
//
// If a new root-level directory is added that may call t(), add it below.
// ---------------------------------------------------------------------------

const srcFiles = readAllJs(path.join(ROOT, 'src'));

let extraFiles = [];
for (const dir of ['scripts', 'agents', 'services']) {
  const p = path.join(ROOT, dir);
  if (fs.existsSync(p)) extraFiles = extraFiles.concat(readAllJs(p));
}

const allFiles = [...srcFiles, ...extraFiles];
const allCode = allFiles.map(f => f.content).join('\n');

// ---------------------------------------------------------------------------
// Auto-detect wrapper functions that forward a key parameter to t() / safeT()
// e.g. const tr = (key, fallback) => { const res = t(key); ... }
// Strategy: find any identifier that appears as t(identifier) where identifier
// is not a string literal. Trace back to the named function that declares it
// as a parameter — that function name is a translation wrapper.
// ---------------------------------------------------------------------------

/**
 * Per-file wrapper detection: find functions in each file that forward their
 * first parameter directly to t() or safeT(). Scopes detection to the same file
 * to avoid false positives from parameter names that happen to match across files.
 */
function detectWrapperNames(files) {
  const wrappers = new Set(['t', 'safeT']);
  const skipVars = new Set(['lang', 'language', 'locale', 'type', 'val', 'v', 'k',
    'e', 'err', 'opt', 'item', 'row', 'col', 'data', 'name', 'label', 'value',
    'result', 'res', 'text', 'msg', 'str', 'translation', 'fallback']);

  for (const { content } of files) {
    const passthroughPat = /\b(?:t|safeT)\(([a-zA-Z_$][a-zA-Z0-9_$]*)\)/g;
    let pm;
    while ((pm = passthroughPat.exec(content)) !== null) {
      const paramName = pm[1];
      if (skipVars.has(paramName)) continue;

      // Arrow: const funcName = (paramName[, ...]) => — must appear BEFORE the t(paramName) call
      const arrowPat = new RegExp(
        `const\\s+(\\w+)\\s*=\\s*(?:useCallback\\s*\\(\\s*)?\\(\\s*${paramName}\\s*[,)]`, 'g'
      );
      let am;
      while ((am = arrowPat.exec(content)) !== null) {
        if (am.index < pm.index) wrappers.add(am[1]);
      }

      // Declaration: function funcName(paramName[, ...]) — must appear BEFORE the t(paramName) call
      const declPat = new RegExp(`function\\s+(\\w+)\\s*\\(\\s*${paramName}\\s*[,)]`, 'g');
      let dm;
      while ((dm = declPat.exec(content)) !== null) {
        if (dm.index < pm.index) wrappers.add(dm[1]);
      }
    }
  }

  return wrappers;
}

const translationFns = detectWrapperNames(allFiles);

// Build a regex alternation for all known translation function names
// Escape for use in regex (most names are simple identifiers)
const fnAlt = [...translationFns].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const fnPat = `(?:${fnAlt})`;

// ---------------------------------------------------------------------------
// Pattern extraction
// ---------------------------------------------------------------------------

const usedLiterals = new Set();
let m;

// Build sub-patterns as plain strings (avoiding backtick escaping issues in template literals)
const BT = '`'; // backtick character, kept separate to avoid template literal confusion
const singleOrDouble = "(?:'[^'$\\r\\n)]+?'|\"[^\"$\\r\\n)]+?\")";
const anyQuote      = "(?:'[^'$\\r\\n)]+?'|\"[^\"$\\r\\n)]+?\"|`[^`$\\r\\n)]+?`)";

// 1. Static string: t('key'), safeT("key"), tr('key'), t(`key`)  (no interpolation)
//    Captures the key content from any quote style
const literalPat = new RegExp(fnPat + "\\((['\"`])([^'\"" + BT + "$\\r\\n)]+)\\1", 'g');
while ((m = literalPat.exec(allCode)) !== null) usedLiterals.add(m[2].trim());

// 1b. Multi-line calls: t(\n  'key'\n) — key is on the next line after the opening paren
//    e.g. safeT(\n  "homepage.chat.textarea.ariaLabel.skipfo"\n)
const multiLinePat = new RegExp(fnPat + "\\([^\\S\\n]*\\n\\s*(['\"`])([^'\"" + BT + "$\\r\\n)]+)\\1", 'g');
while ((m = multiLinePat.exec(allCode)) !== null) usedLiterals.add(m[2].trim());

// 2. Variable assigned a literal key string then passed to t()
//    e.g.  const key = 'some.key';  …  t(key)
const assignedStrings = new Set();
const assignPat = /(?:const|let|var)\s+\w+\s*=\s*(['"`])([a-z][a-z0-9]*(?:\.[a-z][a-z0-9_-]*)+)\1/gi;
while ((m = assignPat.exec(allCode)) !== null) assignedStrings.add(m[2].trim());

// 3. Template literals with interpolation — capture static prefix
//    Handles both t(`key.${v}`) and t(`key.${v}`, fallback)
const dynamicPrefixes = [];
const backtickPat = new RegExp(fnPat + '\\(' + BT + '([^' + BT + ']*)', 'g');
while ((m = backtickPat.exec(allCode)) !== null) {
  const arg = m[1];
  if (arg.includes('${')) {
    const prefix = arg.slice(0, arg.indexOf('${'));
    if (prefix) dynamicPrefixes.push(prefix);
  }
}

// 4. String concatenation: t('prefix.' + var)
const concatPrefixes = [];
const concatPat = new RegExp(fnPat + "\\(['\"]([^'\"$\\r\\n]+)['\"]\\s*\\+", 'g');
while ((m = concatPat.exec(allCode)) !== null) concatPrefixes.push(m[1]);

// 5. Object-access on return value: t('key').prop  t('key') && …  t('key') ?
const objectAccessKeys = [];
const objAccessPat = new RegExp(fnPat + "\\((['\"`])([^'\"" + BT + "$\\r\\n)]+)\\1\\)\\s*(?:\\?|\\.|&&|\\[)", 'g');
while ((m = objAccessPat.exec(allCode)) !== null) objectAccessKeys.push(m[2]);

// 6. Keys used in arrays/objects as plain strings (not inside t() calls)
//    e.g.  { key: 'admin.filters.title', label: '...' }
//    This is a heuristic — only mark as covered if the string matches a known key exactly
const plainStringPat = /['"]([a-z][a-z0-9]*(?:\.[a-z][a-z0-9_-]*){2,})['"]/g;
const plainStrings = new Set();
while ((m = plainStringPat.exec(allCode)) !== null) plainStrings.add(m[1]);

// ---------------------------------------------------------------------------
// Classify every EN key
// ---------------------------------------------------------------------------

const allEnKeys = flattenKeys(en);
const dead = [];
const covered = [];

for (const key of allEnKeys) {
  if (usedLiterals.has(key)) continue;
  if (assignedStrings.has(key)) { covered.push({ key, reason: 'variable-assignment' }); continue; }
  if (plainStrings.has(key))    { covered.push({ key, reason: 'plain-string-reference' }); continue; }

  const dynPrefix = dynamicPrefixes.find(p => key.startsWith(p));
  if (dynPrefix) { covered.push({ key, reason: `dynamic-template:${dynPrefix}` }); continue; }

  const concatPrefix = concatPrefixes.find(p => key.startsWith(p));
  if (concatPrefix) { covered.push({ key, reason: `string-concat:${concatPrefix}` }); continue; }

  const objKey = objectAccessKeys.find(k => key.startsWith(`${k}.`) || key === k);
  if (objKey) { covered.push({ key, reason: `object-access:${objKey}` }); continue; }

  dead.push(key);
}

// ---------------------------------------------------------------------------
// Duplicate detection — same leaf value appears under 2+ different keys in EN
// ---------------------------------------------------------------------------

function flattenWithValues(obj, prefix = '') {
  const result = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      flattenWithValues(obj[k], full).forEach(e => result.push(e));
    } else {
      result.push({ key: full, val: String(obj[k]) });
    }
  }
  return result;
}

const enEntries = flattenWithValues(en);
const valueMap = new Map(); // value -> [key, ...]
for (const { key, val } of enEntries) {
  if (!valueMap.has(val)) valueMap.set(val, []);
  valueMap.get(val).push(key);
}

// All groups of 2+ keys sharing the same value (live or dead)
const duplicates = []; // { value, keys: [...] }
const deadSet = new Set(dead);

// ---------------------------------------------------------------------------
// Parity — keys in FR but not EN, and vice versa
// ---------------------------------------------------------------------------

const enKeySet = new Set(allEnKeys);
const frKeySet = new Set(flattenKeys(fr));
const onlyInFr = [...frKeySet].filter(k => !enKeySet.has(k));
const onlyInEn = [...enKeySet].filter(k => !frKeySet.has(k));
for (const [val, keys] of valueMap) {
  if (keys.length < 2) continue;
  if (val.length < 4) continue; // skip trivially short strings like "All", "No"
  duplicates.push({ value: val, keys });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const grouped = {};
for (const k of dead) {
  const ns = k.split('.')[0];
  if (!grouped[ns]) grouped[ns] = [];
  grouped[ns].push(k);
}

console.log('='.repeat(70));
console.log(`1) DEAD KEYS — ${dead.length} keys with no detected usage (flagged for removal)`);
console.log('='.repeat(70));
for (const [ns, keys] of Object.entries(grouped)) {
  console.log(`\n[${ns}] ${keys.length} dead:`);
  keys.forEach(k => console.log(`  ${k}`));
}

console.log('\n' + '='.repeat(70));
console.log(`2) DUPLICATIVE KEYS — ${duplicates.length} value groups shared by 2+ keys (flagged for optimization)`);
console.log('   Keys marked [dead] have no detected usage and can be removed.');
console.log('   Keys marked [live] are in use — consolidation requires a code update.');
console.log('='.repeat(70));
for (const d of duplicates) {
  console.log(`\n  value: "${d.value}"`);
  d.keys.forEach(k => console.log(`    [${deadSet.has(k) ? 'dead' : 'live'}] ${k}`));
}

console.log('\n' + '='.repeat(70));
console.log(`3) PARITY — ${onlyInEn.length} keys in EN but missing from FR (need French translation)`);
console.log('='.repeat(70));
if (onlyInEn.length === 0) {
  console.log('  ✓ No missing keys');
} else {
  onlyInEn.forEach(k => console.log(`  ${k}`));
}

console.log('\n' + '='.repeat(70));
console.log(`4) PARITY — ${onlyInFr.length} keys in FR but missing from EN (orphaned French keys)`);
console.log('='.repeat(70));
if (onlyInFr.length === 0) {
  console.log('  ✓ No missing keys');
} else {
  onlyInFr.forEach(k => console.log(`  ${k}`));
}
