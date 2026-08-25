/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConnectivityPage from '../ConnectivityPage.js';

const { mockGetSetting, mockSetSetting } = vi.hoisted(() => {
  const connectivitySettings = {
    'connectivity.simulation.database': 'false',
    'connectivity.simulation.search': 'false',
    'connectivity.simulation.llm': 'false',
  };

  return {
    mockGetSetting: vi.fn(async (key, defaultValue = null) => (
      Object.prototype.hasOwnProperty.call(connectivitySettings, key) ? connectivitySettings[key] : defaultValue
    )),
    mockSetSetting: vi.fn(async (key, value) => {
      connectivitySettings[key] = value;
      return { message: 'Setting updated' };
    }),
  };
});

vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getSetting: mockGetSetting,
    setSetting: mockSetSetting,
  },
}));

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  }),
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, ...props }) => <button {...props}>{children}</button>,
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children, ...props }) => <p {...props}>{children}</p>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('ConnectivityPage simulation controls', () => {
  beforeEach(() => {
    mockGetSetting.mockClear();
    mockSetSetting.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads simulation settings and toggles the selected service', async () => {
    render(<ConnectivityPage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('connectivity.simulation.title')).toBeTruthy();
    });

    expect(screen.getByText('common.backToAdmin')).toBeTruthy();

    const databaseButton = screen.getByRole('button', {
      name: 'connectivity.simulation.labels.database connectivity.simulation.enable',
    });
    fireEvent.click(databaseButton);

    await waitFor(() => {
      expect(mockSetSetting).toHaveBeenCalledWith('connectivity.simulation.database', 'true');
    });
  });
});

describe('ConnectivityPage StatusMessage roles', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetSetting.mockClear();
    mockSetSetting.mockClear();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it('announces a failed test run as role="alert"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });

    render(<ConnectivityPage lang="en" />);
    await waitFor(() => screen.getByText('connectivity.runTests'));
    fireEvent.click(screen.getByText('connectivity.runTests'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('boom');
  });

  it('mounts the test-summary region persistently and fills it as role="status" after a successful run', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        summary: { connected: 3, errors: 0, warnings: 0, notConfigured: 0 },
        timestamp: new Date().toISOString(),
        services: [],
      }),
    });

    render(<ConnectivityPage lang="en" />);
    await waitFor(() => screen.getByText('connectivity.runTests'));

    // Persistent: the sr-only status region exists before any test has run.
    const statusRegions = screen.getAllByRole('status');
    expect(statusRegions.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('connectivity.runTests'));

    await waitFor(() => {
      expect(screen.getByText('connectivity.testComplete')).toBeTruthy();
    });
    expect(screen.getByText('connectivity.testComplete').closest('[role="status"]')).toBeTruthy();
  });
});
