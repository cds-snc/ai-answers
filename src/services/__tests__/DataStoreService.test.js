import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataStoreService from '../DataStoreService.js';
import AuthService from '../AuthService.js';
import { getApiUrl } from '../../utils/apiToUrl.js';

vi.mock('../AuthService.js');
vi.mock('../../utils/apiToUrl.js');

describe('DataStoreService.checkIndexStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUrl.mockImplementation((endpoint) => `/api/db/${endpoint}`);
  });

  it('fetches index status with a GET request', async () => {
    const mockStatus = { message: 'All indexes are complete', collections: [] };
    AuthService.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockStatus)
    });

    const result = await DataStoreService.checkIndexStatus();

    expect(AuthService.fetch).toHaveBeenCalledWith('/api/db/db-database-management?action=indexStatus');
    expect(result).toEqual(mockStatus);
  });
});
