import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { ROUTE_TITLE_KEYS, getTitleKeyForPath } from '../routeTitleKeys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');

// App.js's route table can't be imported directly (its entries carry JSX),
// so this parses the same `path: '...' ... titleKey: '...'` shape straight
// out of the source text and diffs it against routeTitleKeys.js's map. This
// is the guard against the two silently drifting apart - see the warning at
// the top of routeTitleKeys.js.
const extractRouteTitleKeysFromAppJs = () => {
  const found = {};
  const pattern = /path:\s*'([^']+)'[^}]*?titleKey:\s*'([^']+)'/g;
  let match;
  while ((match = pattern.exec(appJsSource)) !== null) {
    const [, routePath, titleKey] = match;
    // The `*` wildcard 404 route is deliberately not in ROUTE_TITLE_KEYS -
    // see the "Deliberately NOT covered" note in routeTitleKeys.js.
    if (routePath === '*') continue;
    found[routePath] = titleKey;
  }
  return found;
};

describe('routeTitleKeys', () => {
  it('matches every titleKey App.js declares on its route table', () => {
    const fromAppJs = extractRouteTitleKeysFromAppJs();

    // Sanity check the extraction itself found a realistic number of routes,
    // so a change to App.js's formatting that breaks the regex fails loudly
    // here instead of this test silently asserting against an empty object.
    expect(Object.keys(fromAppJs).length).toBeGreaterThan(30);

    expect(ROUTE_TITLE_KEYS).toEqual(fromAppJs);
  });

  it('derives paths from ROUTE_SLUGS rather than hand-typed strings (a slug rename flows through)', () => {
    // Spot-check both languages of a route whose FR slug differs from EN.
    expect(ROUTE_TITLE_KEYS['/en/chat-viewer']).toBe('logging.title');
    expect(ROUTE_TITLE_KEYS['/fr/visualiseur-de-clavardage']).toBe('logging.title');
    // Every key is a real getPath()-shaped path: /<lang>/<slug>[...]
    for (const routePath of Object.keys(ROUTE_TITLE_KEYS)) {
      expect(routePath).toMatch(/^\/(en|fr)\/[^/]/);
    }
  });

  it('resolves the two dynamic-segment experimental routes regardless of the id value', () => {
    expect(getTitleKeyForPath('/en/experimental/analysis/abc123')).toBe('experimental.results.title');
    expect(getTitleKeyForPath('/fr/experimental/suites-de-tests/xyz')).toBe('experimental.suite.title');
  });

  it('returns null for routes with no titleKey (falls back to the generic site title)', () => {
    expect(getTitleKeyForPath('/en/about')).toBeNull();
    expect(getTitleKeyForPath('/en')).toBeNull();
    expect(getTitleKeyForPath('/en/some-unknown-path')).toBeNull();
  });

  it('ignores a trailing slash', () => {
    expect(getTitleKeyForPath('/en/admin/')).toBe('admin.title');
  });
});
