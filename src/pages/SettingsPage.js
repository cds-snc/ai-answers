import React, { useEffect, useState } from 'react';
import { GcdsButton, GcdsContainer, GcdsDetails } from '@gcds-core/components-react';
import DataStoreService from '../services/DataStoreService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { WORKFLOWS, AVAILABLE_MODELS, WORKFLOW_VALUES } from '../config/workflows.js';

const normalizeChatTransport = (value) => (
  ['sse', 'ndjson'].includes(value) ? value : 'sse'
);

const SettingsPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [status, setStatus] = useState('available');
  const [saving, setSaving] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState('CDS');
  const [savingDeployment, setSavingDeployment] = useState(false);
  const [vectorServiceType, setVectorServiceType] = useState('imvectordb');
  const [savingVectorType, setSavingVectorType] = useState(false);
  const [refreshingSettingsCache, setRefreshingSettingsCache] = useState(false);
  const [settingsCacheMessage, setSettingsCacheMessage] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [savingBaseUrl, setSavingBaseUrl] = useState(false);

  // Global default workflow setting (Default | DefaultWithVector | DefaultWithVectorGraph)
  const [defaultWorkflow, setDefaultWorkflow] = useState('GenericGraph');
  const [savingDefaultWorkflow, setSavingDefaultWorkflow] = useState(false);

  // Default model setting — decoupled from workflow so model upgrades are a Settings change
  const [defaultModel, setDefaultModel] = useState('openai-gpt51');
  const [savingDefaultModel, setSavingDefaultModel] = useState(false);
  const [chatTransport, setChatTransport] = useState('sse');
  const [savingChatTransport, setSavingChatTransport] = useState(false);

  // Canadian Indigenous language blocking guardrail (on by default)
  const [indigenousLanguageBlocking, setIndigenousLanguageBlocking] = useState('true');
  const [savingIndigenousLanguageBlocking, setSavingIndigenousLanguageBlocking] = useState(false);

  // Health monitoring settings
  const [healthEnabled, setHealthEnabled] = useState('false');
  const [savingHealthEnabled, setSavingHealthEnabled] = useState(false);
  const [healthDatabaseEnabled, setHealthDatabaseEnabled] = useState('true');
  const [savingHealthDatabaseEnabled, setSavingHealthDatabaseEnabled] = useState(false);
  const [healthSearchEnabled, setHealthSearchEnabled] = useState('true');
  const [savingHealthSearchEnabled, setSavingHealthSearchEnabled] = useState(false);
  const [healthLlmEnabled, setHealthLlmEnabled] = useState('true');
  const [savingHealthLlmEnabled, setSavingHealthLlmEnabled] = useState(false);
  const [healthAutoDisableOnError, setHealthAutoDisableOnError] = useState('true');
  const [savingHealthAutoDisableOnError, setSavingHealthAutoDisableOnError] = useState(false);
  const [healthErrorTemplateId, setHealthErrorTemplateId] = useState('');
  const [savingHealthErrorTemplateId, setSavingHealthErrorTemplateId] = useState(false);
  const [healthFailureThreshold, setHealthFailureThreshold] = useState(5);
  const [savingHealthFailureThreshold, setSavingHealthFailureThreshold] = useState(false);
  const [healthFailureWindowMinutes, setHealthFailureWindowMinutes] = useState(5);
  const [savingHealthFailureWindowMinutes, setSavingHealthFailureWindowMinutes] = useState(false);
  const [healthIntervalMinutes, setHealthIntervalMinutes] = useState(1);
  const [savingHealthIntervalMinutes, setSavingHealthIntervalMinutes] = useState(false);
  const [healthAlertRecipients, setHealthAlertRecipients] = useState('');
  const [savingHealthAlertRecipients, setSavingHealthAlertRecipients] = useState(false);
  const [healthAlertTemplateId, setHealthAlertTemplateId] = useState('');
  const [savingHealthAlertTemplateId, setSavingHealthAlertTemplateId] = useState(false);



  // Two-factor authentication settings
  const [twoFAEnabled, setTwoFAEnabled] = useState('false');
  const [savingTwoFAEnabled, setSavingTwoFAEnabled] = useState(false);
  const [twoFATemplateId, setTwoFATemplateId] = useState('');
  const [savingTwoFATemplateId, setSavingTwoFATemplateId] = useState(false);
  // GC Notify template ID for password reset link emails
  const [resetTemplateId, setResetTemplateId] = useState('');
  const [savingResetTemplateId, setSavingResetTemplateId] = useState(false);

  // Session-related settings
  const [sessionTTL, setSessionTTL] = useState(60); // minutes
  const [savingSessionTTL, setSavingSessionTTL] = useState(false);
  const [sessionAuthTTL, setSessionAuthTTL] = useState(60); // minutes for authenticated users
  const [savingSessionAuthTTL, setSavingSessionAuthTTL] = useState(false);
  const [rateLimitCapacity, setRateLimitCapacity] = useState(60);
  const [savingRateLimitCapacity, setSavingRateLimitCapacity] = useState(false);
  const [rateLimitRefill, setRateLimitRefill] = useState(1);
  const [savingRateLimitRefill, setSavingRateLimitRefill] = useState(false);
  // Rate-limiter persistence mode (memory | mongo)
  const [rateLimitPersistence, setRateLimitPersistence] = useState('memory');
  const [savingRateLimitPersistence, setSavingRateLimitPersistence] = useState(false);
  // Authenticated session rate-limit settings
  const [authRateLimitCapacity, setAuthRateLimitCapacity] = useState(100);
  const [savingAuthRateLimitCapacity, setSavingAuthRateLimitCapacity] = useState(false);
  const [authRateLimitRefill, setAuthRateLimitRefill] = useState(5);
  const [savingAuthRateLimitRefill, setSavingAuthRateLimitRefill] = useState(false);
  const [maxActiveSessions, setMaxActiveSessions] = useState('');
  const [savingMaxActiveSessions, setSavingMaxActiveSessions] = useState(false);
  const [sessionManagementEnabled, setSessionManagementEnabled] = useState('true');
  const [savingSessionManagementEnabled, setSavingSessionManagementEnabled] = useState(false);
  // Session store type (memory | mongo)
  const [sessionStoreType, setSessionStoreType] = useState('memory');
  const [savingSessionStoreType, setSavingSessionStoreType] = useState(false);
  // Metrics store type (memory | mongo)
  const [metricsStoreType, setMetricsStoreType] = useState('memory');
  const [savingMetricsStoreType, setSavingMetricsStoreType] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const current = await DataStoreService.getSetting('siteStatus', 'available');
      setStatus(current);
      const mode = await DataStoreService.getSetting('deploymentMode', 'CDS');
      setDeploymentMode(mode);
      const type = await DataStoreService.getSetting('vectorServiceType', 'imvectordb');
      setVectorServiceType(type);
      const url = await DataStoreService.getSetting('site.baseUrl', '');
      setBaseUrl(url ?? '');
      // Load default workflow setting
      const defaultWorkflowSetting = await DataStoreService.getSetting('workflow.default', 'GenericGraph');
      // Validate default workflow against known options
      const allowedWorkflows = WORKFLOW_VALUES;
      setDefaultWorkflow(allowedWorkflows.includes(defaultWorkflowSetting) ? defaultWorkflowSetting : 'GenericGraph');
      // Load default model setting (seeded server-side on startup if missing)
      const defaultModelSetting = await DataStoreService.getSetting('model.default', AVAILABLE_MODELS[0].value);
      setDefaultModel(defaultModelSetting || AVAILABLE_MODELS[0].value);
      const chatTransportSetting = await DataStoreService.getSetting('chat.transport', 'sse');
      setChatTransport(normalizeChatTransport(chatTransportSetting));

      const indigenousBlockingSetting = await DataStoreService.getSetting('guardrail.indigenousLanguageBlocking', 'true');
      setIndigenousLanguageBlocking(String(indigenousBlockingSetting ?? 'true'));

      const healthEnabledSetting = await DataStoreService.getSetting('systemHealth.enabled', 'false');
      setHealthEnabled(String(healthEnabledSetting ?? 'false'));
      const healthDatabaseSetting = await DataStoreService.getSetting('systemHealth.checks.database.enabled', 'true');
      setHealthDatabaseEnabled(String(healthDatabaseSetting ?? 'true'));
      const healthSearchSetting = await DataStoreService.getSetting('systemHealth.checks.search.enabled', 'true');
      setHealthSearchEnabled(String(healthSearchSetting ?? 'true'));
      const healthLlmSetting = await DataStoreService.getSetting('systemHealth.checks.llm.enabled', 'true');
      setHealthLlmEnabled(String(healthLlmSetting ?? 'true'));
      const healthAutoDisableSetting = await DataStoreService.getSetting('systemHealth.autoDisableOnError', 'true');
      setHealthAutoDisableOnError(String(healthAutoDisableSetting ?? 'true'));
      const healthErrorTemplateSetting = await DataStoreService.getSetting('systemHealth.errorTemplateId', '');
      setHealthErrorTemplateId(healthErrorTemplateSetting ?? '');
      const healthThresholdSetting = await DataStoreService.getSetting('systemHealth.failureThreshold', '5');
      setHealthFailureThreshold(Number(healthThresholdSetting));
      const healthWindowSetting = await DataStoreService.getSetting('systemHealth.failureWindowMinutes', '5');
      setHealthFailureWindowMinutes(Number(healthWindowSetting));
      const healthIntervalSetting = await DataStoreService.getSetting('systemHealth.intervalMinutes', '1');
      setHealthIntervalMinutes(Number(healthIntervalSetting));
      const healthAlertRecipientsSetting = await DataStoreService.getSetting('systemHealth.alertRecipients', '');
      setHealthAlertRecipients(healthAlertRecipientsSetting ?? '');
      const healthAlertTemplateSetting = await DataStoreService.getSetting('systemHealth.alertTemplateId', '');
      setHealthAlertTemplateId(healthAlertTemplateSetting ?? '');

      const twoFAEnabledSetting = await DataStoreService.getSetting('twoFA.enabled', 'false');
      setTwoFAEnabled(String(twoFAEnabledSetting ?? 'false'));
      const twoFATemplateSetting = await DataStoreService.getSetting('twoFA.templateId', '');
      setTwoFATemplateId(twoFATemplateSetting ?? '');
      const resetTpl = await DataStoreService.getSetting('notify.resetTemplateId', '');
      setResetTemplateId(resetTpl ?? '');
      // Load session settings
      const ttl = await DataStoreService.getSetting('session.defaultTTLMinutes', '60');
      setSessionTTL(Number(ttl));
      const capacity = await DataStoreService.getSetting('session.rateLimitCapacity', '60');
      setRateLimitCapacity(Number(capacity));
      // Stored value is refill per minute (no conversion)
      const refill = await DataStoreService.getSetting('session.rateLimitRefillPerSec', '60');
      setRateLimitRefill(Number(refill));
      // Authenticated rate-limit settings
      const authCap = await DataStoreService.getSetting('session.authenticatedRateLimitCapacity', '100');
      setAuthRateLimitCapacity(Number(authCap));
      const authRefill = await DataStoreService.getSetting('session.authenticatedRateLimitRefillPerSec', '300');
      setAuthRateLimitRefill(Number(authRefill));
      const maxSessions = await DataStoreService.getSetting('session.maxActiveSessions', '');
      setMaxActiveSessions(maxSessions === 'undefined' ? '' : maxSessions);
      const authTtl = await DataStoreService.getSetting('session.authenticatedTTLMinutes', '60');
      setSessionAuthTTL(Number(authTtl));
      // Load rate-limiter persistence mode
      const persistence = await DataStoreService.getSetting('session.rateLimitPersistence', 'memory');
      const persistenceNorm = (persistence || '').toString().trim().toLowerCase();
      setRateLimitPersistence(persistenceNorm === 'mongo' ? 'mongo' : 'memory');
      const managementEnabled = await DataStoreService.getSetting('session.managementEnabled', 'true');
      setSessionManagementEnabled(String(managementEnabled ?? 'true'));
      // Load session store type (memory | mongo)
      const storeType = await DataStoreService.getSetting('session.type', 'memory');
      const storeNorm = (storeType || '').toString().trim().toLowerCase();
      setSessionStoreType(['mongo', 'mongodb', 'redis'].includes(storeNorm) ? storeNorm : 'memory');

      // Load metrics store type (memory | mongo)
      const metricsType = await DataStoreService.getSetting('metrics.type', 'memory');
      const metricsNorm = (metricsType || '').toString().trim().toLowerCase();
      setMetricsStoreType(metricsNorm === 'mongo' || metricsNorm === 'mongodb' ? 'mongo' : 'memory');
    }
    loadSettings();
  }, []);

  // Helper to save a setting and read it back to confirm persistence.
  const saveAndVerify = async (key, value, readTransform = (v) => v) => {
    await DataStoreService.setSetting(key, value);
    const current = await DataStoreService.getSetting(key, value);
    return readTransform(current);
  };

  const saveHealthSetting = async ({ key, value, setValue, setSaving, readTransform = (v) => v }) => {
    setValue(value);
    setSaving(true);
    try {
      const current = await saveAndVerify(key, value, readTransform);
      setValue(current);
      return current;
    } finally {
      setSaving(false);
    }
  };

  // Session handlers
  const handleSessionTTLChange = async (e) => {
    const val = Number(e.target.value);
    setSessionTTL(val);
    setSavingSessionTTL(true);
    try {
      const current = await saveAndVerify('session.defaultTTLMinutes', String(val), (v) => Number(v));
      setSessionTTL(Number(current));
    } finally {
      setSavingSessionTTL(false);
    }
  };

  const handleSessionAuthTTLChange = async (e) => {
    const val = Number(e.target.value);
    setSessionAuthTTL(val);
    setSavingSessionAuthTTL(true);
    try {
      const current = await saveAndVerify('session.authenticatedTTLMinutes', String(val), (v) => Number(v));
      setSessionAuthTTL(Number(current));
    } finally {
      setSavingSessionAuthTTL(false);
    }
  };

  const handleRateLimitCapacityChange = async (e) => {
    const val = Number(e.target.value);
    setRateLimitCapacity(val);
    setSavingRateLimitCapacity(true);
    try {
      const current = await saveAndVerify('session.rateLimitCapacity', String(val), (v) => Number(v));
      setRateLimitCapacity(Number(current));
    } finally {
      setSavingRateLimitCapacity(false);
    }
  };

  const handleAuthRateLimitCapacityChange = async (e) => {
    const val = Number(e.target.value);
    setAuthRateLimitCapacity(val);
    setSavingAuthRateLimitCapacity(true);
    try {
      const current = await saveAndVerify('session.authenticatedRateLimitCapacity', String(val), (v) => Number(v));
      setAuthRateLimitCapacity(Number(current));
    } finally {
      setSavingAuthRateLimitCapacity(false);
    }
  };

  const handleRateLimitRefillChange = async (e) => {
    const val = Number(e.target.value);
    setRateLimitRefill(val);
    setSavingRateLimitRefill(true);
    try {
      await DataStoreService.setSetting('session.rateLimitRefillPerSec', String(val));
      const saved = await DataStoreService.getSetting('session.rateLimitRefillPerSec', String(val));
      setRateLimitRefill(Number(saved));
    } finally {
      setSavingRateLimitRefill(false);
    }
  };

  const handleAuthRateLimitRefillChange = async (e) => {
    const val = Number(e.target.value);
    setAuthRateLimitRefill(val);
    setSavingAuthRateLimitRefill(true);
    try {
      await DataStoreService.setSetting('session.authenticatedRateLimitRefillPerSec', String(val));
      const saved = await DataStoreService.getSetting('session.authenticatedRateLimitRefillPerSec', String(val));
      setAuthRateLimitRefill(Number(saved));
    } finally {
      setSavingAuthRateLimitRefill(false);
    }
  };

  const handleMaxActiveSessionsChange = async (e) => {
    const val = e.target.value;
    setMaxActiveSessions(val);
    setSavingMaxActiveSessions(true);
    try {
      const current = await saveAndVerify('session.maxActiveSessions', val, (v) => (v === 'undefined' ? '' : v));
      setMaxActiveSessions(current);
    } finally {
      setSavingMaxActiveSessions(false);
    }
  };

  const handleRateLimitPersistenceChange = async (e) => {
    const val = e.target.value;
    setRateLimitPersistence(val);
    setSavingRateLimitPersistence(true);
    try {
      // store as 'mongo' or 'memory'
      const current = await saveAndVerify('session.rateLimitPersistence', val, (v) => ((v || '').toString().trim().toLowerCase() === 'mongo' ? 'mongo' : 'memory'));
      setRateLimitPersistence(current);
    } catch (error) {
      console.error('Failed to save rate-limiter persistence:', error);
    } finally {
      setSavingRateLimitPersistence(false);
    }
  };

  const handleSessionManagementEnabledChange = async (e) => {
    const val = e.target.value;
    setSessionManagementEnabled(val);
    setSavingSessionManagementEnabled(true);
    try {
      const current = await saveAndVerify('session.managementEnabled', val, (v) => String(v ?? 'true'));
      setSessionManagementEnabled(String(current));
    } finally {
      setSavingSessionManagementEnabled(false);
    }
  };

  const handleSessionStoreTypeChange = async (e) => {
    const val = e.target.value;
    setSessionStoreType(val);
    setSavingSessionStoreType(true);
    try {
      const current = await saveAndVerify('session.type', val, (v) => {
        const n = (v || '').toString().trim().toLowerCase();
        return ['mongo', 'mongodb', 'redis'].includes(n) ? n : 'memory';
      });
      setSessionStoreType(current);
    } finally {
      setSavingSessionStoreType(false);
    }
  };

  const handleMetricsStoreTypeChange = async (e) => {
    const val = e.target.value;
    setMetricsStoreType(val);
    setSavingMetricsStoreType(true);
    try {
      const current = await saveAndVerify('metrics.type', val, (v) => {
        const n = (v || '').toString().trim().toLowerCase();
        return n === 'mongo' || n === 'mongodb' ? 'mongo' : 'memory';
      });
      setMetricsStoreType(current);
    } finally {
      setSavingMetricsStoreType(false);
    }
  };

  const handleChange = async (e) => {
    const newStatus = e.target.value;
    setStatus(newStatus);
    setSaving(true);
    try {
      const current = await saveAndVerify('siteStatus', newStatus);
      setStatus(current);
    } finally {
      setSaving(false);
    }
  };

  const handleDeploymentModeChange = async (e) => {
    const newMode = e.target.value;
    setDeploymentMode(newMode);
    setSavingDeployment(true);
    try {
      const current = await saveAndVerify('deploymentMode', newMode);
      setDeploymentMode(current);
    } finally {
      setSavingDeployment(false);
    }
  };

  const handleRefreshSettingsCache = async () => {
    setRefreshingSettingsCache(true);
    setSettingsCacheMessage('');
    try {
      await DataStoreService.refreshSettingsCache();
      setSettingsCacheMessage(t('settings.refreshCache.success'));
    } catch (error) {
      setSettingsCacheMessage(t('settings.refreshCache.error').replace('{error}', error.message));
    } finally {
      setRefreshingSettingsCache(false);
    }
  };



  const handleBaseUrlChange = (e) => {
    setBaseUrl(e.target.value);
  };

  const handleBaseUrlBlur = async () => {
    setSavingBaseUrl(true);
    try {
      const current = await saveAndVerify('site.baseUrl', baseUrl, (v) => v ?? '');
      setBaseUrl(current);
    } finally {
      setSavingBaseUrl(false);
    }
  };

  const handleTwoFAEnabledChange = async (e) => {
    const newValue = e.target.value;
    setTwoFAEnabled(newValue);
    setSavingTwoFAEnabled(true);
    try {
      const current = await saveAndVerify('twoFA.enabled', newValue);
      setTwoFAEnabled(String(current ?? 'false'));
    } finally {
      setSavingTwoFAEnabled(false);
    }
  };

  const handleTwoFATemplateIdChange = (e) => {
    setTwoFATemplateId(e.target.value);
  };

  const handleTwoFATemplateIdBlur = async () => {
    setSavingTwoFATemplateId(true);
    try {
      const current = await saveAndVerify('twoFA.templateId', twoFATemplateId, (v) => v ?? '');
      setTwoFATemplateId(current);
    } finally {
      setSavingTwoFATemplateId(false);
    }
  };

  const handleIndigenousLanguageBlockingChange = async (e) => {
    const newValue = e.target.value;
    setIndigenousLanguageBlocking(newValue);
    setSavingIndigenousLanguageBlocking(true);
    try {
      const current = await saveAndVerify('guardrail.indigenousLanguageBlocking', newValue);
      setIndigenousLanguageBlocking(String(current ?? 'true'));
    } finally {
      setSavingIndigenousLanguageBlocking(false);
    }
  };

  const handleHealthEnabledChange = async (e) => saveHealthSetting({
    key: 'systemHealth.enabled',
    value: e.target.value,
    setValue: setHealthEnabled,
    setSaving: setSavingHealthEnabled,
    readTransform: (v) => String(v ?? 'true'),
  });

  const handleHealthDatabaseEnabledChange = async (e) => saveHealthSetting({
    key: 'systemHealth.checks.database.enabled',
    value: e.target.value,
    setValue: setHealthDatabaseEnabled,
    setSaving: setSavingHealthDatabaseEnabled,
    readTransform: (v) => String(v ?? 'true'),
  });

  const handleHealthSearchEnabledChange = async (e) => saveHealthSetting({
    key: 'systemHealth.checks.search.enabled',
    value: e.target.value,
    setValue: setHealthSearchEnabled,
    setSaving: setSavingHealthSearchEnabled,
    readTransform: (v) => String(v ?? 'true'),
  });

  const handleHealthLlmEnabledChange = async (e) => saveHealthSetting({
    key: 'systemHealth.checks.llm.enabled',
    value: e.target.value,
    setValue: setHealthLlmEnabled,
    setSaving: setSavingHealthLlmEnabled,
    readTransform: (v) => String(v ?? 'true'),
  });

  const handleHealthAutoDisableOnErrorChange = async (e) => saveHealthSetting({
    key: 'systemHealth.autoDisableOnError',
    value: e.target.value,
    setValue: setHealthAutoDisableOnError,
    setSaving: setSavingHealthAutoDisableOnError,
    readTransform: (v) => String(v ?? 'true'),
  });

  const handleHealthErrorTemplateIdChange = (e) => {
    setHealthErrorTemplateId(e.target.value);
  };

  const handleHealthErrorTemplateIdBlur = async () => {
    setSavingHealthErrorTemplateId(true);
    try {
      const current = await saveAndVerify('systemHealth.errorTemplateId', healthErrorTemplateId, (v) => v ?? '');
      setHealthErrorTemplateId(current);
    } finally {
      setSavingHealthErrorTemplateId(false);
    }
  };

  const handleHealthFailureThresholdChange = async (e) => saveHealthSetting({
    key: 'systemHealth.failureThreshold',
    value: String(Number(e.target.value)),
    setValue: setHealthFailureThreshold,
    setSaving: setSavingHealthFailureThreshold,
    readTransform: (v) => Number(v),
  });

  const handleHealthFailureWindowMinutesChange = async (e) => saveHealthSetting({
    key: 'systemHealth.failureWindowMinutes',
    value: String(Number(e.target.value)),
    setValue: setHealthFailureWindowMinutes,
    setSaving: setSavingHealthFailureWindowMinutes,
    readTransform: (v) => Number(v),
  });

  const handleHealthIntervalMinutesChange = async (e) => saveHealthSetting({
    key: 'systemHealth.intervalMinutes',
    value: String(Number(e.target.value)),
    setValue: setHealthIntervalMinutes,
    setSaving: setSavingHealthIntervalMinutes,
    readTransform: (v) => Number(v),
  });

  const handleHealthAlertRecipientsChange = (e) => {
    setHealthAlertRecipients(e.target.value);
  };

  const handleHealthAlertRecipientsBlur = async () => {
    setSavingHealthAlertRecipients(true);
    try {
      const current = await saveAndVerify('systemHealth.alertRecipients', healthAlertRecipients, (v) => v ?? '');
      setHealthAlertRecipients(current);
    } finally {
      setSavingHealthAlertRecipients(false);
    }
  };

  const handleHealthAlertTemplateIdChange = (e) => {
    setHealthAlertTemplateId(e.target.value);
  };

  const handleHealthAlertTemplateIdBlur = async () => {
    setSavingHealthAlertTemplateId(true);
    try {
      const current = await saveAndVerify('systemHealth.alertTemplateId', healthAlertTemplateId, (v) => v ?? '');
      setHealthAlertTemplateId(current);
    } finally {
      setSavingHealthAlertTemplateId(false);
    }
  };

  const handleResetTemplateIdChange = (e) => {
    setResetTemplateId(e.target.value);
  };

  const handleResetTemplateIdBlur = async () => {
    setSavingResetTemplateId(true);
    try {
      const current = await saveAndVerify('notify.resetTemplateId', resetTemplateId, (v) => v ?? '');
      setResetTemplateId(current);
    } finally {
      setSavingResetTemplateId(false);
    }
  };

  return (
    <GcdsContainer layout="page" tag="main" className="mb-600">
      <h1 className="mb-400">{t('settings.title')}</h1>
      <nav className="mb-400">
        <a href={`/${lang}/admin`}>{t('common.backToAdmin')}</a>
      </nav>
      <div className="mb-400">
        <GcdsButton
          type="button"
          variant="secondary"
          onClick={handleRefreshSettingsCache}
          disabled={refreshingSettingsCache}
        >
          {refreshingSettingsCache ? t('settings.refreshCache.loading') : t('settings.refreshCache.label')}
        </GcdsButton>
        {settingsCacheMessage ? <p className="mt-200">{settingsCacheMessage}</p> : null}
      </div>
      <GcdsDetails detailsTitle={t('settings.general.title')} className="mb-400" tabIndex="0">
        <div>
          <label htmlFor="site-status" className="mb-200 display-block">
            {t('settings.statusLabel')}
          </label>
          <select id="site-status" value={status} onChange={handleChange} disabled={saving}>
            <option value="available">{t('settings.statuses.available')}</option>
            <option value="unavailable">{t('settings.statuses.unavailable')}</option>
          </select>

          <label htmlFor="base-url" className="mb-200 display-block mt-400">
            {t('settings.baseUrlLabel')}
          </label>
          <input
            id="base-url"
            type="text"
            value={baseUrl}
            onChange={handleBaseUrlChange}
            onBlur={handleBaseUrlBlur}
            disabled={savingBaseUrl}
            className="w-full"
          />

          <label htmlFor="deployment-mode" className="mb-200 display-block mt-400">
            {t('settings.deploymentModeLabel')}
          </label>
          <select id="deployment-mode" value={deploymentMode} onChange={handleDeploymentModeChange} disabled={savingDeployment}>
            <option value="CDS">{t('settings.deploymentMode.cds')}</option>
            <option value="Vercel">{t('settings.deploymentMode.serverless')}</option>
          </select>

          <label htmlFor="vector-service-type" className="mb-200 display-block mt-400">
            {t('settings.vectorServiceTypeLabel')}
          </label>
          <select
            id="vector-service-type"
            value={vectorServiceType}
            onChange={async (e) => {
              const newType = e.target.value;
              setSavingVectorType(true);
              setVectorServiceType(newType);
              try {
                const current = await saveAndVerify('vectorServiceType', newType);
                setVectorServiceType(current);
              } finally {
                setSavingVectorType(false);
              }
            }}
            disabled={savingVectorType}
          >
            <option value="imvectordb">{t('settings.vectorServiceType.imvectordb')}</option>
            <option value="documentdb">{t('settings.vectorServiceType.documentdb')}</option>
          </select>

          <label htmlFor="default-workflow" className="mb-200 display-block mt-400">
            {t('settings.defaultWorkflow.label')}
          </label>
          <select
            id="default-workflow"
            value={defaultWorkflow}
            onChange={async (e) => {
              const v = e.target.value;
              setDefaultWorkflow(v);
              setSavingDefaultWorkflow(true);
              try {
                const allowedWorkflows = WORKFLOW_VALUES;
                const current = await saveAndVerify('workflow.default', v);
                setDefaultWorkflow(allowedWorkflows.includes(current) ? current : 'GenericGraph');
              } finally {
                setSavingDefaultWorkflow(false);
              }
            }}
            disabled={savingDefaultWorkflow}
          >
            {WORKFLOWS.map(w => (
              <option key={w.value} value={w.value}>{t(w.labelKey)}</option>
            ))}
          </select>

          <label htmlFor="chat-transport" className="mb-200 display-block mt-400">
            {t('settings.chatTransport.label')}
          </label>
          <select
            id="chat-transport"
            value={chatTransport}
            onChange={async (e) => {
              const v = e.target.value;
              setChatTransport(v);
              setSavingChatTransport(true);
              try {
                const current = await saveAndVerify('chat.transport', v);
                setChatTransport(normalizeChatTransport(current));
              } finally {
                setSavingChatTransport(false);
              }
            }}
            disabled={savingChatTransport}
          >
            <option value="sse">{t('settings.chatTransport.options.sse')}</option>
            <option value="ndjson">{t('settings.chatTransport.options.ndjson')}</option>
          </select>

          <label htmlFor="default-model" className="mb-200 display-block mt-400">
            {t('settings.defaultModel.label')}
          </label>
          <select
            id="default-model"
            value={defaultModel}
            onChange={async (e) => {
              const v = e.target.value;
              setDefaultModel(v);
              setSavingDefaultModel(true);
              try {
                const current = await saveAndVerify('model.default', v);
                setDefaultModel(current || 'openai-gpt51');
              } finally {
                setSavingDefaultModel(false);
              }
            }}
            disabled={savingDefaultModel}
          >
            {AVAILABLE_MODELS.map(m => (
              <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
            ))}
          </select>

          <label htmlFor="indigenous-language-blocking" className="mb-200 display-block mt-400">
            {t('settings.indigenousLanguageBlocking.label')}
          </label>
          <select
            id="indigenous-language-blocking"
            value={indigenousLanguageBlocking}
            onChange={handleIndigenousLanguageBlockingChange}
            disabled={savingIndigenousLanguageBlocking}
          >
            <option value="true">{t('common.on')}</option>
            <option value="false">{t('common.off')}</option>
          </select>

        </div>
      </GcdsDetails>

      <GcdsDetails detailsTitle={t('settings.health.title')} className="mt-600 mb-200" tabIndex="0">
        <p className="mb-400">{t('settings.health.description')}</p>

        <label htmlFor="health-enabled" className="mb-200 display-block mt-200">
          {t('settings.health.enabledLabel')}
        </label>
        <select
          id="health-enabled"
          value={healthEnabled}
          onChange={handleHealthEnabledChange}
          disabled={savingHealthEnabled}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="health-database-enabled" className="mb-200 display-block mt-400">
          {t('settings.health.databaseEnabledLabel')}
        </label>
        <select
          id="health-database-enabled"
          value={healthDatabaseEnabled}
          onChange={handleHealthDatabaseEnabledChange}
          disabled={savingHealthDatabaseEnabled}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="health-search-enabled" className="mb-200 display-block mt-400">
          {t('settings.health.searchEnabledLabel')}
        </label>
        <select
          id="health-search-enabled"
          value={healthSearchEnabled}
          onChange={handleHealthSearchEnabledChange}
          disabled={savingHealthSearchEnabled}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="health-llm-enabled" className="mb-200 display-block mt-400">
          {t('settings.health.llmEnabledLabel')}
        </label>
        <select
          id="health-llm-enabled"
          value={healthLlmEnabled}
          onChange={handleHealthLlmEnabledChange}
          disabled={savingHealthLlmEnabled}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="health-auto-disable" className="mb-200 display-block mt-400">
          {t('settings.health.autoDisableOnErrorLabel')}
        </label>
        <select
          id="health-auto-disable"
          value={healthAutoDisableOnError}
          onChange={handleHealthAutoDisableOnErrorChange}
          disabled={savingHealthAutoDisableOnError}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <div className="health-template-grid mt-400">
          <div className="health-template-column">
            <label htmlFor="health-error-template" className="mb-200 display-block">
              {t('settings.health.errorTemplateId')}
            </label>
            <input
              id="health-error-template"
              type="text"
              value={healthErrorTemplateId}
              onChange={handleHealthErrorTemplateIdChange}
              onBlur={handleHealthErrorTemplateIdBlur}
              disabled={savingHealthErrorTemplateId}
              className="w-full"
            />
          </div>

          <div className="health-template-column">
            <label htmlFor="health-alert-template" className="mb-200 display-block">
              {t('settings.health.alertTemplateId')}
            </label>
            <input
              id="health-alert-template"
              type="text"
              value={healthAlertTemplateId}
              onChange={handleHealthAlertTemplateIdChange}
              onBlur={handleHealthAlertTemplateIdBlur}
              disabled={savingHealthAlertTemplateId}
              className="w-full"
            />
          </div>
        </div>

        <label htmlFor="health-failure-threshold" className="mb-200 display-block mt-400">
          {t('settings.health.failureThreshold')}
        </label>
        <input
          id="health-failure-threshold"
          type="number"
          min="1"
          value={healthFailureThreshold}
          onChange={handleHealthFailureThresholdChange}
          disabled={savingHealthFailureThreshold}
        />

        <label htmlFor="health-failure-window" className="mb-200 display-block mt-400">
          {t('settings.health.failureWindowMinutes')}
        </label>
        <input
          id="health-failure-window"
          type="number"
          min="1"
          value={healthFailureWindowMinutes}
          onChange={handleHealthFailureWindowMinutesChange}
          disabled={savingHealthFailureWindowMinutes}
        />

        <label htmlFor="health-interval" className="mb-200 display-block mt-400">
          {t('settings.health.intervalMinutes')}
        </label>
        <input
          id="health-interval"
          type="number"
          min="1"
          value={healthIntervalMinutes}
          onChange={handleHealthIntervalMinutesChange}
          disabled={savingHealthIntervalMinutes}
        />

        <label htmlFor="health-alert-recipients" className="mb-200 display-block mt-400">
          {t('settings.health.alertRecipients')}
        </label>
        <input
          id="health-alert-recipients"
          type="text"
          value={healthAlertRecipients}
          onChange={handleHealthAlertRecipientsChange}
          onBlur={handleHealthAlertRecipientsBlur}
          disabled={savingHealthAlertRecipients}
          className="w-full"
        />
      </GcdsDetails>



      <GcdsDetails detailsTitle={t('settings.twoFA.title')} className="mt-600 mb-200" tabIndex="0">
        <label htmlFor="twofa-enabled" className="mb-200 display-block mt-200">
          {t('settings.twoFA.enabledLabel')}
        </label>
        <select
          id="twofa-enabled"
          value={twoFAEnabled}
          onChange={handleTwoFAEnabledChange}
          disabled={savingTwoFAEnabled}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="twofa-template" className="mb-200 display-block mt-400">
          {t('settings.twoFA.templateLabel')}
        </label>
        <input
          id="twofa-template"
          type="text"
          value={twoFATemplateId}
          onChange={handleTwoFATemplateIdChange}
          onBlur={handleTwoFATemplateIdBlur}
          disabled={savingTwoFATemplateId}
        />

        <label htmlFor="reset-template" className="mb-200 display-block mt-400">
          {t('settings.notify.resetTemplateLabel')}
        </label>
        <input
          id="reset-template"
          type="text"
          value={resetTemplateId}
          onChange={handleResetTemplateIdChange}
          onBlur={handleResetTemplateIdBlur}
          disabled={savingResetTemplateId}
        />
      </GcdsDetails>

      <GcdsDetails detailsTitle={t('settings.session.title')} className="mt-600 mb-200" tabIndex="0">
        <label htmlFor="session-management-enabled" className="mb-200 display-block mt-200">
          {t('settings.session.managementEnabled')}
        </label>
        <select
          id="session-management-enabled"
          value={sessionManagementEnabled}
          onChange={handleSessionManagementEnabledChange}
          disabled={savingSessionManagementEnabled}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="session-store-type" className="mb-200 display-block mt-200">
          {t('settings.session.storeType')}
        </label>
        <select
          id="session-store-type"
          value={sessionStoreType}
          onChange={handleSessionStoreTypeChange}
          disabled={savingSessionStoreType}
        >
          <option value="memory">{t('settings.session.store.options.memory')}</option>
          <option value="mongo">{t('settings.session.store.options.mongo')}</option>
          <option value="redis">{t('settings.session.store.options.redis')}</option>
        </select>

        <label htmlFor="metrics-store-type" className="mb-200 display-block mt-200">
          {t('settings.metrics.storeType')}
        </label>
        <select
          id="metrics-store-type"
          value={metricsStoreType}
          onChange={handleMetricsStoreTypeChange}
          disabled={savingMetricsStoreType}
        >
          <option value="memory">{t('settings.session.store.options.memory')}</option>
          <option value="mongo">{t('settings.session.store.options.mongo')}</option>
        </select>

        <label htmlFor="session-ttl" className="mb-200 display-block mt-200">
          {t('settings.session.ttlMinutes')}
        </label>
        <input id="session-ttl" type="number" min="1" value={sessionTTL} onChange={handleSessionTTLChange} disabled={savingSessionTTL} />

        <label htmlFor="session-auth-ttl" className="mb-200 display-block mt-200">
          {t('settings.session.authTtlMinutes')}
        </label>
        <input id="session-auth-ttl" type="number" min="1" value={sessionAuthTTL} onChange={handleSessionAuthTTLChange} disabled={savingSessionAuthTTL} />

        {/* Rate limiting moved to its own section for clarity (localized below) */}

        <label htmlFor="session-max-sessions" className="mb-200 display-block mt-400">
          {t('settings.session.maxActiveSessions')}
        </label>
        <input id="session-max-sessions" type="number" min="0" value={maxActiveSessions} onChange={handleMaxActiveSessionsChange} disabled={savingMaxActiveSessions} />

        {/* session.persistence moved to rate-limiting section (stored as session.rateLimitPersistence) */}
      </GcdsDetails>

      <GcdsDetails detailsTitle={t('settings.rateLimiting.title')} className="mt-600 mb-200" tabIndex="0">
        <label htmlFor="session-rate-persistence" className="mb-200 display-block mt-200">
          {t('settings.rateLimiting.persistence.label')}
        </label>
        <select id="session-rate-persistence" value={rateLimitPersistence} onChange={handleRateLimitPersistenceChange} disabled={savingRateLimitPersistence}>
          <option value="memory">{t('settings.session.persistence.options.memory')}</option>
          <option value="mongo">{t('settings.session.persistence.options.mongo')}</option>
        </select>

        <label htmlFor="session-rate-capacity" className="mb-200 display-block mt-200">
          {t('settings.rateLimiting.rateLimitCapacity')}
        </label>
        <input id="session-rate-capacity" type="number" min="1" value={rateLimitCapacity} onChange={handleRateLimitCapacityChange} disabled={savingRateLimitCapacity} />

        <label htmlFor="session-auth-rate-capacity" className="mb-200 display-block mt-400">
          {t('settings.rateLimiting.authenticatedRateLimitCapacity')}
        </label>
        <input id="session-auth-rate-capacity" type="number" min="1" value={authRateLimitCapacity} onChange={handleAuthRateLimitCapacityChange} disabled={savingAuthRateLimitCapacity} />

        <label htmlFor="session-rate-refill" className="mb-200 display-block mt-400">
          {t('settings.rateLimiting.rateLimitRefill')}
        </label>
        <input id="session-rate-refill" type="number" min="0" step="0.1" value={rateLimitRefill} onChange={handleRateLimitRefillChange} disabled={savingRateLimitRefill} />

        <label htmlFor="session-auth-rate-refill" className="mb-200 display-block mt-400">
          {t('settings.rateLimiting.authenticatedRateLimitRefill')}
        </label>
        <input id="session-auth-rate-refill" type="number" min="0" step="0.1" value={authRateLimitRefill} onChange={handleAuthRateLimitRefillChange} disabled={savingAuthRateLimitRefill} />
      </GcdsDetails>
      <GcdsDetails detailsTitle={t('settings.redaction.title')} className="mt-600 mb-200" tabIndex="0">
        <p className="mb-400">{t('settings.redaction.description')}</p>

        <div className="grid grid-cols-2 gap-400 mb-400" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <h3 className="mb-200">{t('settings.redaction.langEnglish')}</h3>

            <label htmlFor="profanity-en" className="mb-200 display-block mt-400">
              {t('settings.redaction.profanity')} (EN)
            </label>
            <SettingsTextArea settingKey="redaction.profanity.en" saveAndVerify={saveAndVerify} lang={lang} />

            <label htmlFor="threat-en" className="mb-200 display-block mt-400">
              {t('settings.redaction.threat')} (EN)
            </label>
            <SettingsTextArea settingKey="redaction.threat.en" saveAndVerify={saveAndVerify} lang={lang} />

            <label htmlFor="manipulation-en" className="mb-200 display-block mt-400">
              {t('settings.redaction.manipulation')} (EN)
            </label>
            <SettingsTextArea settingKey="redaction.manipulation.en" saveAndVerify={saveAndVerify} lang={lang} />
          </div>

          <div>
            <h3 className="mb-200">{t('settings.redaction.langFrench')}</h3>

            <label htmlFor="profanity-fr" className="mb-200 display-block mt-400">
              {t('settings.redaction.profanity')} (FR)
            </label>
            <SettingsTextArea settingKey="redaction.profanity.fr" saveAndVerify={saveAndVerify} lang={lang} />

            <label htmlFor="threat-fr" className="mb-200 display-block mt-400">
              {t('settings.redaction.threat')} (FR)
            </label>
            <SettingsTextArea settingKey="redaction.threat.fr" saveAndVerify={saveAndVerify} lang={lang} />

            <label htmlFor="manipulation-fr" className="mb-200 display-block mt-400">
              {t('settings.redaction.manipulation')} (FR)
            </label>
            <SettingsTextArea settingKey="redaction.manipulation.fr" saveAndVerify={saveAndVerify} lang={lang} />
          </div>
        </div>
      </GcdsDetails>

    </GcdsContainer>
  );
};

// Helper component for text areas to manage their own state and saving
const SettingsTextArea = ({ settingKey, saveAndVerify, lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    DataStoreService.getSetting(settingKey, '').then(val => {
      setValue(val || '');
      setLoading(false);
    });
  }, [settingKey]);

  const handleBlur = async () => {
    setSaving(true);
    try {
      const current = await saveAndVerify(settingKey, value, (v) => v ?? '');
      setValue(current);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="mb-200">{t('common.loading')}</div>;

  return (
    <textarea
      id={settingKey}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      disabled={saving}
      className="w-full"
      rows={5}
      style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
    />
  );
};

export default SettingsPage;
