import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUserFind, mockFeedbackFind } = vi.hoisted(() => ({
  mockUserFind: vi.fn(),
  mockFeedbackFind: vi.fn(),
}));
vi.mock('../../../models/user.js', () => ({ User: { find: mockUserFind } }));
vi.mock('../../../models/expertFeedback.js', () => ({ ExpertFeedback: { find: mockFeedbackFind } }));

import { resolveReviewerMatch } from '../reviewer-filter.js';

const lean = (rows) => ({ lean: async () => rows });

describe('resolveReviewerMatch', () => {
  beforeEach(() => {
    mockUserFind.mockReset();
    mockFeedbackFind.mockReset();
  });

  it('returns null when neither filter is set', async () => {
    expect(await resolveReviewerMatch({})).toBeNull();
    expect(await resolveReviewerMatch({ institution: ' ', reviewerEmail: '' })).toBeNull();
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  it('institution: resolves members, then their evaluations by email', async () => {
    mockUserFind.mockReturnValue(lean([{ _id: 'u1', email: 'a@dnd.ca' }, { _id: 'u2', email: 'b@dnd.ca' }]));
    mockFeedbackFind.mockReturnValue(lean([{ _id: 'f1' }]));
    const result = await resolveReviewerMatch({ institution: 'DND-MDN' });
    expect(mockUserFind).toHaveBeenCalledWith({ institution: 'DND-MDN' }, { _id: 1, email: 1 });
    expect(mockFeedbackFind).toHaveBeenCalledWith({ expertEmail: { $in: ['a@dnd.ca', 'b@dnd.ca'] } }, { _id: 1 });
    expect(result).toEqual({ userIds: ['u1', 'u2'], feedbackIds: ['f1'] });
  });

  it('group: resolves members by group name', async () => {
    mockUserFind.mockReturnValue(lean([{ _id: 'u3', email: 'c@dnd.ca' }]));
    mockFeedbackFind.mockReturnValue(lean([]));
    const result = await resolveReviewerMatch({ group: 'Military transitions' });
    expect(mockUserFind).toHaveBeenCalledWith({ group: 'Military transitions' }, { _id: 1, email: 1 });
    expect(mockFeedbackFind).toHaveBeenCalledWith({ expertEmail: { $in: ['c@dnd.ca'] } }, { _id: 1 });
    expect(result).toEqual({ userIds: ['u3'], feedbackIds: [] });
  });

  it('institution with no members: empty sets, no evaluation query', async () => {
    mockUserFind.mockReturnValue(lean([]));
    const result = await resolveReviewerMatch({ institution: 'FIN' });
    expect(mockFeedbackFind).not.toHaveBeenCalled();
    expect(result).toEqual({ userIds: [], feedbackIds: [] });
  });

  it('reviewerEmail alone: partial, case-insensitive, and matches evaluations directly', async () => {
    mockUserFind.mockReturnValue(lean([]));
    mockFeedbackFind.mockReturnValue(lean([{ _id: 'f9' }]));
    const result = await resolveReviewerMatch({ reviewerEmail: 'korhan.' });
    const regex = { $regex: 'korhan\\.', $options: 'i' };
    expect(mockUserFind).toHaveBeenCalledWith({ email: regex }, { _id: 1, email: 1 });
    expect(mockFeedbackFind).toHaveBeenCalledWith({ expertEmail: regex }, { _id: 1 });
    expect(result).toEqual({ userIds: [], feedbackIds: ['f9'] });
  });

  it('both: email narrows within the institution', async () => {
    mockUserFind.mockReturnValue(lean([{ _id: 'u1', email: 'a@dnd.ca' }]));
    mockFeedbackFind.mockReturnValue(lean([]));
    await resolveReviewerMatch({ institution: 'DND-MDN', reviewerEmail: 'a@' });
    expect(mockUserFind.mock.calls[0][0]).toEqual({ institution: 'DND-MDN', email: { $regex: 'a@', $options: 'i' } });
    expect(mockFeedbackFind.mock.calls[0][0]).toEqual({ expertEmail: { $in: ['a@dnd.ca'] } });
  });
});
