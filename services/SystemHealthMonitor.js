import { SettingsService } from './SettingsService.js';
import GCNotifyService from './GCNotifyService.js';
import ServerLoggingService from './ServerLoggingService.js';
import {
  testAzureOpenAI,
  testDocumentDB,
  testGoogleSearch,
} from './ConnectivityService.js';

/*
 * System health strategy:
 * - While the site is available, poll on the slower interval to limit health-check traffic.
 * - The first failed dependency probe opens a confirmation window and switches future polls
 *   to the fast interval. Successful probes do not clear that window; failures age out only
 *   when they leave the configured rolling failure window.
 * - If failures for a dependency reach the threshold inside the window, auto-disable mode
 *   marks the site unavailable and sends the outage template. When auto-disable is off, the
 *   site stays available and the error template is sent instead.
 * - While the site is unavailable, polling uses the existing exponential backoff. Once the
 *   site is available again and the failure window has cooled off, polling returns to slow.
 */
const DEFAULT_THRESHOLD = 5;
const DEFAULT_WINDOW_SECONDS = 5;
const DEFAULT_INTERVAL_SECONDS = 1;
const DEFAULT_WINDOW_MS = DEFAULT_WINDOW_SECONDS * 1000;
const DEFAULT_INTERVAL_MS = DEFAULT_INTERVAL_SECONDS * 1000;
const SITE_STATUS_KEY = 'siteStatus';
const UNAVAILABLE_STATUS = 'unavailable';

const HEALTH_SETTING_KEYS = {
  enabled: 'systemHealth.enabled',
  databaseEnabled: 'systemHealth.checks.database.enabled',
  searchEnabled: 'systemHealth.checks.search.enabled',
  llmEnabled: 'systemHealth.checks.llm.enabled',
  autoDisableOnError: 'systemHealth.autoDisableOnError',
  failureThreshold: 'systemHealth.failureThreshold',
  failureWindowMinutes: 'systemHealth.failureWindowMinutes',
  intervalMinutes: 'systemHealth.intervalMinutes',
  fastIntervalSeconds: 'systemHealth.fastIntervalSeconds',
  alertRecipients: 'systemHealth.alertRecipients',
  alertTemplateId: 'systemHealth.alertTemplateId',
  errorTemplateId: 'systemHealth.errorTemplateId',
};

const CATEGORY = {
  DATABASE: 'database',
  SEARCH: 'search',
  LLM: 'llm',
};

const CONNECTION_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

function toLower(value) {
  return String(value || '').toLowerCase();
}

function getErrorStatus(error) {
  return error?.status || error?.statusCode || error?.response?.status || error?.response?.statusCode || null;
}

function isConnectionFailure(error) {
  const code = String(error?.code || error?.cause?.code || error?.errno || '').toUpperCase();
  if (CONNECTION_CODES.has(code)) return true;

  const status = getErrorStatus(error);
  if (status === 408 || status === 429 || status >= 500) return true;

  const text = `${error?.name || ''} ${error?.message || ''} ${error?.cause?.message || ''}`;
  return /timeout|timed out|network|connection|connect|socket hang up|service unavailable|temporarily unavailable|failed after retries/i.test(text);
}

function classifySystemFailure(error) {
  if (!error || error.blockType) return null;
  if (!isConnectionFailure(error)) return null;

  const text = toLower(`${error.name || ''} ${error.message || ''} ${error.stack || ''}`);
  if (/mongo|mongoose|documentdb|database|dbconnect|server selection/.test(text)) {
    return CATEGORY.DATABASE;
  }
  if (/search|google|coveo|canada\.ca/.test(text)) {
    return CATEGORY.SEARCH;
  }
  if (/openai|azure|llm|agent|model|chat invoke|failed after retries/.test(text)) {
    return CATEGORY.LLM;
  }
  return null;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRecipients(value) {
  return String(value || '')
    .split(';')
    .map((recipient) => recipient.trim())
    .filter(Boolean);
}

function getRuntimeEnvironment() {
  return process.env.NODE_ENV || process.env.APP_ENV || process.env.RUNTIME_ENV || 'unknown';
}

class SystemHealthMonitor {
  constructor({
    threshold = parsePositiveInteger(process.env.SYSTEM_HEALTH_FAILURE_THRESHOLD, DEFAULT_THRESHOLD),
    windowMs = parsePositiveInteger(process.env.SYSTEM_HEALTH_FAILURE_WINDOW_MS, DEFAULT_WINDOW_MS),
    intervalMs = parsePositiveInteger(process.env.SYSTEM_HEALTH_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    settingsService = SettingsService,
    notifyService = GCNotifyService,
    loggingService = ServerLoggingService,
    dependencyChecks = {
      [CATEGORY.DATABASE]: testDocumentDB,
      [CATEGORY.SEARCH]: testGoogleSearch,
      [CATEGORY.LLM]: testAzureOpenAI,
    },
  } = {}) {
    this.defaultThreshold = threshold;
    this.defaultWindowMs = windowMs;
    this.defaultIntervalMs = intervalMs;
    this.settingsService = settingsService;
    this.notifyService = notifyService;
    this.loggingService = loggingService;
    this.dependencyChecks = dependencyChecks;
    this.failures = new Map();
    this.timer = null;
    this.activeOutageCategory = null;
    this.unavailableBackoffExponent = 0;
    this.confirmingOutageActive = false;
    this.isRunningCycle = false;
    this.stopped = false;
  }

  readSetting(key, fallback = null) {
    try {
      if (typeof this.settingsService?.get === 'function') {
        const value = this.settingsService.get(key);
        return value ?? fallback;
      }
      if (this.settingsService?.cache && Object.prototype.hasOwnProperty.call(this.settingsService.cache, key)) {
        return this.settingsService.cache[key];
      }
    } catch (_error) {
      // Best effort: use fallback when the settings cache is unavailable.
    }
    return fallback;
  }

  toBoolean(value, fallback = true) {
    if (typeof this.settingsService?.toBoolean === 'function') {
      return this.settingsService.toBoolean(value, fallback);
    }
    if (value === undefined || value === null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    return fallback;
  }

  getHealthConfig() {
    const failureWindowSeconds = parsePositiveInteger(
      this.readSetting(HEALTH_SETTING_KEYS.failureWindowMinutes, DEFAULT_WINDOW_SECONDS),
      DEFAULT_WINDOW_SECONDS
    );
    const intervalSeconds = parsePositiveInteger(
      this.readSetting(HEALTH_SETTING_KEYS.intervalMinutes, DEFAULT_INTERVAL_SECONDS),
      DEFAULT_INTERVAL_SECONDS
    );
    const fastIntervalSeconds = parsePositiveInteger(
      this.readSetting(HEALTH_SETTING_KEYS.fastIntervalSeconds, 30),
      30
    );
    const threshold = parsePositiveInteger(
      this.readSetting(HEALTH_SETTING_KEYS.failureThreshold, this.defaultThreshold),
      this.defaultThreshold
    );

    return {
      enabled: this.toBoolean(this.readSetting(HEALTH_SETTING_KEYS.enabled, 'false'), false),
      threshold,
      windowSeconds: failureWindowSeconds,
      windowMs: failureWindowSeconds * 1000,
      intervalSeconds,
      intervalMs: intervalSeconds * 1000,
      fastIntervalSeconds,
      fastIntervalMs: fastIntervalSeconds * 1000,
      checks: {
        [CATEGORY.DATABASE]: this.toBoolean(this.readSetting(HEALTH_SETTING_KEYS.databaseEnabled, 'true'), true),
        [CATEGORY.SEARCH]: this.toBoolean(this.readSetting(HEALTH_SETTING_KEYS.searchEnabled, 'true'), true),
        [CATEGORY.LLM]: this.toBoolean(this.readSetting(HEALTH_SETTING_KEYS.llmEnabled, 'true'), true),
      },
      autoDisableOnError: this.toBoolean(this.readSetting(HEALTH_SETTING_KEYS.autoDisableOnError, 'true'), true),
      alertRecipients: parseRecipients(this.readSetting(HEALTH_SETTING_KEYS.alertRecipients, '')),
      alertTemplateId: String(this.readSetting(HEALTH_SETTING_KEYS.alertTemplateId, '') || '').trim(),
      errorTemplateId: String(this.readSetting(HEALTH_SETTING_KEYS.errorTemplateId, '') || '').trim(),
    };
  }

  prune(entries, now = Date.now(), windowMs = this.defaultWindowMs) {
    const cutoff = now - windowMs;
    return entries.filter((entry) => entry.at >= cutoff);
  }

  getFailureCount(category, now = Date.now(), windowMs = this.defaultWindowMs) {
    const entries = this.prune(this.failures.get(category) || [], now, windowMs);
    this.failures.set(category, entries);
    return entries.length;
  }

  recordFailure(category, details = {}, windowMs = this.defaultWindowMs) {
    if (!category) return null;

    const now = details.now || Date.now();
    const entries = this.failures.get(category) || [];
    entries.push({
      at: now,
      message: details.message || '',
      workflow: details.workflow || null,
      chatId: details.chatId || null,
      source: details.source || 'probe',
    });
    this.failures.set(category, this.prune(entries, now, windowMs));
    return category;
  }

  async runCycle(now = Date.now()) {
    const config = this.getHealthConfig();
    if (!config.enabled) {
      return { statusChanged: false, skipped: true, reason: 'disabled' };
    }

    if (this.readSetting(SITE_STATUS_KEY, 'available') === 'available') {
      this.activeOutageCategory = null;
    }

    for (const category of Object.values(CATEGORY)) {
      if (!config.checks[category]) continue;
      const failure = await this.checkCategory(category);
      if (failure) {
        this.recordFailure(category, {
          now,
          message: failure.message || `${category} connectivity failure`,
          source: 'probe',
        }, config.windowMs);
      }
    }

    let hasOpenFailures = false;
    for (const category of Object.values(CATEGORY)) {
      if (!config.checks[category]) continue;
      const count = this.getFailureCount(category, now, config.windowMs);
      if (count > 0) {
        hasOpenFailures = true;
      }
      if (count < config.threshold) continue;
      if (config.autoDisableOnError) {
        this.confirmingOutageActive = false;
        await this.markUnavailable(category, count, config);
        return { statusChanged: true, category, count };
      }

      this.confirmingOutageActive = true;
      await this.sendErrorEmail(category, count, this.getLatestFailure(category), config);
      await this.loggingService.error('System health monitor detected failure without disabling site', 'system', {
        category,
        count,
        windowMs: config.windowMs,
      });
      return { statusChanged: false };
    }
    this.confirmingOutageActive = hasOpenFailures;
    return { statusChanged: false };
  }

  getNextRunDelay(config = this.getHealthConfig()) {
    const baseDelay = Number.isFinite(config.intervalMs) && config.intervalMs > 0
      ? config.intervalMs
      : this.defaultIntervalMs;
    const siteStatus = String(this.readSetting(SITE_STATUS_KEY, 'available'));

    if (siteStatus !== UNAVAILABLE_STATUS) {
      this.unavailableBackoffExponent = 0;
      return this.confirmingOutageActive && Number.isFinite(config.fastIntervalMs) && config.fastIntervalMs > 0
        ? config.fastIntervalMs
        : baseDelay;
    }

    this.unavailableBackoffExponent = Math.min(this.unavailableBackoffExponent + 1, 8);
    return baseDelay * (2 ** this.unavailableBackoffExponent);
  }

  async evaluate(now = Date.now()) {
    return this.runCycle(now);
  }

  async checkCategory(category) {
    const check = this.dependencyChecks[category];
    if (typeof check !== 'function') return null;

    try {
      const result = await check();
      if (result?.status === 'error') {
        return {
          category,
          message: result.message || `${category} connectivity failure`,
        };
      }
      return null;
    } catch (error) {
      await this.loggingService.warn('System health probe failed', 'system', {
        category,
        error: error?.message || String(error),
      });
      return {
        category,
        message: error?.message || `${category} connectivity failure`,
      };
    }
  }

  async markUnavailable(category, count, config = this.getHealthConfig()) {
    const wasUnavailable = String(this.readSetting(SITE_STATUS_KEY, 'available')) === UNAVAILABLE_STATUS;
    if (!this.activeOutageCategory) {
      this.activeOutageCategory = category;
    }
    this.confirmingOutageActive = false;
    const outageCategory = this.activeOutageCategory || category;
    if (!wasUnavailable) {
      this.settingsService.cache[SITE_STATUS_KEY] = UNAVAILABLE_STATUS;

      try {
        await this.settingsService.set(SITE_STATUS_KEY, UNAVAILABLE_STATUS);
      } catch (error) {
        await this.loggingService.error('Failed to persist siteStatus unavailable', 'system', error);
      }
    }

    await this.loggingService.error('System health monitor set site unavailable', 'system', {
      category: outageCategory,
      count,
      windowMs: config.windowMs,
    });

    const latestFailure = this.getLatestFailure(outageCategory) || this.getLatestFailure(category);
    await this.sendOutageEmail(outageCategory, count, latestFailure, config);
  }

  getLatestFailure(category) {
    const entries = this.failures.get(category) || [];
    return entries.length ? entries[entries.length - 1] : null;
  }

  async sendOutageEmail(category, count, failure = null, config = this.getHealthConfig()) {
    if (!config.alertRecipients.length || !config.alertTemplateId) return;

    const payload = {
      templateId: config.alertTemplateId,
      reference: `system-health-${category}-${Date.now()}`,
      personalisation: {
        environment: getRuntimeEnvironment(),
        service: category,
        serviceName: 'AI Answers',
        cause: category,
        errorMessage: failure?.message || `${category} connectivity failure`,
        count: String(count),
        windowSeconds: String(Math.round(config.windowMs / 1000)),
        siteStatus: UNAVAILABLE_STATUS,
      },
    };

    try {
      await Promise.all(config.alertRecipients.map((email) => this.notifyService.sendEmail({
        ...payload,
        email,
      })));
    } catch (error) {
      await this.loggingService.error('System health outage email failed', 'system', error);
    }
  }

  async sendErrorEmail(category, count, failure = null, config = this.getHealthConfig()) {
    if (!config.alertRecipients.length || !config.errorTemplateId) return;

    const payload = {
      templateId: config.errorTemplateId,
      reference: `system-health-error-${category}-${Date.now()}`,
      personalisation: {
        environment: getRuntimeEnvironment(),
        service: category,
        serviceName: 'AI Answers',
        cause: category,
        count: String(count),
        interval: String(Math.round(config.windowMs / 1000)),
        errorMessage: failure?.message || `${category} connectivity failure`,
      },
    };

    try {
      await Promise.all(config.alertRecipients.map((email) => this.notifyService.sendEmail({
        ...payload,
        email,
      })));
    } catch (error) {
      await this.loggingService.error('System health error email failed', 'system', error);
    }
  }

  start() {
    if (this.timer) return;
    this.stopped = false;
    this.scheduleNextRun(0);
  }

  scheduleNextRun(delayMs = this.getHealthConfig().intervalMs) {
    if (this.stopped) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const delay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : this.defaultIntervalMs;
    this.timer = setTimeout(() => {
      if (this.isRunningCycle) {
        this.scheduleNextRun(this.getNextRunDelay());
        return;
      }

      this.isRunningCycle = true;
      this.runCycle().catch((error) => {
        this.loggingService.error('System health monitor interval failed', 'system', error);
      }).finally(() => {
        this.isRunningCycle = false;
        this.scheduleNextRun(this.getNextRunDelay());
      });
    }, delay);
    this.timer.unref?.();
  }

  stop() {
    this.stopped = true;
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  reset() {
    this.failures.clear();
    this.activeOutageCategory = null;
    this.unavailableBackoffExponent = 0;
    this.confirmingOutageActive = false;
  }
}

const systemHealthMonitor = new SystemHealthMonitor();

export {
  CATEGORY as SYSTEM_HEALTH_CATEGORY,
  SystemHealthMonitor,
  classifySystemFailure,
  isConnectionFailure,
  systemHealthMonitor,
};

export default systemHealthMonitor;
