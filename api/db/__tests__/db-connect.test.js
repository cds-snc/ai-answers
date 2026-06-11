import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadDbConnect() {
  vi.resetModules();
  return import('../db-connect.js');
}

describe('db-connect DocumentDB target selection', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MONGODB_URI;
    delete process.env.DOCDB_URI;
    delete process.env.DOCDB_5_URI;
    delete process.env.DOCDB_8_URI;
    delete process.env.DOCDB_ACTIVE_VERSION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('normalizes unknown DocumentDB versions to 8', async () => {
    const { normalizeDocumentDbVersion } = await loadDbConnect();

    expect(normalizeDocumentDbVersion('8')).toBe('8');
    expect(normalizeDocumentDbVersion('5')).toBe('5');
    expect(normalizeDocumentDbVersion('')).toBe('8');
    expect(normalizeDocumentDbVersion('latest')).toBe('8');
  });

  it('selects explicit DocumentDB 5 and 8 URI environment variables', async () => {
    process.env.DOCDB_URI = 'mongodb://legacy';
    process.env.DOCDB_5_URI = 'mongodb://docdb5';
    process.env.DOCDB_8_URI = 'mongodb://docdb8';

    const { getDocumentDbUri, switchDocumentDbVersion } = await loadDbConnect();

    expect(getDocumentDbUri()).toBe('mongodb://docdb8');
    expect(getDocumentDbUri('5')).toBe('mongodb://docdb5');
    await switchDocumentDbVersion('8');
    expect(getDocumentDbUri()).toBe('mongodb://docdb8');
  });

  it('falls back to DOCDB_URI when a version-specific URI is not set', async () => {
    process.env.DOCDB_URI = 'mongodb://legacy';

    const { getDocumentDbUri, switchDocumentDbVersion } = await loadDbConnect();

    expect(getDocumentDbUri('5')).toBe('mongodb://legacy');
    await switchDocumentDbVersion('8');
    expect(getDocumentDbUri()).toBe('mongodb://legacy');
  });
});
