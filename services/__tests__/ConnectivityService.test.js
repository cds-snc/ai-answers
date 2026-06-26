import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsService } from '../SettingsService.js';
import { testAzureOpenAI, testDocumentDB, testGoogleSearch } from '../ConnectivityService.js';

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
