#!/usr/bin/env node
// Check the URLs in batch or chat-log exports against the host allowlists:
//   - citations     → isGovernmentUrl   (AIA-007, api/util/govHost.js)
//   - fetched URLs  → normalizeFetchUrl (AIA-010, api/util/normalizeFetchUrl.js)
//
// Run it before changing either allowlist (or the departments list it reads),
// to see which real citations/fetches a change would block.
//
// Reads both export shapes:
//   - batch export:    answer.tools.N.tool + answer.tools.N.input columns
//   - chat-log export: one answer.tools.N cell per call ("downloadWebPage","input":"{\"url\":…}",…)
//
// Usage: node scripts/check-allowlist-urls.js <file.xlsx|file.csv> [...] [--hosts]
//   --hosts  also list every host seen, with counts
import ExcelJS from 'exceljs';
import { isGovernmentUrl } from '../api/util/govHost.js';
import { normalizeFetchUrl } from '../api/util/normalizeFetchUrl.js';

const CITATION_COLS = ['citationUrl', 'answer.citation.aiCitationUrl', 'expertFeedback.expertCitationUrl'];
const FETCH_TOOLS = new Set(['downloadWebPage', 'checkUrl', 'checkUrlStatus']);
const MAX_EXAMPLES = 3;

function usage() {
  console.log('Usage: node scripts/check-allowlist-urls.js <file.xlsx|file.csv> [...] [--hosts]');
}

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    return String(v.text ?? v.hyperlink ?? v.result ?? '');
  }
  return String(v);
}

// Batch export: the .input cell is JSON like {"url":"…","chatId":"…"}.
function urlFromToolInput(raw) {
  const s = cellText(raw).trim();
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    return typeof o === 'string' ? o : (o.url ?? null);
  } catch {
    return s.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ?? null;
  }
}

// Chat-log export: "downloadWebPage","input":"{\"url\":\"https://…\"}",…
function toolCallFromCell(raw) {
  const cell = cellText(raw);
  const tool = cell.match(/^"?([A-Za-z]+)"?/)?.[1];
  const url = cell.match(/\\?"url\\?"\s*:\s*\\?"(https?:\/\/[^"\\]+)/i)?.[1]
    ?? cell.match(/https?:\/\/[^\s"\\<>]+/i)?.[0];
  return { tool, url };
}

async function readRows(file) {
  const wb = new ExcelJS.Workbook();
  if (file.toLowerCase().endsWith('.csv')) await wb.csv.readFile(file);
  else await wb.xlsx.readFile(file);
  const rows = [];
  for (const ws of wb.worksheets) {
    const header = ws.getRow(1).values.map(cellText);
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const rec = {};
      row.values.forEach((v, c) => {
        if (header[c] && rec[header[c]] === undefined) rec[header[c]] = v;
      });
      rows.push(rec);
    });
  }
  return rows;
}

function hostOf(url) {
  try {
    return new URL(url.trim()).host;
  } catch {
    return `(unparseable) ${String(url).slice(0, 60)}`;
  }
}

function newTally() {
  return { total: 0, hosts: new Map(), blocked: new Map() };
}

function record(tally, url, blockedReason) {
  const host = hostOf(url);
  tally.total++;
  tally.hosts.set(host, (tally.hosts.get(host) || 0) + 1);
  if (!blockedReason) return;
  const entry = tally.blocked.get(host) || { n: 0, examples: new Set() };
  entry.n++;
  if (entry.examples.size < MAX_EXAMPLES) entry.examples.add(blockedReason);
  tally.blocked.set(host, entry);
}

function checkFetch(tally, tool, url) {
  try {
    normalizeFetchUrl(url);
    record(tally, url, null);
  } catch (e) {
    record(tally, url, `${tool}: ${url} — ${e.message}`);
  }
}

function printTally(label, tally, showHosts) {
  const blocked = [...tally.blocked.values()].reduce((a, e) => a + e.n, 0);
  console.log(`\n${label}: ${tally.total} checked, ${tally.hosts.size} hosts, ${blocked} would be blocked`);
  for (const [host, e] of [...tally.blocked].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${e.n}\t${host}`);
    for (const ex of e.examples) console.log(`\t  ${ex}`);
  }
  if (showHosts) {
    console.log(`  All hosts:`);
    for (const [host, n] of [...tally.hosts].sort((a, b) => b[1] - a[1])) console.log(`    ${n}\t${host}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) { usage(); return; }
  const showHosts = args.includes('--hosts');
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) { usage(); process.exitCode = 1; return; }

  const citations = newTally();
  const fetches = newTally();

  for (const file of files) {
    for (const rec of await readRows(file)) {
      for (const col of CITATION_COLS) {
        const url = cellText(rec[col]).trim();
        if (!url) continue;
        record(citations, url, isGovernmentUrl(url) ? null : `${col}: ${url}`);
      }
      for (const [key, value] of Object.entries(rec)) {
        if (/^answer\.tools\.\d+$/.test(key)) {
          const { tool, url } = toolCallFromCell(value);
          if (FETCH_TOOLS.has(tool) && url) checkFetch(fetches, tool, url);
          continue;
        }
        const m = key.match(/^answer\.tools\.(\d+)\.tool$/);
        const tool = m && cellText(value).trim();
        if (!m || !FETCH_TOOLS.has(tool)) continue;
        const url = urlFromToolInput(rec[`answer.tools.${m[1]}.input`]);
        if (url) checkFetch(fetches, tool, url);
      }
    }
  }

  printTally('Citations (AIA-007, isGovernmentUrl)', citations, showHosts);
  printTally('Fetched URLs (AIA-010, normalizeFetchUrl)', fetches, showHosts);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
