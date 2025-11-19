import { describe, it, expect, vi, beforeEach } from 'vitest';
// mock axios before importing the module that uses it
vi.mock('axios');
import axios from 'axios';
import handler, { __private__ } from '../util-check-url.js';

// Extract private functions for direct testing
const { checkUrlWithMethod, isKnown404, getFinalUrl } = __private__ || {};

describe('util-check-url', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
    let req, res;
    beforeEach(() => {
      vi.resetAllMocks();
      req = { query: { url: 'https://example.com', chatId: 'test-chat' } };
      res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
    });

  it('should return valid for a 200 response (HEAD)', async () => {
  axios.mockResolvedValueOnce({
      status: 200,
      request: { res: { responseUrl: 'https://example.com' } },
    });
    const result = await checkUrlWithMethod('https://example.com', 'head');
    expect(result.isValid).toBe(true);
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe('https://example.com');
  });
  it('handler returns 400 if url is missing', async () => {
    req.query.url = undefined;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing url parameter' });
  });

  it('handler returns valid for 200 HEAD', async () => {
  axios.mockResolvedValueOnce({
      status: 200,
      request: { res: { responseUrl: 'https://example.com' } },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isValid: true, status: 200, confidenceRating: 1 })
    );
  });

  it('handler returns invalid for 404 HEAD and 404 GET', async () => {
  axios.mockResolvedValueOnce({
      status: 404,
      request: { res: { responseUrl: 'https://example.com/errors/404.html' } },
    });
  axios.mockResolvedValueOnce({
      status: 404,
      request: { res: { responseUrl: 'https://example.com/errors/404.html' } },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isValid: false, status: 404, confidenceRating: 0 })
    );
  });

  it('handler returns valid for 404 HEAD but 200 GET', async () => {
  axios.mockResolvedValueOnce({
      status: 404,
      request: { res: { responseUrl: 'https://example.com/errors/404.html' } },
    });
  axios.mockResolvedValueOnce({
      status: 200,
      request: { res: { responseUrl: 'https://example.com' } },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isValid: true, status: 200, confidenceRating: 1 })
    );
  });

  it('handler handles axios error', async () => {
  axios.mockRejectedValueOnce({ message: 'Network error', response: { status: 500 } });
  axios.mockRejectedValueOnce({ message: 'Network error', response: { status: 500 } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ isValid: false, error: 'Network error', confidenceRating: 0 })
    );
  });

  it('should return invalid for a known 404 page', async () => {
  axios.mockResolvedValueOnce({
      status: 200,
      request: { res: { responseUrl: 'https://www.canada.ca/errors/404.html' } },
    });
    const result = await checkUrlWithMethod('https://www.canada.ca/errors/404.html', 'head');
    expect(result.isValid).toBe(false);
    expect(result.status).toBe(200);
    expect(result.finalUrl).toContain('404.html');
  });

  it('should handle network errors gracefully', async () => {
  axios.mockRejectedValueOnce({
      message: 'Network Error',
      response: { status: 500 },
    });
    const result = await checkUrlWithMethod('https://badurl.com', 'head');
    expect(result.isValid).toBe(false);
    expect(result.status).toBe(500);
    expect(result.error).toBe('Network Error');
  });

  it('isKnown404 should detect known 404 URLs', () => {
    expect(isKnown404('https://www.canada.ca/errors/404.html')).toBe(true);
    expect(isKnown404('https://www.canada.ca/fr/erreurs/404.html')).toBe(true);
    expect(isKnown404('https://example.com')).toBe(false);
  });

  it('getFinalUrl should return responseUrl if present', () => {
    const response = { request: { res: { responseUrl: 'https://final.com' } } };
    expect(getFinalUrl(response, 'https://original.com')).toBe('https://final.com');
  });

  it('getFinalUrl should return original url if responseUrl is missing', () => {
    const response = {};
    expect(getFinalUrl(response, 'https://original.com')).toBe('https://original.com');
  });
});
