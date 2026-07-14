import path from 'node:path';
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

  it('uses DOCDB_CA_FILE when provided', async () => {
    process.env.DOCDB_CA_FILE = 'C:\\temp\\custom-bundle.pem';

    const { resolveDocumentDbCaFile } = await loadDbConnect();

    expect(resolveDocumentDbCaFile()).toBe('C:\\temp\\custom-bundle.pem');
  });

  it('falls back to the repo root global bundle when available', async () => {
    const { resolveDocumentDbCaFile } = await loadDbConnect();

    expect(resolveDocumentDbCaFile()).toBe(path.resolve(process.cwd(), 'global-bundle.pem'));
  });

  it('enables invalid hostname allowance for localhost tunnels', async () => {
    process.env.DOCDB_URI = 'mongodb://localhost:27018/?tls=true';

    const { shouldAllowInvalidDocumentDbHostnames } = await loadDbConnect();

    expect(shouldAllowInvalidDocumentDbHostnames(process.env.DOCDB_URI)).toBe(true);
  });

  it('does not enable invalid hostname allowance for aws hosts by default', async () => {
    process.env.DOCDB_URI = 'mongodb://example.docdb.amazonaws.com:27017/?tls=true';

    const { shouldAllowInvalidDocumentDbHostnames } = await loadDbConnect();

    expect(shouldAllowInvalidDocumentDbHostnames(process.env.DOCDB_URI)).toBe(false);
  });

  it('uses direct connection for localhost tunnels', async () => {
    process.env.DOCDB_URI = 'mongodb://localhost:27018/?tls=true';

    const { shouldUseDirectConnectionForDocumentDb } = await loadDbConnect();

    expect(shouldUseDirectConnectionForDocumentDb(process.env.DOCDB_URI)).toBe(true);
  });

  it('does not use direct connection for aws hosts by default', async () => {
    process.env.DOCDB_URI = 'mongodb://example.docdb.amazonaws.com:27017/?tls=true';

    const { shouldUseDirectConnectionForDocumentDb } = await loadDbConnect();

    expect(shouldUseDirectConnectionForDocumentDb(process.env.DOCDB_URI)).toBe(false);
  });
});
