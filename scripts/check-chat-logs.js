#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
    const args = { file: null, filter: null, metadataOnly: false, json: false, summary: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--filter') args.filter = argv[++i];
        else if (a === '--metadata-only') args.metadataOnly = true;
        else if (a === '--json') args.json = true;
        else if (a === '--summary') args.summary = true;
        else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
        else if (!args.file) args.file = a;
    }
    return args;
}

function usage() {
    console.log(`Usage: node scripts/check-chat-logs.js <file.json> [options]

Reads a chat-logs JSON export (downloaded from the ChatViewer page) and prints
its log entries. Accepts either the wrapped envelope
\`{ chatId, exportedAt, logCount, logs: [...] }\` or a raw \`[...]\` array.

Options:
  --filter <substring>   Only show logs whose message contains this substring
                         (e.g. --filter similarQuestions)
  --metadata-only        Print only metadata (skip the human-readable header)
  --json                 Emit raw JSON array instead of formatted output
  --summary              List unique message types and their counts (no bodies)
  -h, --help             Show this help

Examples:
  node scripts/check-chat-logs.js chat-logs-abc-2026-05-26.json
  node scripts/check-chat-logs.js chat-logs-abc-2026-05-26.json --filter similarQuestions
  node scripts/check-chat-logs.js chat-logs-abc-2026-05-26.json --summary`);
}

function loadLogs(filePath) {
    const abs = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(abs)) {
        console.error(`File not found: ${abs}`);
        process.exit(1);
    }
    const raw = fs.readFileSync(abs, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        console.error(`Failed to parse JSON: ${err.message}`);
        process.exit(1);
    }
    if (Array.isArray(parsed)) {
        return { meta: null, logs: parsed };
    }
    if (parsed && Array.isArray(parsed.logs)) {
        const { logs, ...meta } = parsed;
        return { meta, logs };
    }
    console.error('Unrecognized JSON shape — expected an array or an object with a `logs` array.');
    process.exit(1);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.file) {
        usage();
        process.exit(1);
    }

    const { meta, logs } = loadLogs(args.file);

    if (meta) {
        const header = [
            meta.chatId ? `chatId=${meta.chatId}` : null,
            meta.exportedAt ? `exportedAt=${meta.exportedAt}` : null,
            meta.logCount != null ? `logCount=${meta.logCount}` : null,
        ].filter(Boolean).join(' ');
        if (header) console.error(header);
    }

    let filtered = logs;
    if (args.filter) {
        const needle = args.filter.toLowerCase();
        filtered = logs.filter((r) => typeof r.message === 'string' && r.message.toLowerCase().includes(needle));
    }

    console.error(`Showing ${filtered.length} of ${logs.length} entries${args.filter ? ` (filter: "${args.filter}")` : ''}`);

    if (args.summary) {
        const counts = new Map();
        for (const row of filtered) {
            const key = row.message || '(no message)';
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        for (const [msg, count] of sorted) {
            console.log(`${String(count).padStart(4)}  ${msg}`);
        }
        return;
    }

    if (args.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
    }

    for (const row of filtered) {
        const ts = row.createdAt || '';
        if (!args.metadataOnly) {
            console.log(`\n[${ts}][${row.logLevel || '?'}] ${row.message || ''}`);
        }
        if (row.metadata && Object.keys(row.metadata).length) {
            console.log(JSON.stringify(row.metadata, null, 2));
        }
        if (!args.metadataOnly) console.log('---');
    }
}

main();
