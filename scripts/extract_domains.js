#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Files to scan (relative to repo root)
const files = [
  path.join(__dirname, '..', 'src', 'services', 'systemPrompt', 'departments_EN.js'),
  path.join(__dirname, '..', 'src', 'services', 'systemPrompt', 'departments_FR.js'),
];

function extractDomains(text) {
  const domains = new Set();

  // Match hostnames in URLs or bare hostnames. Capture host only (no path or file)
  // Examples matched: example.com, sub.example.co.uk, www.example.ca
  const urlHostRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)(?=[\/:"'\s,]|$)/g;

  let m;
  while ((m = urlHostRegex.exec(text)) !== null) {
    let d = m[1].toLowerCase();

    // strip trailing dots
    d = d.replace(/\.+$/, '');

    // skip IPs
    if (/^\d+\.\d+\.\d+\.\d+$/.test(d)) continue;

    // filter out tokens that look like filenames (contain a dot after a slash or no TLD-like structure)
    // We allow typical hostnames containing letters/numbers and hyphens and at least one dot
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) continue;

    domains.add(d);
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
  const allDomains = new Set();

  for (const file of files) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      const domains = extractDomains(text);
      domains.forEach(d => allDomains.add(d));
    } catch (err) {
      console.error(`Failed to read ${file}: ${err.message}`);
    }
  }

  const csv = filterAndFormat(Array.from(allDomains));

  const outPath = path.join(__dirname, 'domains_for_programmable_search.csv');
  fs.writeFileSync(outPath, csv, 'utf8');

  console.log('Wrote', outPath);
  console.log(csv);
}

main();
