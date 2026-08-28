import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GcdsButton, GcdsContainer } from '@gcds-core/components-react';
import DataStoreService from '../services/DataStoreService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import { useErrorStatus } from '../hooks/useErrorStatus.js';
import { WORKFLOWS, AVAILABLE_MODELS, WORKFLOW_VALUES, DEFAULT_WORKFLOW } from '../config/workflows.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { announce } from '../utils/liveAnnouncer.js';
import { AUDIT_VALUE_PREVIEW_LENGTH } from '../components/settings/SettingsAuditValue.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import ExplanationErrorSummary from '../components/chat/ExplanationErrorSummary.js';
// ServerDataTable (components/admin/) is the first step toward consolidating
// this app's several duplicated DataTables setups — see the longer note in
// that file for why it's not components/experimental/ExperimentalServerData
// Table.js (used by the two experimental pages) that Settings depends on,
// and why ChatDashboardPage/EvalDashboardPage/etc. aren't migrated onto it
// in this same change.
import ServerDataTable from '../components/admin/ServerDataTable.js';
import { escapeHtmlAttribute } from '../utils/reviewLink.js';
import { formatLocaleDate } from '../utils/formatLocaleDate.js';

const UNSAVED_WARNING_ANNOUNCE_DELAY_MS = 4000;

// Same truncate-behind-a-disclosure treatment as the React SettingsAuditValue
// component (previousValue/newValue can be as long as SettingsAuditService's
// own 2000-char cap), but building a raw HTML string instead of JSX —
// DataTables column `render` functions insert HTML directly, not React
// elements, so the two can't share the same component.
const renderAuditValueHtml = (value, emptyLabel) => {
  if (value === null || value === undefined) return escapeHtmlAttribute(emptyLabel);
  const text = String(value);
  if (text.length <= AUDIT_VALUE_PREVIEW_LENGTH) {
    return `<span class="settings-audit-value">${escapeHtmlAttribute(text)}</span>`;
  }
  const preview = escapeHtmlAttribute(text.slice(0, AUDIT_VALUE_PREVIEW_LENGTH));
  return `<details class="settings-audit-value settings-audit-value--long"><summary>${preview}…</summary><span>${escapeHtmlAttribute(text)}</span></details>`;
};

// setMany()'s `errors` map holds either a plain (untranslated) string — for
// errors SettingsService doesn't yet localize, e.g. a DB write failure — or
// a { i18nKey, i18nValues } pair for field validators, which compose no
// prose themselves since they run server-side with no access to the
// admin's UI language. This resolves either shape to display text in the
// admin's actual language.
const resolveFieldError = (error, t) => {
  // The plain-string branch is the rare case (a requireString/requireLiteralString
  // validation failure, or a DB write throwing inside setMany's
  // Promise.allSettled) — SettingsService.setMany has no translation for these,
  // by its own comment, so `error` here is a raw driver/exception message.
  // FeedbackInlineError renders `message` directly, so returning a fragment
  // instead of a string works with no change to that component — same
  // translated-prefix + <code lang="en"> wrap as buildErrorStatus uses for
  // DatabasePage.js's raw details, just field-scoped instead of page-scoped.
  if (typeof error === 'string') {
    const [prefix, suffix] = t('settings.fieldError.unexpected').split('{error}');
    return <>{prefix}<code lang="en">{error}</code>{suffix}</>;
  }
  if (error && error.i18nKey) {
    let message = t(error.i18nKey);
    Object.entries(error.i18nValues || {}).forEach(([placeholder, value]) => {
      message = message.replace(`{${placeholder}}`, () => value);
    });
    return message;
  }
  return String(error);
};


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

// Reverse of SECTION_KEYS — which section a given setting key belongs to.
// Lets stageChange clear that section's stale save-outcome message without
// every field's onChange having to know its own section name.
const KEY_TO_SECTION = Object.fromEntries(
  Object.entries(SECTION_KEYS).flatMap(([section, keys]) => keys.map((key) => [key, section]))
);

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

// Every setting key's own field id + label locale key — drives the inline
// FeedbackInlineError under each field (id) and the jump-link text in a
// section's ExplanationErrorSummary (labelKey), from the single per-key
// `errors` map setMany() returns, without hand-maintaining a second copy of
// every field's id/label next to its JSX.
const FIELD_META = {
  siteStatus: { fieldId: 'site-status', labelKey: 'settings.statusLabel' },
  'site.baseUrl': { fieldId: 'base-url', labelKey: 'settings.baseUrlLabel' },
  deploymentMode: { fieldId: 'deployment-mode', labelKey: 'settings.deploymentModeLabel' },
  vectorServiceType: { fieldId: 'vector-service-type', labelKey: 'settings.vectorServiceTypeLabel' },
  'workflow.default': { fieldId: 'default-workflow', labelKey: 'settings.defaultWorkflow.label' },
  'chat.transport': { fieldId: 'chat-transport', labelKey: 'settings.chatTransport.label' },
  'model.default': { fieldId: 'default-model', labelKey: 'settings.defaultModel.label' },
  'guardrail.indigenousLanguageBlocking': { fieldId: 'indigenous-language-blocking', labelKey: 'settings.indigenousLanguageBlocking.label' },
  'systemHealth.enabled': { fieldId: 'health-enabled', labelKey: 'settings.health.enabledLabel' },
  'systemHealth.checks.database.enabled': { fieldId: 'health-database-enabled', labelKey: 'settings.health.databaseEnabledLabel' },
  'systemHealth.checks.search.enabled': { fieldId: 'health-search-enabled', labelKey: 'settings.health.searchEnabledLabel' },
  'systemHealth.checks.llm.enabled': { fieldId: 'health-llm-enabled', labelKey: 'settings.health.llmEnabledLabel' },
  'systemHealth.autoDisableOnError': { fieldId: 'health-auto-disable', labelKey: 'settings.health.autoDisableOnErrorLabel' },
  'systemHealth.errorTemplateId': { fieldId: 'health-error-template', labelKey: 'settings.health.errorTemplateId' },
  'systemHealth.alertTemplateId': { fieldId: 'health-alert-template', labelKey: 'settings.health.alertTemplateId' },
  'systemHealth.failureThreshold': { fieldId: 'health-failure-threshold', labelKey: 'settings.health.failureThreshold' },
  'systemHealth.failureWindowMinutes': { fieldId: 'health-failure-window', labelKey: 'settings.health.failureWindowMinutes' },
  'systemHealth.intervalMinutes': { fieldId: 'health-interval', labelKey: 'settings.health.intervalMinutes' },
  'systemHealth.fastIntervalSeconds': { fieldId: 'health-fast-interval', labelKey: 'settings.health.fastIntervalSeconds' },
  'systemHealth.alertRecipients': { fieldId: 'health-alert-recipients', labelKey: 'settings.health.alertRecipients' },
  'twoFA.enabled': { fieldId: 'twofa-enabled', labelKey: 'settings.twoFA.enabledLabel' },
  'twoFA.templateId': { fieldId: 'twofa-template', labelKey: 'settings.twoFA.templateLabel' },
  'notify.resetTemplateId': { fieldId: 'reset-template', labelKey: 'settings.notify.resetTemplateLabel' },
  'session.managementEnabled': { fieldId: 'session-management-enabled', labelKey: 'settings.session.managementEnabled' },
  'session.type': { fieldId: 'session-store-type', labelKey: 'settings.session.storeType' },
  'metrics.type': { fieldId: 'metrics-store-type', labelKey: 'settings.metrics.storeType' },
  'session.defaultTTLMinutes': { fieldId: 'session-ttl', labelKey: 'settings.session.ttlMinutes' },
  'session.authenticatedTTLMinutes': { fieldId: 'session-auth-ttl', labelKey: 'settings.session.authTtlMinutes' },
  'session.maxActiveSessions': { fieldId: 'session-max-sessions', labelKey: 'settings.session.maxActiveSessions' },
  'session.rateLimitPersistence': { fieldId: 'session-rate-persistence', labelKey: 'settings.rateLimiting.persistence.label' },
  'session.singleAnonymousChatRunEnabled': { fieldId: 'session-single-anonymous-chat-run', labelKey: 'settings.rateLimiting.singleAnonymousChatRunEnabled' },
  'session.rateLimitCapacity': { fieldId: 'session-rate-capacity', labelKey: 'settings.rateLimiting.rateLimitCapacity' },
  'session.rateLimitRefillPerSec': { fieldId: 'session-rate-refill', labelKey: 'settings.rateLimiting.rateLimitRefill' },
  'session.authenticatedRateLimitCapacity': { fieldId: 'session-authenticated-rate-capacity', labelKey: 'settings.rateLimiting.authenticatedRateLimitCapacity' },
  'session.authenticatedRateLimitRefillPerSec': { fieldId: 'session-authenticated-rate-refill', labelKey: 'settings.rateLimiting.authenticatedRateLimitRefill' },
  'redaction.profanity.en': { fieldId: 'redaction.profanity.en', labelKey: 'settings.redaction.profanity' },
  'redaction.threat.en': { fieldId: 'redaction.threat.en', labelKey: 'settings.redaction.threat' },
  'redaction.manipulation.en': { fieldId: 'redaction.manipulation.en', labelKey: 'settings.redaction.manipulation' },
  'redaction.profanity.fr': { fieldId: 'redaction.profanity.fr', labelKey: 'settings.redaction.profanity' },
  'redaction.threat.fr': { fieldId: 'redaction.threat.fr', labelKey: 'settings.redaction.threat' },
  'redaction.manipulation.fr': { fieldId: 'redaction.manipulation.fr', labelKey: 'settings.redaction.manipulation' },
};

const SettingsPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  // Shared with DatabasePage.js's own ~13 uses of the same shape - see
  // useErrorStatus.js. This page's only use (the settings-cache refresh
  // below) renders success as 'info' (a neutral confirmation, not a
  // completed mutation), not the 'success' default.
  const { buildErrorStatus, renderStatusMessage } = useErrorStatus(t);
  const [status, setStatus] = useState('available');
  const [deploymentMode, setDeploymentMode] = useState('CDS');
  const [vectorServiceType, setVectorServiceType] = useState('imvectordb');
  const [refreshingSettingsCache, setRefreshingSettingsCache] = useState(false);
  const [settingsCacheStatus, setSettingsCacheStatus] = useState(null); // { text, isError }
  // Imperative handle onto the audit history table (see ServerDataTable.js)
  // — after a section save or a cache refresh writes new audit rows,
  // auditTableRef.current.reload() re-fetches the current page in place
  // without resetting whatever the admin had typed into the search box or
  // paged to, unlike forcing a full remount via a `tableKey` bump.
  const auditTableRef = useRef(null);
  // Set from ServerDataTable's onError — a genuine fetch failure used to be
  // silently indistinguishable from "no audit rows exist" (both rendered
  // emptyTableText). buildErrorStatus/renderStatusMessage below is the same
  // shape/rendering this page's settingsCacheStatus and DatabasePage.js's
  // ~13 operations already use.
  const [auditLoadStatus, setAuditLoadStatus] = useState(null);
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
  // Raw settings values as last loaded from the server, keyed by setting
  // key — a ref (not state) since nothing renders it directly, only
  // stageChange reads it. Lets an edit that lands back on the original value
  // (e.g. bump a number up then back down) drop out of pendingChanges
  // instead of leaving the section dirty for a net-zero change. Compared
  // against the raw loaded string rather than each field's own
  // display-normalized state (Number()/allowlist-clamped/etc.), so this can
  // miss a revert on the handful of fields with non-trivial normalization
  // (e.g. session store type) if the stored value itself is in an unusual
  // form — acceptable for the common case this fixes (typing a number back
  // to what it was) without needing to duplicate every field's own
  // load-time transform here too.
  const originalValuesRef = useRef({});
  const [sectionSaving, setSectionSaving] = useState({
    general: false, health: false, twoFA: false, session: false, rateLimiting: false, redaction: false,
  });
  // { [section]: { text, isError } } — one save-outcome message per section,
  // replacing a single page-wide status shared by every field.
  const [sectionStatus, setSectionStatus] = useState({});
  // { [settingKey]: message } — per-field validation errors from the last
  // setMany() response, surfaced inline via FeedbackInlineError next to the
  // field itself rather than only in the section's generic StatusMessage.
  const [fieldErrors, setFieldErrors] = useState({});
  // { [section]: number } — bumped on every save that comes back with 1+
  // field errors, even if the same field fails again with the same message.
  // ExplanationErrorSummary needs a change, not just a truthy value, to
  // re-focus/re-announce on a second failed attempt (see useFocusOnChange).
  const [sectionErrorAttempt, setSectionErrorAttempt] = useState({});
  // Bumped on every save attempt (success or failure) for a section, so
  // SectionSaveControls' StatusMessage re-announces even when the
  // outcome text is identical to the previous attempt (e.g. two saves in a
  // row that both succeed, or a retry that hits the same error).
  const [sectionSaveNonce, setSectionSaveNonce] = useState({});

  const stageChange = (key, value) => {
    const original = originalValuesRef.current[key];
    const isReverted = original !== undefined && String(original) === value;
    setPendingChanges((prev) => {
      if (isReverted) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
    // A fresh edit supersedes whatever the last save attempt said was wrong
    // with this field.
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // The section's last save-outcome message describes a state the admin
    // has now changed again — "Changes to X saved" would otherwise keep
    // showing next to a field edited since that save.
    const section = KEY_TO_SECTION[key];
    setSectionStatus((prev) => {
      if (!section || !prev[section]) return prev;
      const next = { ...prev };
      delete next[section];
      return next;
    });
  };

  // A number input cleared to empty is invalid server-side (requireString
  // rejects '' for any key not in EMPTY_ALLOWED_SETTINGS, aborting the whole
  // section's batch save, not just this field) — snap it to '0' once the
  // admin leaves the field, instead of letting an empty value ever reach
  // Save. Only fires on blur, not onChange, so mid-edit clearing (e.g.
  // select-all + delete before typing a new number) isn't fought.
  const defaultEmptyNumberOnBlur = (currentValue, setDisplay, key) => {
    if (currentValue === '') {
      setDisplay('0');
      stageChange(key, '0');
    }
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
      originalValuesRef.current = settings;
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

  // fetchData contract for ServerDataTable: called with
  // DataTables' own server-side params (start/length/search), returns the
  // recordsTotal/recordsFiltered/data shape its ajax callback expects.
  // Sorting is disabled on this table (see the `ordering={false}` prop
  // below), so no orderBy/orderDir mapping is needed — the server always
  // sorts newest-first.
  const fetchAuditHistory = useCallback(async ({ start, length, search }) => {
    const result = await DataStoreService.getSettingsAudit({
      skip: start || 0,
      limit: length || 10,
      search: search || '',
    });
    return {
      data: result.entries || [],
      recordsTotal: result.total || 0,
      recordsFiltered: result.filteredTotal || 0,
    };
  }, []);

  const auditColumns = useMemo(() => [
    {
      data: 'actorEmail',
      title: t('settings.auditHistory.user'),
      render: (value) => escapeHtmlAttribute(value || ''),
    },
    {
      data: 'action',
      title: t('settings.auditHistory.action'),
      render: (value) => escapeHtmlAttribute(
        value === 'settings.cache_refreshed'
          ? t('settings.auditHistory.actions.cacheRefreshed')
          : t('settings.auditHistory.actions.settingUpdated')
      ),
    },
    {
      data: 'settingKey',
      title: t('settings.auditHistory.setting'),
      render: (value) => escapeHtmlAttribute(value || t('settings.auditHistory.notApplicable')),
    },
    {
      data: 'previousValue',
      title: t('settings.auditHistory.previousValue'),
      render: (value) => renderAuditValueHtml(value, t('settings.auditHistory.notApplicable')),
    },
    {
      data: 'newValue',
      title: t('settings.auditHistory.newValue'),
      render: (value) => renderAuditValueHtml(value, t('settings.auditHistory.notApplicable')),
    },
    {
      data: 'createdAt',
      title: t('settings.auditHistory.date'),
      render: (value) => escapeHtmlAttribute(formatLocaleDate(value, lang, t('settings.auditHistory.notApplicable'))),
    },
  ], [lang, t]);

  // Warn on tab close/refresh/URL navigation while a section has unsaved
  // changes. Attached once on mount (not re-attached on every keystroke) —
  // the handler reads current dirty-state through a ref a separate cheap
  // effect keeps in sync. Note: this only covers actual browser-level
  // navigation; it does not fire for in-app route changes, and this codebase
  // has no navigation-guard pattern to hook into for that case.
  //
  // TODO (edge case, low priority): the browser Back/Forward buttons can
  // restore this page from the bfcache instead of re-mounting it, so an
  // unsaved edit can still show as dirty after navigating away and back. Fix
  // would listen for `pageshow`/`event.persisted`; needs real cross-browser
  // testing before landing, not just reasoning about it — out of scope for
  // MVP.
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
      // A saved value is the new "reverting to this counts as no change"
      // baseline — otherwise editing a just-saved field back to its (older,
      // pre-save) original would wrongly stay flagged as a pending change.
      Object.entries(values).forEach(([key, value]) => {
        originalValuesRef.current[key] = value;
      });
      const hasErrors = Object.keys(errors).length > 0;
      setFieldErrors((prev) => {
        const next = { ...prev };
        Object.keys(values).forEach((key) => { delete next[key]; });
        Object.entries(errors).forEach(([key, error]) => { next[key] = resolveFieldError(error, t); });
        return next;
      });
      if (hasErrors) {
        setSectionErrorAttempt((prev) => ({ ...prev, [section]: (prev[section] || 0) + 1 }));
      }
      const statusText = hasErrors
        ? t('settings.saveError')
        : t('settings.saveSuccessIn').replace('{section}', () => t(SECTION_TITLE_KEYS[section]));
      setSectionStatus((prev) => ({
        ...prev,
        [section]: { text: statusText, isError: hasErrors },
      }));
      setSectionSaveNonce((prev) => ({ ...prev, [section]: (prev[section] || 0) + 1 }));
      // Every save is audited, so the table below is stale the moment a
      // section saves — reload it in place.
      auditTableRef.current?.reload();
    } catch (err) {
      setSectionStatus((prev) => ({ ...prev, [section]: { text: t('settings.saveError'), isError: true } }));
      setSectionSaveNonce((prev) => ({ ...prev, [section]: (prev[section] || 0) + 1 }));
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
      auditTableRef.current?.reload();
    } catch (error) {
      setSettingsCacheStatus(buildErrorStatus('settings.refreshCache.error', error));
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
  const unsavedWarning = dirtySectionNames
    ? t('settings.unsavedChangesIn').replace('{sections}', () => dirtySectionNames)
    : undefined;
  // Announced only if still unsaved a few seconds after it appears —
  // announcing on the first keystroke talks over the field being typed in.
  // Re-arms whenever the set of dirty sections changes.
  useEffect(() => {
    if (!unsavedWarning) return undefined;
    const timer = setTimeout(() => announce(unsavedWarning), UNSAVED_WARNING_ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [unsavedWarning]);

  return (
    <GcdsContainer layout="page" className="mb-600 filter-fields-full-size">
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
        {renderStatusMessage(settingsCacheStatus, 'info')}
      </div>
      {/* Per-section "Unsaved changes" only shows while that section's
          <details> is open — a page-level one stays visible regardless of
          which sections are collapsed, and names which section(s) so it's
          useful even when several are dirty at once. Gives advance notice
          before the beforeunload prompt would. */}
      {/* announce={false} + the delayed announce() above: this appears on
          the first keystroke, and announcing it right then talks over the
          field being typed in, so it's easy to miss. It's announced only if
          still unsaved a few seconds later. */}
      <StatusMessage
        variant={unsavedWarning ? 'warning' : undefined}
        message={unsavedWarning}
        announce={false}
        announcedVia="live-announcer-polite"
        className="mb-400"
      />
      <details>
        <summary>{t('settings.general.title')}</summary>
        <div className="settings-form-width">
            {fieldErrors['siteStatus'] && (
              <FeedbackInlineError id="site-status-error" message={fieldErrors['siteStatus']} announce={false} />
            )}
          <label htmlFor="site-status" className="filter-label display-block">
            {t('settings.statusLabel')}
          </label>
          <select
            id="site-status"
            className="filter-select"
            value={status}
            onChange={(e) => { const v = e.target.value; setStatus(v); stageChange('siteStatus', v); }}
            disabled={sectionSaving.general}
            aria-describedby={fieldErrors['siteStatus'] ? 'site-status-error' : undefined}
          >
            <option value="available">{t('settings.statuses.available')}</option>
            <option value="unavailable">{t('settings.statuses.unavailable')}</option>
          </select>

          {fieldErrors['site.baseUrl'] && (
            <FeedbackInlineError id="base-url-error" message={fieldErrors['site.baseUrl']} announce={false} />
          )}
          <label htmlFor="base-url" className="filter-label display-block mt-200">
            {t('settings.baseUrlLabel')}
          </label>
          <input
            id="base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => { const v = e.target.value; setBaseUrl(v); stageChange('site.baseUrl', v); }}
            disabled={sectionSaving.general}
            aria-describedby={fieldErrors['site.baseUrl'] ? 'base-url-error' : undefined}
            className="filter-input"
          />

            {fieldErrors['deploymentMode'] && (
              <FeedbackInlineError id="deployment-mode-error" message={fieldErrors['deploymentMode']} announce={false} />
            )}
          <label htmlFor="deployment-mode" className="filter-label display-block mt-200">
            {t('settings.deploymentModeLabel')}
          </label>
          <select
            id="deployment-mode"
            className="filter-select"
            value={deploymentMode}
            onChange={(e) => { const v = e.target.value; setDeploymentMode(v); stageChange('deploymentMode', v); }}
            disabled={sectionSaving.general}
            aria-describedby={fieldErrors['deploymentMode'] ? 'deployment-mode-error' : undefined}
          >
            <option value="CDS">{t('settings.deploymentMode.cds')}</option>
            <option value="Vercel">{t('settings.deploymentMode.serverless')}</option>
          </select>

            {fieldErrors['vectorServiceType'] && (
              <FeedbackInlineError id="vector-service-type-error" message={fieldErrors['vectorServiceType']} announce={false} />
            )}
          <label htmlFor="vector-service-type" className="filter-label display-block mt-200">
            {t('settings.vectorServiceTypeLabel')}
          </label>
          <select
            id="vector-service-type"
            className="filter-select"
            value={vectorServiceType}
            onChange={(e) => { const v = e.target.value; setVectorServiceType(v); stageChange('vectorServiceType', v); }}
            disabled={sectionSaving.general}
            aria-describedby={fieldErrors['vectorServiceType'] ? 'vector-service-type-error' : undefined}
          >
            <option value="imvectordb">{t('settings.vectorServiceType.imvectordb')}</option>
            <option value="documentdb">{t('settings.vectorServiceType.documentdb')}</option>
          </select>

            {fieldErrors['workflow.default'] && (
              <FeedbackInlineError id="default-workflow-error" message={fieldErrors['workflow.default']} announce={false} />
            )}
          <label htmlFor="default-workflow" className="filter-label display-block mt-200">
            {t('settings.defaultWorkflow.label')}
          </label>
          <select
            id="default-workflow"
            className="filter-select"
            value={defaultWorkflow}
            onChange={(e) => { const v = e.target.value; setDefaultWorkflow(v); stageChange('workflow.default', v); }}
            disabled={sectionSaving.general}
            aria-describedby={fieldErrors['workflow.default'] ? 'default-workflow-error' : undefined}
          >
            {WORKFLOWS.map(w => (
              <option key={w.value} value={w.value}>{t(w.labelKey)}</option>
            ))}
          </select>

            {fieldErrors['chat.transport'] && (
              <FeedbackInlineError id="chat-transport-error" message={fieldErrors['chat.transport']} announce={false} />
            )}
          <label htmlFor="chat-transport" className="filter-label display-block mt-200">
            {t('settings.chatTransport.label')}
          </label>
          <select
            id="chat-transport"
            className="filter-select"
            value={chatTransport}
            onChange={(e) => { const v = e.target.value; setChatTransport(v); stageChange('chat.transport', v); }}
            disabled={sectionSaving.general}
            aria-describedby={fieldErrors['chat.transport'] ? 'chat-transport-error' : undefined}
          >
            <option value="sse">{t('settings.chatTransport.options.sse')}</option>
            <option value="ndjson">{t('settings.chatTransport.options.ndjson')}</option>
          </select>

            {fieldErrors['model.default'] && (
              <FeedbackInlineError id="default-model-error" message={fieldErrors['model.default']} announce={false} />
            )}
          <label htmlFor="default-model" className="filter-label display-block mt-200">
            {t('settings.defaultModel.label')}
          </label>
          <select
            id="default-model"
            className="filter-select"
            value={defaultModel}
            onChange={(e) => { const v = e.target.value; setDefaultModel(v); stageChange('model.default', v); }}
            disabled={sectionSaving.general}
            aria-describedby={fieldErrors['model.default'] ? 'default-model-error' : undefined}
          >
            {AVAILABLE_MODELS.map(m => (
              <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
            ))}
          </select>

            {fieldErrors['guardrail.indigenousLanguageBlocking'] && (
              <FeedbackInlineError id="indigenous-language-blocking-error" message={fieldErrors['guardrail.indigenousLanguageBlocking']} announce={false} />
            )}
          <label htmlFor="indigenous-language-blocking" className="filter-label display-block mt-200">
            {t('settings.indigenousLanguageBlocking.label')}
          </label>
          <select
            id="indigenous-language-blocking"
            className="filter-select"
            value={indigenousLanguageBlocking}
            onChange={(e) => { const v = e.target.value; setIndigenousLanguageBlocking(v); stageChange('guardrail.indigenousLanguageBlocking', v); }}
            disabled={sectionSaving.general}
            aria-describedby={fieldErrors['guardrail.indigenousLanguageBlocking'] ? 'indigenous-language-blocking-error' : undefined}
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
            fieldErrors={fieldErrors}
            errorAttempt={sectionErrorAttempt.general || 0}
            saveNonce={sectionSaveNonce.general || 0}
          />
        </div>
      </details>

      <details>
        <summary>{t('settings.health.title')}</summary>
        <div className="settings-form-width">
        <p className="mb-400">{t('settings.health.description')}</p>

          {fieldErrors['systemHealth.enabled'] && (
            <FeedbackInlineError id="health-enabled-error" message={fieldErrors['systemHealth.enabled']} announce={false} />
          )}
        <label htmlFor="health-enabled" className="filter-label display-block mt-200">
          {t('settings.health.enabledLabel')}
        </label>
        <select
          id="health-enabled"
          className="filter-select"
          value={healthEnabled}
          onChange={(e) => { const v = e.target.value; setHealthEnabled(v); stageChange('systemHealth.enabled', v); }}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.enabled'] ? 'health-enabled-error' : undefined}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

          {fieldErrors['systemHealth.checks.database.enabled'] && (
            <FeedbackInlineError id="health-database-enabled-error" message={fieldErrors['systemHealth.checks.database.enabled']} announce={false} />
          )}
        <label htmlFor="health-database-enabled" className="filter-label display-block mt-200">
          {t('settings.health.databaseEnabledLabel')}
        </label>
        <select
          id="health-database-enabled"
          className="filter-select"
          value={healthDatabaseEnabled}
          onChange={(e) => { const v = e.target.value; setHealthDatabaseEnabled(v); stageChange('systemHealth.checks.database.enabled', v); }}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.checks.database.enabled'] ? 'health-database-enabled-error' : undefined}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

          {fieldErrors['systemHealth.checks.search.enabled'] && (
            <FeedbackInlineError id="health-search-enabled-error" message={fieldErrors['systemHealth.checks.search.enabled']} announce={false} />
          )}
        <label htmlFor="health-search-enabled" className="filter-label display-block mt-200">
          {t('settings.health.searchEnabledLabel')}
        </label>
        <select
          id="health-search-enabled"
          className="filter-select"
          value={healthSearchEnabled}
          onChange={(e) => { const v = e.target.value; setHealthSearchEnabled(v); stageChange('systemHealth.checks.search.enabled', v); }}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.checks.search.enabled'] ? 'health-search-enabled-error' : undefined}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

          {fieldErrors['systemHealth.checks.llm.enabled'] && (
            <FeedbackInlineError id="health-llm-enabled-error" message={fieldErrors['systemHealth.checks.llm.enabled']} announce={false} />
          )}
        <label htmlFor="health-llm-enabled" className="filter-label display-block mt-200">
          {t('settings.health.llmEnabledLabel')}
        </label>
        <select
          id="health-llm-enabled"
          className="filter-select"
          value={healthLlmEnabled}
          onChange={(e) => { const v = e.target.value; setHealthLlmEnabled(v); stageChange('systemHealth.checks.llm.enabled', v); }}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.checks.llm.enabled'] ? 'health-llm-enabled-error' : undefined}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

          {fieldErrors['systemHealth.autoDisableOnError'] && (
            <FeedbackInlineError id="health-auto-disable-error" message={fieldErrors['systemHealth.autoDisableOnError']} announce={false} />
          )}
        <label htmlFor="health-auto-disable" className="filter-label display-block mt-200">
          {t('settings.health.autoDisableOnErrorLabel')}
        </label>
        <select
          id="health-auto-disable"
          className="filter-select"
          value={healthAutoDisableOnError}
          onChange={(e) => { const v = e.target.value; setHealthAutoDisableOnError(v); stageChange('systemHealth.autoDisableOnError', v); }}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.autoDisableOnError'] ? 'health-auto-disable-error' : undefined}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

        <div className="health-template-grid mt-400">
          <div className="health-template-column">
            {fieldErrors['systemHealth.errorTemplateId'] && (
              <FeedbackInlineError id="health-error-template-error" message={fieldErrors['systemHealth.errorTemplateId']} announce={false} />
            )}
            <label htmlFor="health-error-template" className="filter-label display-block">
              {t('settings.health.errorTemplateId')}
            </label>
            <input
              id="health-error-template"
              type="text"
              value={healthErrorTemplateId}
              onChange={(e) => { const v = e.target.value; setHealthErrorTemplateId(v); stageChange('systemHealth.errorTemplateId', v); }}
              disabled={sectionSaving.health}
              aria-describedby={fieldErrors['systemHealth.errorTemplateId'] ? 'health-error-template-error' : undefined}
              className="filter-input"
            />
          </div>

          <div className="health-template-column">
            {fieldErrors['systemHealth.alertTemplateId'] && (
              <FeedbackInlineError id="health-alert-template-error" message={fieldErrors['systemHealth.alertTemplateId']} announce={false} />
            )}
            <label htmlFor="health-alert-template" className="filter-label display-block">
              {t('settings.health.alertTemplateId')}
            </label>
            <input
              id="health-alert-template"
              type="text"
              value={healthAlertTemplateId}
              onChange={(e) => { const v = e.target.value; setHealthAlertTemplateId(v); stageChange('systemHealth.alertTemplateId', v); }}
              disabled={sectionSaving.health}
              aria-describedby={fieldErrors['systemHealth.alertTemplateId'] ? 'health-alert-template-error' : undefined}
              className="filter-input"
            />
          </div>
        </div>

          {fieldErrors['systemHealth.failureThreshold'] && (
            <FeedbackInlineError id="health-failure-threshold-error" message={fieldErrors['systemHealth.failureThreshold']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(healthFailureThreshold, setHealthFailureThreshold, 'systemHealth.failureThreshold')}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.failureThreshold'] ? 'health-failure-threshold-error' : undefined}
        />

          {fieldErrors['systemHealth.failureWindowMinutes'] && (
            <FeedbackInlineError id="health-failure-window-error" message={fieldErrors['systemHealth.failureWindowMinutes']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(healthFailureWindowSeconds, setHealthFailureWindowSeconds, 'systemHealth.failureWindowMinutes')}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.failureWindowMinutes'] ? 'health-failure-window-error' : undefined}
        />

          {fieldErrors['systemHealth.intervalMinutes'] && (
            <FeedbackInlineError id="health-interval-error" message={fieldErrors['systemHealth.intervalMinutes']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(healthIntervalSeconds, setHealthIntervalSeconds, 'systemHealth.intervalMinutes')}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.intervalMinutes'] ? 'health-interval-error' : undefined}
        />

          {fieldErrors['systemHealth.fastIntervalSeconds'] && (
            <FeedbackInlineError id="health-fast-interval-error" message={fieldErrors['systemHealth.fastIntervalSeconds']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(healthFastIntervalSeconds, setHealthFastIntervalSeconds, 'systemHealth.fastIntervalSeconds')}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.fastIntervalSeconds'] ? 'health-fast-interval-error' : undefined}
        />

        {fieldErrors['systemHealth.alertRecipients'] && (
          <FeedbackInlineError id="health-alert-recipients-error" message={fieldErrors['systemHealth.alertRecipients']} announce={false} />
        )}
        <label htmlFor="health-alert-recipients" className="filter-label display-block mt-200">
          {t('settings.health.alertRecipients')}
        </label>
        <input
          id="health-alert-recipients"
          type="text"
          value={healthAlertRecipients}
          onChange={(e) => { const v = e.target.value; setHealthAlertRecipients(v); stageChange('systemHealth.alertRecipients', v); }}
          disabled={sectionSaving.health}
          aria-describedby={fieldErrors['systemHealth.alertRecipients'] ? 'health-alert-recipients-error' : undefined}
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
          fieldErrors={fieldErrors}
          errorAttempt={sectionErrorAttempt.health || 0}
          saveNonce={sectionSaveNonce.health || 0}
        />
        </div>
      </details>

      <details>
        <summary>{t('settings.twoFA.title')}</summary>
        <div className="settings-form-width">
          {fieldErrors['twoFA.enabled'] && (
            <FeedbackInlineError id="twofa-enabled-error" message={fieldErrors['twoFA.enabled']} announce={false} />
          )}
        <label htmlFor="twofa-enabled" className="filter-label display-block mt-200">
          {t('settings.twoFA.enabledLabel')}
        </label>
        <select
          id="twofa-enabled"
          className="filter-select"
          value={twoFAEnabled}
          onChange={(e) => { const v = e.target.value; setTwoFAEnabled(v); stageChange('twoFA.enabled', v); }}
          disabled={sectionSaving.twoFA}
          aria-describedby={fieldErrors['twoFA.enabled'] ? 'twofa-enabled-error' : undefined}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

          {fieldErrors['twoFA.templateId'] && (
            <FeedbackInlineError id="twofa-template-error" message={fieldErrors['twoFA.templateId']} announce={false} />
          )}
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
          aria-describedby={fieldErrors['twoFA.templateId'] ? 'twofa-template-error' : undefined}
        />

          {fieldErrors['notify.resetTemplateId'] && (
            <FeedbackInlineError id="reset-template-error" message={fieldErrors['notify.resetTemplateId']} announce={false} />
          )}
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
          aria-describedby={fieldErrors['notify.resetTemplateId'] ? 'reset-template-error' : undefined}
        />

        <SectionSaveControls
          section="twoFA"
          titleKey="settings.twoFA.title"
          dirty={isSectionDirty('twoFA')}
          saving={sectionSaving.twoFA}
          status={sectionStatus.twoFA}
          onSave={handleSectionSave}
          t={t}
          fieldErrors={fieldErrors}
          errorAttempt={sectionErrorAttempt.twoFA || 0}
          saveNonce={sectionSaveNonce.twoFA || 0}
        />
        </div>
      </details>

      <details>
        <summary>{t('settings.session.title')}</summary>
        <div className="settings-form-width">
          {fieldErrors['session.managementEnabled'] && (
            <FeedbackInlineError id="session-management-enabled-error" message={fieldErrors['session.managementEnabled']} announce={false} />
          )}
        <label htmlFor="session-management-enabled" className="filter-label display-block mt-200">
          {t('settings.session.managementEnabled')}
        </label>
        <select
          id="session-management-enabled"
          className="filter-select"
          value={sessionManagementEnabled}
          onChange={(e) => { const v = e.target.value; setSessionManagementEnabled(v); stageChange('session.managementEnabled', v); }}
          disabled={sectionSaving.session}
          aria-describedby={fieldErrors['session.managementEnabled'] ? 'session-management-enabled-error' : undefined}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

          {fieldErrors['session.type'] && (
            <FeedbackInlineError id="session-store-type-error" message={fieldErrors['session.type']} announce={false} />
          )}
        <label htmlFor="session-store-type" className="filter-label display-block mt-200">
          {t('settings.session.storeType')}
        </label>
        <select
          id="session-store-type"
          className="filter-select"
          value={sessionStoreType}
          onChange={(e) => { const v = e.target.value; setSessionStoreType(v); stageChange('session.type', v); }}
          disabled={sectionSaving.session}
          aria-describedby={fieldErrors['session.type'] ? 'session-store-type-error' : undefined}
        >
          <option value="memory">{t('settings.session.store.options.memory')}</option>
          <option value="mongo">{t('settings.session.store.options.mongo')}</option>
          <option value="redis">{t('settings.session.store.options.redis')}</option>
        </select>

          {fieldErrors['metrics.type'] && (
            <FeedbackInlineError id="metrics-store-type-error" message={fieldErrors['metrics.type']} announce={false} />
          )}
        <label htmlFor="metrics-store-type" className="filter-label display-block mt-200">
          {t('settings.metrics.storeType')}
        </label>
        <select
          id="metrics-store-type"
          className="filter-select"
          value={metricsStoreType}
          onChange={(e) => { const v = e.target.value; setMetricsStoreType(v); stageChange('metrics.type', v); }}
          disabled={sectionSaving.session}
          aria-describedby={fieldErrors['metrics.type'] ? 'metrics-store-type-error' : undefined}
        >
          <option value="memory">{t('settings.session.store.options.memory')}</option>
          <option value="mongo">{t('settings.session.store.options.mongo')}</option>
        </select>

          {fieldErrors['session.defaultTTLMinutes'] && (
            <FeedbackInlineError id="session-ttl-error" message={fieldErrors['session.defaultTTLMinutes']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(sessionTTL, setSessionTTL, 'session.defaultTTLMinutes')}
          disabled={sectionSaving.session}
          aria-describedby={fieldErrors['session.defaultTTLMinutes'] ? 'session-ttl-error' : undefined}
        />

          {fieldErrors['session.authenticatedTTLMinutes'] && (
            <FeedbackInlineError id="session-auth-ttl-error" message={fieldErrors['session.authenticatedTTLMinutes']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(sessionAuthTTL, setSessionAuthTTL, 'session.authenticatedTTLMinutes')}
          disabled={sectionSaving.session}
          aria-describedby={fieldErrors['session.authenticatedTTLMinutes'] ? 'session-auth-ttl-error' : undefined}
        />

        {/* Rate limiting moved to its own section for clarity (localized below) */}

          {fieldErrors['session.maxActiveSessions'] && (
            <FeedbackInlineError id="session-max-sessions-error" message={fieldErrors['session.maxActiveSessions']} announce={false} />
          )}
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
          aria-describedby={fieldErrors['session.maxActiveSessions'] ? 'session-max-sessions-error' : undefined}
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
          fieldErrors={fieldErrors}
          errorAttempt={sectionErrorAttempt.session || 0}
          saveNonce={sectionSaveNonce.session || 0}
        />
        </div>
      </details>

      <details>
        <summary>{t('settings.rateLimiting.title')}</summary>
        <div className="settings-form-width">
          {fieldErrors['session.rateLimitPersistence'] && (
            <FeedbackInlineError id="session-rate-persistence-error" message={fieldErrors['session.rateLimitPersistence']} announce={false} />
          )}
        <label htmlFor="session-rate-persistence" className="filter-label display-block mt-200">
          {t('settings.rateLimiting.persistence.label')}
        </label>
        <select
          id="session-rate-persistence"
          className="filter-select"
          value={rateLimitPersistence}
          onChange={(e) => { const v = e.target.value; setRateLimitPersistence(v); stageChange('session.rateLimitPersistence', v); }}
          disabled={sectionSaving.rateLimiting}
          aria-describedby={fieldErrors['session.rateLimitPersistence'] ? 'session-rate-persistence-error' : undefined}
        >
          <option value="memory">{t('settings.session.persistence.options.memory')}</option>
          <option value="redis">{t('settings.session.persistence.options.redis')}</option>
        </select>

          {fieldErrors['session.singleAnonymousChatRunEnabled'] && (
            <FeedbackInlineError id="session-single-anonymous-chat-run-error" message={fieldErrors['session.singleAnonymousChatRunEnabled']} announce={false} />
          )}
        <label htmlFor="session-single-anonymous-chat-run" className="filter-label display-block mt-200">
          {t('settings.rateLimiting.singleAnonymousChatRunEnabled')}
        </label>
        <select
          id="session-single-anonymous-chat-run"
          className="filter-select"
          value={singleAnonymousChatRunEnabled}
          onChange={(e) => { const v = e.target.value; setSingleAnonymousChatRunEnabled(v); stageChange('session.singleAnonymousChatRunEnabled', v); }}
          disabled={sectionSaving.rateLimiting}
          aria-describedby={fieldErrors['session.singleAnonymousChatRunEnabled'] ? 'session-single-anonymous-chat-run-error' : undefined}
        >
          <option value="true">{t('common.yes')}</option>
          <option value="false">{t('common.no')}</option>
        </select>

          {fieldErrors['session.rateLimitCapacity'] && (
            <FeedbackInlineError id="session-rate-capacity-error" message={fieldErrors['session.rateLimitCapacity']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(rateLimitCapacity, setRateLimitCapacity, 'session.rateLimitCapacity')}
          disabled={sectionSaving.rateLimiting}
          aria-describedby={fieldErrors['session.rateLimitCapacity'] ? 'session-rate-capacity-error' : undefined}
        />

          {fieldErrors['session.rateLimitRefillPerSec'] && (
            <FeedbackInlineError id="session-rate-refill-error" message={fieldErrors['session.rateLimitRefillPerSec']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(rateLimitRefill, setRateLimitRefill, 'session.rateLimitRefillPerSec')}
          disabled={sectionSaving.rateLimiting}
          aria-describedby={fieldErrors['session.rateLimitRefillPerSec'] ? 'session-rate-refill-error' : undefined}
        />

          {fieldErrors['session.authenticatedRateLimitCapacity'] && (
            <FeedbackInlineError id="session-authenticated-rate-capacity-error" message={fieldErrors['session.authenticatedRateLimitCapacity']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(authenticatedRateLimitCapacity, setAuthenticatedRateLimitCapacity, 'session.authenticatedRateLimitCapacity')}
          disabled={sectionSaving.rateLimiting}
          aria-describedby={fieldErrors['session.authenticatedRateLimitCapacity'] ? 'session-authenticated-rate-capacity-error' : undefined}
        />

          {fieldErrors['session.authenticatedRateLimitRefillPerSec'] && (
            <FeedbackInlineError id="session-authenticated-rate-refill-error" message={fieldErrors['session.authenticatedRateLimitRefillPerSec']} announce={false} />
          )}
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
          onBlur={() => defaultEmptyNumberOnBlur(authenticatedRateLimitRefill, setAuthenticatedRateLimitRefill, 'session.authenticatedRateLimitRefillPerSec')}
          disabled={sectionSaving.rateLimiting}
          aria-describedby={fieldErrors['session.authenticatedRateLimitRefillPerSec'] ? 'session-authenticated-rate-refill-error' : undefined}
        />

        <SectionSaveControls
          section="rateLimiting"
          titleKey="settings.rateLimiting.title"
          dirty={isSectionDirty('rateLimiting')}
          saving={sectionSaving.rateLimiting}
          status={sectionStatus.rateLimiting}
          onSave={handleSectionSave}
          t={t}
          fieldErrors={fieldErrors}
          errorAttempt={sectionErrorAttempt.rateLimiting || 0}
          saveNonce={sectionSaveNonce.rateLimiting || 0}
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
              error={fieldErrors['redaction.profanity.en']}
            />

            <label htmlFor="redaction.threat.en" className="filter-label display-block mt-200">
              {t('settings.redaction.threat')} (EN)
            </label>
            <SettingsTextArea
              settingKey="redaction.threat.en"
              value={redactionValues['redaction.threat.en']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
              error={fieldErrors['redaction.threat.en']}
            />

            <label htmlFor="redaction.manipulation.en" className="filter-label display-block mt-200">
              {t('settings.redaction.manipulation')} (EN)
            </label>
            <SettingsTextArea
              settingKey="redaction.manipulation.en"
              value={redactionValues['redaction.manipulation.en']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
              error={fieldErrors['redaction.manipulation.en']}
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
              error={fieldErrors['redaction.profanity.fr']}
            />

            <label htmlFor="redaction.threat.fr" className="filter-label display-block mt-200">
              {t('settings.redaction.threat')} (FR)
            </label>
            <SettingsTextArea
              settingKey="redaction.threat.fr"
              value={redactionValues['redaction.threat.fr']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
              error={fieldErrors['redaction.threat.fr']}
            />

            <label htmlFor="redaction.manipulation.fr" className="filter-label display-block mt-200">
              {t('settings.redaction.manipulation')} (FR)
            </label>
            <SettingsTextArea
              settingKey="redaction.manipulation.fr"
              value={redactionValues['redaction.manipulation.fr']}
              onChange={handleRedactionChange}
              disabled={sectionSaving.redaction}
              error={fieldErrors['redaction.manipulation.fr']}
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
          fieldErrors={fieldErrors}
          errorAttempt={sectionErrorAttempt.redaction || 0}
          saveNonce={sectionSaveNonce.redaction || 0}
        />
        </div>
      </details>

      <section className="mt-600" aria-labelledby="settings-audit-title">
        <h2 id="settings-audit-title">{t('settings.auditHistory.title')}</h2>
        <p>{t('settings.auditHistory.description')}</p>
        {/* TODO (design review): this always-visible full table is a lot of
            page real estate for something most admins only check
            occasionally. Worth a design pass on whether settings history
            belongs in its own tab on this page, or behind a details/summary
            disclosure — either would let a lighter "recent changes" view
            replace this full search/paginate table for the common case. */}
        {renderStatusMessage(auditLoadStatus)}
        <ServerDataTable
          ref={auditTableRef}
          tableKey="settings-audit-history"
          columns={auditColumns}
          fetchData={fetchAuditHistory}
          lang={lang}
          order={[]}
          ordering={false}
          pageLength={10}
          lengthChange={false}
          layout={{ topStart: 'search', topEnd: null }}
          containerClassName="table-scroll mt-200"
          emptyTableText={t('settings.auditHistory.empty')}
          onError={(error) => setAuditLoadStatus(error ? buildErrorStatus('settings.auditHistory.loadError', error) : null)}
        />
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
const SectionSaveControls = ({ section, titleKey, dirty, saving, status, onSave, t, fieldErrors, errorAttempt, saveNonce }) => {
  // Every field in this section that came back with a per-field error on the
  // last save — feeds both the jump-link list below and, via errorAttempt,
  // when to re-focus/re-announce it (a second failed attempt with the exact
  // same single field wrong wouldn't otherwise re-trigger the effect).
  const sectionErrorLinks = SECTION_KEYS[section]
    .filter((key) => fieldErrors[key])
    .map((key) => ({ fieldId: FIELD_META[key].fieldId, label: t(FIELD_META[key].labelKey) }));
  const summaryRef = useFocusOnChange(errorAttempt);

  return (
    <div className="mt-400 mb-400">
      {sectionErrorLinks.length > 0 && (
        <ExplanationErrorSummary
          id={`${section}-error-summary`}
          heading={t('common.errorSummaryHeading')}
          links={sectionErrorLinks}
          errorCount={errorAttempt}
          inputRef={summaryRef}
        />
      )}
      <GcdsButton
        type="button"
        onClick={() => onSave(section)}
        disabled={!dirty || saving}
      >
        {saving ? t('settings.saving') : `${t('settings.save')} ${t(titleKey)}`}
      </GcdsButton>
      <StatusMessage
        variant={status ? (status.isError ? 'error' : 'success') : undefined}
        message={status?.text}
        nonce={saveNonce}
      />
    </div>
  );
};

// Pure controlled textarea for a redaction field — nothing to save itself
// anymore, staging into the parent's pendingChanges happens on every change
// (not on blur: clicking the section's Save button before a field blurs must
// not drop the just-typed text).
const SettingsTextArea = ({ settingKey, value, onChange, disabled, error }) => (
  <>
    {error && (
      <FeedbackInlineError id={`${settingKey}-error`} message={error} announce={false} />
    )}
    <textarea
      id={settingKey}
      value={value}
      onChange={(e) => onChange(settingKey, e.target.value)}
      disabled={disabled}
      aria-describedby={error ? `${settingKey}-error` : undefined}
      className="filter-input"
      rows={5}
    />
  </>
);

export default SettingsPage;
