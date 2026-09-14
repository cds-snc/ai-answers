import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { contextSearch, contextSearchTool } from '../canadaCaContextSearch.js';

describe('canadaCaContextSearch', () => {
  beforeEach(() => {
    process.env.CANADA_CA_SEARCH_URI = 'https://search.example.test';
    process.env.CANADA_CA_SEARCH_API_KEY = 'secret';
    process.env.CANADA_CA_SEARCH_HUB = 'canada-gouv-public-websites';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CANADA_CA_SEARCH_URI;
    delete process.env.CANADA_CA_SEARCH_API_KEY;
    delete process.env.CANADA_CA_SEARCH_HUB;
  });

  it('returns the shared search result contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            clickUri: 'https://canada.ca/passport',
            title: 'Passport',
            excerpt: 'Passport information',
            raw: { sysauthor: ['Service Canada'] },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await contextSearch('passport', 'en');
    expect(result).toEqual({
      provider: 'canadaca',
      results: expect.stringContaining('https://canada.ca/passport'),
    });
    expect(result.results).toContain('Source organization: Service Canada');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      q: 'passport',
      searchHub: 'canada-gouv-public-websites',
      locale: 'en-CA',
      forwardLanguageToCoveoIndex: true,
    });
  });

  it('sends the French locale without the deprecated srb origin value', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await contextSearch('passeport', 'fr');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.locale).toBe('fr-CA');
    expect(body.forwardLanguageToCoveoIndex).toBe(true);
    expect(body).not.toHaveProperty('originLevel3');
  });

  it('throws a normalized configuration error when credentials are missing', async () => {
    delete process.env.CANADA_CA_SEARCH_URI;

    await expect(contextSearch('passport', 'en')).rejects.toMatchObject({
      provider: 'canadaca',
      code: 'SEARCH_PROVIDER_CONFIG',
    });
  });

  it('throws a normalized request error for an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
      text: async () => 'temporarily unavailable',
    }));

    await expect(contextSearch('passport', 'en')).rejects.toMatchObject({
      provider: 'canadaca',
      code: 'SEARCH_PROVIDER_HTTP',
      status: 503,
    });
  });

  it('returns the same result contract from the LangChain tool adapter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { clickUri: 'https://canada.ca/passport', title: 'Passport', excerpt: 'Passport information' },
        ],
      }),
    }));

    await expect(contextSearchTool.invoke({ query: 'passport', lang: 'en' })).resolves.toEqual({
      provider: 'canadaca',
      results: expect.stringContaining('https://canada.ca/passport'),
    });
  });
});
