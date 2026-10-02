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

// Keys by default; a test can give one key a real template to check what's
// filled in.
const mockTemplates = {};
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => mockTemplates[key] ?? key,
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

  it('announces all four summary counts, including not configured', async () => {
    mockTemplates['connectivity.testComplete'] = 'done {connected}/{errors}/{warnings}/{notConfigured}';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        summary: { connected: 2, errors: 1, warnings: 0, notConfigured: 1 },
        timestamp: new Date().toISOString(),
        services: [],
      }),
    });

    try {
      render(<ConnectivityPage lang="en" />);
      fireEvent.click(await screen.findByText('connectivity.runTests'));
      await waitForAnnouncement('done 2/1/0/1');
    } finally {
      delete mockTemplates['connectivity.testComplete'];
    }
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

describe('ConnectivityPage failure simulation re-runs the test when results are showing', () => {
  const originalFetch = global.fetch;
  let settings;
  const okResponse = () => ({
    ok: true,
    status: 200,
    json: async () => ({
      summary: { connected: 3, errors: 0, warnings: 0, notConfigured: 0 },
      timestamp: new Date().toISOString(),
      services: [],
    }),
  });

  beforeEach(() => {
    settings = {
      'connectivity.simulation.database': 'false',
      'connectivity.simulation.search': 'false',
      'connectivity.simulation.llm': 'false',
    };
    mockGetSettingStrict.mockImplementation(async (key, defaultValue = null) => settings[key] ?? defaultValue);
    mockSetSetting.mockImplementation(async (key, value) => { settings[key] = value; return {}; });
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    mockGetSettingStrict.mockReset();
    mockSetSetting.mockReset();
  });

  const onButton = (service) => within(
    screen.getByRole('group', { name: `connectivity.simulation.labels.${service}` })
  ).getByRole('button', { name: 'connectivity.simulation.on' });
  const whenLoaded = () => waitFor(() => expect(onButton('database').getAttribute('aria-disabled')).toBeNull());
  const runOnce = async () => {
    fireEvent.click(screen.getByText('connectivity.runTests'));
    await screen.findByRole('heading', { level: 2, name: 'connectivity.summaryHeading' });
    await waitFor(() => expect(screen.getByText('connectivity.runTests')).toBeTruthy());
  };

  it('re-runs the test after a toggle saves, keeping focus on the toggle', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();
    await runOnce();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const toggle = onButton('database');
    toggle.focus();
    fireEvent.click(toggle);

    await waitForAnnouncement('connectivity.simulation.announceOn');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitForAnnouncement('connectivity.testComplete');
    expect(document.activeElement).toBe(onButton('database'));
  });

  it('only saves when no results are showing yet', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();

    fireEvent.click(onButton('database'));

    await waitForAnnouncement('connectivity.simulation.announceOn');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not re-run when the save fails', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();
    await runOnce();
    mockSetSetting.mockRejectedValue(new Error('save boom'));

    fireEvent.click(onButton('database'));

    await waitForAnnouncement('connectivity.simulation.saveFailed', 'assertive');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('dims the results with a scoped overlay while a re-run replaces them', async () => {
    const { container } = render(<ConnectivityPage lang="en" />);
    await whenLoaded();

    let finishFirst;
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    fireEvent.click(screen.getByText('connectivity.runTests'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    // First run: no results to cover yet.
    expect(container.querySelector('.loading-overlay')).toBeNull();
    finishFirst(okResponse());
    await screen.findByRole('heading', { level: 2, name: 'connectivity.summaryHeading' });
    await waitFor(() => expect(screen.getByText('connectivity.runTests')).toBeTruthy());

    let finishRerun;
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => { finishRerun = resolve; }));
    fireEvent.click(onButton('database'));
    const overlay = await waitFor(() => {
      const el = container.querySelector('.connectivity-results > .loading-overlay--scoped');
      expect(el).not.toBeNull();
      return el;
    });
    expect(overlay.textContent).toBe('connectivity.testing');

    finishRerun(okResponse());
    await waitFor(() => expect(container.querySelector('.loading-overlay')).toBeNull());
  });

  it('re-runs when the first run finishes while a toggle is still saving', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();

    let finishRun;
    global.fetch.mockImplementationOnce(() => new Promise((resolve) => { finishRun = resolve; }));
    let finishSave;
    mockSetSetting.mockImplementationOnce((key, value) => new Promise((resolve) => {
      finishSave = () => { settings[key] = value; resolve({}); };
    }));

    // No results yet: start a run, then change a toggle while it runs.
    fireEvent.click(screen.getByText('connectivity.runTests'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(onButton('database'));
    await waitFor(() => expect(mockSetSetting).toHaveBeenCalled());

    // The run finishes first, then the save.
    finishRun(okResponse());
    await screen.findByRole('heading', { level: 2, name: 'connectivity.summaryHeading' });
    finishSave();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('runs once more after the current run when toggles change during it', async () => {
    render(<ConnectivityPage lang="en" />);
    await whenLoaded();
    await runOnce();

    const pending = [];
    global.fetch.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));

    fireEvent.click(onButton('database'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    fireEvent.click(onButton('search'));
    await waitFor(() => expect(mockSetSetting).toHaveBeenCalledWith('connectivity.simulation.search', 'true'));
    fireEvent.click(onButton('llm'));
    await waitFor(() => expect(mockSetSetting).toHaveBeenCalledWith('connectivity.simulation.llm', 'true'));
    // Two changes during the run - still only one more run queued.
    expect(global.fetch).toHaveBeenCalledTimes(2);

    pending[0](okResponse());
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    pending[1](okResponse());
    await waitForAnnouncement('connectivity.testComplete');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
