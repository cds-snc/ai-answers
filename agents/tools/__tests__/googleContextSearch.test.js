import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    customsearch: vi.fn(() => ({
      cse: {
        list: listMock,
      },
    })),
  },
}));

import { contextSearch } from '../googleContextSearch.js';

describe('googleContextSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SEARCH_ENGINE_ID = 'engine-id';
    process.env.GOOGLE_API_KEY = 'secret123';
  });

  it('masks api keys in returned and logged errors', async () => {
    const error = new Error(
      'Invalid response body while trying to fetch https://customsearch.googleapis.com/customsearch/v1?cx=engine-id&q=SCIS%20definition&key=secret123&lr=lang_en: Premature close'
    );
    listMock.mockRejectedValueOnce(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await contextSearch('SCIS definition', 'en');

    expect(result.results).toContain('Search failed:');
    expect(result.results).toContain('key=[REDACTED]');
    expect(result.results).not.toContain('secret123');
    expect(consoleSpy).toHaveBeenCalled();

    const loggedPayload = consoleSpy.mock.calls[0][1];
    expect(JSON.stringify(loggedPayload)).toContain('[REDACTED]');
    expect(JSON.stringify(loggedPayload)).not.toContain('secret123');

    consoleSpy.mockRestore();
  });
});
