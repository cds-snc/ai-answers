import React, { useEffect, useRef, useState } from 'react';
import { GcdsButton, GcdsContainer, GcdsIcon } from '@gcds-core/components-react';
import DataStoreService from '../services/DataStoreService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { WORKFLOWS, AVAILABLE_MODELS, WORKFLOW_VALUES, DEFAULT_WORKFLOW } from '../config/workflows.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import SettingsAuditValue from '../components/settings/SettingsAuditValue.js';
import { formatNumber } from '../utils/numberFormat.js';

const SETTINGS_LOAD_DEFAULTS = {
  siteStatus: 'available',
  deploymentMode: 'CDS',
  vectorServiceType: 'imvectordb',
  'site.baseUrl': '',
  'workflow.default': DEFAULT_WORKFLOW,
  'model.default': 'openai-gpt51',
  'chat.transport': 'sse',
  'guardrail.indigenousLanguageBlocking': 'true',
  'systemHealth.enabled': 'false',
  'systemHealth.checks.database.enabled': 'true',
  'systemHealth.checks.search.enabled': 'true',
  'systemHealth.checks.llm.enabled': 'true',
  'systemHealth.autoDisableOnError': 'true',
  'systemHealth.errorTemplateId': '',
  'systemHealth.failureThreshold': '5',
  'systemHealth.failureWindowMinutes': '5',
  'systemHealth.intervalMinutes': '1',
  'systemHealth.fastIntervalSeconds': '30',
  'systemHealth.alertRecipients': '',
  'systemHealth.alertTemplateId': '',
  'twoFA.enabled': 'false',
  'twoFA.templateId': '',
  'notify.resetTemplateId': '',
  'session.defaultTTLMinutes': '60',
  'session.rateLimitCapacity': '60',
  'session.rateLimitRefillPerSec': '60',
  'session.authenticatedRateLimitCapacity': '300',
  'session.authenticatedRateLimitRefillPerSec': '300',
  'session.maxActiveSessions': '',
  'session.authenticatedTTLMinutes': '60',
  'session.rateLimitPersistence': 'memory',
  'session.singleAnonymousChatRunEnabled': 'true',
  'session.managementEnabled': 'true',
  'session.type': 'memory',
  'metrics.type': 'memory',
  'redaction.profanity.en': '',
  'redaction.threat.en': '',
  'redaction.manipulation.en': '',
  'redaction.profanity.fr': '',
  'redaction.threat.fr': '',
  'redaction.manipulation.fr': '',
};

const SETTINGS_LOAD_KEYS = Object.keys(SETTINGS_LOAD_DEFAULTS);

// Which setting keys belong to which section's Save button. Drives both
// per-section dirty-checking (is anything in `pendingChanges` one of this
// section's keys?) and what gets sent when that section's Save is clicked.
const SECTION_KEYS = {
  general: [
    'siteStatus', 'deploymentMode', 'vectorServiceType', 'workflow.default',
    'chat.transport', 'model.default', 'guardrail.indigenousLanguageBlocking', 'site.baseUrl',
  ],
  health: [
    'systemHealth.enabled', 'systemHealth.checks.database.enabled', 'systemHealth.checks.search.enabled',
    'systemHealth.checks.llm.enabled', 'systemHealth.autoDisableOnError', 'systemHealth.errorTemplateId',
    'systemHealth.alertTemplateId', 'systemHealth.failureThreshold', 'systemHealth.failureWindowMinutes',
    'systemHealth.intervalMinutes', 'systemHealth.fastIntervalSeconds', 'systemHealth.alertRecipients',
  ],
  twoFA: ['twoFA.enabled', 'twoFA.templateId', 'notify.resetTemplateId'],
  session: [
    'session.managementEnabled', 'session.type', 'metrics.type',
    'session.defaultTTLMinutes', 'session.authenticatedTTLMinutes', 'session.maxActiveSessions',
  ],
  rateLimiting: [
    'session.rateLimitPersistence', 'session.singleAnonymousChatRunEnabled', 'session.rateLimitCapacity',
    'session.rateLimitRefillPerSec', 'session.authenticatedRateLimitCapacity', 'session.authenticatedRateLimitRefillPerSec',
  ],
  redaction: [
    'redaction.profanity.en', 'redaction.threat.en', 'redaction.manipulation.en',
    'redaction.profanity.fr', 'redaction.threat.fr', 'redaction.manipulation.fr',
  ],
};

// Same section keys, mapped to the locale key for that section's own title —
// lets the page-level unsaved-changes banner name which section(s) without
// duplicating the title strings each SectionSaveControls already carries.
const SECTION_TITLE_KEYS = {
  general: 'settings.general.title',
  health: 'settings.health.title',
  twoFA: 'settings.twoFA.title',
  session: 'settings.session.title',
  rateLimiting: 'settings.rateLimiting.title',
  redaction: 'settings.redaction.title',
};

const SettingsPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [status, setStatus] = useState('available');
  const [deploymentMode, setDeploymentMode] = useState('CDS');
  const [vectorServiceType, setVectorServiceType] = useState('imvectordb');
  const [refreshingSettingsCache, setRefreshingSettingsCache] = useState(false);
  const [settingsCacheStatus, setSettingsCacheStatus] = useState(null); // { text, isError }
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [auditError, setAuditError] = useState(false);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditTotal, setAuditTotal] = useState(0);
  // Newest entry of the first page — later pages are read relative to it. A ref
  // rather than state: nothing renders it, and keeping it out of the render
  // cycle avoids making the loader depend on a value it also writes.
  const auditAnchorRef = useRef(null);
  const auditCountRef = useRef(null);
  const auditRefocusRef = useRef(false);
  const [baseUrl, setBaseUrl] = useState('');

  // Global default workflow setting (Default | DefaultWithVector | DefaultWithVectorGraph)
  const [defaultWorkflow, setDefaultWorkflow] = useState(DEFAULT_WORKFLOW);

  // Default model setting — decoupled from workflow so model upgrades are a Settings change
  const [defaultModel, setDefaultModel] = useState('openai-gpt51');
  const [chatTransport, setChatTransport] = useState('sse');

  // Canadian Indigenous language blocking guardrail (on by default)
  const [indigenousLanguageBlocking, setIndigenousLanguageBlocking] = useState('true');

  // Health monitoring settings
  const [healthEnabled, setHealthEnabled] = useState('false');
  const [healthDatabaseEnabled, setHealthDatabaseEnabled] = useState('true');
  const [healthSearchEnabled, setHealthSearchEnabled] = useState('true');
  const [healthLlmEnabled, setHealthLlmEnabled] = useState('true');
  const [healthAutoDisableOnError, setHealthAutoDisableOnError] = useState('true');
  const [healthErrorTemplateId, setHealthErrorTemplateId] = useState('');
  const [healthFailureThreshold, setHealthFailureThreshold] = useState(5);
  const [healthFailureWindowSeconds, setHealthFailureWindowSeconds] = useState(5);
  const [healthIntervalSeconds, setHealthIntervalSeconds] = useState(1);
  const [healthFastIntervalSeconds, setHealthFastIntervalSeconds] = useState(30);
  const [healthAlertRecipients, setHealthAlertRecipients] = useState('');
  const [healthAlertTemplateId, setHealthAlertTemplateId] = useState('');

  // Two-factor authentication settings
  const [twoFAEnabled, setTwoFAEnabled] = useState('false');
  const [twoFATemplateId, setTwoFATemplateId] = useState('');
  // GC Notify template ID for password reset link emails
  const [resetTemplateId, setResetTemplateId] = useState('');

  // Session-related settings
  const [sessionTTL, setSessionTTL] = useState(60); // minutes
  const [sessionAuthTTL, setSessionAuthTTL] = useState(60); // minutes for authenticated users
  const [rateLimitCapacity, setRateLimitCapacity] = useState(60);
  const [rateLimitRefill, setRateLimitRefill] = useState(1);
  const [authenticatedRateLimitCapacity, setAuthenticatedRateLimitCapacity] = useState(300);
  const [authenticatedRateLimitRefill, setAuthenticatedRateLimitRefill] = useState(300);
  // Rate-limiter persistence mode.
  const [rateLimitPersistence, setRateLimitPersistence] = useState('memory');
  const [singleAnonymousChatRunEnabled, setSingleAnonymousChatRunEnabled] = useState('true');
  const [maxActiveSessions, setMaxActiveSessions] = useState('');
  const [sessionManagementEnabled, setSessionManagementEnabled] = useState('true');
  // Session store type. UI says DocumentDB; persisted value remains 'mongo'.
  const [sessionStoreType, setSessionStoreType] = useState('memory');
  // Metrics store type. UI says DocumentDB; persisted value remains 'mongo'.
  const [metricsStoreType, setMetricsStoreType] = useState('memory');
  const [redactionValues, setRedactionValues] = useState({
    'redaction.profanity.en': '',
    'redaction.threat.en': '',
    'redaction.manipulation.en': '',
    'redaction.profanity.fr': '',
    'redaction.threat.fr': '',
    'redaction.manipulation.fr': '',
  });

  // Fields staged by a change but not yet persisted, keyed by setting key —
  // one flat map for the whole page. SECTION_KEYS turns it into a per-section
  // dirty check. Cleared per-key as each field's save actually succeeds.
  const [pendingChanges, setPendingChanges] = useState({});
  const [sectionSaving, setSectionSaving] = useState({
    general: false, health: false, twoFA: false, session: false, rateLimiting: false, redaction: false,
  });
  // { [section]: { text, isError } } — one save-outcome message per section,
  // replacing a single page-wide status shared by every field.
  const [sectionStatus, setSectionStatus] = useState({});

  const stageChange = (key, value) => {
    setPendingChanges((prev) => ({ ...prev, [key]: value }));
  };

  const isSectionDirty = (section) => SECTION_KEYS[section].some((key) => key in pendingChanges);

  // TODO(follow-up, pre-existing): this mount-time load and a field's own
  // onChange (below, e.g. setDefaultWorkflow(v) via stageChange) both call
  // setDefaultWorkflow with no sequencing between them. A slow initial GET
  // that resolves after the user has already started editing overwrites the
  // dropdown's displayed value with the stale loaded one, while
  // pendingChanges still holds what they typed — display and staged value
  // go out of sync. Same class of race as before the section-Save rework,
  // just a different symptom (stale display instead of stale save).
  useEffect(() => {
    async function loadSettings() {
      const settings = await DataStoreService.getSettings(SETTINGS_LOAD_KEYS, SETTINGS_LOAD_DEFAULTS);
      setStatus(settings.siteStatus);
      setDeploymentMode(settings.deploymentMode);
      setVectorServiceType(settings.vectorServiceType);
      setBaseUrl(settings['site.baseUrl'] ?? '');
      const allowedWorkflows = WORKFLOW_VALUES;
      const defaultWorkflowSetting = settings['workflow.default'];
      setDefaultWorkflow(allowedWorkflows.includes(defaultWorkflowSetting) ? defaultWorkflowSetting : DEFAULT_WORKFLOW);
      setDefaultModel(settings['model.default'] || AVAILABLE_MODELS[0].value);
      setChatTransport(['sse', 'ndjson'].includes(settings['chat.transport']) ? settings['chat.transport'] : 'sse');
      setIndigenousLanguageBlocking(String(settings['guardrail.indigenousLanguageBlocking'] ?? 'true'));
      setHealthEnabled(String(settings['systemHealth.enabled'] ?? 'false'));
      setHealthDatabaseEnabled(String(settings['systemHealth.checks.database.enabled'] ?? 'true'));
      setHealthSearchEnabled(String(settings['systemHealth.checks.search.enabled'] ?? 'true'));
      setHealthLlmEnabled(String(settings['systemHealth.checks.llm.enabled'] ?? 'true'));
      setHealthAutoDisableOnError(String(settings['systemHealth.autoDisableOnError'] ?? 'true'));
      setHealthErrorTemplateId(settings['systemHealth.errorTemplateId'] ?? '');
      setHealthFailureThreshold(Number(settings['systemHealth.failureThreshold']));
      setHealthFailureWindowSeconds(Number(settings['systemHealth.failureWindowMinutes']));
      setHealthIntervalSeconds(Number(settings['systemHealth.intervalMinutes']));
      setHealthFastIntervalSeconds(Number(settings['systemHealth.fastIntervalSeconds']));
      setHealthAlertRecipients(settings['systemHealth.alertRecipients'] ?? '');
      setHealthAlertTemplateId(settings['systemHealth.alertTemplateId'] ?? '');
      setTwoFAEnabled(String(settings['twoFA.enabled'] ?? 'false'));
      setTwoFATemplateId(settings['twoFA.templateId'] ?? '');
      setResetTemplateId(settings['notify.resetTemplateId'] ?? '');
      setSessionTTL(Number(settings['session.defaultTTLMinutes']));
      setRateLimitCapacity(Number(settings['session.rateLimitCapacity']));
      setRateLimitRefill(Number(settings['session.rateLimitRefillPerSec']));
      setAuthenticatedRateLimitCapacity(Number(settings['session.authenticatedRateLimitCapacity']));
      setAuthenticatedRateLimitRefill(Number(settings['session.authenticatedRateLimitRefillPerSec']));
      setMaxActiveSessions(settings['session.maxActiveSessions'] === 'undefined' ? '' : (settings['session.maxActiveSessions'] ?? ''));
      setSessionAuthTTL(Number(settings['session.authenticatedTTLMinutes']));
      const persistenceNorm = (settings['session.rateLimitPersistence'] || '').toString().trim().toLowerCase();
      setRateLimitPersistence(persistenceNorm === 'redis' ? 'redis' : 'memory');
      setSingleAnonymousChatRunEnabled(String(settings['session.singleAnonymousChatRunEnabled'] ?? 'true'));
      setSessionManagementEnabled(String(settings['session.managementEnabled'] ?? 'true'));
      const storeNorm = (settings['session.type'] || '').toString().trim().toLowerCase();
      setSessionStoreType(['mongo', 'mongodb', 'redis'].includes(storeNorm) ? storeNorm : 'memory');
      const metricsNorm = (settings['metrics.type'] || '').toString().trim().toLowerCase();
      setMetricsStoreType(metricsNorm === 'mongo' || metricsNorm === 'mongodb' ? 'mongo' : 'memory');
      setRedactionValues({
        'redaction.profanity.en': settings['redaction.profanity.en'] ?? '',
        'redaction.threat.en': settings['redaction.threat.en'] ?? '',
        'redaction.manipulation.en': settings['redaction.manipulation.en'] ?? '',
        'redaction.profanity.fr': settings['redaction.profanity.fr'] ?? '',
        'redaction.threat.fr': settings['redaction.threat.fr'] ?? '',
        'redaction.manipulation.fr': settings['redaction.manipulation.fr'] ?? '',
      });
    }
    loadSettings();
  }, []);

  // `append` pages in older entries under the existing ones; `silent` refreshes
  // in place without flashing the loading text over a table that is already on
  // screen; `limit` lets a post-save refresh ask for as many rows as are
  // already on screen instead of always collapsing back to the first 50 (still
  // bounded by the server's own 100-row cap). Never throws — a failed load
  // surfaces through auditError instead, so callers can await it without
  // wrapping it in their own try/catch.
  const loadAuditHistory = async ({ skip = 0, append = false, silent = false, limit = 50 } = {}) => {
    if (append) setAuditLoadingMore(true);
    else if (!silent) setAuditLoading(true);
    setAuditError(false);
    try {
      const result = await DataStoreService.getSettingsAudit({
        limit,
        skip,
        before: append ? auditAnchorRef.current : null,
      });
      const entries = result.entries || [];
      setAuditEntries((current) => (append ? [...current, ...entries] : entries));
      setAuditHasMore(Boolean(result.hasMore));
      setAuditTotal(result.total || 0);
      // A fresh read establishes the snapshot every later page is anchored to.
      if (!append) auditAnchorRef.current = entries[0]?.createdAt || null;
      // The Load more button unmounts once the last page is in. Without moving
      // focus, a keyboard user is dropped back to the top of the document and
      // loses their place in the table.
      if (append && !result.hasMore) auditRefocusRef.current = true;
    } catch (error) {
      setAuditError(true);
    } finally {
      if (append) setAuditLoadingMore(false);
      else if (!silent) setAuditLoading(false);
    }
  };

  useEffect(() => {
    loadAuditHistory();
  }, []);

  useEffect(() => {
    if (!auditRefocusRef.current) return;
    auditRefocusRef.current = false;
    auditCountRef.current?.focus();
  }, [auditEntries, auditHasMore]);

  // Warn on tab close/refresh/URL navigation while a section has unsaved
  // changes. Attached once on mount (not re-attached on every keystroke) —
  // the handler reads current dirty-state through a ref a separate cheap
  // effect keeps in sync. Note: this only covers actual browser-level
  // navigation; it does not fire for in-app route changes, and this codebase
  // has no navigation-guard pattern to hook into for that case.
  const pendingChangesRef = useRef(pendingChanges);
  useEffect(() => {
    pendingChangesRef.current = pendingChanges;
  }, [pendingChanges]);
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (Object.keys(pendingChangesRef.current).length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Submits every changed field in one section as a single request. Fields
  // that fail stay in pendingChanges so the admin can retry; fields that
  // succeed are cleared and the audit table (which now has new rows) refreshes.
  const handleSectionSave = async (section) => {
    const keys = SECTION_KEYS[section].filter((key) => key in pendingChanges);
    if (keys.length === 0) return;
    const changes = keys.map((key) => ({ key, value: pendingChanges[key] }));
    setSectionSaving((prev) => ({ ...prev, [section]: true }));
    try {
      const { values = {}, errors = {} } = await DataStoreService.setSettings(changes);
      setPendingChanges((prev) => {
        const next = { ...prev };
        Object.keys(values).forEach((key) => { delete next[key]; });
        return next;
      });
      const hasErrors = Object.keys(errors).length > 0;
      const statusText = hasErrors ? t('settings.saveError') : t('settings.saveSuccess');
      setSectionStatus((prev) => ({
        ...prev,
        [section]: { text: statusText, isError: hasErrors },
      }));
      // Every save is audited, so the table below is stale the moment a
      // section saves. Ask for as many rows as are already loaded so a saved
      // change doesn't collapse an expanded table back to the first page.
      await loadAuditHistory({ silent: true, limit: Math.max(auditEntries.length, 50) });
    } catch (err) {
      setSectionStatus((prev) => ({ ...prev, [section]: { text: t('settings.saveError'), isError: true } }));
    } finally {
      setSectionSaving((prev) => ({ ...prev, [section]: false }));
    }
  };

  const handleRefreshSettingsCache = async () => {
    setRefreshingSettingsCache(true);
    setSettingsCacheStatus(null);
    try {
      await DataStoreService.refreshSettingsCache();
      setSettingsCacheStatus({ text: t('settings.refreshCache.success'), isError: false });
      await loadAuditHistory({ silent: true, limit: Math.max(auditEntries.length, 50) });
    } catch (error) {
      setSettingsCacheStatus({
        text: t('settings.refreshCache.error').replace('{error}', () => error.message || String(error)),
        isError: true,
      });
    } finally {
      setRefreshingSettingsCache(false);
    }
  };

  const handleRedactionChange = (key, value) => {
    setRedactionValues((prev) => ({ ...prev, [key]: value }));
    stageChange(key, value);
  };

  const dirtySectionNames = Object.keys(SECTION_KEYS)
    .filter((section) => isSectionDirty(section))
    .map((section) => t(SECTION_TITLE_KEYS[section]))
    .join(', ');

  return (
    <GcdsContainer layout="page" className="mb-600 settings-page">
      <h1 className="mb-400">{t('settings.title')}</h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
        <a href={`/${lang}/admin`}>{t('common.backToAdmin')}</a>
      </nav>
      <div className="mb-400">
        <GcdsButton
          type="button"
          buttonRole="secondary"
          onClick={handleRefreshSettingsCache}
          disabled={refreshingSettingsCache}
        >
          {refreshingSettingsCache ? t('settings.refreshCache.loading') : t('settings.refreshCache.label')}
        </GcdsButton>
        <StatusMessage
          isError={settingsCacheStatus?.isError}
          tag={settingsCacheStatus ? 'div' : 'p'}
          className={
            settingsCacheStatus?.isError
              ? 'mt-200 dashboard-error dashboard-error--inline'
              : settingsCacheStatus
                ? 'mt-200 dashboard-info-box'
                : 'mt-200'
          }
        >
          {settingsCacheStatus?.isError ? (
            <>
              <GcdsIcon name="warning-triangle" marginRight="50" />
              {settingsCacheStatus.text}
            </>
          ) : settingsCacheStatus ? (
            <>
              <GcdsIcon name="info-circle" marginRight="50" />
              {settingsCacheStatus.text}
            </>
          ) : null}
        </StatusMessage>
      </div>
      {/* Per-section "Unsaved changes" only shows while that section's
          <details> is open — a page-level one stays visible regardless of
          which sections are collapsed, and names which section(s) so it's
          useful even when several are dirty at once. Gives advance notice
          before the beforeunload prompt would. */}
      {/* TODO: this page's `persistent` StatusMessage usages (here, and the
          audit-loading/empty message + "Showing X of Y" count below) were
          written against StatusMessage.js as it stood mid-merge, in parallel
          with main's own separate a11y pass over admin StatusMessage usage
          ("close StatusMessage/aria gaps in admin utility pages"). Now that
          both are merged, revisit whether `persistent`'s empty-node/
          `status-message--empty` handling still matches whatever convention
          main settled on for other admin pages' status messages, once this
          PR and any follow-up review are wrapped up — don't assume the two
          efforts landed on the same pattern just because they merged cleanly. */}
      <StatusMessage persistent tag="div" className="mb-400 dashboard-warning-box">
        {dirtySectionNames && (
          <>
            <GcdsIcon name="warning-triangle" marginRight="50" />
            {t('settings.unsavedChangesIn').replace('{sections}', () => dirtySectionNames)}
          </>
        )}
      </StatusMessage>
      <details>
        <summary>{t('settings.general.title')}</summary>
        <div className="settings-form-width">
          <label htmlFor="site-status" className="filter-label display-block">
            {t('settings.statusLabel')}
          </label>
          <select
            id="site-status"
            className="filter-select"
            value={status}
            onChange={(e) => { const v = e.target.value; setStatus(v); stageChange('siteStatus', v); }}
            disabled={sectionSaving.general}
          >
            <option value="available">{t('settings.statuses.available')}</option>
            <option value="unavailable">{t('settings.statuses.unavailable')}</option>
          </select>

          <label htmlFor="base-url" className="filter-label display-block mt-200">
            {t('settings.baseUrlLabel')}
          </label>
          <input
            id="base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => { const v = e.target.value; setBaseUrl(v); stageChange('site.baseUrl', v); }}
            disabled={sectionSaving.general}
            className="filter-input"
          />

          <label htmlFor="deployment-mode" className="filter-label display-block mt-200">
            {t('settings.deploymentModeLabel')}
          </label>
          <select
            id="deployment-mode"
            className="filter-select"
            value={deploymentMode}
            onChange={(e) => { const v = e.target.value; setDeploymentMode(v); stageChange('deploymentMode', v); }}
            disabled={sectionSaving.general}
          >
            <option value="CDS">{t('settings.deploymentMode.cds')}</option>
            <option value="Vercel">{t('settings.deploymentMode.serverless')}</option>
          </select>

          <label htmlFor="vector-service-type" className="filter-label display-block mt-200">
            {t('settings.vectorServiceTypeLabel')}
          </label>
          <select
            id="vector-service-type"
            className="filter-select"
            value={vectorServiceType}
            onChange={(e) => { const v = e.target.value; setVectorServiceType(v); stageChange('vectorServiceType', v); }}
            disabled={sectionSaving.general}
          >
            <option value="imvectordb">{t('settings.vectorServiceType.imvectordb')}</option>
            <option value="documentdb">{t('settings.vectorServiceType.documentdb')}</option>
          </select>

          <label htmlFor="default-workflow" className="filter-label display-block mt-200">
            {t('settings.defaultWorkflow.label')}
          </label>
          <select
            id="default-workflow"
            className="filter-select"
            value={defaultWorkflow}
            onChange={(e) => { const v = e.target.value; setDefaultWorkflow(v); stageChange('workflow.default', v); }}
            disabled={sectionSaving.general}
          >
            {WORKFLOWS.map(w => (
              <option key={w.value} value={w.value}>{t(w.labelKey)}</option>
            ))}
          </select>

          <label htmlFor="chat-transport" className="filter-label display-block mt-200">
            {t('settings.chatTransport.label')}
          </label>
          <select
            id="chat-transport"
            className="filter-select"
            value={chatTransport}
            onChange={(e) => { const v = e.target.value; setChatTransport(v); stageChange('chat.transport', v); }}
            disabled={sectionSaving.general}
          >
            <option value="sse">{t('settings.chatTransport.options.sse')}</option>
            <option value="ndjson">{t('settings.chatTransport.options.ndjson')}</option>
          </select>

          <label htmlFor="default-model" className="filter-label display-block mt-200">
            {t('settings.defaultModel.label')}
          </label>
          <select
            id="default-model"
            className="filter-select"
            value={defaultModel}
            onChange={(e) => { const v = e.target.value; setDefaultModel(v); stageChange('model.default', v); }}
            disabled={sectionSaving.general}
          >
            {AVAILABLE_MODELS.map(m => (
              <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
            ))}
          </select>

          <label htmlFor="indigenous-language-blocking" className="filter-label display-block mt-200">
            {t('settings.indigenousLanguageBlocking.label')}
          </label>
          <select
            id="indigenous-language-blocking"
            className="filter-select"
            value={indigenousLanguageBlocking}
            onChange={(e) => { const v = e.target.value; setIndigenousLanguageBlocking(v); stageChange('guardrail.indigenousLanguageBlocking', v); }}
            disabled={sectionSaving.general}
          >
            <option value="true">{t('common.on')}</option>
            <option value="false">{t('common.off')}</option>
          </select>

          <SectionSaveControls
            section="general"
            titleKey="settings.general.title"
            dirty={isSectionDirty('general')}
            saving={sectionSaving.general}
            status={sectionStatus.general}
            onSave={handleSectionSave}
            t={t}
          />
        </div>
      </details>

      <details>
        <summary>{t('settings.health.title')}</summary>
        <div className="settings-form-width">
        <p className="mb-400">{t('settings.health.description')}</p>

        <label htmlFor="health-enabled" className="filter-label display-block mt-200">
          {t('settings.health.enabledLabel')}
        </label>
        <select
          id="health-enabled"
          className="filter-select"
          value={healthEnabled}
          onChange={(e) => { const v = e.target.value; setHealthEnabled(v); stageChange('systemHealth.enabled', v); }}
          disabled={sectionSaving.health}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="health-database-enabled" className="filter-label display-block mt-200">
          {t('settings.health.databaseEnabledLabel')}
        </label>
        <select
          id="health-database-enabled"
          className="filter-select"
          value={healthDatabaseEnabled}
          onChange={(e) => { const v = e.target.value; setHealthDatabaseEnabled(v); stageChange('systemHealth.checks.database.enabled', v); }}
          disabled={sectionSaving.health}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="health-search-enabled" className="filter-label display-block mt-200">
          {t('settings.health.searchEnabledLabel')}
        </label>
        <select
          id="health-search-enabled"
          className="filter-select"
          value={healthSearchEnabled}
          onChange={(e) => { const v = e.target.value; setHealthSearchEnabled(v); stageChange('systemHealth.checks.search.enabled', v); }}
          disabled={sectionSaving.health}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="health-llm-enabled" className="filter-label display-block mt-200">
          {t('settings.health.llmEnabledLabel')}
        </label>
        <select
          id="health-llm-enabled"
          className="filter-select"
          value={healthLlmEnabled}
          onChange={(e) => { const v = e.target.value; setHealthLlmEnabled(v); stageChange('systemHealth.checks.llm.enabled', v); }}
          disabled={sectionSaving.health}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="health-auto-disable" className="filter-label display-block mt-200">
          {t('settings.health.autoDisableOnErrorLabel')}
        </label>
        <select
          id="health-auto-disable"
          className="filter-select"
          value={healthAutoDisableOnError}
          onChange={(e) => { const v = e.target.value; setHealthAutoDisableOnError(v); stageChange('systemHealth.autoDisableOnError', v); }}
          disabled={sectionSaving.health}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <div className="health-template-grid mt-400">
          <div className="health-template-column">
            <label htmlFor="health-error-template" className="filter-label display-block">
              {t('settings.health.errorTemplateId')}
            </label>
            <input
              id="health-error-template"
              type="text"
              value={healthErrorTemplateId}
              onChange={(e) => { const v = e.target.value; setHealthErrorTemplateId(v); stageChange('systemHealth.errorTemplateId', v); }}
              disabled={sectionSaving.health}
              className="filter-input"
            />
          </div>

          <div className="health-template-column">
            <label htmlFor="health-alert-template" className="filter-label display-block">
              {t('settings.health.alertTemplateId')}
            </label>
            <input
              id="health-alert-template"
              type="text"
              value={healthAlertTemplateId}
              onChange={(e) => { const v = e.target.value; setHealthAlertTemplateId(v); stageChange('systemHealth.alertTemplateId', v); }}
              disabled={sectionSaving.health}
              className="filter-input"
            />
          </div>
        </div>

        <label htmlFor="health-failure-threshold" className="filter-label display-block mt-200">
          {t('settings.health.failureThreshold')}
        </label>
        <input
          id="health-failure-threshold"
          className="filter-input"
          type="number"
          min="1"
          value={healthFailureThreshold}
          onChange={(e) => { const v = e.target.value; setHealthFailureThreshold(v); stageChange('systemHealth.failureThreshold', v); }}
          disabled={sectionSaving.health}
        />

        <label htmlFor="health-failure-window" className="filter-label display-block mt-200">
          {t('settings.health.failureWindowMinutes')}
        </label>
        <input
          id="health-failure-window"
          className="filter-input"
          type="number"
          min="1"
          value={healthFailureWindowSeconds}
          onChange={(e) => { const v = e.target.value; setHealthFailureWindowSeconds(v); stageChange('systemHealth.failureWindowMinutes', v); }}
          disabled={sectionSaving.health}
        />

        <label htmlFor="health-interval" className="filter-label display-block mt-200">
          {t('settings.health.intervalMinutes')}
        </label>
        <input
          id="health-interval"
          className="filter-input"
          type="number"
          min="1"
          value={healthIntervalSeconds}
          onChange={(e) => { const v = e.target.value; setHealthIntervalSeconds(v); stageChange('systemHealth.intervalMinutes', v); }}
          disabled={sectionSaving.health}
        />

        <label htmlFor="health-fast-interval" className="filter-label display-block mt-200">
          {t('settings.health.fastIntervalSeconds')}
        </label>
        <input
          id="health-fast-interval"
          className="filter-input"
          type="number"
          min="1"
          value={healthFastIntervalSeconds}
          onChange={(e) => { const v = e.target.value; setHealthFastIntervalSeconds(v); stageChange('systemHealth.fastIntervalSeconds', v); }}
          disabled={sectionSaving.health}
        />

        <label htmlFor="health-alert-recipients" className="filter-label display-block mt-200">
          {t('settings.health.alertRecipients')}
        </label>
        <input
          id="health-alert-recipients"
          type="text"
          value={healthAlertRecipients}
          onChange={(e) => { const v = e.target.value; setHealthAlertRecipients(v); stageChange('systemHealth.alertRecipients', v); }}
          disabled={sectionSaving.health}
          className="filter-input"
        />

        <SectionSaveControls
          section="health"
          titleKey="settings.health.title"
          dirty={isSectionDirty('health')}
          saving={sectionSaving.health}
          status={sectionStatus.health}
          onSave={handleSectionSave}
          t={t}
        />
        </div>
      </details>

      <details>
        <summary>{t('settings.twoFA.title')}</summary>
        <div className="settings-form-width">
        <label htmlFor="twofa-enabled" className="filter-label display-block mt-200">
          {t('settings.twoFA.enabledLabel')}
        </label>
        <select
          id="twofa-enabled"
          className="filter-select"
          value={twoFAEnabled}
          onChange={(e) => { const v = e.target.value; setTwoFAEnabled(v); stageChange('twoFA.enabled', v); }}
          disabled={sectionSaving.twoFA}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="twofa-template" className="filter-label display-block mt-200">
          {t('settings.twoFA.templateLabel')}
        </label>
        <input
          id="twofa-template"
          className="filter-input"
          type="text"
          value={twoFATemplateId}
          onChange={(e) => { const v = e.target.value; setTwoFATemplateId(v); stageChange('twoFA.templateId', v); }}
          disabled={sectionSaving.twoFA}
        />

        <label htmlFor="reset-template" className="filter-label display-block mt-200">
          {t('settings.notify.resetTemplateLabel')}
        </label>
        <input
          id="reset-template"
          className="filter-input"
          type="text"
          value={resetTemplateId}
          onChange={(e) => { const v = e.target.value; setResetTemplateId(v); stageChange('notify.resetTemplateId', v); }}
          disabled={sectionSaving.twoFA}
        />

        <SectionSaveControls
          section="twoFA"
          titleKey="settings.twoFA.title"
          dirty={isSectionDirty('twoFA')}
          saving={sectionSaving.twoFA}
          status={sectionStatus.twoFA}
          onSave={handleSectionSave}
          t={t}
        />
        </div>
      </details>

      <details>
        <summary>{t('settings.session.title')}</summary>
        <div className="settings-form-width">
        <label htmlFor="session-management-enabled" className="filter-label display-block mt-200">
          {t('settings.session.managementEnabled')}
        </label>
        <select
          id="session-management-enabled"
          className="filter-select"
          value={sessionManagementEnabled}
          onChange={(e) => { const v = e.target.value; setSessionManagementEnabled(v); stageChange('session.managementEnabled', v); }}
          disabled={sectionSaving.session}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="session-store-type" className="filter-label display-block mt-200">
          {t('settings.session.storeType')}
        </label>
        <select
          id="session-store-type"
          className="filter-select"
          value={sessionStoreType}
          onChange={(e) => { const v = e.target.value; setSessionStoreType(v); stageChange('session.type', v); }}
          disabled={sectionSaving.session}
        >
          <option value="memory">{t('settings.session.store.options.memory')}</option>
          <option value="mongo">{t('settings.session.store.options.mongo')}</option>
          <option value="redis">{t('settings.session.store.options.redis')}</option>
        </select>

        <label htmlFor="metrics-store-type" className="filter-label display-block mt-200">
          {t('settings.metrics.storeType')}
        </label>
        <select
          id="metrics-store-type"
          className="filter-select"
          value={metricsStoreType}
          onChange={(e) => { const v = e.target.value; setMetricsStoreType(v); stageChange('metrics.type', v); }}
          disabled={sectionSaving.session}
        >
          <option value="memory">{t('settings.session.store.options.memory')}</option>
          <option value="mongo">{t('settings.session.store.options.mongo')}</option>
        </select>

        <label htmlFor="session-ttl" className="filter-label display-block mt-200">
          {t('settings.session.ttlMinutes')}
        </label>
        <input
          id="session-ttl"
          className="filter-input"
          type="number"
          min="1"
          value={sessionTTL}
          onChange={(e) => { const v = e.target.value; setSessionTTL(v); stageChange('session.defaultTTLMinutes', v); }}
          disabled={sectionSaving.session}
        />

        <label htmlFor="session-auth-ttl" className="filter-label display-block mt-200">
          {t('settings.session.authTtlMinutes')}
        </label>
        <input
          id="session-auth-ttl"
          className="filter-input"
          type="number"
          min="1"
          value={sessionAuthTTL}
          onChange={(e) => { const v = e.target.value; setSessionAuthTTL(v); stageChange('session.authenticatedTTLMinutes', v); }}
          disabled={sectionSaving.session}
        />

        {/* Rate limiting moved to its own section for clarity (localized below) */}

        <label htmlFor="session-max-sessions" className="filter-label display-block mt-200">
          {t('settings.session.maxActiveSessions')}
        </label>
        <input
          id="session-max-sessions"
          className="filter-input"
          type="number"
          min="0"
          value={maxActiveSessions}
          onChange={(e) => { const v = e.target.value; setMaxActiveSessions(v); stageChange('session.maxActiveSessions', v); }}
          disabled={sectionSaving.session}
        />

        {/* session.persistence moved to rate-limiting section (stored as session.rateLimitPersistence) */}

        <SectionSaveControls
          section="session"
          titleKey="settings.session.title"
          dirty={isSectionDirty('session')}
          saving={sectionSaving.session}
          status={sectionStatus.session}
          onSave={handleSectionSave}
          t={t}
        />
        </div>
      </details>

      <details>
        <summary>{t('settings.rateLimiting.title')}</summary>
        <div className="settings-form-width">
        <label htmlFor="session-rate-persistence" className="filter-label display-block mt-200">
          {t('settings.rateLimiting.persistence.label')}
        </label>
        <select
          id="session-rate-persistence"
          className="filter-select"
          value={rateLimitPersistence}
          onChange={(e) => { const v = e.target.value; setRateLimitPersistence(v); stageChange('session.rateLimitPersistence', v); }}
          disabled={sectionSaving.rateLimiting}
        >
          <option value="memory">{t('settings.session.persistence.options.memory')}</option>
          <option value="redis">{t('settings.session.persistence.options.redis')}</option>
        </select>

        <label htmlFor="session-single-anonymous-chat-run" className="filter-label display-block mt-200">
          {t('settings.rateLimiting.singleAnonymousChatRunEnabled')}
        </label>
        <select
          id="session-single-anonymous-chat-run"
          className="filter-select"
          value={singleAnonymousChatRunEnabled}
          onChange={(e) => { const v = e.target.value; setSingleAnonymousChatRunEnabled(v); stageChange('session.singleAnonymousChatRunEnabled', v); }}
          disabled={sectionSaving.rateLimiting}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <label htmlFor="session-rate-capacity" className="filter-label display-block mt-200">
          {t('settings.rateLimiting.rateLimitCapacity')}
        </label>
        <input
          id="session-rate-capacity"
          className="filter-input"
          type="number"
          min="1"
          value={rateLimitCapacity}
          onChange={(e) => { const v = e.target.value; setRateLimitCapacity(v); stageChange('session.rateLimitCapacity', v); }}
          disabled={sectionSaving.rateLimiting}
        />

        <label htmlFor="session-rate-refill" className="filter-label display-block mt-200">
          {t('settings.rateLimiting.rateLimitRefill')}
        </label>
        <input
          id="session-rate-refill"
          className="filter-input"
          type="number"
          min="0"
          step="0.1"
          value={rateLimitRefill}
          onChange={(e) => { const v = e.target.value; setRateLimitRefill(v); stageChange('session.rateLimitRefillPerSec', v); }}
          disabled={sectionSaving.rateLimiting}
        />

        <label htmlFor="session-authenticated-rate-capacity" className="filter-label display-block mt-200">
          {t('settings.rateLimiting.authenticatedRateLimitCapacity')}
        </label>
        <input
          id="session-authenticated-rate-capacity"
          className="filter-input"
          type="number"
          min="1"
          value={authenticatedRateLimitCapacity}
          onChange={(e) => { const v = e.target.value; setAuthenticatedRateLimitCapacity(v); stageChange('session.authenticatedRateLimitCapacity', v); }}
          disabled={sectionSaving.rateLimiting}
        />

        <label htmlFor="session-authenticated-rate-refill" className="filter-label display-block mt-200">
          {t('settings.rateLimiting.authenticatedRateLimitRefill')}
        </label>
        <input
          id="session-authenticated-rate-refill"
          className="filter-input"
          type="number"
          min="0"
          step="0.1"
          value={authenticatedRateLimitRefill}
          onChange={(e) => { const v = e.target.value; setAuthenticatedRateLimitRefill(v); stageChange('session.authenticatedRateLimitRefillPerSec', v); }}
          disabled={sectionSaving.rateLimiting}
        />

        <SectionSaveControls
          section="rateLimiting"
          titleKey="settings.rateLimiting.title"
          dirty={isSectionDirty('rateLimiting')}
          saving={sectionSaving.rateLimiting}
          status={sectionStatus.rateLimiting}
          onSave={handleSectionSave}
          t={t}
        />
        </div>
      </details>
      <details>
        <summary>{t('settings.redaction.title')}</summary>
        <div>
        <p>{t('settings.redaction.description')}</p>

        <div className="grid grid-cols-2 gap-400 mb-400" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <h2 className="heading-size-h3 mb-200 mt-200">{t('settings.redaction.langEnglish')}</h2>

            <label htmlFor="redaction.profanity.en" className="filter-label display-block mt-200">
              {t('settings.redaction.profanity')} (EN)
            </label>
            <SettingsTextArea
              settingKey="redaction.profanity.en"
              value={redactionValues['redaction.profanity.en']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
            />

            <label htmlFor="redaction.threat.en" className="filter-label display-block mt-200">
              {t('settings.redaction.threat')} (EN)
            </label>
            <SettingsTextArea
              settingKey="redaction.threat.en"
              value={redactionValues['redaction.threat.en']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
            />

            <label htmlFor="redaction.manipulation.en" className="filter-label display-block mt-200">
              {t('settings.redaction.manipulation')} (EN)
            </label>
            <SettingsTextArea
              settingKey="redaction.manipulation.en"
              value={redactionValues['redaction.manipulation.en']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
            />
          </div>

          <div>
            <h2 className="heading-size-h3 mb-200 mt-200">{t('settings.redaction.langFrench')}</h2>

            <label htmlFor="redaction.profanity.fr" className="filter-label display-block mt-200">
              {t('settings.redaction.profanity')} (FR)
            </label>
            <SettingsTextArea
              settingKey="redaction.profanity.fr"
              value={redactionValues['redaction.profanity.fr']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
            />

            <label htmlFor="redaction.threat.fr" className="filter-label display-block mt-200">
              {t('settings.redaction.threat')} (FR)
            </label>
            <SettingsTextArea
              settingKey="redaction.threat.fr"
              value={redactionValues['redaction.threat.fr']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
            />

            <label htmlFor="redaction.manipulation.fr" className="filter-label display-block mt-200">
              {t('settings.redaction.manipulation')} (FR)
            </label>
            <SettingsTextArea
              settingKey="redaction.manipulation.fr"
              value={redactionValues['redaction.manipulation.fr']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
            />
          </div>
        </div>

        <SectionSaveControls
          section="redaction"
          titleKey="settings.redaction.title"
          dirty={isSectionDirty('redaction')}
          saving={sectionSaving.redaction}
          status={sectionStatus.redaction}
          onSave={handleSectionSave}
          t={t}
        />
        </div>
      </details>

      <section className="mt-600" aria-labelledby="settings-audit-title">
        <h2 id="settings-audit-title">{t('settings.auditHistory.title')}</h2>
        <p>{t('settings.auditHistory.description')}</p>
        {/* One polite region covers loading and empty: both describe the state
            of the same fetch, and keeping it mounted is what makes the message
            an announced change rather than a silent insertion. */}
        <StatusMessage
          persistent
          message={
            auditLoading
              ? t('settings.auditHistory.loading')
              : (!auditError && auditEntries.length === 0 ? t('settings.auditHistory.empty') : null)
          }
        />
        <StatusMessage isError tag="div" className="dashboard-error dashboard-error--inline">
          {auditError && (
            <>
              <GcdsIcon name="warning-triangle" marginRight="50" />
              {t('settings.auditHistory.error')}
            </>
          )}
        </StatusMessage>
        {auditEntries.length > 0 ? (
          // Wide table scrolls in its own container so the page body never
          // scrolls sideways. tabIndex makes the scroll region keyboard-reachable.
          <div className="table-scroll" tabIndex={0}>
            <table className="settings-audit-table">
              <caption className="sr-only">{t('settings.auditHistory.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('settings.auditHistory.user')}</th>
                  <th scope="col">{t('settings.auditHistory.action')}</th>
                  <th scope="col">{t('settings.auditHistory.setting')}</th>
                  <th scope="col">{t('settings.auditHistory.previousValue')}</th>
                  <th scope="col">{t('settings.auditHistory.newValue')}</th>
                  <th scope="col">{t('settings.auditHistory.date')}</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.actorEmail}</td>
                    <td>{entry.action === 'settings.cache_refreshed'
                      ? t('settings.auditHistory.actions.cacheRefreshed')
                      : t('settings.auditHistory.actions.settingUpdated')}</td>
                    <td>{entry.settingKey || t('settings.auditHistory.notApplicable')}</td>
                    <td>
                      <SettingsAuditValue
                        value={entry.previousValue}
                        emptyLabel={t('settings.auditHistory.notApplicable')}
                      />
                    </td>
                    <td>
                      <SettingsAuditValue
                        value={entry.newValue}
                        emptyLabel={t('settings.auditHistory.notApplicable')}
                      />
                    </td>
                    <td className="settings-audit-date">
                      {new Date(entry.createdAt).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <StatusMessage
          persistent
          message={auditEntries.length > 0
            ? t('settings.auditHistory.showing')
              .replace('{count}', formatNumber(auditEntries.length, lang))
              .replace('{total}', formatNumber(auditTotal, lang))
            : null}
          className="mb-200 settings-audit-count"
          tabIndex={-1}
          ref={auditCountRef}
        />
        {auditHasMore ? (
          // Deliberately not `disabled` while loading: disabling the focused
          // button blurs it, dropping a keyboard user back to <body> on every
          // page but the last. The label carries the busy state and the handler
          // guards against a second click.
          <GcdsButton
            type="button"
            buttonRole="secondary"
            onClick={() => {
              if (auditLoadingMore) return;
              loadAuditHistory({ skip: auditEntries.length, append: true });
            }}
          >
            {auditLoadingMore ? t('settings.auditHistory.loadingMore') : t('settings.auditHistory.loadMore')}
          </GcdsButton>
        ) : null}
      </section>

    </GcdsContainer>
  );
};

// Renders a section's Save button, "unsaved changes" indicator, and
// save-outcome message — the same three elements at the end of every
// details/summary block above. Defined at module scope (not inside SettingsPage)
// so React treats it as a stable component type across renders instead of
// remounting it — declaring it inside the parent's render body would give it
// a new function identity every render, forcing a full unmount/remount of
// every Save button on every keystroke.
// This is always the last element inside its <details>, so its own
// bottom margin is what keeps it off the border when the section is open —
// fixing the gap here (rather than on <details> itself) avoids double
// spacing wherever a section's last child is something like a <p> that
// already carries its own margin-bottom.
const SectionSaveControls = ({ section, titleKey, dirty, saving, status, onSave, t }) => (
  <div className="mt-400 mb-400">
    <GcdsButton
      type="button"
      onClick={() => onSave(section)}
      disabled={!dirty || saving}
      aria-label={`${t('settings.save')} ${t(titleKey)}`}
    >
      {saving ? t('settings.saving') : t('settings.save')}
    </GcdsButton>
    <StatusMessage
      isError={status?.isError}
      tag={status?.isError ? 'div' : 'p'}
      className={status?.isError ? 'mt-200 dashboard-error dashboard-error--inline' : 'mt-200'}
    >
      {status?.isError ? (
        <>
          <GcdsIcon name="warning-triangle" marginRight="50" />
          {status.text}
        </>
      ) : status?.text}
    </StatusMessage>
  </div>
);

// Pure controlled textarea for a redaction field — nothing to save itself
// anymore, staging into the parent's pendingChanges happens on every change
// (not on blur: clicking the section's Save button before a field blurs must
// not drop the just-typed text).
const SettingsTextArea = ({ settingKey, value, onChange, disabled }) => (
  <textarea
    id={settingKey}
    value={value}
    onChange={(e) => onChange(settingKey, e.target.value)}
    disabled={disabled}
    className="filter-input"
    rows={5}
  />
);

export default SettingsPage;
