#!/usr/bin/env node
// Converts saved CanadaLogin help pages (HTML) into the temporary markdown snapshots in
// agents/prompts/scenarios/canadalogin/. See that folder's README for why they exist.
//
// Save each page in Chrome with "Save page as… → Webpage, HTML only", EN and FR, into one
// folder, then run:
//   node scripts/canadalogin-snapshot.js <folder> [--out <dir>] [--captured YYYY-MM-DD]
//                                        [--url "<file name>=<page URL>"]...
//
// A saved page doesn't contain its own URL, only its language toggle (the other-language
// URL). So a page's URL comes from its other-language counterpart's toggle. A page saved
// without its counterpart needs --url. The script stops if it can't work out a URL.
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const HOST = 'https://login.canada.ca';
const DEFAULT_OUT = 'agents/prompts/scenarios/canadalogin';

function parseArgs(argv) {
    const args = { dir: null, out: DEFAULT_OUT, captured: new Date().toISOString().slice(0, 10), urls: {} };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--out') args.out = argv[++i];
        else if (a === '--captured') args.captured = argv[++i];
        else if (a === '--url') {
            const [file, url] = argv[++i].split(/=(.*)/s);
            args.urls[file] = url.replace(HOST, '');
        } else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
        else if (!args.dir) args.dir = a;
    }
    if (!args.dir) { usage(); process.exit(1); }
    return args;
}

function usage() {
    console.log('Usage: node scripts/canadalogin-snapshot.js <folder of saved .html pages> ' +
        '[--out <dir>] [--captured YYYY-MM-DD] [--url "<file name>=<page URL>"]...');
}

// Relative links become absolute; links to the alpha site point at production.
function absoluteUrl(href) {
    if (!href || href.startsWith('#')) return href;
    href = href.replace(/^https:\/\/connexion\.alpha\.canada\.ca/, HOST);
    return href.startsWith('/') ? HOST + href : href;
}

function createTurndown() {
    const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*' });
    td.addRule('gcdsLink', {
        filter: (n) => n.nodeName === 'GCDS-LINK',
        replacement: (content, n) => {
            const href = n.getAttribute('href');
            const text = content.trim();
            return href && !href.startsWith('#') ? `[${text}](${href})` : text;
        },
    });
    // "Related help guides" boxes become a quoted list of links.
    td.addRule('gcdsNotice', {
        filter: (n) => n.nodeName === 'GCDS-NOTICE',
        replacement: (content, n) => {
            const body = content.trim().split('\n').map((l) => `> ${l}`.trimEnd()).join('\n');
            return `\n\n> **${n.getAttribute('notice-title')}**\n>\n${body}\n\n`;
        },
    });
    td.remove((n) => n.nodeName === 'GCDS-DATE-MODIFIED');
    return td;
}

function tidyMarkdown(md) {
    return md
        .replace(/ /g, ' ')
        .replace(/[ \t]+$/gm, '')
        .replace(/^(\s*)-   /gm, '$1- ')                       // turndown pads bullets to 4 columns
        .replace(/^(\s*\d+)\.  /gm, '$1. ')
        .replace(/^(#+ )\*\*(.*)\*\*$/gm, '$1$2')               // bold wrapping a whole heading
        .replace(/^(#+ \d+)\\\./gm, '$1.')                     // "### 1\. Step" -> "### 1. Step"
        .replace(/^(#+ \d+\. )\*\*(.*)\*\*$/gm, '$1$2')
        .replace(/^> \[/gm, '> - [')                           // notice links are <br>-separated: make a list
        .replace(/^(> - .*\))\[/gm, '$1\n> - [')               // two notice links with no <br> between them
        .replace(/^(> - .*\))\[/gm, '$1\n> - [')
        .replace(/\[([^\]]*?)\.\]\(([^)]*)\)/g, '[$1]($2).')   // move a trailing period out of link text
        .replace(/^(>.*)\n(?!>)/gm, '$1\n\n')                  // blank line after each notice
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function loadPage(dir, file) {
    const $ = cheerio.load(fs.readFileSync(path.join(dir, file), 'utf8'));
    const main = $('main');
    if (!main.length) throw new Error(`${file}: no <main> element. Save the page as "Webpage, HTML only".`);
    const crumbs = $('gcds-breadcrumbs-item').map((i, e) => $(e).attr('href')).get();
    return {
        file, $,
        lang: $('html').attr('lang'),
        langHref: $('gcds-header').attr('lang-href'),
        parent: crumbs[crumbs.length - 1],
        date: $('gcds-date-modified').text().trim(),
        // Two language versions of a page have the same headings. (Not links: a page
        // can carry hidden, empty links its counterpart doesn't have.)
        shape: ['h2', 'h3', 'h4'].map((t) => main.find(t).length).join(','),
    };
}

// p's URL is the toggle of its counterpart q: q is in the other language, each page's
// toggle sits under the other page's breadcrumb parent, and both have the same headings.
function findOwnUrl(p, pages, overrides) {
    if (overrides[p.file]) return overrides[p.file];
    const isChildOf = (url, parent) => parent && url?.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
    const matches = pages.filter((q) => q.lang !== p.lang
        && isChildOf(q.langHref, p.parent) && isChildOf(p.langHref, q.parent) && q.shape === p.shape);
    if (matches.length === 1) return matches[0].langHref;
    const why = matches.length ? `matches ${matches.map((m) => m.file).join(', ')}` : 'has no other-language counterpart';
    throw new Error(`${p.file} ${why}. Give its URL with --url "${p.file}=<URL>".`);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const files = fs.readdirSync(args.dir).filter((n) => n.endsWith('.html')).sort();
    const pages = files.map((f) => loadPage(args.dir, f));
    const td = createTurndown();
    const written = [];
    const linked = new Set();

    for (const p of pages) {
        const ownPath = findOwnUrl(p, pages, args.urls);
        const enPath = p.lang === 'en' ? ownPath : p.langHref;
        const name = `${enPath.replace(/\/$/, '').split('/').pop()}-${p.lang}.md`;
        const { $ } = p;
        $('main [href]').each((i, e) => {
            const href = absoluteUrl($(e).attr('href'));
            $(e).attr('href', href);
            if (href.startsWith(HOST)) linked.add(href.split('#')[0]);
        });
        const header = `TEMPORARY SNAPSHOT – source: ${HOST}${ownPath}\n` +
            `Modified on source: ${p.date} · Captured: ${args.captured}\n` +
            "Cite the source URL above, never this file's URL.";
        fs.writeFileSync(path.join(args.out, name), `${header}\n\n${tidyMarkdown(td.turndown($('main').html()))}\n`);
        written.push({ name, url: HOST + ownPath });
    }

    console.log('Written:');
    for (const w of written) console.log(`  ${w.name}  ${w.url}`);
    const captured = new Set(written.map((w) => w.url));
    const missing = [...linked].filter((u) => !captured.has(u)).sort();
    if (missing.length) {
        console.log('\nLinked from these pages but not captured:');
        for (const u of missing) console.log(`  ${u}`);
    }
}

main();
