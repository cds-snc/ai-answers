import React, { useEffect, useState } from 'react';
import { GcdsContainer, GcdsDetails } from '@cdssnc/gcds-components-react';
import DataStoreService from '../services/DataStoreService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';

const SettingsPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();
  const [status, setStatus] = useState('available');
  const [saving, setSaving] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState('CDS');
  const [savingDeployment, setSavingDeployment] = useState(false);
  const [vectorServiceType, setVectorServiceType] = useState('imvectordb');
  const [savingVectorType, setSavingVectorType] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [savingBaseUrl, setSavingBaseUrl] = useState(false);

  // New state for provider (openai | azure)
  const [provider, setProvider] = useState('openai');
  const [savingProvider, setSavingProvider] = useState(false);

  // Global default workflow setting (Default | DefaultWithVector | DefaultWithVectorGraph)
  const [defaultWorkflow, setDefaultWorkflow] = useState('DefaultGraph');
  const [savingDefaultWorkflow, setSavingDefaultWorkflow] = useState(false);



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
      // Load provider setting
      const providerSetting = await DataStoreService.getSetting('provider', 'openai');
      setProvider(providerSetting);
      // Load default workflow setting
      const defaultWorkflowSetting = await DataStoreService.getSetting('workflow.default', 'DefaultGraph');
      // Validate default workflow against known options
      const allowedWorkflows = ['DefaultWithVectorGraph', 'InstantAndQAGraph', 'DefaultGraph', 'GPT5MiniDefaultGraph'];
      setDefaultWorkflow(allowedWorkflows.includes(defaultWorkflowSetting) ? defaultWorkflowSetting : 'DefaultGraph');

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

  // Handler for provider setting
  const handleProviderChange = async (e) => {
    const newValue = e.target.value;
    setProvider(newValue);
    setSavingProvider(true);
    try {
      const current = await saveAndVerify('provider', newValue);
      setProvider(current);
    } finally {
      setSavingProvider(false);
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
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('settings.title', 'Settings')}</h1>
      <nav className="mb-400">
        <a href={`/${language}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</a>
      </nav>
      <GcdsDetails detailsTitle={t('settings.general.title', 'General settings')} className="mb-400" tabIndex="0">
        <div>
          <label htmlFor="site-status" className="mb-200 display-block">
            {t('settings.statusLabel', 'Service status')}
          </label>
          <select id="site-status" value={status} onChange={handleChange} disabled={saving}>
            <option value="available">{t('settings.statuses.available', 'Available')}</option>
            <option value="unavailable">{t('settings.statuses.unavailable', 'Unavailable')}</option>
          </select>

          <label htmlFor="base-url" className="mb-200 display-block mt-400">
            {t('settings.baseUrlLabel', 'Base URL (e.g. https://example.com)')}
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
            {t('settings.deploymentModeLabel', 'Deployment Mode')}
          </label>
          <select id="deployment-mode" value={deploymentMode} onChange={handleDeploymentModeChange} disabled={savingDeployment}>
            <option value="CDS">{t('settings.deploymentMode.cds', 'CDS (Background worker)')}</option>
            <option value="Vercel">{t('settings.deploymentMode.serverless', 'Serverless (Wait for completion)')}</option>
          </select>

          <label htmlFor="vector-service-type" className="mb-200 display-block mt-400">
            {t('settings.vectorServiceTypeLabel', 'Vector Service Type')}
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
            <option value="imvectordb">{t('settings.vectorServiceType.imvectordb', 'IMVectorDB (local)')}</option>
            <option value="documentdb">{t('settings.vectorServiceType.documentdb', 'DocumentDB (AWS)')}</option>
          </select>

          <label htmlFor="provider" className="mb-200 display-block mt-400">
            {t('settings.providerLabel', 'Provider')}
          </label>
          <select
            id="provider"
            value={provider}
            onChange={handleProviderChange}
            disabled={savingProvider}
          >
            <option value="openai">{t('settings.provider.openai', 'OpenAI')}</option>
            <option value="azure">{t('settings.provider.azure', 'Azure')}</option>
          </select>

          <label htmlFor="default-workflow" className="mb-200 display-block mt-400">
            {t('settings.defaultWorkflow.label', 'Default workflow')}
          </label>
          <select
            id="default-workflow"
            value={defaultWorkflow}
            onChange={async (e) => {
              const v = e.target.value;
              setDefaultWorkflow(v);
              setSavingDefaultWorkflow(true);
              try {
                const allowedWorkflows = ['DefaultWithVectorGraph', 'InstantAndQAGraph', 'DefaultGraph', 'GPT5MiniDefaultGraph'];
                const current = await saveAndVerify('workflow.default', v);
                setDefaultWorkflow(allowedWorkflows.includes(current) ? current : 'DefaultGraph');
              } finally {
                setSavingDefaultWorkflow(false);
              }
            }}
            disabled={savingDefaultWorkflow}
          >
            <option value="DefaultGraph">DefaultGraph</option>
            <option value="DefaultWithVectorGraph">DefaultWithVectorGraph</option>
            <option value="InstantAndQAGraph">InstantAndQAGraph</option>
            <option value="GPT5MiniDefaultGraph">GPT5MiniDefaultGraph</option>
          </select>

        </div>
      </GcdsDetails>



      <GcdsDetails detailsTitle={t('settings.twoFA.title', 'Two-factor authentication')} className="mt-600 mb-200" tabIndex="0">
        <label htmlFor="twofa-enabled" className="mb-200 display-block mt-200">
          {t('settings.twoFA.enabledLabel', 'Require two-factor authentication for login')}
        </label>
        <select
          id="twofa-enabled"
          value={twoFAEnabled}
          onChange={handleTwoFAEnabledChange}
          disabled={savingTwoFAEnabled}
        >
          <option value="true">{t('common.yes', 'Yes')}</option>
          <option value="false">{t('common.no', 'No')}</option>
        </select>

        <label htmlFor="twofa-template" className="mb-200 display-block mt-400">
          {t('settings.twoFA.templateLabel', 'GC Notify template ID for 2FA emails')}
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
          {t('settings.notify.resetTemplateLabel', 'Reset Link Template ID')}
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

      <GcdsDetails detailsTitle={t('settings.session.title', 'Session settings')} className="mt-600 mb-200" tabIndex="0">
        <label htmlFor="session-management-enabled" className="mb-200 display-block mt-200">
          {t('settings.session.managementEnabled', 'Enable Session Management')}
        </label>
        <select
          id="session-management-enabled"
          value={sessionManagementEnabled}
          onChange={handleSessionManagementEnabledChange}
          disabled={savingSessionManagementEnabled}
        >
          <option value="true">{t('common.yes', 'Yes')}</option>
          <option value="false">{t('common.no', 'No')}</option>
        </select>

        <label htmlFor="session-store-type" className="mb-200 display-block mt-200">
          {t('settings.session.storeType', 'Express Session Store (memory | mongo)')}
        </label>
        <select
          id="session-store-type"
          value={sessionStoreType}
          onChange={handleSessionStoreTypeChange}
          disabled={savingSessionStoreType}
        >
          <option value="memory">{t('settings.session.store.options.memory', 'Memory (in-process)')}</option>
          <option value="mongo">{t('settings.session.store.options.mongo', 'MongoDB (persistent)')}</option>
          <option value="redis">{t('settings.session.store.options.redis', 'Redis (persistent)')}</option>
        </select>

        <label htmlFor="metrics-store-type" className="mb-200 display-block mt-200">
          {t('settings.metrics.storeType', 'Chat Metrics Store (memory | mongo)')}
        </label>
        <select
          id="metrics-store-type"
          value={metricsStoreType}
          onChange={handleMetricsStoreTypeChange}
          disabled={savingMetricsStoreType}
        >
          <option value="memory">{t('settings.session.store.options.memory', 'Memory (in-process)')}</option>
          <option value="mongo">{t('settings.session.store.options.mongo', 'MongoDB (persistent)')}</option>
        </select>

        <label htmlFor="session-ttl" className="mb-200 display-block mt-200">
          {t('settings.session.ttlMinutes', 'Default session TTL (minutes — e.g. 60 = 1 hour)')}
        </label>
        <input id="session-ttl" type="number" min="1" value={sessionTTL} onChange={handleSessionTTLChange} disabled={savingSessionTTL} />

        <label htmlFor="session-auth-ttl" className="mb-200 display-block mt-200">
          {t('settings.session.authTtlMinutes', 'Authenticated session TTL (minutes — e.g. 60 = 1 hour)')}
        </label>
        <input id="session-auth-ttl" type="number" min="1" value={sessionAuthTTL} onChange={handleSessionAuthTTLChange} disabled={savingSessionAuthTTL} />

        {/* Rate limiting moved to its own section for clarity (localized below) */}

        <label htmlFor="session-max-sessions" className="mb-200 display-block mt-400">
          {t('settings.session.maxActiveSessions', 'Max active sessions (count — empty = unlimited)')}
        </label>
        <input id="session-max-sessions" type="number" min="0" value={maxActiveSessions} onChange={handleMaxActiveSessionsChange} disabled={savingMaxActiveSessions} />

        {/* session.persistence moved to rate-limiting section (stored as session.rateLimitPersistence) */}
      </GcdsDetails>

      <GcdsDetails detailsTitle={t('settings.rateLimiting.title', 'Rate limiting')} className="mt-600 mb-200" tabIndex="0">
        <label htmlFor="session-rate-persistence" className="mb-200 display-block mt-200">
          {t('settings.rateLimiting.persistence.label', 'Rate-limiter persistence (memory | mongo)')}
        </label>
        <select id="session-rate-persistence" value={rateLimitPersistence} onChange={handleRateLimitPersistenceChange} disabled={savingRateLimitPersistence}>
          <option value="memory">{t('settings.session.persistence.options.memory', 'Memory (in-process)')}</option>
          <option value="mongo">{t('settings.session.persistence.options.mongo', 'Mongo (persistent)')}</option>
        </select>

        <label htmlFor="session-rate-capacity" className="mb-200 display-block mt-200">
          {t('settings.rateLimiting.rateLimitCapacity', 'Rate limit capacity (tokens)')}
        </label>
        <input id="session-rate-capacity" type="number" min="1" value={rateLimitCapacity} onChange={handleRateLimitCapacityChange} disabled={savingRateLimitCapacity} />

        <label htmlFor="session-auth-rate-capacity" className="mb-200 display-block mt-400">
          {t('settings.rateLimiting.authenticatedRateLimitCapacity', 'Authenticated rate limit capacity (tokens)')}
        </label>
        <input id="session-auth-rate-capacity" type="number" min="1" value={authRateLimitCapacity} onChange={handleAuthRateLimitCapacityChange} disabled={savingAuthRateLimitCapacity} />

        <label htmlFor="session-rate-refill" className="mb-200 display-block mt-400">
          {t('settings.rateLimiting.rateLimitRefill', 'Rate limit refill (tokens/min)')}
        </label>
        <input id="session-rate-refill" type="number" min="0" step="0.1" value={rateLimitRefill} onChange={handleRateLimitRefillChange} disabled={savingRateLimitRefill} />

        <label htmlFor="session-auth-rate-refill" className="mb-200 display-block mt-400">
          {t('settings.rateLimiting.authenticatedRateLimitRefill', 'Authenticated rate limit refill (tokens/min)')}
        </label>
        <input id="session-auth-rate-refill" type="number" min="0" step="0.1" value={authRateLimitRefill} onChange={handleAuthRateLimitRefillChange} disabled={savingAuthRateLimitRefill} />
      </GcdsDetails>
      <GcdsDetails detailsTitle={t('settings.redaction.title', 'Redaction Settings')} className="mt-600 mb-200" tabIndex="0">
        <p className="mb-400">{t('settings.redaction.description', 'Manage bad words, threats, and manipulation phrases. Enter words separated by commas.')}</p>

        <div className="grid grid-cols-2 gap-400 mb-400" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <h3 className="mb-200">English</h3>

            <label htmlFor="profanity-en" className="mb-200 display-block mt-400">
              {t('settings.redaction.profanity', 'Profanity')} (EN)
            </label>
            <SettingsTextArea settingKey="redaction.profanity.en" saveAndVerify={saveAndVerify} />

            <label htmlFor="threat-en" className="mb-200 display-block mt-400">
              {t('settings.redaction.threat', 'Threats')} (EN)
            </label>
            <SettingsTextArea settingKey="redaction.threat.en" saveAndVerify={saveAndVerify} />

            <label htmlFor="manipulation-en" className="mb-200 display-block mt-400">
              {t('settings.redaction.manipulation', 'Manipulation')} (EN)
            </label>
            <SettingsTextArea settingKey="redaction.manipulation.en" saveAndVerify={saveAndVerify} />
          </div>

          <div>
            <h3 className="mb-200">Français</h3>

            <label htmlFor="profanity-fr" className="mb-200 display-block mt-400">
              {t('settings.redaction.profanity', 'Profanity')} (FR)
            </label>
            <SettingsTextArea settingKey="redaction.profanity.fr" saveAndVerify={saveAndVerify} />

            <label htmlFor="threat-fr" className="mb-200 display-block mt-400">
              {t('settings.redaction.threat', 'Threats')} (FR)
            </label>
            <SettingsTextArea settingKey="redaction.threat.fr" saveAndVerify={saveAndVerify} />

            <label htmlFor="manipulation-fr" className="mb-200 display-block mt-400">
              {t('settings.redaction.manipulation', 'Manipulation')} (FR)
            </label>
            <SettingsTextArea settingKey="redaction.manipulation.fr" saveAndVerify={saveAndVerify} />
          </div>
        </div>
      </GcdsDetails>

    </GcdsContainer>
  );
};

// Helper component for text areas to manage their own state and saving
const SettingsTextArea = ({ settingKey, saveAndVerify }) => {
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

  if (loading) return <div className="mb-200">Loading...</div>;

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
