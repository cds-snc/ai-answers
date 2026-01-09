import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from '../util-check-url.js';
import { UrlValidationService } from '../../../services/UrlValidationService.js';

vi.mock('../../../services/UrlValidationService.js', () => ({
  UrlValidationService: {
    validateUrl: vi.fn(),
    __private__: {}
  }
}));

describe('util-check-url handler', () => {
  let req, res;
  beforeEach(() => {
    vi.resetAllMocks();
    req = { query: { url: 'https://example.com', chatId: 'test-chat' } };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
  });

  it('handler returns 400 if url is missing', async () => {
    req.query.url = undefined;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing url parameter' });
  });

  it('handler returns delegation result', async () => {
    const mockResult = { isValid: true, status: 200, confidenceRating: 1 };
    UrlValidationService.validateUrl.mockResolvedValue(mockResult);

    await handler(req, res);
    expect(UrlValidationService.validateUrl).toHaveBeenCalledWith('https://example.com', 'test-chat');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResult);
  });
});
