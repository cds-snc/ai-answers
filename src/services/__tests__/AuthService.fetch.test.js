import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import AuthService from '../AuthService.js';

describe('AuthService.fetch header logic', () => {
    let origFetch;

    beforeEach(() => {
        origFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    });

    afterEach(() => {
        global.fetch = origFetch;
        vi.resetAllMocks();
    });

    it('sets application/json for POST with body', async () => {
        await AuthService.fetch('/test', {
            method: 'POST',
            body: JSON.stringify({ data: 1 })
        });

        const headers = global.fetch.mock.calls[0][1].headers;
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('sets application/json for PATCH with body', async () => {
        await AuthService.fetch('/test', {
            method: 'PATCH',
            body: JSON.stringify({ data: 1 })
        });

        const headers = global.fetch.mock.calls[0][1].headers;
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('sets application/json for DELETE with body (The Fix)', async () => {
        await AuthService.fetch('/test', {
            method: 'DELETE',
            body: JSON.stringify({ userId: '123' })
        });

        const headers = global.fetch.mock.calls[0][1].headers;
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('does NOT set application/json for GET', async () => {
        await AuthService.fetch('/test', {
            method: 'GET'
        });

        const headers = global.fetch.mock.calls[0][1].headers;
        expect(headers['Content-Type']).toBeUndefined();
    });

    it('does NOT set application/json for DELETE without body', async () => {
        await AuthService.fetch('/test', {
            method: 'DELETE'
        });

        const headers = global.fetch.mock.calls[0][1].headers;
        expect(headers['Content-Type']).toBeUndefined();
    });

    it('respects existing Content-Type header', async () => {
        await AuthService.fetch('/test', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: 'plain text'
        });

        const headers = global.fetch.mock.calls[0][1].headers;
        expect(headers['Content-Type']).toBe('text/plain');
    });
});
