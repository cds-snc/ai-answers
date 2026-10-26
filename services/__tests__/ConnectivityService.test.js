import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../SettingsService.js';
import { testAzureOpenAI, testCanadaCaSearch, testDocumentDB, testGoogleSearch } from '../ConnectivityService.js';

let originalCache = {};

beforeEach(() => {
  originalCache = { ...SettingsService.cache };
});

afterEach(() => {
  SettingsService.cache = { ...originalCache };
});

describe('ConnectivityService simulation controls', () => {
  it('simulates a database connection failure when enabled', async () => {
    SettingsService.cache['connectivity.simulation.database'] = 'true';

    const result = await testDocumentDB();

    expect(result).toMatchObject({
      service: 'DocumentDB',
      status: 'error',
      statusCode: 503,
      message: 'Simulated connection failure',
      details: { simulated: true },
    });
  });

  it('simulates a search connection failure when enabled', async () => {
    SettingsService.cache['connectivity.simulation.search'] = 'true';

    const result = await testGoogleSearch();

    expect(result).toMatchObject({
      service: 'Google search',
      status: 'error',
      statusCode: 503,
      message: 'Simulated connection failure',
      details: { simulated: true },
    });
  });

  it('simulates a Canada.ca search connection failure when enabled', async () => {
    SettingsService.cache['connectivity.simulation.search'] = 'true';

    const result = await testCanadaCaSearch();

    expect(result).toMatchObject({
      service: 'Canada.ca search',
      status: 'error',
      statusCode: 503,
      message: 'Simulated connection failure',
      details: { simulated: true },
    });
  });

  it('simulates an llm connection failure when enabled', async () => {
    SettingsService.cache['connectivity.simulation.llm'] = 'true';

    const result = await testAzureOpenAI();

    expect(result).toMatchObject({
      service: 'Azure OpenAI',
      status: 'error',
      statusCode: 503,
      message: 'Simulated connection failure',
      details: { simulated: true },
    });
  });
});

describe('Canada.ca search connectivity probe', () => {
  beforeEach(() => {
    SettingsService.cache['connectivity.simulation.search'] = 'false';
    vi.stubEnv('CANADA_CA_SEARCH_URI', 'https://search.test/api');
    vi.stubEnv('CANADA_CA_SEARCH_API_KEY', 'test-api-key');
    vi.stubEnv('USER_AGENT', 'test-agent');
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the current Coveo request and reports a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ results: [{}, {}] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testCanadaCaSearch();

    expect(result).toMatchObject({
      service: 'Canada.ca search',
      status: 'connected',
      configured: true,
      details: { resultCount: 2, endpoint: 'https://search.test/api' },
    });
    expect(fetchMock).toHaveBeenCalledWith('https://search.test/api', expect.objectContaining({
      method: 'POST',
      signal: expect.any(AbortSignal),
      headers: {
        Authorization: 'Bearer test-api-key',
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'test-agent',
      },
    }));
    expect(AbortSignal.timeout).toHaveBeenCalledWith(10000);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      q: '@language=English passport',
      locale: 'en-CA',
      forwardLanguageToCoveoIndex: true,
    });
  });

  it('reports an HTTP failure without exposing the response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'secret response details',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await testCanadaCaSearch();

    expect(result).toMatchObject({
      service: 'Canada.ca search',
      status: 'error',
      configured: true,
      message: 'HTTP 503: Service Unavailable',
    });
    expect(result.message).not.toContain('secret response details');
  });

  it('reports malformed JSON as a probe failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not-json',
    }));

    const result = await testCanadaCaSearch();

    expect(result).toMatchObject({
      service: 'Canada.ca search',
      status: 'error',
      configured: true,
    });
  });
});
