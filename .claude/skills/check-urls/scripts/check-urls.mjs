#!/usr/bin/env node
// Check every URL found in a folder and report broken links and redirects.
// Usage: node check-urls.mjs <folder> [--output report.md] [--ignore .urlcheck-ignore]
//        [--concurrency 8] [--timeout 20000]
// Exit code: 1 if any URL is broken or redirects, 0 otherwise, 2 on a script error.

import fs from 'node:fs';
import path from 'node:path';

// Node exits 1 on an uncaught error, which CI would read as "URLs failed".
// Exit 2 instead so a crash fails the run rather than posting a report.
const crash = (err) => {
  console.error(err);
  process.exit(2);
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const folder = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!folder) {
  console.error('Usage: node check-urls.mjs <folder> [--output report.md] [--ignore .urlcheck-ignore]');
  process.exit(2);
}
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error(`Not a directory: ${folder}`);
  process.exit(2);
}
const output = opt('--output', null);
const ignoreFile = opt('--ignore', '.urlcheck-ignore');
const positiveInt = (name, fallback) => {
  const n = Number(opt(name, fallback));
  if (!Number.isInteger(n) || n < 1) {
    console.error(`${name} must be a positive integer`);
    process.exit(2);
  }
  return n;
};
const concurrency = positiveInt('--concurrency', 8);
const timeoutMs = positiveInt('--timeout', 20000);

// --- ignore patterns: one per line, '#' comments, '*' wildcard. Every pattern
// matches anywhere in the URL, so the scheme can be left out.
const ignorePatterns = fs.existsSync(ignoreFile)
  ? fs.readFileSync(ignoreFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : [];
const ignoreRegexes = ignorePatterns.map(
  (p) => new RegExp(p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'))
);
const isIgnored = (u) => ignoreRegexes.some((r) => r.test(u));

// --- collect URLs with file:line locations
// Parentheses are allowed inside a URL (e.g. /wiki/Foo_(bar)); an unbalanced
// trailing ')' is the end of a markdown link or a sentence, so it's trimmed.
const URL_RE = /https?:\/\/[^\s"'`<>\[\]{}\\]+/g;
const TRAILING = /[.,;:!?*]+$/;
const count = (s, c) => s.split(c).length - 1;
function trimUrl(raw) {
  let url = raw.replace(TRAILING, '');
  while (url.endsWith(')') && count(url, ')') > count(url, '(')) url = url.slice(0, -1).replace(TRAILING, '');
  return url;
}
const found = new Map(); // url -> [{file, line}]

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) scanFile(full);
  }
}
function scanFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((text, idx) => {
    for (const m of text.matchAll(URL_RE)) {
      const url = trimUrl(m[0]);
      if (url.includes('${')) continue; // template literal, not a real URL
      const loc = { file: path.relative(process.cwd(), file).replace(/\\/g, '/'), line: idx + 1 };
      if (!found.has(url)) found.set(url, []);
      found.get(url).push(loc);
    }
  });
}
walk(folder);

const allUrls = [...found.keys()];
const ignored = allUrls.filter(isIgnored);
const toCheck = allUrls.filter((u) => !isIgnored(u));

// --- check one URL without following redirects
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; url-checker/1.0)',
  Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
};
async function request(url, method, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const headers = cookie ? { ...HEADERS, Cookie: cookie } : HEADERS;
  try {
    const res = await fetch(url, { method, redirect: 'manual', headers, signal: ctrl.signal });
    res.body?.cancel().catch(() => {});
    return res;
  } finally {
    clearTimeout(timer);
  }
}
// A language switch is a redirect to the page the URL itself names
// (e.g. /set-lang?from=/accueil -> /accueil), or to the same URL with only a
// language parameter removed. Only that one hop is excused; the destination
// is still checked like any other URL.
const LANG_PARAMS = /^(lang|language|langue|togglelanguage|locale)$/i;
function isLanguageSwitch(url, target) {
  const from = new URL(url);
  const to = new URL(target);
  if (from.host !== to.host) return false;
  const toPathAndQuery = to.pathname + to.search;
  if ([...from.searchParams.values()].some((v) => v === toPathAndQuery || v === to.href)) return true;
  const stripped = new URL(url);
  for (const key of [...stripped.searchParams.keys()]) if (LANG_PARAMS.test(key)) stripped.searchParams.delete(key);
  const norm = (u) => u.href.replace(/\?$/, '');
  return stripped.href !== from.href && norm(stripped) === norm(to);
}

async function checkOnce(url, followLanguageSwitch = true, cookie = undefined) {
  try {
    // Some servers reject, mishandle or never answer HEAD; confirm with GET
    // before calling it broken.
    let res = await request(url, 'HEAD', cookie).catch(() => null);
    if (!res || res.status >= 400) res = await request(url, 'GET', cookie);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { url, kind: 'redirect', status: res.status, target: '(no Location header)' };
      const target = new URL(loc, url).href;
      // Canada.ca (and others) answer dead pages with a 302 to an error page instead of a 404.
      if (/\/errors?\/|\b404\b|not-?found/i.test(new URL(target).pathname)) {
        return { url, kind: 'broken', error: `HTTP ${res.status} redirect to error page ${target}` };
      }
      if (followLanguageSwitch && isLanguageSwitch(url, target)) {
        // Switches usually store the language in a cookie; send it on, as a browser would.
        const setCookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
        const dest = await checkOnce(target, false, setCookie || undefined);
        if (dest.kind === 'ok') return { url, kind: 'ok', status: dest.status, languageSwitch: target };
        if (dest.kind === 'broken') return { url, kind: 'broken', error: `Language switch to ${target}, which failed: ${dest.error}` };
        return { url, kind: 'redirect', status: dest.status, target: dest.target, via: target };
      }
      return { url, kind: 'redirect', status: res.status, target };
    }
    if (res.status >= 400) return { url, kind: 'broken', error: `HTTP ${res.status}` };
    return { url, kind: 'ok', status: res.status };
  } catch (err) {
    const cause = err.cause?.code || err.cause?.message;
    const msg = err.name === 'AbortError' ? `Timeout after ${timeoutMs / 1000}s` : cause ? `${err.message} (${cause})` : err.message;
    return { url, kind: 'broken', error: msg };
  }
}

// Retry anything that isn't OK; servers like Canada.ca give inconsistent
// answers under load. A URL only fails if every attempt fails.
const RETRY_DELAYS_MS = [3000, 10000];
async function check(url) {
  let result = await checkOnce(url);
  for (const delay of RETRY_DELAYS_MS) {
    if (result.kind === 'ok') break;
    await new Promise((r) => setTimeout(r, delay));
    result = { ...(await checkOnce(url)), attempts: (result.attempts || 1) + 1 };
  }
  return result;
}

// --- run with bounded concurrency
const results = [];
let next = 0;
let done = 0;
async function worker() {
  while (next < toCheck.length) {
    const url = toCheck[next++];
    results.push(await check(url));
    done++;
    if (done % 50 === 0 || done === toCheck.length) process.stderr.write(`Checked ${done}/${toCheck.length}\n`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, toCheck.length) }, worker));

// --- report
const broken = results.filter((r) => r.kind === 'broken').sort((a, b) => a.url.localeCompare(b.url));
const redirects = results.filter((r) => r.kind === 'redirect').sort((a, b) => a.url.localeCompare(b.url));
const langSwitches = results.filter((r) => r.languageSwitch).sort((a, b) => a.url.localeCompare(b.url));
const where = (url) => found.get(url).map((l) => `\`${l.file}:${l.line}\``).join(', ');

const out = [];
out.push('# URL check report', '');
out.push(`Folder: \`${folder}\``, '');
out.push(`- URLs found: ${allUrls.length}`);
out.push(`- Ignored (\`${ignoreFile}\`): ${ignored.length}`);
out.push(`- Checked: ${toCheck.length}`);
out.push(`- Broken: ${broken.length}`);
out.push(`- Redirects: ${redirects.length}`);
out.push(`- Language switches (destination checked and OK): ${langSwitches.length}`, '');
out.push('## Broken', '');
if (!broken.length) out.push('None.');
for (const r of broken) out.push(`- ${r.url}`, `  - Error: ${r.error}`, `  - Found in: ${where(r.url)}`);
out.push('', '## Redirects', '');
if (!redirects.length) out.push('None.');
for (const r of redirects) {
  out.push(`- ${r.url}`);
  if (r.via) out.push(`  - Language switch to ${r.via}, which then redirects`);
  out.push(`  - ${r.status} → ${r.target}`, `  - Found in: ${where(r.url)}`);
}
out.push('', '## Language switches', '');
if (!langSwitches.length) out.push('None.');
for (const r of langSwitches) out.push(`- ${r.url} → ${r.languageSwitch}`);
const report = out.join('\n') + '\n';

if (output) {
  fs.writeFileSync(output, report);
  console.log(`Report written to ${output}`);
}
console.log(`Checked ${toCheck.length} URLs (${ignored.length} ignored): ${broken.length} broken, ${redirects.length} redirecting.`);
process.exit(broken.length || redirects.length ? 1 : 0);
