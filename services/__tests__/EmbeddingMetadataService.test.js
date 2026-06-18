import { describe, it, expect, vi, beforeEach } from 'vitest';
import EmbeddingMetadataService from '../EmbeddingMetadataService.js';

const { mockUpdateOne, mockChatFindOne, mockInteractionFindById } = vi.hoisted(() => ({
  mockUpdateOne: vi.fn(),
  mockChatFindOne: vi.fn(),
  mockInteractionFindById: vi.fn(),
}));

vi.mock('../../api/db/db-connect.js', () => ({
  default: vi.fn().mockResolvedValue(),
}));

vi.mock('../../models/chat.js', () => ({
  Chat: { findOne: mockChatFindOne },
}));

vi.mock('../../models/interaction.js', () => ({
  Interaction: { findById: mockInteractionFindById },
}));

vi.mock('../../models/embedding.js', () => ({
  Embedding: { updateOne: mockUpdateOne, find: vi.fn(), countDocuments: vi.fn() },
}));

vi.mock('../../models/expertFeedback.js', () => ({
  ExpertFeedback: { findById: vi.fn() },
}));

describe('EmbeddingMetadataService', () => {
  beforeEach(() => {
    mockUpdateOne.mockReset();
    mockChatFindOne.mockReset();
    mockInteractionFindById.mockReset();
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

    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const result = await EmbeddingMetadataService.syncForInteraction({
      _id: '507f1f77bcf86cd799439011',
      expertFeedback: {
        _id: '507f1f77bcf86cd799439012',
        totalScore: 100,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        neverStale: false,
      },
    });

    expect(result).toEqual({ matchedCount: 1, modifiedCount: 1 });
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { interactionId: '507f1f77bcf86cd799439011' },
      {
        $set: expect.objectContaining({
          expertFeedbackId: '507f1f77bcf86cd799439012',
          expertFeedbackTotalScore: 100,
          pageLanguage: 'fr',
          interactionLanguage: 'en',
        }),
      }
    );
  });
});
