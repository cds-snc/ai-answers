import { describe, it, expect } from 'vitest';
import {
  ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT,
  EXPERT_EVAL_CHATS_EXPORT,
  getDatabaseExportCollections,
  getDatabaseExportFilenameTag,
  getExportDatesUnavailableReason,
  toExportDateBounds
} from '../exportCollections.js';

describe('database export collection helpers', () => {
  it('excludes logs and embedding collections for the new export preset', () => {
    const collections = [
      'chat',
      'interaction',
      'embedding',
      'sentenceembedding',
      'logs',
      'user'
    ];

    expect(getDatabaseExportCollections(ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT, collections)).toEqual([
      'chat',
      'interaction',
      'user'
    ]);
    expect(getDatabaseExportFilenameTag(ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT)).toBe('all-but-logs-and-embeddings-');
  });

  it('keeps expert eval chat export intact', () => {
    const collections = ['chat', 'interaction', 'question', 'answer', 'embedding', 'logs', 'user'];

    expect(getDatabaseExportCollections(EXPERT_EVAL_CHATS_EXPORT, collections)).toEqual([
      'chat',
      'interaction',
      'question',
      'answer',
      'embedding',
      'logs',
      'user'
    ]);
    expect(getDatabaseExportFilenameTag(EXPERT_EVAL_CHATS_EXPORT)).toBe('expert-eval-chats-');
  });
});

describe('database export date helpers', () => {
  it('sends the start as local midnight and the end as the last second of its day', () => {
    expect(toExportDateBounds({ startDate: '2026-09-01', endDate: '2026-09-28' })).toEqual({
      startDate: new Date(2026, 8, 1, 0, 0, 0, 0).toISOString(),
      endDate: new Date(2026, 8, 28, 23, 59, 59, 0).toISOString()
    });
  });

  it('leaves a blank date blank', () => {
    expect(toExportDateBounds({ startDate: '', endDate: '2026-09-28' }).startDate).toBe('');
    expect(toExportDateBounds({ startDate: '2026-09-01', endDate: '' }).endDate).toBe('');
  });

  it('says why dates do not apply to an export, or null when they do', () => {
    const withoutDates = ['sessionstate', 'sentenceembedding'];
    expect(getExportDatesUnavailableReason(EXPERT_EVAL_CHATS_EXPORT, withoutDates)).toBe('expertEvalChats');
    expect(getExportDatesUnavailableReason('sessionstate', withoutDates)).toBe('noUpdatedAt');
    expect(getExportDatesUnavailableReason('chat', withoutDates)).toBeNull();
    expect(getExportDatesUnavailableReason('All', withoutDates)).toBeNull();
  });
});
