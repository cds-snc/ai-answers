import { describe, expect, it } from 'vitest';
import { corsMiddleware, credentialedCorsOrigin, isPublicAvailabilityRequest } from '../corsPolicy.js';

const EN = 'ai-answers.alpha.canada.ca';
const FR = 'reponses-ia.alpha.canada.ca';

function run(req) {
  const headers = {};
  const res = {
    statusCode: null,
    ended: false,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    end() { this.ended = true; },
  };
  let nextCalled = false;
  corsMiddleware(req, res, () => { nextCalled = true; });
  return { headers, res, nextCalled };
}

describe('credentialedCorsOrigin', () => {
  it('reflects the request host and its language partner', () => {
    expect(credentialedCorsOrigin(`https://${EN}`, EN, 'production')).toBe(`https://${EN}`);
    expect(credentialedCorsOrigin(`https://${FR}`, EN, 'production')).toBe(`https://${FR}`);
    expect(credentialedCorsOrigin(`https://${EN}`, FR, 'production')).toBe(`https://${EN}`);
  });

  it('reflects the same pair on other environments, including an explicit https port', () => {
    expect(credentialedCorsOrigin(
      'https://reponses-ia.cdssandbox.xyz',
      'ai-answers.cdssandbox.xyz',
      'production'
    )).toBe('https://reponses-ia.cdssandbox.xyz');
    expect(credentialedCorsOrigin(`https://${EN}:443`, EN, 'production')).toBe(`https://${EN}`);
  });

  it('allows a loopback dev server and a preview host only for itself', () => {
    expect(credentialedCorsOrigin('http://localhost:3000', 'localhost:3000', 'production')).toBe('http://localhost:3000');
    expect(credentialedCorsOrigin('http://[::1]:3000', '[::1]:3000', 'production')).toBe('http://[::1]:3000');
    const preview = 'abc123.lambda-url.ca-central-1.on.aws';
    expect(credentialedCorsOrigin(`https://${preview}`, preview, 'production')).toBe(`https://${preview}`);
    expect(credentialedCorsOrigin('https://other.lambda-url.ca-central-1.on.aws', preview, 'production')).toBeNull();
  });

  it('rejects sibling sites, lookalikes, and credentialed http in production', () => {
    const rejected = [
      ['https://evil.alpha.canada.ca', EN],
      ['https://www.canada.ca', EN],
      ['https://ai-answers.alpha.canada.ca.evil.example', EN],
      ['https://notai-answers.alpha.canada.ca', EN],
      ['https://ai-answers.evil.alpha.canada.ca', EN],
      ['http://ai-answers.alpha.canada.ca', EN],
      [`https://${EN}:444`, EN],
      ['https://ai-answers.alpha.canada.ca/api', EN],
      ['null', EN],
      [`https://${EN}`, 'evil.alpha.canada.ca'],
    ];
    for (const [origin, host] of rejected) {
      expect(credentialedCorsOrigin(origin, host, 'production')).toBeNull();
    }
  });
});

describe('isPublicAvailabilityRequest', () => {
  it('matches only the banner availability route', () => {
    expect(isPublicAvailabilityRequest('GET', '/api/chat/chat-session-availability')).toBe(true);
    expect(isPublicAvailabilityRequest('GET', '/api/chat/chat-session-availability?x=1')).toBe(true);
    expect(isPublicAvailabilityRequest('POST', '/api/chat/chat-session-availability')).toBe(false);
    expect(isPublicAvailabilityRequest('GET', '/api/db/db-chat-logs')).toBe(false);
  });
});

describe('corsMiddleware', () => {
  it('sends credentials only for an allowed origin, and reflects the normalized origin', () => {
    const allowed = run({
      method: 'GET',
      url: '/api/db/db-chat-logs',
      originalUrl: '/api/db/db-chat-logs',
      headers: { origin: `https://${FR}`, host: EN },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(`https://${FR}`);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowed.headers.vary).toBe('Origin');
    expect(allowed.nextCalled).toBe(true);

    const denied = run({
      method: 'GET',
      url: '/api/db/db-chat-logs',
      originalUrl: '/api/db/db-chat-logs',
      headers: { origin: 'https://evil.alpha.canada.ca', host: EN },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(denied.headers['access-control-allow-credentials']).toBeUndefined();
    expect(denied.nextCalled).toBe(true);
  });

  it('lets any origin read availability, without credentials', () => {
    const result = run({
      method: 'GET',
      url: '/api/chat/chat-session-availability',
      originalUrl: '/api/chat/chat-session-availability',
      headers: { origin: 'https://www.canada.ca', host: EN },
    });
    expect(result.headers['access-control-allow-origin']).toBe('*');
    expect(result.headers['access-control-allow-credentials']).toBeUndefined();
    expect(result.nextCalled).toBe(true);
  });

  it('does not pair availability with a wildcard when the request has cookies', () => {
    const result = run({
      method: 'GET',
      url: '/api/chat/chat-session-availability',
      originalUrl: '/api/chat/chat-session-availability',
      headers: {
        origin: 'https://www.canada.ca',
        host: EN,
        cookie: 'connect.sid=abc',
      },
    });
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
    expect(result.nextCalled).toBe(true);
  });

  it('advertises only GET and HEAD on the public availability preflight', () => {
    const result = run({
      method: 'OPTIONS',
      url: '/api/chat/chat-session-availability',
      originalUrl: '/api/chat/chat-session-availability',
      headers: { origin: 'https://www.canada.ca', host: EN },
    });
    expect(result.headers['access-control-allow-origin']).toBe('*');
    expect(result.headers['access-control-allow-methods']).toBe('GET,HEAD');
    expect(result.res.ended).toBe(true);
    expect(result.nextCalled).toBe(false);
  });

  it('answers an allowed preflight with credentials for the language partner', () => {
    const result = run({
      method: 'OPTIONS',
      url: '/api/db/db-chat-logs',
      originalUrl: '/api/db/db-chat-logs',
      headers: { origin: `https://${FR}`, host: EN },
    });
    expect(result.headers['access-control-allow-origin']).toBe(`https://${FR}`);
    expect(result.headers['access-control-allow-credentials']).toBe('true');
    expect(result.res.ended).toBe(true);
    expect(result.nextCalled).toBe(false);
  });

  it('answers a disallowed preflight without CORS headers and without calling next', () => {
    const result = run({
      method: 'OPTIONS',
      url: '/api/user/user-users',
      originalUrl: '/api/user/user-users',
      headers: { origin: 'https://evil.alpha.canada.ca', host: EN },
    });
    expect(result.res.statusCode).toBe(204);
    expect(result.res.ended).toBe(true);
    expect(result.headers['content-length']).toBe('0');
    expect(result.headers.vary).toBe('Origin');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
    expect(result.headers['access-control-allow-credentials']).toBeUndefined();
    expect(result.nextCalled).toBe(false);
  });

  it('does not add CORS headers when the request has no Origin', () => {
    const result = run({
      method: 'GET',
      url: '/api/user/user-users',
      originalUrl: '/api/user/user-users',
      headers: { host: EN },
    });
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
    expect(result.nextCalled).toBe(true);
  });
});
