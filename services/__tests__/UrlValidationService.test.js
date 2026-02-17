import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UrlValidationService } from '../UrlValidationService.js';
// Mock axios
vi.mock('axios');
import axios from 'axios';

vi.mock('../ServerLoggingService.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

const { checkUrlWithMethod, isKnown404, getFinalUrl } = UrlValidationService.__private__;

describe('UrlValidationService', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('checkUrlWithMethod (private)', () => {
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
    });

    describe('validateUrl (public)', () => {
        it('returns valid validation result if HEAD succeeds', async () => {
            axios.mockResolvedValueOnce({
                status: 200,
                request: { res: { responseUrl: 'https://example.com' } },
            });
            const result = await UrlValidationService.validateUrl('https://example.com');
            expect(result.isValid).toBe(true);
            // Only one call needed
            expect(axios).toHaveBeenCalledTimes(1);
        });

        it('falls back to GET if HEAD fails (404/Invalid)', async () => {
            // HEAD 404
            axios.mockResolvedValueOnce({
                status: 404,
                request: { res: { responseUrl: 'https://example.com/404' } },
            });
            // GET 200
            axios.mockResolvedValueOnce({
                status: 200,
                request: { res: { responseUrl: 'https://example.com' } },
            });

            const result = await UrlValidationService.validateUrl('https://example.com');
            expect(result.isValid).toBe(true);
            expect(axios).toHaveBeenCalledTimes(2);
        });

        it('returns invalid if both HEAD and GET fail', async () => {
            // HEAD 404
            axios.mockResolvedValueOnce({
                status: 404,
                request: { res: { responseUrl: 'https://example.com/404' } },
            });
            // GET 404
            axios.mockResolvedValueOnce({
                status: 404,
                request: { res: { responseUrl: 'https://example.com/404' } },
            });

            const result = await UrlValidationService.validateUrl('https://example.com');
            expect(result.isValid).toBe(false);
        });
    });

    describe('Utils', () => {
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
});
