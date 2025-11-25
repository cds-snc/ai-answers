import React, { useEffect, useState } from 'react';
import { GcdsContainer } from '@cdssnc/gcds-components-react';
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

  // New state for provider (openai | azure)
  const [provider, setProvider] = useState('openai');
  const [savingProvider, setSavingProvider] = useState(false);

  // Global default workflow setting (Default | DefaultWithVector | DefaultWithVectorGraph)
  const [defaultWorkflow, setDefaultWorkflow] = useState('Default');
  const [savingDefaultWorkflow, setSavingDefaultWorkflow] = useState(false);

  // New state for logging chats to database
  const [logChats, setLogChats] = useState('no');
  const [savingLogChats, setSavingLogChats] = useState(false);

  // Two-factor authentication settings
  const [twoFAEnabled, setTwoFAEnabled] = useState('false');
  const [savingTwoFAEnabled, setSavingTwoFAEnabled] = useState(false);
  const [twoFATemplateId, setTwoFATemplateId] = useState('');
  const [savingTwoFATemplateId, setSavingTwoFATemplateId] = useState(false);
  // GC Notify template ID for password reset link emails
  const [resetTemplateId, setResetTemplateId] = useState('');
  const [savingResetTemplateId, setSavingResetTemplateId] = useState(false);
  // Base URL for frontend links (used to prefix reset_link in emails)
  const [baseUrl, setBaseUrl] = useState('');
  const [savingBaseUrl, setSavingBaseUrl] = useState(false);

  // Session-related settings
  const [sessionTTL, setSessionTTL] = useState(60); // minutes
  const [savingSessionTTL, setSavingSessionTTL] = useState(false);
  const [cleanupInterval, setCleanupInterval] = useState(60); // seconds
  const [savingCleanupInterval, setSavingCleanupInterval] = useState(false);
  const [rateLimitCapacity, setRateLimitCapacity] = useState(60);
  const [savingRateLimitCapacity, setSavingRateLimitCapacity] = useState(false);
  const [rateLimitRefill, setRateLimitRefill] = useState(1);
  const [savingRateLimitRefill, setSavingRateLimitRefill] = useState(false);
  // Authenticated session rate-limit settings
  const [authRateLimitCapacity, setAuthRateLimitCapacity] = useState(100);
  const [savingAuthRateLimitCapacity, setSavingAuthRateLimitCapacity] = useState(false);
  const [authRateLimitRefill, setAuthRateLimitRefill] = useState(5);
  const [savingAuthRateLimitRefill, setSavingAuthRateLimitRefill] = useState(false);
  const [maxActiveSessions, setMaxActiveSessions] = useState('');
  const [savingMaxActiveSessions, setSavingMaxActiveSessions] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const current = await DataStoreService.getSetting('siteStatus', 'available');
      setStatus(current);
      const mode = await DataStoreService.getSetting('deploymentMode', 'CDS');
      setDeploymentMode(mode);
      const type = await DataStoreService.getSetting('vectorServiceType', 'imvectordb');
      setVectorServiceType(type);
      // Load provider setting
      const providerSetting = await DataStoreService.getSetting('provider', 'openai');
      setProvider(providerSetting);
  // Load default workflow setting
  const defaultWorkflowSetting = await DataStoreService.getSetting('workflow.default', 'Default');
  setDefaultWorkflow(defaultWorkflowSetting || 'Default');
      // Load logChats setting
      const logChatsSetting = await DataStoreService.getSetting('logChatsToDatabase', 'no');
      setLogChats(logChatsSetting);
      const twoFAEnabledSetting = await DataStoreService.getSetting('twoFA.enabled', 'false');
      setTwoFAEnabled(String(twoFAEnabledSetting ?? 'false'));
      const twoFATemplateSetting = await DataStoreService.getSetting('twoFA.templateId', '');
      setTwoFATemplateId(twoFATemplateSetting ?? '');
  const resetTpl = await DataStoreService.getSetting('notify.resetTemplateId', '');
  setResetTemplateId(resetTpl ?? '');
    const base = await DataStoreService.getSetting('site.baseUrl', '');
    setBaseUrl(base ?? '');
      // Load session settings
      const ttl = await DataStoreService.getSetting('session.defaultTTLMinutes', '60');
      setSessionTTL(Number(ttl));
      const cleanup = await DataStoreService.getSetting('session.cleanupIntervalSeconds', '60');
      setCleanupInterval(Number(cleanup));
      const capacity = await DataStoreService.getSetting('session.rateLimitCapacity', '60');
      setRateLimitCapacity(Number(capacity));
  // Stored value is refill per second; display to admin as requests per minute
  const refill = await DataStoreService.getSetting('session.rateLimitRefillPerSec', '1');
  const refillPerSec = Number(refill);
  setRateLimitRefill(Number((refillPerSec * 60).toFixed(2)));
        // Authenticated rate-limit settings (stored per-second, display per-minute)
        const authCap = await DataStoreService.getSetting('session.authenticatedRateLimitCapacity', '100');
        setAuthRateLimitCapacity(Number(authCap));
        const authRefill = await DataStoreService.getSetting('session.authenticatedRateLimitRefillPerSec', '5');
        const authRefillPerSec = Number(authRefill);
        setAuthRateLimitRefill(Number((authRefillPerSec * 60).toFixed(2)));
      const maxSessions = await DataStoreService.getSetting('session.maxActiveSessions', '');
      setMaxActiveSessions(maxSessions === 'undefined' ? '' : maxSessions);
    }
    loadSettings();
  }, []);

  // Session handlers
  const handleSessionTTLChange = async (e) => {
    const val = Number(e.target.value);
    setSessionTTL(val);
    setSavingSessionTTL(true);
    try {
      await DataStoreService.setSetting('session.defaultTTLMinutes', String(val));
    } finally {
      setSavingSessionTTL(false);
    }
  };

  const handleCleanupIntervalChange = async (e) => {
    const val = Number(e.target.value);
    setCleanupInterval(val);
    setSavingCleanupInterval(true);
    try {
      await DataStoreService.setSetting('session.cleanupIntervalSeconds', String(val));
    } finally {
      setSavingCleanupInterval(false);
    }
  };

  const handleRateLimitCapacityChange = async (e) => {
    const val = Number(e.target.value);
    setRateLimitCapacity(val);
    setSavingRateLimitCapacity(true);
    try {
      await DataStoreService.setSetting('session.rateLimitCapacity', String(val));
    } finally {
      setSavingRateLimitCapacity(false);
    }
  };

  const handleAuthRateLimitCapacityChange = async (e) => {
    const val = Number(e.target.value);
    setAuthRateLimitCapacity(val);
    setSavingAuthRateLimitCapacity(true);
    try {
      await DataStoreService.setSetting('session.authenticatedRateLimitCapacity', String(val));
    } finally {
      setSavingAuthRateLimitCapacity(false);
    }
  };

  const handleRateLimitRefillChange = async (e) => {
    const val = Number(e.target.value);
    setRateLimitRefill(val);
    setSavingRateLimitRefill(true);
    try {
      // Admin enters requests per minute; store as per-second for the service
      const perSec = Number(val) / 60;
      await DataStoreService.setSetting('session.rateLimitRefillPerSec', String(perSec));
    } finally {
      setSavingRateLimitRefill(false);
    }
  };

  const handleAuthRateLimitRefillChange = async (e) => {
    const val = Number(e.target.value);
    setAuthRateLimitRefill(val);
    setSavingAuthRateLimitRefill(true);
    try {
      // Admin enters requests per minute; store as per-second for the service
      const perSec = Number(val) / 60;
      await DataStoreService.setSetting('session.authenticatedRateLimitRefillPerSec', String(perSec));
    } finally {
      setSavingAuthRateLimitRefill(false);
    }
  };

  const handleMaxActiveSessionsChange = async (e) => {
    const val = e.target.value;
    setMaxActiveSessions(val);
    setSavingMaxActiveSessions(true);
    try {
      await DataStoreService.setSetting('session.maxActiveSessions', val);
    } finally {
      setSavingMaxActiveSessions(false);
    }
  };

  const handleChange = async (e) => {
    const newStatus = e.target.value;
    setStatus(newStatus);
    setSaving(true);
    try {
      await DataStoreService.setSetting('siteStatus', newStatus);
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
      await DataStoreService.setSetting('provider', newValue);
    } finally {
      setSavingProvider(false);
    }
  };

  const handleDeploymentModeChange = async (e) => {
    const newMode = e.target.value;
    setDeploymentMode(newMode);
    setSavingDeployment(true);
    try {
      await DataStoreService.setSetting('deploymentMode', newMode);
    } finally {
      setSavingDeployment(false);
    }
  };

  // Handler for logChats setting
  const handleLogChatsChange = async (e) => {
    const newValue = e.target.value;
    setLogChats(newValue);
    setSavingLogChats(true);
    try {
      await DataStoreService.setSetting('logChatsToDatabase', newValue);
    } finally {
      setSavingLogChats(false);
    }
  };

  const handleTwoFAEnabledChange = async (e) => {
    const newValue = e.target.value;
    setTwoFAEnabled(newValue);
    setSavingTwoFAEnabled(true);
    try {
      await DataStoreService.setSetting('twoFA.enabled', newValue);
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
      await DataStoreService.setSetting('twoFA.templateId', twoFATemplateId);
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
      await DataStoreService.setSetting('notify.resetTemplateId', resetTemplateId);
    } finally {
      setSavingResetTemplateId(false);
    }
  };

  const handleBaseUrlChange = (e) => {
    setBaseUrl(e.target.value);
  };

  const handleBaseUrlBlur = async () => {
    setSavingBaseUrl(true);
    try {
      await DataStoreService.setSetting('site.baseUrl', baseUrl);
    } finally {
      setSavingBaseUrl(false);
    }
  };

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('settings.title', 'Settings')}</h1>
      <nav className="mb-400">
        <a href={`/${language}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</a>
      </nav>
      <label htmlFor="site-status" className="mb-200 display-block">
        {t('settings.statusLabel', 'Service status')}
      </label>
      <select id="site-status" value={status} onChange={handleChange} disabled={saving}>
        <option value="available">{t('settings.statuses.available', 'Available')}</option>
        <option value="unavailable">{t('settings.statuses.unavailable', 'Unavailable')}</option>
      </select>

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
          await DataStoreService.setSetting('vectorServiceType', newType);
          setSavingVectorType(false);
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
            await DataStoreService.setSetting('workflow.default', v);
          } finally {
            setSavingDefaultWorkflow(false);
          }
        }}
        disabled={savingDefaultWorkflow}
      >
        <option value="Default">Default</option>
        <option value="DefaultAlwaysContext">DefaultAlwaysContext</option>
        <option value="DefaultWithVector">DefaultWithVector</option>
        <option value="DefaultWithVectorGraph">DefaultWithVectorGraph</option>
      </select>
      <label htmlFor="log-chats-db" className="mb-200 display-block mt-400">
        {t('settings.logChatsToDatabaseLabel', 'Log chats to database')}
      </label>
      <select
        id="log-chats-db"
        value={logChats}
        onChange={handleLogChatsChange}
      disabled={savingLogChats}
      >
        <option value="yes">{t('common.yes', 'Yes')}</option>
        <option value="no">{t('common.no', 'No')}</option>
      </select>

      <h2 className="mt-600 mb-200">{t('settings.twoFA.title', 'Two-factor authentication')}</h2>

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

      <label htmlFor="base-url" className="mb-200 display-block mt-200">
        {t('settings.site.baseUrl', 'Base URL (frontend)')}
      </label>
      <input
        id="base-url"
        type="text"
        value={baseUrl}
        onChange={handleBaseUrlChange}
        onBlur={handleBaseUrlBlur}
        disabled={savingBaseUrl}
      />

      <h2 className="mt-600 mb-200">{t('settings.session.title', 'Session settings')}</h2>

      <label htmlFor="session-ttl" className="mb-200 display-block mt-200">
        {t('settings.session.ttlMinutes', 'Default session TTL (minutes — e.g. 60 = 1 hour)')}
      </label>
      <input id="session-ttl" type="number" min="1" value={sessionTTL} onChange={handleSessionTTLChange} disabled={savingSessionTTL} />

      <label htmlFor="session-cleanup" className="mb-200 display-block mt-400">
        {t('settings.session.cleanupSeconds', 'Session cleanup interval (seconds)')}
      </label>
      <input id="session-cleanup" type="number" min="5" value={cleanupInterval} onChange={handleCleanupIntervalChange} disabled={savingCleanupInterval} />

      <label htmlFor="session-rate-capacity" className="mb-200 display-block mt-400">
        {t('settings.session.rateLimitCapacity', 'Rate limit capacity (tokens)')}
      </label>
      <input id="session-rate-capacity" type="number" min="1" value={rateLimitCapacity} onChange={handleRateLimitCapacityChange} disabled={savingRateLimitCapacity} />

      <label htmlFor="session-auth-rate-capacity" className="mb-200 display-block mt-400">
        {t('settings.session.authenticatedRateLimitCapacity', 'Authenticated rate limit capacity (tokens)')}
      </label>
      <input id="session-auth-rate-capacity" type="number" min="1" value={authRateLimitCapacity} onChange={handleAuthRateLimitCapacityChange} disabled={savingAuthRateLimitCapacity} />

      <label htmlFor="session-rate-refill" className="mb-200 display-block mt-400">
        {t('settings.session.rateLimitRefill', 'Rate limit refill (tokens/sec)')}
      </label>
      <input id="session-rate-refill" type="number" min="0" step="0.1" value={rateLimitRefill} onChange={handleRateLimitRefillChange} disabled={savingRateLimitRefill} />

      <label htmlFor="session-auth-rate-refill" className="mb-200 display-block mt-400">
        {t('settings.session.authenticatedRateLimitRefill', 'Authenticated rate limit refill (tokens/sec)')}
      </label>
      <input id="session-auth-rate-refill" type="number" min="0" step="0.1" value={authRateLimitRefill} onChange={handleAuthRateLimitRefillChange} disabled={savingAuthRateLimitRefill} />

      <label htmlFor="session-max-sessions" className="mb-200 display-block mt-400">
        {t('settings.session.maxActiveSessions', 'Max active sessions (count — empty = unlimited)')}
      </label>
      <input id="session-max-sessions" type="number" min="0" value={maxActiveSessions} onChange={handleMaxActiveSessionsChange} disabled={savingMaxActiveSessions} />
    </GcdsContainer>
  );
};

export default SettingsPage;
