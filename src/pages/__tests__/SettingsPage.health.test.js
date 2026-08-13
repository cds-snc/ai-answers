/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from '../SettingsPage.js';

const {
  mockGetSettings,
  mockGetSetting,
  mockSetSetting,
  mockSetSettings,
  mockRefreshSettingsCache,
  mockGetSettingsAudit,
} = vi.hoisted(() => {
  const healthSettings = {
    'siteStatus': 'available',
    'deploymentMode': 'CDS',
    'vectorServiceType': 'imvectordb',
    'site.baseUrl': '',
    'workflow.default': 'GenericGraph',
    'model.default': 'openai-gpt51',
    'chat.transport': 'sse',
    'guardrail.indigenousLanguageBlocking': 'true',
    'systemHealth.enabled': 'false',
    'systemHealth.checks.database.enabled': 'true',
    'systemHealth.checks.search.enabled': 'true',
    'systemHealth.checks.llm.enabled': 'true',
    'systemHealth.autoDisableOnError': 'true',
    'systemHealth.errorTemplateId': 'tpl-error',
    'systemHealth.failureThreshold': '5',
    'systemHealth.failureWindowMinutes': '5',
    'systemHealth.intervalMinutes': '1',
    'systemHealth.fastIntervalSeconds': '30',
    'systemHealth.alertRecipients': 'ops@example.com;admin@example.com',
    'systemHealth.alertTemplateId': 'tpl-health',
    'twoFA.enabled': 'false',
    'twoFA.templateId': '',
    'notify.resetTemplateId': '',
    'session.defaultTTLMinutes': '60',
    'session.rateLimitCapacity': '60',
    'session.rateLimitRefillPerSec': '1',
    'session.maxActiveSessions': '',
    'session.authenticatedTTLMinutes': '60',
    'session.rateLimitPersistence': 'memory',
    'session.managementEnabled': 'true',
    'session.type': 'memory',
    'metrics.type': 'memory',
    'redaction.profanity.en': 'bad word',
    'redaction.threat.en': 'threat',
    'redaction.manipulation.en': 'manipulation',
    'redaction.profanity.fr': 'mot interdit',
    'redaction.threat.fr': 'menace',
    'redaction.manipulation.fr': 'manipulation',
  };

  return {
    mockGetSettings: vi.fn(async (keys, defaults = {}) => {
      const values = {};
      for (const key of keys) {
        values[key] = Object.prototype.hasOwnProperty.call(healthSettings, key)
          ? healthSettings[key]
          : defaults[key];
      }
      return values;
    }),
    mockGetSetting: vi.fn(async (key, defaultValue = null) => (
      Object.prototype.hasOwnProperty.call(healthSettings, key) ? healthSettings[key] : defaultValue
    )),
    mockSetSetting: vi.fn(async () => ({ message: 'Setting updated' })),
    // Mirrors the real handler's shape: every submitted key/value succeeds
    // and comes back in `values`, `errors` empty.
    mockSetSettings: vi.fn(async (changes) => ({
      values: Object.fromEntries(changes.map(({ key, value }) => [key, value])),
      errors: {},
    })),
    mockRefreshSettingsCache: vi.fn(async () => ({ message: 'Settings cache refreshed' })),
    mockGetSettingsAudit: vi.fn(async () => ({ entries: [], total: 0, filteredTotal: 0 })),
  };
});

vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getSettings: mockGetSettings,
    getSetting: mockGetSetting,
    setSetting: mockSetSetting,
    setSettings: mockSetSettings,
    refreshSettingsCache: mockRefreshSettingsCache,
    getSettingsAudit: mockGetSettingsAudit,
  },
}));

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key) => key,
  }),
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, ...props }) => React.createElement('button', props, children),
  GcdsContainer: ({ children }) => React.createElement('div', null, children),
  GcdsIcon: (props) => React.createElement('span', { ...props, 'aria-hidden': 'true' }),
}));

// The audit history table is an ExperimentalServerDataTable (see
// src/pages/__tests__/ChatDashboardPage.test.js / EvalDashboardPages.test.js
// for the same convention) — mocked shallowly rather than letting the real
// jQuery DataTables library run under jsdom. Capturing the props each render
// passes to the mock lets a test inspect the columns/options config and
// manually drive `options.ajax` the same way the real library would.
let lastDataTableProps = null;

vi.mock('datatables.net-react', () => {
  const MockDataTable = (props) => {
    lastDataTableProps = props;
    return React.createElement('div', { 'data-testid': 'audit-data-table' });
  };
  MockDataTable.use = vi.fn();
  return { default: MockDataTable };
});

vi.mock('datatables.net-dt', () => ({ default: () => null }));

describe('SettingsPage health section', () => {
  beforeEach(() => {
    mockGetSettings.mockClear();
    mockSetSetting.mockClear();
    mockRefreshSettingsCache.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('loads and renders the health controls', async () => {
    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.health.title')).toBeTruthy();
    });

    expect(screen.getByLabelText('settings.health.enabledLabel')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.databaseEnabledLabel')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.searchEnabledLabel')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.llmEnabledLabel')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.autoDisableOnErrorLabel')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.errorTemplateId')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.failureThreshold')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.failureWindowMinutes')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.intervalMinutes')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.fastIntervalSeconds')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.alertRecipients')).toBeTruthy();
    expect(screen.getByLabelText('settings.health.alertTemplateId')).toBeTruthy();

    await waitFor(() => {
      expect(mockGetSettings).toHaveBeenCalledTimes(1);
      expect(mockGetSettings.mock.calls[0][0]).toContain('systemHealth.enabled');
      expect(mockGetSettings.mock.calls[0][0]).toContain('session.rateLimitPersistence');
      expect(mockGetSettings.mock.calls[0][0]).toContain('redaction.profanity.en');
    });
  });
});

describe('SettingsPage audit history', () => {
  beforeEach(() => {
    mockGetSettings.mockClear();
    mockGetSetting.mockClear();
    mockSetSetting.mockClear();
    mockSetSettings.mockClear();
    mockRefreshSettingsCache.mockClear();
    mockGetSettingsAudit.mockClear();
    lastDataTableProps = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('does not save on change — only when the section Save button is clicked', async () => {
    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.health.title')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('settings.health.enabledLabel'), {
      target: { value: 'true' },
    });

    // Nothing persists until the section's Save button is clicked — this is
    // the whole point of moving off auto-save-on-change.
    expect(mockSetSettings).not.toHaveBeenCalled();
  });

  it('enables the health Save button only while a change is pending, and disables it again once saved', async () => {
    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.health.title')).toBeTruthy();
    });

    const saveButton = screen.getByRole('button', { name: 'settings.save settings.health.title' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('settings.health.enabledLabel'), {
      target: { value: 'true' },
    });
    expect(saveButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(saveButton.hasAttribute('disabled')).toBe(true);
    });
  });

  it('clears the save-outcome message once the field is edited again', async () => {
    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.health.title')).toBeTruthy();
    });

    const field = screen.getByLabelText('settings.health.enabledLabel');
    fireEvent.change(field, { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'settings.save settings.health.title' }));

    await waitFor(() => {
      expect(screen.getByText('settings.saveSuccessIn')).toBeTruthy();
    });

    // A save-outcome message describing a state the admin has since changed
    // again would be misleading left on screen.
    fireEvent.change(field, { target: { value: 'false' } });
    expect(screen.queryByText('settings.saveSuccessIn')).toBeNull();
  });

  it('drops a field from pendingChanges (and re-disables Save) once it is edited back to its original value', async () => {
    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.health.title')).toBeTruthy();
    });

    const saveButton = screen.getByRole('button', { name: 'settings.save settings.health.title' });
    const field = screen.getByLabelText('settings.health.enabledLabel');

    // Loaded value is 'false' (see healthSettings above).
    fireEvent.change(field, { target: { value: 'true' } });
    expect(saveButton.hasAttribute('disabled')).toBe(false);

    fireEvent.change(field, { target: { value: 'false' } });
    expect(saveButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(saveButton);
    expect(mockSetSettings).not.toHaveBeenCalled();
  });

  it('renders a search/paginate table with sorting disabled and 10 rows per page', async () => {
    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(lastDataTableProps).toBeTruthy();
    });

    expect(lastDataTableProps.options.ordering).toBe(false);
    expect(lastDataTableProps.options.pageLength).toBe(10);
    expect(lastDataTableProps.options.lengthChange).toBe(false);
    expect(lastDataTableProps.options.searching).toBe(true);
    expect(lastDataTableProps.options.serverSide).toBe(true);

    const columnFields = lastDataTableProps.columns.map((column) => column.data);
    expect(columnFields).toEqual([
      'actorEmail', 'action', 'settingKey', 'previousValue', 'newValue', 'createdAt',
    ]);
  });

  it('fetches a page through DataStoreService and hands back the recordsTotal/recordsFiltered shape DataTables expects', async () => {
    mockGetSettingsAudit.mockResolvedValueOnce({
      entries: [{
        id: '1',
        actorEmail: 'admin@example.com',
        action: 'setting.updated',
        settingKey: 'siteStatus',
        previousValue: 'available',
        newValue: 'unavailable',
        createdAt: '2026-08-11T12:00:00.000Z',
      }],
      total: 5,
      filteredTotal: 1,
    });

    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(lastDataTableProps?.options?.ajax).toBeTruthy();
    });

    const callback = vi.fn();
    await lastDataTableProps.options.ajax(
      { start: 10, length: 10, search: { value: 'unavailable' }, draw: 2 },
      callback
    );

    expect(mockGetSettingsAudit).toHaveBeenCalledWith({ skip: 10, limit: 10, search: 'unavailable' });
    expect(callback).toHaveBeenCalledWith({
      draw: 2,
      recordsTotal: 5,
      recordsFiltered: 1,
      data: expect.any(Array),
    });
  });

  it('escapes and formats each column, and truncates long values behind a disclosure', async () => {
    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(lastDataTableProps).toBeTruthy();
    });

    const columns = Object.fromEntries(lastDataTableProps.columns.map((c) => [c.data, c]));
    expect(columns.actorEmail.render('<b>admin@example.com</b>')).toBe('&lt;b&gt;admin@example.com&lt;/b&gt;');
    expect(columns.action.render('settings.cache_refreshed')).toBe('settings.auditHistory.actions.cacheRefreshed');
    expect(columns.action.render('setting.updated')).toBe('settings.auditHistory.actions.settingUpdated');
    expect(columns.settingKey.render(null)).toBe('settings.auditHistory.notApplicable');
    expect(columns.previousValue.render('short')).toBe('<span class="settings-audit-value">short</span>');

    const longValue = 'x'.repeat(150);
    const longHtml = columns.newValue.render(longValue);
    expect(longHtml).toContain('<details class="settings-audit-value settings-audit-value--long">');
    expect(longHtml).toContain('x'.repeat(120));
  });
});

describe('SettingsPage field errors', () => {
  beforeEach(() => {
    mockGetSettings.mockClear();
    mockSetSettings.mockClear();
    mockGetSettingsAudit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the field-level error next to the field when a save partially fails', async () => {
    // Mirrors what setMany() actually returns for a batch where one field
    // failed validation/write and the rest succeeded — see
    // services/__tests__/SettingsService.test.js for that contract.
    mockSetSettings.mockResolvedValueOnce({
      values: {},
      errors: { 'systemHealth.enabled': 'Not a valid value' },
    });

    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.health.title')).toBeTruthy();
    });

    const field = screen.getByLabelText('settings.health.enabledLabel');
    fireEvent.change(field, { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'settings.save settings.health.title' }));

    await waitFor(() => {
      expect(screen.getByText('Not a valid value')).toBeTruthy();
    });

    // The field is wired to its own error via aria-describedby, not just a
    // generic section-level message.
    expect(field.getAttribute('aria-describedby')).toBe('health-enabled-error');

    // A field that failed stays dirty so the admin can fix and retry — a
    // partial failure must not silently discard the edit.
    const saveButton = screen.getByRole('button', { name: 'settings.save settings.health.title' });
    expect(saveButton.hasAttribute('disabled')).toBe(false);
  });

  it('resolves a structured { i18nKey } error (e.g. alertRecipients validation) through t()', async () => {
    // SettingsService's field validators run server-side with no access to
    // the admin's UI language, so they return a translation key instead of
    // a formatted sentence — see services/SettingsService.js's
    // FIELD_VALIDATORS comment. SettingsPage resolves it via t() before
    // display.
    mockSetSettings.mockResolvedValueOnce({
      values: {},
      errors: {
        'systemHealth.alertRecipients': { i18nKey: 'settings.validation.invalidEmail' },
      },
    });

    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.health.title')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('settings.health.alertRecipients'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'settings.save settings.health.title' }));

    // The mocked t() is an identity function, so the resolved text is the
    // translation key itself — proving the i18nKey was actually passed
    // through t() rather than some raw/untranslated string leaking through.
    await waitFor(() => {
      expect(screen.getByText('settings.validation.invalidEmail')).toBeTruthy();
    });
  });

  it('clears the field error as soon as the field is edited again', async () => {
    mockSetSettings.mockResolvedValueOnce({
      values: {},
      errors: { 'systemHealth.enabled': 'Not a valid value' },
    });

    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.health.title')).toBeTruthy();
    });

    const field = screen.getByLabelText('settings.health.enabledLabel');
    fireEvent.change(field, { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'settings.save settings.health.title' }));

    await waitFor(() => {
      expect(screen.getByText('Not a valid value')).toBeTruthy();
    });

    fireEvent.change(field, { target: { value: 'false' } });

    expect(screen.queryByText('Not a valid value')).toBeNull();
    expect(field.getAttribute('aria-describedby')).toBeNull();
  });
});
