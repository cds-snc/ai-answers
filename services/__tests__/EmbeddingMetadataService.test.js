import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmbeddingMetadataService from '../EmbeddingMetadataService.js';

const {
  mockUpdateOne,
  mockUpdateMany,
  mockEmbeddingFind,
  mockCountDocuments,
  mockChatFindOne,
  mockInteractionFindById,
  mockInteractionFindOne,
  mockExpertFeedbackFindById,
} = vi.hoisted(() => ({
  mockUpdateOne: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockEmbeddingFind: vi.fn(),
  mockCountDocuments: vi.fn(),
  mockChatFindOne: vi.fn(),
  mockInteractionFindById: vi.fn(),
  mockInteractionFindOne: vi.fn(),
  mockExpertFeedbackFindById: vi.fn(),
}));

vi.mock('../../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(),
}));

vi.mock('../../models/chat.js', () => ({
  Chat: { findOne: mockChatFindOne },
}));

vi.mock('../../models/interaction.js', () => ({
  Interaction: { findById: mockInteractionFindById, findOne: mockInteractionFindOne },
}));

vi.mock('../../models/embedding.js', () => ({
  Embedding: {
    updateOne: mockUpdateOne,
    updateMany: mockUpdateMany,
    find: mockEmbeddingFind,
    countDocuments: mockCountDocuments,
  },
}));

vi.mock('../../models/expertFeedback.js', () => ({
  ExpertFeedback: { findById: mockExpertFeedbackFindById },
}));

describe('EmbeddingMetadataService', () => {
  beforeEach(() => {
    mockUpdateOne.mockReset();
    mockUpdateMany.mockReset();
    mockEmbeddingFind.mockReset();
    mockCountDocuments.mockReset();
    mockChatFindOne.mockReset();
    mockInteractionFindById.mockReset();
    mockInteractionFindOne.mockReset();
    mockExpertFeedbackFindById.mockReset();
  });

  it('stores both pageLanguage and interactionLanguage when syncing metadata', async () => {
    mockChatFindOne.mockReturnValue({
      select: () => ({
        lean: async () => ({ pageLanguage: 'fr' }),
      }),
    });

    mockInteractionFindById.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => ({
            _id: '507f1f77bcf86cd799439011',
            question: { language: 'en' },
          }),
        }),
      }),
    });

    mockUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 });

    const result = await EmbeddingMetadataService.syncForInteraction({
      _id: '507f1f77bcf86cd799439011',
      expertFeedback: {
        _id: '507f1f77bcf86cd799439012',
        totalScore: 100,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        neverStale: false,
      },
    });

    expect(result).toEqual({ matchedCount: 2, modifiedCount: 2, metadataAction: 'updated' });
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

  it('clears existing metadata during backfill when interaction feedback is missing', async () => {
    mockEmbeddingFind.mockReturnValue({
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: async () => ([{
              _id: '507f1f77bcf86cd799439021',
              interactionId: '507f1f77bcf86cd799439011',
            }]),
          }),
        }),
      }),
    });
    mockInteractionFindById.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => ({
            _id: '507f1f77bcf86cd799439011',
            question: { language: 'eng' },
          }),
        }),
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockCountDocuments.mockResolvedValue(0);

    const result = await EmbeddingMetadataService.backfillBatch({ limit: 1 });

    expect(result).toEqual(expect.objectContaining({
      processed: 1,
      updated: 0,
      cleared: 1,
      skipped: 0,
      remaining: 0,
    }));
    expect(mockUpdateMany).toHaveBeenCalledWith(
      {
        $or: [
          { _id: '507f1f77bcf86cd799439021' },
          { interactionId: '507f1f77bcf86cd799439011' },
        ],
      },
      {
        $set: {
          interactionId: '507f1f77bcf86cd799439011',
        },
        $unset: {
          expertFeedbackId: '',
          expertFeedbackTotalScore: '',
          expertFeedbackCreatedAt: '',
          expertFeedbackNeverStale: '',
          interactionLanguage: '',
        },
      }
    );
  });

  it('normalizes interaction language during backfill updates', async () => {
    mockEmbeddingFind.mockReturnValue({
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: async () => ([{
              _id: '507f1f77bcf86cd799439021',
              interactionId: '507f1f77bcf86cd799439011',
            }]),
          }),
        }),
      }),
    });
    mockInteractionFindById.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => ({
            _id: '507f1f77bcf86cd799439011',
            expertFeedback: '507f1f77bcf86cd799439012',
            question: { language: 'eng' },
          }),
        }),
      }),
    });
    mockExpertFeedbackFindById.mockReturnValue({
      lean: async () => ({
        _id: '507f1f77bcf86cd799439012',
        totalScore: 90,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      }),
    });
    mockChatFindOne.mockReturnValue({
      select: () => ({
        lean: async () => ({ pageLanguage: 'fr' }),
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 2, modifiedCount: 2 });
    mockCountDocuments.mockResolvedValue(0);

    const result = await EmbeddingMetadataService.backfillBatch({ limit: 1 });

    expect(result).toEqual(expect.objectContaining({
      processed: 1,
      updated: 2,
      cleared: 0,
      skipped: 0,
      remaining: 0,
    }));
    expect(mockUpdateMany).toHaveBeenCalledWith(
      {
        $or: [
          { _id: '507f1f77bcf86cd799439021' },
          { interactionId: '507f1f77bcf86cd799439011' },
        ],
      },
      {
        $set: expect.objectContaining({
          expertFeedbackId: '507f1f77bcf86cd799439012',
          expertFeedbackTotalScore: 90,
          interactionId: '507f1f77bcf86cd799439011',
          pageLanguage: 'fr',
          interactionLanguage: 'en',
        }),
      }
    );
  });

  it('excludes auto-eval feedback during backfill and clears metadata instead', async () => {
    mockEmbeddingFind.mockReturnValue({
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: async () => ([{
              _id: '507f1f77bcf86cd799439021',
              interactionId: '507f1f77bcf86cd799439011',
            }]),
          }),
        }),
      }),
    });
    mockInteractionFindById.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => ({
            _id: '507f1f77bcf86cd799439011',
            expertFeedback: '507f1f77bcf86cd799439012',
            question: { language: 'en' },
          }),
        }),
      }),
    });
    mockExpertFeedbackFindById.mockReturnValue({
      lean: async () => ({
        _id: '507f1f77bcf86cd799439012',
        type: 'ai',
        totalScore: 100,
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockCountDocuments.mockResolvedValue(0);

    const result = await EmbeddingMetadataService.backfillBatch({ limit: 1 });

    expect(result).toEqual(expect.objectContaining({
      processed: 1,
      updated: 0,
      cleared: 1,
      skipped: 0,
      remaining: 0,
    }));
    expect(mockUpdateMany).toHaveBeenCalledWith(
      {
        $or: [
          { _id: '507f1f77bcf86cd799439021' },
          { interactionId: '507f1f77bcf86cd799439011' },
        ],
      },
      {
        $set: {
          interactionId: '507f1f77bcf86cd799439011',
        },
        $unset: {
          expertFeedbackId: '',
          expertFeedbackTotalScore: '',
          expertFeedbackCreatedAt: '',
          expertFeedbackNeverStale: '',
          interactionLanguage: '',
        },
      }
    );
  });

  it('repairs backfilled embeddings whose interactionId is not the Mongo interaction _id', async () => {
    mockEmbeddingFind.mockReturnValue({
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: async () => ([{
              _id: '507f1f77bcf86cd799439021',
              chatId: '507f1f77bcf86cd799439031',
              interactionId: 'chat-counter-1',
              questionId: '507f1f77bcf86cd799439041',
              answerId: '507f1f77bcf86cd799439051',
            }]),
          }),
        }),
      }),
    });
    mockChatFindOne
      .mockReturnValueOnce({
        select: () => ({
          lean: async () => ({ interactions: ['507f1f77bcf86cd799439011'] }),
        }),
      })
      .mockReturnValue({
        select: () => ({
          lean: async () => ({ pageLanguage: 'en' }),
        }),
      });
    mockInteractionFindOne.mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => ({
            _id: '507f1f77bcf86cd799439011',
            expertFeedback: '507f1f77bcf86cd799439012',
            question: { language: 'en' },
          }),
        }),
      }),
    });
    mockExpertFeedbackFindById.mockReturnValue({
      lean: async () => ({
        _id: '507f1f77bcf86cd799439012',
        totalScore: 75,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      }),
    });
    mockUpdateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockCountDocuments.mockResolvedValue(0);

    const result = await EmbeddingMetadataService.backfillBatch({ limit: 1 });

    expect(result).toEqual(expect.objectContaining({
      processed: 1,
      updated: 1,
      skipped: 0,
    }));
    expect(mockInteractionFindById).not.toHaveBeenCalled();
    expect(mockInteractionFindOne).toHaveBeenCalledWith({
      question: '507f1f77bcf86cd799439041',
      answer: '507f1f77bcf86cd799439051',
      _id: { $in: ['507f1f77bcf86cd799439011'] },
    });
    expect(mockUpdateMany).toHaveBeenCalledWith(
      {
        $or: [
          { _id: '507f1f77bcf86cd799439021' },
          { interactionId: '507f1f77bcf86cd799439011' },
        ],
      },
      {
        $set: expect.objectContaining({
          interactionId: '507f1f77bcf86cd799439011',
          expertFeedbackId: '507f1f77bcf86cd799439012',
          expertFeedbackTotalScore: 75,
          interactionLanguage: 'en',
        }),
      }
    );
  });
});
