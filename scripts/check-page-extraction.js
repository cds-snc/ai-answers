#!/usr/bin/env node
/**
 * Live check that downloadWebPage still reads the pages AI Answers depends on.
 *
 * This exists because the failure it guards against is silent. When Readability
 * kept only the largest block of the counter-tariff page, the tool returned
 * HTTP 200, `status: "success"` and 143k tokens of plausible-looking tariff
 * rows — from a list superseded twice. No error, no failing test, no log line.
 *
 * So the corpus asserts *named content*, never ratios. That page scored a
 * healthy 0.711 text-coverage while being entirely wrong; only "does the
 * September 8 list actually appear" catches it.
 *
 * Usage:
 *   node scripts/check-page-extraction.js              # check every page
 *   node scripts/check-page-extraction.js --filter fin # only matching URLs
 *   node scripts/check-page-extraction.js --verbose    # show token counts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(here, 'fixtures', 'page-extraction-corpus.json');

function parseArgs(argv) {
    const args = { filter: null, verbose: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--filter') args.filter = argv[++i];
        else if (a === '--verbose' || a === '-v') args.verbose = true;
        else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
    }
    return args;
}

function usage() {
    console.log(`Usage: node scripts/check-page-extraction.js [options]

  --filter <text>   Only check URLs containing <text>
  --verbose, -v     Print token counts per page
  -h, --help        Show this help

Corpus: ${path.relative(process.cwd(), CORPUS)}
Add a page whenever you find one the tool reads badly, with the markers that
prove the right part of it arrived.`);
}

const args = parseArgs(process.argv.slice(2));
const corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));

// Imported after arg parsing so --help works without loading jsdom.
const { default: downloadWebPageTool } = await import('../agents/tools/downloadWebPage.js');

// The tool logs a request line per read and dumps the axios error object on
// failure; quiet all three streams so results stay readable.
const real = { log: console.log, warn: console.warn, error: console.error };
const silence = () => {};

async function read(url) {
    console.log = silence;
    console.warn = silence;
    console.error = silence;
    try {
        return { ok: true, text: await downloadWebPageTool.invoke({ url }) };
    } catch (err) {
        return { ok: false, error: err.message };
    } finally {
        Object.assign(console, real);
    }
}

// Canada.ca sets its dates and French punctuation with non-breaking spaces, so
// "Effective September 8, 2026" on the page is not the same string as the one
// you would type into the corpus. Normalising here keeps the markers readable
// rather than making the extractor rewrite the page's own characters.
const normalize = (s) => s.replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\s+/g, ' ');
const has = (haystack, needle) => normalize(haystack).includes(normalize(needle));

let failures = 0;
let checked = 0;

const pages = corpus.pages.filter((p) => !args.filter || p.url.includes(args.filter));

for (const page of pages) {
    checked++;
    const label = page.url.replace(/^https:\/\//, '');
    const result = await read(page.url);

    if (!result.ok) {
        failures++;
        console.log(`FAIL  ${label}\n      could not read: ${result.error}`);
        if (page.why) console.log(`      why it matters: ${page.why}`);
        continue;
    }

    const missing = (page.expect || []).filter((m) => !has(result.text, m));

    // Content that must not appear before a given marker — used to prove a
    // superseded list did not crowd out the current one.
    let leaked = [];
    if (page.rejectBefore) {
        const text = normalize(result.text);
        const cut = text.indexOf(normalize(page.rejectBefore.marker));
        const head = cut === -1 ? text : text.slice(0, cut);
        leaked = page.rejectBefore.reject.filter((m) => head.includes(normalize(m)));
    }

    if (missing.length === 0 && leaked.length === 0) {
        const size = args.verbose ? ` (${result.text.length.toLocaleString()} chars)` : '';
        console.log(`ok    ${label}${size}`);
        continue;
    }

    failures++;
    console.log(`FAIL  ${label}`);
    if (missing.length) console.log(`      missing: ${missing.map((m) => JSON.stringify(m)).join(', ')}`);
    if (leaked.length) console.log(`      appeared before "${page.rejectBefore.marker}": ${leaked.join(', ')}`);
    if (page.why) console.log(`      why it matters: ${page.why}`);
}

if (corpus.unreadable?.length && !args.filter) {
    console.log(`\nKnown unreadable (JavaScript-rendered; not fixed by extraction):`);
    for (const p of corpus.unreadable) {
        console.log(`  ${p.url.replace(/^https:\/\//, '')}${p.cites ? ` — cited ${p.cites}x` : ''}`);
        console.log(`      ${p.why}`);
    }
}

console.log(`\n${checked - failures}/${checked} pages extracted correctly`);
if (failures) {
    console.log(`\n${failures} failing. Either canada.ca restructured the page (update the markers)`);
    console.log(`or extraction regressed (check agents/tools/downloadWebPage.js).`);
}
process.exit(failures ? 1 : 0);
