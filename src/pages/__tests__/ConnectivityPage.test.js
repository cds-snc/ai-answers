/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ConnectivityPage from '../ConnectivityPage.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';
import { formatNumber } from '../../utils/numberFormat.js';

const { mockGetSettingStrict, mockSetSetting } = vi.hoisted(() => {
  const connectivitySettings = {
    'connectivity.simulation.database': 'false',
    'connectivity.simulation.search': 'false',
    'connectivity.simulation.llm': 'false',
  };

  return {
    mockGetSettingStrict: vi.fn(async (key, defaultValue = null) => (
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
    getSettingStrict: mockGetSettingStrict,
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
    mockGetSettingStrict.mockClear();
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

    const databaseButton = within(
      screen.getByRole('group', { name: 'connectivity.simulation.labels.database' })
    ).getByRole('button', { name: 'connectivity.simulation.on' });
    // Off until the settings have loaded.
    await waitFor(() => expect(databaseButton.getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(databaseButton);

    await waitFor(() => {
      expect(mockSetSetting).toHaveBeenCalledWith('connectivity.simulation.database', 'true');
    });
  });
});

describe('ConnectivityPage StatusMessage roles', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetSettingStrict.mockClear();
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

    await waitForAnnouncement('boom', 'assertive');
  });

  it('translates each service badge and formats latency for the page language', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        summary: { connected: 1, errors: 1, warnings: 0, notConfigured: 1 },
        timestamp: new Date().toISOString(),
        services: [
          { service: 'MongoDB', status: 'connected', message: 'ok', latencyMs: 1234 },
          { service: 'Search', status: 'error', message: 'down' },
          { service: 'Azure', status: 'not_configured', message: 'n/a' },
        ],
      }),
    });

    render(<ConnectivityPage lang="fr" />);
    fireEvent.click(await screen.findByText('connectivity.runTests'));

    await screen.findByText('MongoDB');
    expect(screen.getByRole('heading', { level: 2, name: 'connectivity.summaryHeading' })).toBeTruthy();
    // Label before number, so screen readers say "Connected, 1".
    const pairs = [...document.querySelectorAll('dl > div')]
      .map((row) => [...row.children].map((el) => `${el.tagName}:${el.textContent.trim()}`));
    expect(pairs[0]).toEqual(['DT:connectivity.connected', 'DD:1']);
    expect(pairs).toHaveLength(4);
    const badges = [...document.querySelectorAll('[data-status]')].map((el) => el.textContent);
    expect(badges).toEqual(['connectivity.connected', 'connectivity.statusError', 'connectivity.notConfigured']);
    expect(screen.queryByText(/not configured/i)).toBeNull();
    // Server text is English only; marked so a French screen reader reads it as English.
    expect(screen.getByRole('heading', { level: 3, name: 'MongoDB' }).getAttribute('lang')).toBe('en');
    expect(screen.getByText('ok').getAttribute('lang')).toBe('en');
    // Page-language number (fr-CA: "1 234"), then a spaced unit.
    expect(screen.getByText(/connectivity\.latency/).textContent)
      .toBe(`connectivity.latency ${formatNumber(1234, 'fr')} connectivity.millisecondsUnit`);
  });

  it('announces the test summary politely after a successful run', async () => {
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

    fireEvent.click(screen.getByText('connectivity.runTests'));

    await waitForAnnouncement('connectivity.testComplete');
    expect(document.querySelector('.status-message--error-box')).toBeNull();
  });
});

describe('ConnectivityPage failure simulation: a compact On/Off row per service', () => {
  let settings;
  beforeEach(() => {
    settings = {
      'connectivity.simulation.database': 'false',
      'connectivity.simulation.search': 'true',
      'connectivity.simulation.llm': 'false',
    };
    mockGetSettingStrict.mockImplementation(async (key, defaultValue = null) => settings[key] ?? defaultValue);
    mockSetSetting.mockImplementation(async (key, value) => { settings[key] = value; return {}; });
  });

  afterEach(() => {
    cleanup();
    mockGetSettingStrict.mockReset();
    mockSetSetting.mockReset();
  });

  const pair = (service) => {
    const group = within(screen.getByRole('group', { name: `connectivity.simulation.labels.${service}` }));
    return {
      fail: group.getByRole('button', { name: 'connectivity.simulation.on' }),
      normal: group.getByRole('button', { name: 'connectivity.simulation.off' }),
    };
  };
  const pressed = (service) => {
    const { fail, normal } = pair(service);
    return [fail.getAttribute('aria-pressed'), normal.getAttribute('aria-pressed')];
  };
  const whenLoaded = () => waitFor(() => expect(pair('database').fail.getAttribute('aria-disabled')).toBeNull());

  it('presses the option in effect for each service', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();

    // The section heading names the set; each service names its On | Off pair.
    const outer = screen.getByRole('group', { name: 'connectivity.simulation.title' });
    expect(within(outer).getAllByRole('group')).toHaveLength(3);

    expect(pressed('search')).toEqual(['true', 'false']);
    expect(pressed('database')).toEqual(['false', 'true']);
    expect(pressed('llm')).toEqual(['false', 'true']);
  });

  it('keeps both buttons off until the settings load, pressing neither', async () => {
    let release;
    mockGetSettingStrict.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    render(<ConnectivityPage lang="en" />);

    const { fail, normal } = pair('database');
    expect(fail.getAttribute('aria-disabled')).toBe('true');
    expect(normal.getAttribute('aria-disabled')).toBe('true');
    expect(pressed('database')).toEqual(['false', 'false']);
    fireEvent.click(fail);
    expect(mockSetSetting).not.toHaveBeenCalled();
    release('false');
  });

  it('shows an error and keeps the buttons off when the settings fail to load', async () => {
    mockGetSettingStrict.mockRejectedValue(new Error('load boom'));
    render(<ConnectivityPage lang="en" />);

    await waitForAnnouncement('connectivity.simulation.loadFailed', 'assertive');
    expect(pair('database').fail.getAttribute('aria-disabled')).toBe('true');
  });

  it('switches a service on and off, announcing each change', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();

    fireEvent.click(pair('database').fail);
    await waitFor(() => expect(pressed('database')).toEqual(['true', 'false']));
    expect(settings['connectivity.simulation.database']).toBe('true');
    await waitForAnnouncement('connectivity.simulation.announceOn');

    await whenLoaded();
    fireEvent.click(pair('database').normal);
    await waitFor(() => expect(pressed('database')).toEqual(['false', 'true']));
    expect(settings['connectivity.simulation.database']).toBe('false');
    await waitForAnnouncement('connectivity.simulation.announceOff');
  });

  it('shows the saved value without reading it back', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();
    const loadReads = mockGetSettingStrict.mock.calls.length;
    // A read-back that failed used to fall back to "false" and show Off.
    mockGetSettingStrict.mockRejectedValue(new Error('read boom'));

    fireEvent.click(pair('database').fail);

    await waitForAnnouncement('connectivity.simulation.announceOn');
    expect(pressed('database')).toEqual(['true', 'false']);
    expect(mockGetSettingStrict.mock.calls.length).toBe(loadReads);
  });

  it('does nothing when the option already in effect is clicked', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();

    fireEvent.click(pair('database').normal);
    fireEvent.click(pair('search').fail);
    expect(mockSetSetting).not.toHaveBeenCalled();
  });

  it('shows a save failure and keeps the old state', async () => {
    mockSetSetting.mockRejectedValue(new Error('save boom'));
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();

    fireEvent.click(pair('database').fail);

    await waitForAnnouncement('connectivity.simulation.saveFailed', 'assertive');
    expect(pressed('database')).toEqual(['false', 'true']);
  });
});
