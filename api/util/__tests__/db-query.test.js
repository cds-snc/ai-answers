import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  normalizeLiteralString,
  normalizeObjectId,
  normalizeObjectIdString,
  normalizeString,
  requireLiteralString,
  requireObjectIdString,
  requireString,
} from '../db-query.js';

describe('db query helpers', () => {
  it('normalizes valid ObjectId strings', () => {
    const id = '64fec1000000000000000001';

    expect(normalizeObjectIdString(id)).toBe(id);
    expect(normalizeObjectIdString(`  ${id}  `)).toBe(id);
  });

  it('rejects non-string request ObjectId values', () => {
    expect(normalizeObjectIdString({ _id: '64fec1000000000000000001' })).toBeNull();
    expect(normalizeObjectIdString(new mongoose.Types.ObjectId())).toBeNull();
  });

  it('normalizes ObjectId instances for internal values', () => {
    const id = new mongoose.Types.ObjectId('64fec1000000000000000002');

    expect(normalizeObjectId(id)).toBe(id.toString());
  });

  it('rejects invalid ObjectIds', () => {
    expect(normalizeObjectIdString('not-an-id')).toBeNull();
    expect(normalizeObjectId('not-an-id')).toBeNull();
  });

  it('throws for invalid request ObjectIds', () => {
    expect(() => requireObjectIdString('not-an-id', 'interactionId')).toThrow('Invalid interactionId');
  });

  it('normalizes literal string query values', () => {
    expect(normalizeLiteralString('siteStatus')).toBe('siteStatus');
    expect(normalizeLiteralString(' model.default ')).toBe('model.default');
    expect(normalizeLiteralString('twoFA.templateId')).toBe('twoFA.templateId');
  });

  it('rejects non-string and operator-like literal values', () => {
    expect(normalizeLiteralString({ $ne: 'siteStatus' })).toBeNull();
    expect(normalizeLiteralString(['siteStatus'])).toBeNull();
    expect(normalizeLiteralString('$where')).toBeNull();
  });

  it('throws for invalid literal values', () => {
    expect(() => requireLiteralString({ $ne: 'siteStatus' }, 'setting key')).toThrow('Invalid setting key');
  });

  it('normalizes plain string values', () => {
    expect(normalizeString(' openai-gpt51 ')).toBe('openai-gpt51');
    expect(normalizeString('')).toBeNull();
    expect(normalizeString({ value: 'openai-gpt51' })).toBeNull();
  });

  it('throws for invalid plain string values', () => {
    expect(() => requireString('', 'setting value')).toThrow('Invalid setting value');
    expect(() => requireString({ value: 'openai-gpt51' }, 'setting value')).toThrow('Invalid setting value');
  });
});
