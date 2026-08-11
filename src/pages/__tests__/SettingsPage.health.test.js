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
    mockRefreshSettingsCache: vi.fn(async () => ({ message: 'Settings cache refreshed' })),
    mockGetSettingsAudit: vi.fn(async () => ({ entries: [], total: 0, hasMore: false })),
  };
});

vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getSettings: mockGetSettings,
    getSetting: mockGetSetting,
    setSetting: mockSetSetting,
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
  GcdsDetails: ({ children, detailsTitle }) => React.createElement(
    'section',
    null,
    React.createElement('h2', null, detailsTitle),
    children
  ),
}));

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
    mockRefreshSettingsCache.mockClear();
    mockGetSettingsAudit.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('reloads the history after a setting is saved', async () => {
    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(mockGetSettingsAudit).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText('settings.health.enabledLabel'), {
      target: { value: 'true' },
    });

    await waitFor(() => {
      expect(mockSetSetting).toHaveBeenCalledWith('systemHealth.enabled', 'true');
    });

    // The saved change should show up in the table without a page reload,
    // and the refresh starts from the newest page.
    await waitFor(() => {
      expect(mockGetSettingsAudit).toHaveBeenCalledTimes(2);
    });
    expect(mockGetSettingsAudit).toHaveBeenLastCalledWith({ limit: 50, skip: 0, before: null });
  });

  it('anchors load more to the first page and announces the new count', async () => {
    const entry = (id, createdAt) => ({
      id,
      actorEmail: 'admin@example.com',
      action: 'setting.updated',
      settingKey: 'siteStatus',
      previousValue: 'available',
      newValue: 'unavailable',
      createdAt,
    });

    mockGetSettingsAudit
      .mockResolvedValueOnce({
        entries: [entry('1', '2026-08-11T12:00:00.000Z')],
        total: 2,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        entries: [entry('2', '2026-08-10T09:00:00.000Z')],
        total: 2,
        hasMore: false,
      });

    render(React.createElement(SettingsPage, { lang: 'en' }));

    await waitFor(() => {
      expect(screen.getByText('settings.auditHistory.loadMore')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('settings.auditHistory.loadMore'));

    // The next page is pinned to the newest row of the first page, so an entry
    // recorded in between cannot shift rows into a repeat.
    await waitFor(() => {
      expect(mockGetSettingsAudit).toHaveBeenLastCalledWith({
        limit: 50,
        skip: 1,
        before: '2026-08-11T12:00:00.000Z',
      });
    });

    // Disabling the focused button while loading would blur it and drop a
    // keyboard user back to <body> on every page but the last.
    expect(screen.queryByText('settings.auditHistory.loadMore')?.hasAttribute('disabled')).not.toBe(true);

    // Appending rows is silent for a screen reader unless the count is
    // announced, and the Load more button unmounts on the last page.
    const count = await screen.findByText('settings.auditHistory.showing');
    expect(count.getAttribute('role')).toBe('status');
    await waitFor(() => {
      expect(screen.queryByText('settings.auditHistory.loadMore')).toBeNull();
      expect(document.activeElement).toBe(count);
    });
  });
});
