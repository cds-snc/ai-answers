/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useErrorStatus } from '../useErrorStatus.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';
import { getAnnouncedTexts } from '../../utils/liveAnnouncer.js';

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

    it('warns in dev when the locale key has no {error} placeholder', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { buildErrorStatus } = useErrorStatusForTest();

      buildErrorStatus('settings.refreshCache.success', new Error('boom'));

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('settings.refreshCache.success'));
      errorSpy.mockRestore();
    });
  });

  describe('wrapErrorDetail', () => {
    it('returns the same prefix/suffix/isError as buildErrorStatus, with detail pre-wrapped in <code lang="en">', () => {
      const { wrapErrorDetail } = useErrorStatusForTest();
      const wrapped = wrapErrorDetail('admin.database.exportError', new Error('disk full'));

      expect(wrapped.prefix).toBe('Export failed: ');
      expect(wrapped.suffix).toBe('.');
      expect(wrapped.isError).toBe(true);
      expect(React.isValidElement(wrapped.detail)).toBe(true);
      expect(wrapped.detail.type).toBe('code');
      expect(wrapped.detail.props.lang).toBe('en');
      expect(wrapped.detail.props.children).toBe('disk full');
    });

    it('renders correctly for a caller that builds its own fragment instead of renderStatusMessage', () => {
      const { wrapErrorDetail } = useErrorStatusForTest();
      const wrapped = wrapErrorDetail('admin.database.exportError', new Error('disk full'));

      const { container } = render(<>{wrapped.prefix}{wrapped.detail}{wrapped.suffix}</>);

      expect(container.textContent).toBe('Export failed: disk full.');
      const raw = container.querySelector('code[lang="en"]');
      expect(raw.textContent).toBe('disk full');
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

  // Regression: a fresh object with identical text (what every call site
  // rebuilds on a repeat outcome) must still bump the nonce.
  describe('renderStatusMessage nonce', () => {
    it('re-announces a second status object with identical text', async () => {
      const { rerender } = render(<Host status={{ text: 'Failed.', isError: true }} />);
      await waitForAnnouncement('Failed.', 'assertive');

      rerender(<Host status={{ text: 'Failed.', isError: true }} />);
      await waitFor(() => {
        expect(getAnnouncedTexts('assertive').filter((t) => t === 'Failed.')).toHaveLength(2);
      });
    });

    it('does not re-announce when rerendered with the same status object', async () => {
      const status = { text: 'Done.', isError: false };
      const { rerender } = render(<Host status={status} />);
      await waitForAnnouncement('Done.');

      rerender(<Host status={status} extra="unrelated prop change" />);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(getAnnouncedTexts('polite').filter((t) => t === 'Done.')).toHaveLength(1);
    });

    // DatabasePage.js renders ~13 of these off one hook instance.
    it('tracks nonce independently per `key`, so sibling boxes on the same hook instance do not interfere', () => {
      const TwoBoxHost = ({ statusA, statusB }) => {
        const { renderStatusMessage } = useErrorStatus(t);
        return (
          <>
            {renderStatusMessage(statusA, 'success', 'a')}
            {renderStatusMessage(statusB, 'success', 'b')}
          </>
        );
      };
      render(<TwoBoxHost statusA={{ text: 'A done.', isError: false }} statusB={{ text: 'B done.', isError: false }} />);
      expect(screen.getByText('A done.')).toBeTruthy();
      expect(screen.getByText('B done.')).toBeTruthy();
    });

    it('warns when two call sites in the same render share a key (or the default)', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const CollidingHost = () => {
        const { renderStatusMessage } = useErrorStatus(t);
        return (
          <>
            {renderStatusMessage({ text: 'A done.', isError: false })}
            {renderStatusMessage({ text: 'B done.', isError: false })}
          </>
        );
      };
      render(<CollidingHost />);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('key "default"'));
      errorSpy.mockRestore();
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
