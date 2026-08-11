import { beforeEach, afterEach } from 'vitest';
import { reset } from './setup.js';

beforeEach(async () => {
  await reset();
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
  }
  await reset();
});
