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
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('selects the DOCDB_URI environment variable', async () => {
    process.env.DOCDB_URI = 'mongodb://legacy';

    const { getDocumentDbUri } = await loadDbConnect();

    expect(getDocumentDbUri()).toBe('mongodb://legacy');
  });

  it('returns undefined when no DocumentDB URI is configured', async () => {
    const { getDocumentDbUri } = await loadDbConnect();

    expect(getDocumentDbUri()).toBeUndefined();
  });
});
