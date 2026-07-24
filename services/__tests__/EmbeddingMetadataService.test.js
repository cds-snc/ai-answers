import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmbeddingMetadataService from '../EmbeddingMetadataService.js';

const {
  mockUpdateMany,
  mockEmbeddingAggregate,
  mockEmbeddingFind,
  mockChatFind,
  mockChatFindOne,
  mockInteractionFind,
  mockInteractionFindById,
  mockInteractionCountDocuments,
  mockExpertFeedbackFindById,
} = vi.hoisted(() => ({
  mockUpdateMany: vi.fn(),
  mockEmbeddingAggregate: vi.fn(),
  mockEmbeddingFind: vi.fn(),
  mockChatFind: vi.fn(),
  mockChatFindOne: vi.fn(),
  mockInteractionFind: vi.fn(),
  mockInteractionFindById: vi.fn(),
  mockInteractionCountDocuments: vi.fn(),
  mockExpertFeedbackFindById: vi.fn(),
}));

vi.mock('../../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(),
}));

vi.mock('../../models/chat.js', () => ({
  Chat: { find: mockChatFind, findOne: mockChatFindOne },
}));

vi.mock('../../models/interaction.js', () => ({
  Interaction: {
    find: mockInteractionFind,
    findById: mockInteractionFindById,
    countDocuments: mockInteractionCountDocuments,
  },
}));

vi.mock('../../models/embedding.js', () => ({
  Embedding: {
    updateMany: mockUpdateMany,
    aggregate: mockEmbeddingAggregate,
    find: mockEmbeddingFind,
  },
}));

vi.mock('../../models/expertFeedback.js', () => ({
  ExpertFeedback: { findById: mockExpertFeedbackFindById },
}));

function mockInteractionFindResult(interactions) {
  mockInteractionFind.mockReturnValue({
    sort: () => ({
      limit: () => ({
        select: () => ({
          populate: () => ({
            lean: async () => interactions,
          }),
        }),
      }),
    }),
  });
}

function mockObjectId(id) {
  return {
    _id: id,
    toString: () => id,
    valueOf: () => id,
  };
}

describe('EmbeddingMetadataService', () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockEmbeddingAggregate.mockReset();
    mockEmbeddingFind.mockReset();
    mockChatFind.mockReset();
    mockChatFindOne.mockReset();
    mockInteractionFind.mockReset();
    mockInteractionFindById.mockReset();
    mockInteractionCountDocuments.mockReset();
    mockExpertFeedbackFindById.mockReset();
    mockEmbeddingFind.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => [],
        }),
      }),
    });
    mockChatFind.mockReturnValue({
      select: () => ({
        lean: async () => [],
      }),
    });
  });

  it('stores both pageLanguage and interactionLanguage when syncing metadata', async () => {
    mockChatFindOne.mockReturnValue({
      select: () => ({
        lean: async () => ({ pageLanguage: 'fr' }),
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 });

    const result = await EmbeddingMetadataService.syncForInteraction({
      _id: '507f1f77bcf86cd799439011',
      interactionId: '3',
      question: { language: 'en' },
      expertFeedback: {
        _id: '507f1f77bcf86cd799439012',
        totalScore: 100,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        neverStale: false,
      },
    });

    expect(result).toEqual(expect.objectContaining({
      matchedCount: 2,
      modifiedCount: 2,
      metadataAction: 'updated',
    }));
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { interactionId: '507f1f77bcf86cd799439011' },
      {
        $set: expect.objectContaining({
          expertFeedbackId: '507f1f77bcf86cd799439012',
          expertFeedbackTotalScore: 100,
          interactionId: '507f1f77bcf86cd799439011',
          pageLanguage: 'fr',
          interactionLanguage: 'en',
        }),
      }
    );
  });

  it('clears all denormalized metadata for an interaction, including pageLanguage', async () => {
    mockUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await EmbeddingMetadataService.clearForInteraction('507f1f77bcf86cd799439011');

    expect(mockUpdateMany).toHaveBeenCalledWith(
      { interactionId: '507f1f77bcf86cd799439011' },
      {
        $set: { interactionId: '507f1f77bcf86cd799439011' },
        $unset: {
          expertFeedbackId: '',
          expertFeedbackTotalScore: '',
          expertFeedbackCreatedAt: '',
          expertFeedbackNeverStale: '',
          pageLanguage: '',
          interactionLanguage: '',
        },
      }
    );
  });

  it('starts backfill by clearing all existing embedding metadata once', async () => {
    mockUpdateMany.mockResolvedValue({ matchedCount: 10, modifiedCount: 7 });
    mockInteractionCountDocuments.mockResolvedValue(3);

    const result = await EmbeddingMetadataService.backfillBatch({
      phase: 'clear',
      includeDetails: true,
    });

    expect(result).toEqual(expect.objectContaining({
      phase: 'interactions',
      processed: 10,
      updated: 0,
      cleared: 7,
      skipped: 0,
      remaining: null,
      hasMore: true,
      lastProcessedId: null,
    }));
    expect(mockUpdateMany).toHaveBeenCalledWith(
      {},
      {
        $unset: expect.objectContaining({
          expertFeedbackId: '',
          pageLanguage: '',
          interactionLanguage: '',
        }),
      }
    );
    expect(result.batchRecords[0]).toEqual(expect.objectContaining({
      action: 'cleared',
      reason: 'allMetadataReset',
      modifiedCount: 7,
    }));
  });

  it('resolves page languages through embedding chat ids without reverse-scanning chats', async () => {
    const interactionIds = [
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439013',
    ];
    mockInteractionFindResult(interactionIds.map((id, index) => ({
      _id: id,
      expertFeedback: {
        _id: `507f1f77bcf86cd79943901${index + 2}`,
        totalScore: 100,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
      question: { language: 'en' },
    })));
    mockEmbeddingFind.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => interactionIds.map((interactionId, index) => ({
            interactionId,
            chatId: {
              _id: `507f1f77bcf86cd79943902${index + 1}`,
              pageLanguage: 'fr',
            },
          })),
        }),
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await EmbeddingMetadataService.backfillBatch({
      phase: 'interactions',
      limit: 2,
      includeDetails: true,
    });

    expect(mockEmbeddingFind).toHaveBeenCalledWith({ interactionId: { $in: interactionIds } });
    expect(mockChatFind).not.toHaveBeenCalled();
    expect(mockChatFindOne).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockUpdateMany.mock.calls[0][1].$set.pageLanguage).toBe('fr');
    expect(result).toEqual(expect.objectContaining({ processed: 2, updated: 2 }));
  });

  it('does not reverse-scan chats when an interaction has no embedding', async () => {
    const interactionId = '507f1f77bcf86cd799439011';
    mockInteractionFindResult([{
      _id: interactionId,
      expertFeedback: {
        _id: '507f1f77bcf86cd799439012',
        totalScore: 100,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
      question: { language: 'en' },
    }]);
    mockUpdateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    await EmbeddingMetadataService.backfillBatch({
      phase: 'interactions',
      limit: 1,
    });

    expect(mockEmbeddingFind).toHaveBeenCalledWith({ interactionId: { $in: [interactionId] } });
    expect(mockChatFind).not.toHaveBeenCalled();
    expect(mockChatFindOne).not.toHaveBeenCalled();
  });

  it('reports whether embedding metadata matches linked feedback', async () => {
    mockEmbeddingAggregate.mockResolvedValue([{
      totalEmbeddings: 12,
      recordsRequiringMetadata: 5,
      recordsWithMetadata: 10,
      recordsMissingMetadata: 2,
    }]);

    await expect(EmbeddingMetadataService.getBackfillStatus()).resolves.toEqual(expect.objectContaining({
      complete: false,
      totalEmbeddings: 12,
      recordsRequiringMetadata: 5,
      recordsWithMetadata: 10,
      recordsMissingMetadata: 2,
    }));
    expect(mockEmbeddingAggregate).toHaveBeenCalledTimes(1);
  });

  it('resumes backfill by paging interactions with attached expert feedback using _id', async () => {
    const interaction = {
      _id: '507f1f77bcf86cd799439011',
      interactionId: '1',
      expertFeedback: mockObjectId('507f1f77bcf86cd799439012'),
      question: { language: 'eng' },
    };
    mockInteractionFindResult([interaction]);
    mockExpertFeedbackFindById.mockReturnValue({
      lean: async () => ({
        _id: '507f1f77bcf86cd799439012',
        totalScore: 90,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      }),
    });
    mockEmbeddingFind.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => [{
            interactionId: interaction._id,
            chatId: {
              _id: '507f1f77bcf86cd799439021',
              pageLanguage: 'fr',
            },
          }],
        }),
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 });
    mockInteractionCountDocuments.mockResolvedValue(0);

    const result = await EmbeddingMetadataService.backfillBatch({
      phase: 'interactions',
      limit: 1,
      includeDetails: true,
    });

    expect(result).toEqual(expect.objectContaining({
      phase: 'interactions',
      processed: 1,
      updated: 1,
      cleared: 0,
      skipped: 0,
      remaining: null,
      hasMore: true,
      lastProcessedId: '507f1f77bcf86cd799439011',
    }));
    expect(mockInteractionFind).toHaveBeenCalledWith({
      expertFeedback: { $exists: true, $ne: null },
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { interactionId: '507f1f77bcf86cd799439011' },
      {
        $set: expect.objectContaining({
          interactionId: '507f1f77bcf86cd799439011',
          expertFeedbackId: '507f1f77bcf86cd799439012',
          expertFeedbackTotalScore: 90,
          pageLanguage: 'fr',
          interactionLanguage: 'en',
        }),
      }
    );
    expect(result.batchRecords[0]).toEqual(expect.objectContaining({
      embeddingId: null,
      storedInteractionId: '507f1f77bcf86cd799439011',
      resolvedInteractionId: '507f1f77bcf86cd799439011',
      action: 'updated',
      modifiedCount: 2,
    }));
  });

  it('loads the expert feedback document when backfill receives only an object id', async () => {
    const interaction = {
      _id: '507f1f77bcf86cd799439011',
      expertFeedback: mockObjectId('507f1f77bcf86cd799439012'),
      question: { language: 'en' },
    };
    mockInteractionFindResult([interaction]);
    mockExpertFeedbackFindById.mockReturnValue({
      lean: async () => ({
        _id: '507f1f77bcf86cd799439012',
        totalScore: 100,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      }),
    });
    mockChatFindOne.mockReturnValue({
      select: () => ({
        lean: async () => ({ pageLanguage: 'en' }),
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockInteractionCountDocuments.mockResolvedValue(0);

    const result = await EmbeddingMetadataService.backfillBatch({
      phase: 'interactions',
      limit: 1,
    });

    expect(mockExpertFeedbackFindById).toHaveBeenCalledWith('507f1f77bcf86cd799439012');
    expect(result.updated).toBe(1);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { interactionId: '507f1f77bcf86cd799439011' },
      {
        $set: expect.objectContaining({
          expertFeedbackId: '507f1f77bcf86cd799439012',
          expertFeedbackTotalScore: 100,
        }),
      }
    );
  });

  it('continues interaction backfill from the saved _id without clearing again', async () => {
    mockInteractionFindResult([]);
    mockInteractionCountDocuments.mockResolvedValue(0);

    await EmbeddingMetadataService.backfillBatch({
      phase: 'interactions',
      lastProcessedId: '507f1f77bcf86cd799439011',
      limit: 5,
    });

    expect(mockInteractionFind).toHaveBeenCalledWith({
      expertFeedback: { $exists: true, $ne: null },
      _id: { $gt: '507f1f77bcf86cd799439011' },
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('defensively clears metadata if an ai-typed feedback document is attached', async () => {
    const interaction = {
      _id: '507f1f77bcf86cd799439011',
      expertFeedback: '507f1f77bcf86cd799439012',
      question: { language: 'en' },
    };
    mockInteractionFindResult([interaction]);
    mockExpertFeedbackFindById.mockReturnValue({
      lean: async () => ({
        _id: '507f1f77bcf86cd799439012',
        type: 'ai',
        totalScore: 100,
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockInteractionCountDocuments.mockResolvedValue(0);

    const result = await EmbeddingMetadataService.backfillBatch({
      phase: 'interactions',
      includeDetails: true,
    });

    expect(result).toEqual(expect.objectContaining({
      processed: 1,
      updated: 0,
      cleared: 1,
      skipped: 0,
    }));
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { interactionId: '507f1f77bcf86cd799439011' },
      {
        $set: { interactionId: '507f1f77bcf86cd799439011' },
        $unset: expect.objectContaining({
          expertFeedbackId: '',
          pageLanguage: '',
          interactionLanguage: '',
        }),
      }
    );
  });

  it('looks up embedding metadata for each chat interaction and flags stale metadata', async () => {
    mockChatFindOne.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => ({
            _id: '507f1f77bcf86cd799439031',
            chatId: 'chat-123',
            pageLanguage: 'en',
            interactions: [{
              _id: '507f1f77bcf86cd799439011',
              interactionId: '1',
              question: { language: 'fr' },
              expertFeedback: {
                _id: '507f1f77bcf86cd799439012',
                totalScore: 80,
                neverStale: true,
                createdAt: new Date('2024-01-01T00:00:00Z'),
              },
            }],
          }),
        }),
      }),
    });
    mockEmbeddingFind.mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: async () => ([{
            _id: '507f1f77bcf86cd799439021',
            interactionId: '507f1f77bcf86cd799439011',
            expertFeedbackId: '507f1f77bcf86cd799439099',
            expertFeedbackTotalScore: 60,
            expertFeedbackNeverStale: false,
            pageLanguage: 'fr',
            interactionLanguage: 'en',
          }]),
        }),
      }),
    });

    const result = await EmbeddingMetadataService.lookupForChat('chat-123');

    expect(result.chat).toEqual(expect.objectContaining({
      chatId: 'chat-123',
      interactionCount: 1,
      embeddingCount: 1,
    }));
    expect(result.rows[0]).toEqual(expect.objectContaining({
      rowNumber: 1,
      interactionObjectId: '507f1f77bcf86cd799439011',
      interactionDisplayId: '1',
      embeddingId: '507f1f77bcf86cd799439021',
      attachedExpertFeedbackId: '507f1f77bcf86cd799439012',
      metadataExpertFeedbackId: '507f1f77bcf86cd799439099',
      metadataStatus: 'staleFeedbackId',
      chatPageLanguage: 'en',
      interactionLanguage: 'fr',
      metadataPageLanguage: 'fr',
      metadataInteractionLanguage: 'en',
    }));
  });

  it('shows interactions with missing embeddings in metadata lookup', async () => {
    mockChatFindOne.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => ({
            _id: '507f1f77bcf86cd799439031',
            chatId: 'chat-123',
            pageLanguage: 'en',
            interactions: [{
              _id: '507f1f77bcf86cd799439011',
              interactionId: '1',
              question: { language: 'en' },
              expertFeedback: null,
            }],
          }),
        }),
      }),
    });
    mockEmbeddingFind.mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: async () => ([]),
        }),
      }),
    });

    const result = await EmbeddingMetadataService.lookupForChat('chat-123');

    expect(result.rows[0]).toEqual(expect.objectContaining({
      interactionObjectId: '507f1f77bcf86cd799439011',
      embeddingId: null,
      metadataStatus: 'missingEmbedding',
    }));
  });
});
