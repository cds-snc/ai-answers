/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionPage from '../SessionPage.js';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const { mockGetSessionMetrics } = vi.hoisted(() => ({
  mockGetSessionMetrics: vi.fn(),
}));

vi.mock('../../services/SessionService.js', () => ({
  default: { getSessionMetrics: mockGetSessionMetrics },
}));

// A stable `t` reference matters here: SessionPage's fetchSessions is a
// useCallback keyed on [t], and the mocked usePausablePolling below re-fires
// its effect whenever that callback's identity changes — a fresh arrow
// function per render would cause an infinite refetch loop instead of
// settling on the error/loading state under test.
const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

vi.mock('../../hooks/usePauseToggle.js', () => ({
  // Run the fetch once, immediately, with no real polling interval — keeps
  // the test deterministic and fast.
  usePausablePolling: (fetchFn) => {
    React.useEffect(() => { fetchFn(); }, [fetchFn]);
    return { isPaused: false, togglePause: () => {} };
  },
}));

vi.mock('../../components/admin/PauseToggleButton.js', () => ({
  default: () => null,
}));

vi.mock('datatables.net-react', () => {
  const MockDataTable = ({ children }) => <div>{children}</div>;
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});

vi.mock('datatables.net-dt', () => ({ default: () => null }));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
  GcdsText: ({ children }) => <div>{children}</div>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
}));

describe('SessionPage StatusMessage roles', () => {
  afterEach(() => {
    cleanup();
    mockGetSessionMetrics.mockReset();
  });

  it('announces a fetch error as role="alert"', async () => {
    mockGetSessionMetrics.mockRejectedValue(new Error('network down'));

    renderWithRouter(<SessionPage lang="en" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('admin.session.errorGeneric');
  });

  it('announces the loading state as role="status" with the loading spinner box', async () => {
    // Never resolves during the assertion window, so `loading` stays true.
    mockGetSessionMetrics.mockReturnValue(new Promise(() => {}));

    renderWithRouter(<SessionPage lang="en" />);

    await waitFor(() => {
      const status = screen.getByText('admin.filters.loading').closest('[role="status"]');
      expect(status).toBeTruthy();
      expect(status.className).toContain('status-message--loading');
    });
  });
});
