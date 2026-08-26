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

    describe('validateUrlFormatting (public)', () => {
        it('falls back to a search URL when no URL is supplied', async () => {
            const result = await UrlValidationService.validateUrlFormatting('', 'en', 'feed licence', 'cfia');

            expect(result.isValid).toBe(false);
            expect(result.fallbackUrl).toContain('/sr/srb.html?q=feed%20licence');
        });

        it('uses the department search page for a known department', async () => {
            const result = await UrlValidationService.validateUrlFormatting('', 'en', 'benefits', 'cra');

            expect(result.fallbackUrl).toContain('/revenue-agency/search.html');
        });

        // Pass-through is the intended behaviour of a non-networking validator,
        // not an accident of the tautology this replaced. Non-www.canada.ca GC
        // hosts must keep their own URL rather than being sent to a search page.
        it('passes any supplied URL through unchanged', async () => {
            for (const url of [
                'https://www.canada.ca/en/services/benefits.html',
                'https://inspection.canada.ca/en/animal-health/livestock-feeds',
                'https://ised-isde.canada.ca/site/ised/en',
            ]) {
                expect(await UrlValidationService.validateUrlFormatting(url)).toEqual({
                    isValid: true,
                    url,
                });
            }
        });

        it('makes no network request', async () => {
            await UrlValidationService.validateUrlFormatting('https://www.canada.ca/en');

            expect(axios).not.toHaveBeenCalled();
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
