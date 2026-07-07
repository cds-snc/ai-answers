import { describe, expect, it } from 'vitest';
import {
  PUBLIC_AUTH_ALWAYS_EXEMPT_PATHS,
  PUBLIC_HOME_ROUTE_PATHS,
  getPublicAuthExemptPaths,
  isPublicAuthExemptPath,
} from '../appRoutePaths.js';

describe('appRoutePaths', () => {
  it('treats the home routes as public when chat does not require auth', () => {
    const publicPaths = getPublicAuthExemptPaths(false);

    expect(publicPaths.has('/')).toBe(true);
    expect(publicPaths.has('/en')).toBe(true);
    expect(publicPaths.has('/fr')).toBe(true);

    for (const path of PUBLIC_HOME_ROUTE_PATHS) {
      expect(publicPaths.has(path)).toBe(true);
    }
  });

  it('keeps the always-exempt auth and about routes public even when chat requires auth', () => {
    const protectedPaths = getPublicAuthExemptPaths(true);

    for (const path of PUBLIC_HOME_ROUTE_PATHS) {
      expect(protectedPaths.has(path)).toBe(false);
    }

    for (const path of PUBLIC_AUTH_ALWAYS_EXEMPT_PATHS) {
      expect(protectedPaths.has(path)).toBe(true);
    }
  });

  it('normalizes trailing slashes when checking exempt paths', () => {
    expect(isPublicAuthExemptPath('/en/')).toBe(true);
    expect(isPublicAuthExemptPath('/fr/')).toBe(true);
    expect(isPublicAuthExemptPath('/en/signin/')).toBe(true);
    expect(isPublicAuthExemptPath('/fr/deconnexion/')).toBe(true);
  });

  it('treats the home routes as protected when chat requires auth', () => {
    expect(isPublicAuthExemptPath('/', true)).toBe(false);
    expect(isPublicAuthExemptPath('/en', true)).toBe(false);
    expect(isPublicAuthExemptPath('/fr', true)).toBe(false);
  });

  it('keeps always-exempt routes public regardless of the auth requirement', () => {
    expect(isPublicAuthExemptPath('/en/signin', false)).toBe(true);
    expect(isPublicAuthExemptPath('/en/signin', true)).toBe(true);
    expect(isPublicAuthExemptPath('/fr/a-propos', false)).toBe(true);
    expect(isPublicAuthExemptPath('/fr/a-propos', true)).toBe(true);
  });
});
