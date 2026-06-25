/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from '../SettingsPage.js';

const { mockGetSetting, mockSetSetting, mockRefreshSettingsCache } = vi.hoisted(() => {
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
    'session.authenticatedRateLimitCapacity': '100',
    'session.authenticatedRateLimitRefillPerSec': '5',
    'session.maxActiveSessions': '',
    'session.authenticatedTTLMinutes': '60',
    'session.rateLimitPersistence': 'memory',
    'session.managementEnabled': 'true',
    'session.type': 'memory',
    'metrics.type': 'memory',
  };

  return {
    mockGetSetting: vi.fn(async (key, defaultValue = null) => (
      Object.prototype.hasOwnProperty.call(healthSettings, key) ? healthSettings[key] : defaultValue
    )),
    mockSetSetting: vi.fn(async () => ({ message: 'Setting updated' })),
    mockRefreshSettingsCache: vi.fn(async () => ({ message: 'Settings cache refreshed' })),
  };
});

vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getSetting: mockGetSetting,
    setSetting: mockSetSetting,
    refreshSettingsCache: mockRefreshSettingsCache,
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
    mockGetSetting.mockClear();
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
      expect(mockGetSetting.mock.calls.some(([key]) => key === 'systemHealth.enabled')).toBe(true);
      expect(mockGetSetting.mock.calls.some(([key]) => key === 'systemHealth.checks.database.enabled')).toBe(true);
      expect(mockGetSetting.mock.calls.some(([key]) => key === 'systemHealth.checks.search.enabled')).toBe(true);
      expect(mockGetSetting.mock.calls.some(([key]) => key === 'systemHealth.checks.llm.enabled')).toBe(true);
      expect(mockGetSetting.mock.calls.some(([key]) => key === 'systemHealth.autoDisableOnError')).toBe(true);
      expect(mockGetSetting.mock.calls.some(([key]) => key === 'systemHealth.errorTemplateId')).toBe(true);
      expect(mockGetSetting.mock.calls.some(([key]) => key === 'systemHealth.fastIntervalSeconds')).toBe(true);
      expect(mockGetSetting.mock.calls.some(([key]) => key === 'systemHealth.alertRecipients')).toBe(true);
    });
  });
});
