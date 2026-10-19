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

describe('AuthService sign-in steps: failure reasons', () => {
    let origFetch;
    beforeEach(() => { origFetch = global.fetch; });
    afterEach(() => { global.fetch = origFetch; vi.resetAllMocks(); });

    const respond = (status, json) => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => json });
    };
    const reasonOf = (promise) => promise.then(() => 'resolved', (err) => err.reason);
    const steps = [
        ['login', () => AuthService.login('a@canada.ca', 'pw')],
        ['verify2FA', () => AuthService.verify2FA('123456')],
        ['send2FA', () => AuthService.send2FA()],
    ];

    it.each(steps)('%s: no response at all is "network", not a wrong password or code', async (_name, call) => {
        global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        expect(await reasonOf(call())).toBe('network');
    });

    it.each(steps)('%s: a 5xx without a reason is "server_error"', async (_name, call) => {
        respond(500, { error: 'boom' });
        expect(await reasonOf(call())).toBe('server_error');
        global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } });
        expect(await reasonOf(call())).toBe('server_error');
    });

    it.each(steps)("%s: the server's own reason wins", async (_name, call) => {
        respond(429, { reason: 'locked' });
        expect(await reasonOf(call())).toBe('locked');
    });

    it('a 401 with no reason stays null, which the page reads as wrong credentials', async () => {
        respond(401, { message: 'Invalid credentials' });
        expect(await reasonOf(AuthService.login('a@canada.ca', 'bad'))).toBeNull();
    });
});
