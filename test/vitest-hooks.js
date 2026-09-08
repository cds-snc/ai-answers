import { beforeEach, afterEach } from 'vitest';
import { reset } from './setup.js';

beforeEach(async () => {
  await reset();
  if (typeof document !== 'undefined') {
    // The site-wide live regions (src/utils/liveAnnouncer.js) echo whatever
    // a page just announced, so without this every `getByText('Saved')`
    // would match twice — the visible box and the echo. Keep *ByText
    // queries on page content; assert announcements through
    // test/liveAnnouncer.js's waitForAnnouncement instead.
    const { configure } = await import('@testing-library/react');
    configure({ defaultIgnore: 'script, style, [data-live-announcer], [data-live-announcer] *' });
  }
});

afterEach(async () => {
  // Unmount anything React Testing Library rendered. Without this, rendered DOM
  // persists across tests in a file and `screen` queries (which read
  // document.body) can match a previous test's markup. Imported lazily and
  // guarded on `document` because this setup file also runs for
  // node-environment suites, where importing RTL would fail.
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
    // The site-wide live regions live on document.body, outside anything
    // RTL rendered, so cleanup() doesn't reach them — drop them and any
    // pending announcement timers so text can't leak into the next test.
    // importActual: some suites vi.mock() this module with only `announce`,
    // and a mocked module has no resetLiveAnnouncer to call.
    const { vi } = await import('vitest');
    const { resetLiveAnnouncer } = await vi.importActual('../src/utils/liveAnnouncer.js');
    resetLiveAnnouncer();
  }
  await reset();
});
