import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UrlValidationService } from '../UrlValidationService.js';
// Mocked only so 'makes no network request' can assert it is never called.
vi.mock('axios');
import axios from 'axios';

vi.mock('../../agents/graphs/GraphEventLogger.js', () => ({ logGraphEvent: vi.fn() }));
import { logGraphEvent } from '../../agents/graphs/GraphEventLogger.js';

describe('UrlValidationService', () => {
    beforeEach(() => {
        vi.resetAllMocks();
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

        // Non-www.canada.ca GC hosts must keep their own URL rather than being
        // sent to a search page.
        it('passes a Government of Canada URL through unchanged', async () => {
            for (const url of [
                'https://www.canada.ca/en/services/benefits.html',
                'https://inspection.canada.ca/en/animal-health/livestock-feeds',
                'https://ised-isde.canada.ca/site/ised/en',
                'https://www.tpsgc-pwgsc.gc.ca/recgen/index-eng.html',
                'https://www.rcmp.ca/en', // department list, own domain
            ]) {
                expect(await UrlValidationService.validateUrlFormatting(url)).toEqual({
                    isValid: true,
                    url,
                });
            }
        });

        // AIA-007: a model steered or hallucinating into citing another
        // domain must not have that link rendered as a trusted GC source.
        it('falls back to search for a URL not on a Government of Canada host', async () => {
            for (const url of [
                'https://attacker.example/phish',
                'https://canada.ca.attacker.example/en',
                'https://evilcanada.ca/en',
                'https://www.canada.ca@attacker.example/en',
                '//attacker.example/phish',
                'javascript:alert(1)',
                'not a url',
            ]) {
                const result = await UrlValidationService.validateUrlFormatting(url, 'en', 'benefits', 'cra');
                expect(result.isValid).toBe(false);
                expect(result.url).toBeUndefined();
                expect(result.fallbackUrl).toContain('https://www.canada.ca/en/revenue-agency/search.html');
            }
        });

        // The rejected URL is untrusted and may carry personal details in its
        // query string, so only the hostname is logged.
        it('logs only the hostname of a rejected URL', async () => {
            await UrlValidationService.validateUrlFormatting(
                'https://attacker.example/phish?q=my+SIN+123456789', 'en', '', undefined, null, 'chat-1'
            );
            expect(logGraphEvent).toHaveBeenCalledWith(
                'warn',
                expect.any(String),
                'chat-1',
                { hostname: 'attacker.example' },
            );
            expect(JSON.stringify(logGraphEvent.mock.calls)).not.toContain('123456789');
        });

        it('makes no network request', async () => {
            await UrlValidationService.validateUrlFormatting('https://www.canada.ca/en');

            expect(axios).not.toHaveBeenCalled();
        });

        // Unlike api/util/normalizeFetchUrl.js (used by the outbound fetch
        // tools), this validator has no http->https upgrade — see the comment
        // above the return in UrlValidationService.js. A model can fetch a page
        // over https and still cite it as http: here; this test locks in that
        // known, accepted gap so a future change doesn't silently alter it
        // either way without the test noticing.
        it('does not upgrade an http:// URL to https', async () => {
            const url = 'http://inspection.canada.ca/en/animal-health/livestock-feeds';

            expect(await UrlValidationService.validateUrlFormatting(url)).toEqual({
                isValid: true,
                url,
            });
        });
    });
});
