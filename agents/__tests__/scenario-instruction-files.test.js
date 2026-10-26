import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const promptsDir = path.join(repoRoot, 'agents', 'prompts');

// Scenario prompts tell the agent to ⚠️DOWNLOAD instruction files out of this
// repo (see agenticBase.js — these loads are exempt from the download budget).
// A wrong path 404s silently at answer time: no error, no failing test, the
// model just answers without the instructions. So does a URL pinned to a branch,
// the moment that branch is deleted. This asserts every such URL points at a file
// that exists, on main.
const RAW_URL = /https:\/\/raw\.githubusercontent\.com\/cds-snc\/ai-answers\/([^/\s]+)\/([^\s)`'"]+)/g;

const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(js|md)$/.test(entry.name) ? [full] : [];
    });

const references = walk(promptsDir).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return [...source.matchAll(RAW_URL)].map((match) => ({
        file: path.relative(repoRoot, file),
        ref: match[1],
        repoPath: decodeURIComponent(match[2]),
    }));
});

describe('scenario instruction files downloaded from this repo', () => {
    it('finds raw.githubusercontent URLs to check', () => {
        expect(references.length).toBeGreaterThan(0);
    });

    const cases = [...new Map(references.map((r) => [`${r.repoPath} (${r.file})`, r])).values()];

    it.each(cases.map((r) => [r.repoPath, r]))('%s exists in the repo', (_repoPath, reference) => {
        expect(fs.existsSync(path.join(repoRoot, reference.repoPath))).toBe(true);
    });

    // Branch-pinned URLs work right up until the branch is deleted, which is why
    // this is worth asserting separately from the path: the file is still there,
    // the ref is what rots.
    it('pins every URL to main, never a branch', () => {
        const branchPinned = references
            .filter((reference) => reference.ref !== 'main')
            .map((reference) => `${reference.file} → ${reference.ref}`);
        expect(branchPinned).toEqual([]);
    });
});
