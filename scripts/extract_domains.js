#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { departments_EN } from '../agents/prompts/scenarios/departments_EN.js';
import { departments_FR } from '../agents/prompts/scenarios/departments_FR.js';
import { NON_GC_DEPARTMENT_HOSTS } from '../api/util/govHost.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hosts come from the department lists' `url` fields, parsed with URL so that
// page names like `home.page` or `mn-eng.cfm` are never mistaken for hosts.
// Same source govHost.js (the fetch/citation allowlist) builds from.
function extractDomains(departments) {
  const domains = new Set();
  for (const dept of departments) {
    try {
      domains.add(new URL(dept.url).hostname.toLowerCase().replace(/^www\./, ''));
    } catch {
      console.error(`Skipping malformed url for ${dept.name}: ${dept.url}`);
    }
  }
  return Array.from(domains);
}

function filterAndFormat(domains) {
  const excludedSuffixes = ['.gc.ca', '.canada.ca'];

  const unique = Array.from(new Set(domains));

  // Keep only hostnames that match hostname pattern
  const hostnames = unique.filter(d => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));

  // Exclude common file extensions and tokens with non-alpha final label
  const fileExtBlacklist = new Set(['html','htm','php','asp','aspx','shtml','js','css','jpg','jpeg','png','gif','ico','svg','json','xml','txt','csv','pdf','xls','xlsx','php3','php4','php5']);

  const filtered = hostnames.filter(d => {
    const parts = d.split('.');
    const last = parts[parts.length - 1];
    if (!/^[a-z]+$/.test(last)) return false; // final label must be alphabetic
    if (fileExtBlacklist.has(last)) return false;
    return true;
  });

  // split into gc/canada and others
  const others = filtered.filter(d => !excludedSuffixes.some(s => d.endsWith(s) || d === s.slice(1)));

  // Normalize and dedupe others
  const normalized = Array.from(new Set(others.map(d => d.toLowerCase())));

  // Wildcard each exact host, never its parent domain: collapsing
  // acme.azurewebsites.net to *.azurewebsites.net would search every tenant on
  // the platform. Matches govHost.js, which allows a department host and its
  // subdomains only. Drop a host already covered by another entry's wildcard.
  const keep = normalized.filter(d => !normalized.some(parent => parent !== d && d.endsWith('.' + parent)));

  return keep.map(d => '*.' + d);
}

async function main() {
  const domains = extractDomains([...departments_EN, ...departments_FR]);

  // Hosts the GC doesn't control get no *.domain wildcard, matching the
  // fetch/citation allowlist in govHost.js: 'host' entries cover that host
  // with or without www, 'pinned' entries only their listed paths.
  const restricted = [];
  for (const [host, rule] of NON_GC_DEPARTMENT_HOSTS) {
    if (!domains.includes(host)) continue;
    if (rule.match === 'pinned') {
      rule.paths.forEach(p => restricted.push(`${host}${p}*`));
    } else {
      restricted.push(`${host}/*`, `www.${host}/*`);
    }
  }

  // A department host under a restricted domain that isn't itself a key would
  // otherwise get a wildcard. govHost.js doesn't allow it either, so stop here.
  const isUnder = (d, host) => d.endsWith('.' + host);
  for (const d of domains) {
    for (const host of NON_GC_DEPARTMENT_HOSTS.keys()) {
      if (isUnder(d, host) || isUnder(host, d)) {
        throw new Error(`${d} overlaps NON_GC_DEPARTMENT_HOSTS entry ${host}. Add it to that map in api/util/govHost.js with its own rule.`);
      }
    }
  }
  const open = domains.filter(d => !NON_GC_DEPARTMENT_HOSTS.has(d));

  // *.gc.ca and *.canada.ca first, the rest sorted so the file diffs cleanly
  // against the search engine's site list.
  const rest = [...filterAndFormat(open), ...restricted].sort();
  const csv = ['*.gc.ca', '*.canada.ca', ...rest].join('\n');

  const outPath = path.join(__dirname, 'domains_for_programmable_search.csv');
  fs.writeFileSync(outPath, csv, 'utf8');

  console.log('Wrote', outPath);
  console.log(csv);
}

main();
