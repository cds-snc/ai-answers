import { describe, it, expect, vi, beforeEach } from 'vitest';

const { Interaction, Embedding, Chat } = vi.hoisted(() => ({
  Interaction: { find: vi.fn(), countDocuments: vi.fn() },
  Embedding: { find: vi.fn(), deleteMany: vi.fn() },
  Chat: { exists: vi.fn() },
}));

vi.mock('../../models/interaction.js', () => ({ Interaction }));
vi.mock('../../models/embedding.js', () => ({ Embedding }));
vi.mock('../../models/chat.js', () => ({ Chat }));
vi.mock('../../models/sentenceEmbedding.js', () => ({ SentenceEmbedding: { deleteMany: vi.fn() } }));
vi.mock('../../api/db/db-connect.js', () => ({ default: vi.fn() }));
vi.mock('../ServerLoggingService.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import EmbeddingService from '../EmbeddingService.js';

const EMBEDDED_ID = '0000000000000000000000aa';
const LAST_ID = '000000000000000000000001';

function mockInteractionFind(results = []) {
  const chain = {
    sort: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    populate: vi.fn(() => Promise.resolve(results)),
  };
  Interaction.find.mockReturnValue(chain);
}

describe('EmbeddingService.processEmbeddingForDuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Embedding.find.mockResolvedValue([{ interactionId: EMBEDDED_ID }]);
    Interaction.countDocuments.mockResolvedValue(0);
    mockInteractionFind([]);
  });

  it('excludes already-embedded interactions on the first batch', async () => {
    await EmbeddingService.processEmbeddingForDuration(10, true, null);

    const query = Interaction.find.mock.calls[0][0];
    expect(query._id.$nin).toContain(EMBEDDED_ID);
  });

  // Regression: paging with lastProcessedId used to replace the $nin filter
  // with $gt, so every later batch re-embedded interactions that already had
  // an embedding and created duplicates.
  it('still excludes already-embedded interactions when paging with lastProcessedId', async () => {
    await EmbeddingService.processEmbeddingForDuration(10, true, LAST_ID);

    const query = Interaction.find.mock.calls[0][0];
    expect(query._id.$nin).toContain(EMBEDDED_ID);
    expect(String(query._id.$gt)).toBe(LAST_ID);
  });
});
