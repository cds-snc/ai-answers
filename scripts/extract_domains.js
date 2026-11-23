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
  const others = filtered.filter(d => !excludedSuffixes.some(s => d.endsWith(s)));

  // Ensure special entries in fixed order and ensure uniqueness
  const special = ['*.gc.ca', '*.canada.ca'];

  // Normalize and dedupe others
  const normalized = Array.from(new Set(others.map(d => d.toLowerCase())));

  // Remove overlapping subdomains: if a parent domain exists in the set, drop subdomains
  // Collapse to registrable base domains using a conservative heuristic.
  // Ideally we'd use the Public Suffix List; offline we use a small manual list
  const knownMultiPartTlds = new Set(['co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'co.jp']);

  function baseDomain(domain) {
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;
    const lastTwo = parts.slice(-2).join('.');
    const lastThree = parts.slice(-3).join('.');
    // if last two form a known multi-part tld, use last three labels
    if (knownMultiPartTlds.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.');
    // fallback: use last two labels
    return lastTwo;
  }

  const collapsed = Array.from(new Set(normalized.map(d => baseDomain(d))));

  // Remove any residual overlaps (shouldn't be necessary after baseDomain)
  const keep = collapsed.filter(d => !collapsed.some(parent => parent !== d && d.endsWith('.' + parent)));

  // Sort consistently
  keep.sort();

  // wildcard other hostnames
  const wildcarded = keep.map(d => '*.' + d);

  // remove any duplicates in final list and join lines
  const final = Array.from(new Set(special.concat(wildcarded)));
  return final.join('\n');
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
  const open = domains.filter(d => !NON_GC_DEPARTMENT_HOSTS.has(d));

  const csv = [filterAndFormat(open), ...restricted].join('\n');

  const outPath = path.join(__dirname, 'domains_for_programmable_search.csv');
  fs.writeFileSync(outPath, csv, 'utf8');

  console.log('Wrote', outPath);
  console.log(csv);
}

main();
