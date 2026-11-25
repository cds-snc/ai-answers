/**
 * CORS for the API (AIA-022).
 *
 * The session cookie is scoped to the parent domain so the English and French
 * hosts (ai-answers.* and reponses-ia.*) can share a sign-in. That also sends
 * the cookie to every other sibling of that parent. Reflecting whatever Origin
 * the browser sent, with credentials, lets any of those siblings read
 * authenticated responses. Credentialed CORS is therefore limited to the host
 * that received the request and its language partner on the same parent.
 *
 * The canada.ca banner reads chat-session-availability from another origin and
 * does not send cookies. That one route stays readable cross-origin, without
 * credentials. Wildcard origins cannot be combined with cookies; a GET or
 * HEAD that carries a Cookie header skips CORS so a user-specific body is
 * never paired with Access-Control-Allow-Origin: *. An OPTIONS preflight has
 * no body and is still answered, including when the request has cookies.
 */

import cors from 'cors';
import { parseHttpUrl } from '../api/util/parseHttpUrl.js';

// First host label of each language site. Swapping it yields the partner host
// on the same parent (ai-answers.alpha.canada.ca ↔ reponses-ia.alpha.canada.ca,
// and the same pair on any other environment).
const LANGUAGE_HOST_LABELS = {
  'ai-answers': 'reponses-ia',
  'reponses-ia': 'ai-answers',
};

const AVAILABILITY_PATH = '/api/chat/chat-session-availability';

const PUBLIC_AVAILABILITY_CORS = cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'HEAD'],
});

function endDeniedPreflight(res) {
  res.statusCode = 204;
  res.setHeader('Content-Length', '0');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function isLoopback(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

// An Origin header is only a scheme, host, and optional port. parseHttpUrl
// accepts any http(s) URL, so a path, query, or hash is rejected here.
function parseOrigin(originHeader) {
  const parsed = parseHttpUrl(originHeader);
  if (!parsed || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
  const hostname = parsed.hostname.replace(/\.$/, '').toLowerCase();
  if (!hostname) return null;
  return { protocol: parsed.protocol, hostname, port: parsed.port, origin: parsed.origin };
}

function parseHost(hostHeader) {
  if (typeof hostHeader !== 'string' || /[\u0000-\u0020]/.test(hostHeader)) return null;
  const parsed = parseHttpUrl(`http://${hostHeader}`);
  if (!parsed || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
  const hostname = parsed.hostname.replace(/\.$/, '').toLowerCase();
  if (!hostname) return null;
  return { hostname, port: parsed.port };
}

function languageSibling(hostname) {
  const dot = hostname.indexOf('.');
  const label = dot === -1 ? hostname : hostname.slice(0, dot);
  const partner = LANGUAGE_HOST_LABELS[label];
  if (!partner) return null;
  return dot === -1 ? partner : `${partner}${hostname.slice(dot)}`;
}

function portsMatch(origin, hostPort) {
  const defaultPort = origin.protocol === 'https:' ? '443' : '80';
  return (origin.port || defaultPort) === (hostPort || defaultPort);
}

/**
 * Normalized origin to reflect with credentials, or null when the request
 * must not receive a credentialed CORS response.
 *
 * @param {string|undefined} originHeader
 * @param {string|undefined} hostHeader
 * @param {string} [nodeEnv]
 * @returns {string|null}
 */
export function credentialedCorsOrigin(originHeader, hostHeader, nodeEnv = process.env.NODE_ENV) {
  const origin = parseOrigin(originHeader);
  const host = parseHost(hostHeader);
  if (!origin || !host) return null;
  if (origin.protocol === 'http:' && !isLoopback(origin.hostname) && nodeEnv !== 'development' && nodeEnv !== 'test') {
    return null;
  }
  if (!portsMatch(origin, host.port)) return null;

  const sameHost = origin.hostname === host.hostname;
  const partnerHost = origin.hostname === languageSibling(host.hostname);
  if (!sameHost && !partnerHost) return null;
  return origin.origin;
}

export function isPublicAvailabilityRequest(method, pathName) {
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') return false;
  return (pathName || '').split('?')[0] === AVAILABILITY_PATH;
}

// Preflight is answered here, as it was when cors() covered every route, so
// OPTIONS never reaches a handler that would treat it as a real API call.
export function corsMiddleware(req, res, next) {
  // Same-origin navigations often omit Origin. A cache that stored that
  // response could reuse it for the language-partner host, which needs CORS
  // headers for a cross-origin font or module script.
  res.setHeader('Vary', 'Origin');

  const originHeader = req.headers.origin;
  const reflected = credentialedCorsOrigin(originHeader, req.headers.host);
  if (reflected) {
    return cors({ origin: reflected, credentials: true })(req, res, next);
  }

  const pathName = (req.originalUrl || req.url || '').split('?')[0];
  if (originHeader && isPublicAvailabilityRequest(req.method, pathName)) {
    // Skip only the actual response. Preflight must be answered here so
    // OPTIONS never reaches a handler, and it carries no body to expose.
    if (req.headers.cookie && req.method !== 'OPTIONS') {
      return next();
    }
    return PUBLIC_AVAILABILITY_CORS(req, res, next);
  }

  if (req.method === 'OPTIONS') {
    endDeniedPreflight(res);
    return;
  }

  next();
}
