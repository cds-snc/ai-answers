/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { useErrorStatus } from '../useErrorStatus.js';

const TRANSLATIONS = {
  'admin.database.exportError': 'Export failed: {error}.',
  'admin.database.checkFailed': 'Check {check} failed: {error}.',
  'settings.refreshCache.success': 'Settings cache refreshed.',
};
const t = (key) => TRANSLATIONS[key] || key;

// Tiny host component — buildErrorStatus/renderStatusMessage are plain
// functions returned from the hook, not components themselves, so a host
// is needed to actually mount what renderStatusMessage returns and assert
// on real DOM (role, class, <code lang="en">), the same way
// MetricsDashboard.statusMessage.test.js asserts on StatusMessage's output
// rather than inspecting the returned React element in isolation.
const Host = ({ status, successVariant }) => {
  const { renderStatusMessage } = useErrorStatus(t);
  return renderStatusMessage(status, successVariant);
};

describe('useErrorStatus', () => {
  afterEach(cleanup);

  describe('buildErrorStatus', () => {
    it('splits the template on {error} and sets detail/isError from the error object', () => {
      const { buildErrorStatus } = useErrorStatusForTest();
      const status = buildErrorStatus('admin.database.exportError', new Error('disk full'));

      expect(status).toEqual({
        prefix: 'Export failed: ',
        suffix: '.',
        detail: 'disk full',
        isError: true,
      });
    });

    it('substitutes otherPlaceholders before splitting on {error} (DatabasePage.js checkFailed case)', () => {
      const { buildErrorStatus } = useErrorStatusForTest();
      const status = buildErrorStatus('admin.database.checkFailed', new Error('timeout'), { check: 'duplicateKeys' });

      expect(status.prefix).toBe('Check duplicateKeys failed: ');
      expect(status.suffix).toBe('.');
      expect(status.detail).toBe('timeout');
    });

    it('falls back to String(error) when the thrown value has no usable .message', () => {
      const { buildErrorStatus } = useErrorStatusForTest();

      // A non-Error thrown value (e.g. a rejected fetch with a plain string,
      // or code that does `throw 'oops'`) has no .message at all — detail
      // must still resolve to something renderable, not undefined. An
      // undefined detail would make renderStatusMessage's
      // `detail !== undefined` check fall through to the .text branch,
      // silently dropping the error entirely (see the hook's own comment).
      const status = buildErrorStatus('admin.database.exportError', 'raw string failure');
      expect(status.detail).toBe('raw string failure');

      // An Error whose .message is itself an empty string is falsy, so the
      // `error?.message || String(error)` fallback must not skip past it as
      // if .message were missing entirely.
      const emptyMessageStatus = buildErrorStatus('admin.database.exportError', new Error(''));
      expect(emptyMessageStatus.detail).toBe('Error');
    });
  });

  describe('renderStatusMessage', () => {
    it('renders a null status as nothing', () => {
      const { container } = render(<Host status={null} />);
      expect(container.querySelector('[class*="status-message--"]')).toBeNull();
    });

    it('renders a {text, isError:false} status as plain text with the default success variant', () => {
      render(<Host status={{ text: 'Done.', isError: false }} />);

      const el = screen.getByText('Done.');
      expect(el.className).toContain('status-message--success-box');
      expect(el.textContent).toContain('Done.');
    });

    it('renders a successVariant override (e.g. "info") instead of success for a non-error status', () => {
      // The exact "found by code review" case the hook's own comment flags:
      // SettingsPage.js's cache-refresh success is a neutral confirmation,
      // not a completed mutation, so it renders as 'info' via this param
      // rather than the 'success' default every other caller gets.
      render(<Host status={{ text: 'Settings cache refreshed.', isError: false }} successVariant="info" />);

      const el = screen.getByText('Settings cache refreshed.');
      expect(el.className).toContain('status-message--info-box');
      expect(el.className).not.toContain('status-message--success-box');
    });

    it('renders a buildErrorStatus-shaped status as prefix + <code lang="en">{detail}</code> + suffix with the error variant', () => {
      render(<Host status={{ prefix: 'Export failed: ', suffix: '.', detail: 'disk full', isError: true }} />);

      const el = document.querySelector('.status-message--error-box');
      expect(el).toBeTruthy();
      expect(el.textContent).toBe('Export failed: disk full.');

      const raw = el.querySelector('code[lang="en"]');
      expect(raw).toBeTruthy();
      expect(raw.textContent).toBe('disk full');
    });
  });
});

// buildErrorStatus itself needs no React tree — it's a pure function — so
// tests that only assert on its return value call the hook via a throwaway
// component-free invocation instead of mounting a Host for each one.
function useErrorStatusForTest() {
  let captured;
  function Capture() {
    captured = useErrorStatus(t);
    return null;
  }
  render(<Capture />);
  return captured;
}
