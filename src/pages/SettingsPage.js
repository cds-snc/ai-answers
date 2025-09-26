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

  // New state for logging chats to database
  const [logChats, setLogChats] = useState('no');
  const [savingLogChats, setSavingLogChats] = useState(false);

  // Session-related settings
  const [sessionTTL, setSessionTTL] = useState(60); // minutes
  const [savingSessionTTL, setSavingSessionTTL] = useState(false);
  const [cleanupInterval, setCleanupInterval] = useState(60); // seconds
  const [savingCleanupInterval, setSavingCleanupInterval] = useState(false);
  const [rateLimitCapacity, setRateLimitCapacity] = useState(60);
  const [savingRateLimitCapacity, setSavingRateLimitCapacity] = useState(false);
  const [rateLimitRefill, setRateLimitRefill] = useState(1);
  const [savingRateLimitRefill, setSavingRateLimitRefill] = useState(false);
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
      // Load logChats setting
      const logChatsSetting = await DataStoreService.getSetting('logChatsToDatabase', 'no');
      setLogChats(logChatsSetting);
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

      <label htmlFor="session-rate-refill" className="mb-200 display-block mt-400">
        {t('settings.session.rateLimitRefill', 'Rate limit refill (tokens/sec)')}
      </label>
      <input id="session-rate-refill" type="number" min="0" step="0.1" value={rateLimitRefill} onChange={handleRateLimitRefillChange} disabled={savingRateLimitRefill} />

      <label htmlFor="session-max-sessions" className="mb-200 display-block mt-400">
        {t('settings.session.maxActiveSessions', 'Max active sessions (count — empty = unlimited)')}
      </label>
      <input id="session-max-sessions" type="number" min="0" value={maxActiveSessions} onChange={handleMaxActiveSessionsChange} disabled={savingMaxActiveSessions} />
    </GcdsContainer>
  );
};

export default SettingsPage;
