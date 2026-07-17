import { describe, it, expect } from 'vitest';
import {
  ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT,
  EXPERT_EVAL_CHATS_EXPORT,
  getDatabaseExportCollections,
  getDatabaseExportFilenameTag
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
