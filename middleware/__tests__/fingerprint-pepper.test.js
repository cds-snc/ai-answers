import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Each test re-imports the module so its cached pepper starts empty.
async function loadFresh() {
  vi.resetModules();
  return import('../fingerprint-pepper.js');
}

describe('fingerprint pepper (AIA-019)', () => {
  const originalPepper = process.env.FP_PEPPER;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.FP_PEPPER;
  });

  // Tests here change NODE_ENV and FP_PEPPER; never let that leak into later suites.
  afterEach(() => {
    if (originalPepper === undefined) delete process.env.FP_PEPPER;
    else process.env.FP_PEPPER = originalPepper;
    process.env.NODE_ENV = originalNodeEnv ?? 'test';
    vi.restoreAllMocks();
  });

  it('hashes with FP_PEPPER when it is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FP_PEPPER = 'configured-pepper';
    const { hashVisitorId, assertFingerprintPepperConfigured } = await loadFresh();

    expect(() => assertFingerprintPepperConfigured()).not.toThrow();
    const expected = crypto.createHmac('sha256', 'configured-pepper').update('browser123').digest('hex');
    expect(hashVisitorId('browser123')).toBe(expected);
  });

  it('throws in production when FP_PEPPER is unset, naming the variable only', async () => {
    process.env.NODE_ENV = 'production';
    const { assertFingerprintPepperConfigured } = await loadFresh();

    // Exact match: the message names the variable and carries no value.
    expect(() => assertFingerprintPepperConfigured())
      .toThrow(new Error('FP_PEPPER is not set. Refusing to hash visitor fingerprints without it.'));
  });

  it('throws when NODE_ENV is unset, because that counts as deployed', async () => {
    delete process.env.NODE_ENV;
    const { assertFingerprintPepperConfigured } = await loadFresh();
    expect(() => assertFingerprintPepperConfigured()).toThrow(/FP_PEPPER is not set/);
  });

  it.each(['test', 'development'])('uses a random pepper that is stable within the process when NODE_ENV=%s', async (env) => {
    process.env.NODE_ENV = env;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getFingerprintPepper, assertFingerprintPepperConfigured, hashVisitorId } = await loadFresh();

    expect(() => assertFingerprintPepperConfigured()).not.toThrow();
    const pepper = getFingerprintPepper();
    expect(pepper).toMatch(/^[0-9a-f]{64}$/);
    expect(pepper).not.toBe('dev-pepper');
    expect(getFingerprintPepper()).toBe(pepper);
    expect(hashVisitorId('browser123')).toBe(hashVisitorId('browser123'));
    expect(hashVisitorId('browser123')).not.toBe(
      crypto.createHmac('sha256', 'dev-pepper').update('browser123').digest('hex'),
    );

    // Warn in development only, and never log the pepper itself.
    if (env === 'development') {
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0].join(' ')).not.toContain(pepper);
    } else {
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it('a fresh process gets a different random pepper', async () => {
    process.env.NODE_ENV = 'test';
    const first = (await loadFresh()).getFingerprintPepper();
    const second = (await loadFresh()).getFingerprintPepper();
    expect(first).not.toBe(second);
  });
});

describe('no hardcoded fingerprint pepper in source (AIA-019 regression guard)', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const SOURCE_DIRS = ['api', 'agents', 'config', 'middleware', 'models', 'server', 'services', 'src', 'scripts'];

  function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'build') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(full);
      else if (/\.(c|m)?jsx?$/.test(entry.name) && !/\.test\.(c|m)?jsx?$/.test(entry.name)) yield full;
    }
  }

  it("contains no 'dev-pepper' literal outside tests", () => {
    const offenders = [];
    for (const dir of SOURCE_DIRS) {
      const abs = path.join(repoRoot, dir);
      if (!fs.existsSync(abs)) continue;
      for (const file of walk(abs)) {
        if (fs.readFileSync(file, 'utf8').includes('dev-pepper')) {
          offenders.push(path.relative(repoRoot, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
