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

  it('throws the shared normalized error contract and masks api keys', async () => {
    const error = new Error(
      'Invalid response body while trying to fetch https://customsearch.googleapis.com/customsearch/v1?cx=engine-id&q=SCIS%20definition&api_key=secret123&lr=lang_en Authorization: Bearer secret123: Premature close'
    );
    listMock.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    let thrownError;
    try {
      await contextSearch('SCIS definition', 'en');
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({ provider: 'google', code: 'SEARCH_PROVIDER_REQUEST' });
    expect(thrownError.message).not.toContain('secret123');
    expect(thrownError.stack).not.toContain('secret123');
    expect(thrownError.cause).toBeUndefined();
    expect(JSON.stringify(thrownError)).not.toContain('secret123');
    expect(consoleSpy).toHaveBeenCalled();

    const loggedPayload = consoleSpy.mock.calls[0][1];
    expect(JSON.stringify(loggedPayload)).toContain('[REDACTED]');
    expect(JSON.stringify(loggedPayload)).not.toContain('secret123');

    const retryLog = console.warn.mock.calls[0][1];
    expect(retryLog).not.toContain('secret123');

    consoleSpy.mockRestore();
  });

  it('throws a normalized configuration error when credentials are missing', async () => {
    delete process.env.GOOGLE_API_KEY;

    await expect(contextSearch('passport', 'en')).rejects.toMatchObject({
      provider: 'google',
      code: 'SEARCH_PROVIDER_CONFIG',
    });
  });

  it('retries on a transient "Premature close" error and then succeeds', async () => {
    const transientError = new Error(
      'Invalid response body while trying to fetch https://customsearch.googleapis.com/customsearch/v1?key=secret123: Premature close'
    );
    listMock
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({
        data: {
          items: [
            { link: 'https://canada.ca/a', title: 'A', snippet: 'snippet a' },
          ],
        },
      });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await contextSearch('child benefits rural', 'en');

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe('google');
    expect(result.results).toContain('https://canada.ca/a');
    expect(result.results).not.toContain('Search failed:');
  });

  it('does not retry on a non-transient error', async () => {
    const clientError = Object.assign(new Error('Request failed'), { code: 400 });
    listMock.mockRejectedValue(clientError);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(contextSearch('child benefits rural', 'en')).rejects.toMatchObject({
      provider: 'google',
      code: 'SEARCH_PROVIDER_REQUEST',
      status: 400,
    });
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});
