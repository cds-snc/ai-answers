import { describe, expect, it, vi } from 'vitest';
import {
  SYSTEM_HEALTH_CATEGORY,
  SystemHealthMonitor,
  classifySystemFailure,
} from '../SystemHealthMonitor.js';

function createMonitor(overrides = {}) {
  const settingsService = {
    cache: {
      siteStatus: 'available',
      'systemHealth.enabled': 'true',
      'systemHealth.alertRecipients': 'ops@example.com;admin@example.com',
      'systemHealth.alertTemplateId': 'tpl-health',
    },
    set: vi.fn(async (key, value) => {
      settingsService.cache[key] = value;
    }),
  };
  const notifyService = {
    sendEmail: vi.fn(async () => ({ success: true })),
  };
  const loggingService = {
    warn: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
  };
  const dependencyChecks = {
    [SYSTEM_HEALTH_CATEGORY.DATABASE]: vi.fn(async () => ({ status: 'connected' })),
    [SYSTEM_HEALTH_CATEGORY.SEARCH]: vi.fn(async () => ({ status: 'connected' })),
    [SYSTEM_HEALTH_CATEGORY.LLM]: vi.fn(async () => ({ status: 'connected' })),
  };

  const monitor = new SystemHealthMonitor({
    threshold: 2,
    windowMs: 60000,
    intervalMs: 0,
    settingsService,
    notifyService,
    loggingService,
    dependencyChecks,
    ...overrides,
  });

  return { monitor, settingsService, notifyService, loggingService, dependencyChecks };
}

describe('SystemHealthMonitor', () => {
  it('classifies connection-style LLM errors but ignores parsing and blocked errors', () => {
    expect(classifySystemFailure(new Error('Failed after retries: Azure OpenAI request timed out')))
      .toBe(SYSTEM_HEALTH_CATEGORY.LLM);

    expect(classifySystemFailure(new Error('Could not parse model JSON response')))
      .toBeNull();

    expect(classifySystemFailure({ message: 'PII detected', blockType: 'piStage2' }))
      .toBeNull();
  });

  it('skips the entire cycle when health monitoring is disabled', async () => {
    const { monitor, dependencyChecks, settingsService } = createMonitor();
    settingsService.cache['systemHealth.enabled'] = 'false';

    await expect(monitor.runCycle(1000)).resolves.toMatchObject({
      statusChanged: false,
      skipped: true,
    });

    expect(dependencyChecks[SYSTEM_HEALTH_CATEGORY.DATABASE]).not.toHaveBeenCalled();
    expect(dependencyChecks[SYSTEM_HEALTH_CATEGORY.SEARCH]).not.toHaveBeenCalled();
    expect(dependencyChecks[SYSTEM_HEALTH_CATEGORY.LLM]).not.toHaveBeenCalled();
  });

  it('skips disabled dependency checks and keeps polling the enabled ones', async () => {
    const { monitor, dependencyChecks, settingsService } = createMonitor();
    settingsService.cache['systemHealth.checks.search.enabled'] = 'false';

    await monitor.runCycle(1000);

    expect(dependencyChecks[SYSTEM_HEALTH_CATEGORY.DATABASE]).toHaveBeenCalledTimes(1);
    expect(dependencyChecks[SYSTEM_HEALTH_CATEGORY.SEARCH]).not.toHaveBeenCalled();
    expect(dependencyChecks[SYSTEM_HEALTH_CATEGORY.LLM]).toHaveBeenCalledTimes(1);
  });

  it('does not disable the site until the threshold is reached and the dependency check fails', async () => {
    const { monitor, settingsService, dependencyChecks } = createMonitor();
    dependencyChecks[SYSTEM_HEALTH_CATEGORY.LLM].mockResolvedValue({ status: 'error' });

    await expect(monitor.runCycle(1000)).resolves.toEqual({ statusChanged: false });
    expect(settingsService.cache.siteStatus).toBe('available');

    await expect(monitor.runCycle(2000)).resolves.toMatchObject({
      statusChanged: true,
      category: SYSTEM_HEALTH_CATEGORY.LLM,
      count: 2,
    });
    expect(settingsService.cache.siteStatus).toBe('unavailable');
    expect(settingsService.set).toHaveBeenCalledWith('siteStatus', 'unavailable');
  });

  it('clears stale failures for healthy categories so another category can trigger the outage', async () => {
    const { monitor, settingsService, dependencyChecks } = createMonitor();

    dependencyChecks[SYSTEM_HEALTH_CATEGORY.DATABASE].mockResolvedValueOnce({ status: 'error' });
    dependencyChecks[SYSTEM_HEALTH_CATEGORY.DATABASE].mockResolvedValueOnce({ status: 'connected' });
    dependencyChecks[SYSTEM_HEALTH_CATEGORY.SEARCH]
      .mockResolvedValueOnce({ status: 'connected' })
      .mockResolvedValueOnce({ status: 'connected' })
      .mockResolvedValueOnce({ status: 'error' })
      .mockResolvedValueOnce({ status: 'error' });
    dependencyChecks[SYSTEM_HEALTH_CATEGORY.LLM].mockResolvedValue({ status: 'connected' });

    await expect(monitor.runCycle(1000)).resolves.toEqual({ statusChanged: false });
    await expect(monitor.runCycle(2000)).resolves.toEqual({ statusChanged: false });
    await expect(monitor.runCycle(3000)).resolves.toEqual({ statusChanged: false });
    await expect(monitor.runCycle(4000)).resolves.toMatchObject({
      statusChanged: true,
      category: SYSTEM_HEALTH_CATEGORY.SEARCH,
    });

    expect(settingsService.cache.siteStatus).toBe('unavailable');
    expect(settingsService.set).toHaveBeenCalledWith('siteStatus', 'unavailable');
  });

  it('updates the cache even when siteStatus persistence fails', async () => {
    const settingsService = {
      cache: {
        siteStatus: 'available',
        'systemHealth.enabled': 'true',
      },
      set: vi.fn(async () => {
        throw new Error('Mongo server selection timed out');
      }),
    };
    const { monitor, loggingService } = createMonitor({
      settingsService,
      dependencyChecks: {
        [SYSTEM_HEALTH_CATEGORY.LLM]: vi.fn(async () => ({ status: 'error' })),
      },
    });

    await monitor.runCycle(1000);
    await monitor.runCycle(2000);

    expect(settingsService.cache.siteStatus).toBe('unavailable');
    expect(loggingService.error).toHaveBeenCalledWith(
      'Failed to persist siteStatus unavailable',
      'system',
      expect.any(Error)
    );
  });

  it('sends an outage email on each failing cycle while the site remains unavailable', async () => {
    const { monitor, notifyService, dependencyChecks } = createMonitor();
    dependencyChecks[SYSTEM_HEALTH_CATEGORY.SEARCH].mockResolvedValue({ status: 'error' });

    await monitor.runCycle(1000);
    await monitor.runCycle(2000);
    await monitor.runCycle(3000);

    expect(notifyService.sendEmail).toHaveBeenCalledTimes(4);
    expect(notifyService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ops@example.com',
      personalisation: expect.objectContaining({
        service: SYSTEM_HEALTH_CATEGORY.SEARCH,
        serviceName: 'AI Answers',
        cause: SYSTEM_HEALTH_CATEGORY.SEARCH,
        count: '2',
        windowSeconds: '5',
        environment: expect.any(String),
        errorMessage: expect.any(String),
      }),
    }));
    expect(notifyService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'admin@example.com',
      personalisation: expect.objectContaining({
        service: SYSTEM_HEALTH_CATEGORY.SEARCH,
      }),
    }));
  });

  it('keeps the original outage category for repeated outage emails until recovery', async () => {
    const { monitor, notifyService, dependencyChecks } = createMonitor();

    dependencyChecks[SYSTEM_HEALTH_CATEGORY.LLM].mockResolvedValue({ status: 'error' });
    dependencyChecks[SYSTEM_HEALTH_CATEGORY.DATABASE]
      .mockResolvedValueOnce({ status: 'connected' })
      .mockResolvedValueOnce({ status: 'error' })
      .mockResolvedValueOnce({ status: 'error' });
    dependencyChecks[SYSTEM_HEALTH_CATEGORY.SEARCH].mockResolvedValue({ status: 'connected' });

    await monitor.runCycle(1000);
    await monitor.runCycle(2000);
    await monitor.runCycle(3000);

    expect(notifyService.sendEmail).toHaveBeenCalledTimes(4);
    expect(notifyService.sendEmail).toHaveBeenNthCalledWith(1, expect.objectContaining({
      personalisation: expect.objectContaining({
        service: SYSTEM_HEALTH_CATEGORY.LLM,
        cause: SYSTEM_HEALTH_CATEGORY.LLM,
      }),
    }));
    expect(notifyService.sendEmail).toHaveBeenNthCalledWith(3, expect.objectContaining({
      personalisation: expect.objectContaining({
        service: SYSTEM_HEALTH_CATEGORY.LLM,
        cause: SYSTEM_HEALTH_CATEGORY.LLM,
      }),
    }));
  });

  it('backs off exponentially while unavailable and resets when available', () => {
    const { monitor, settingsService } = createMonitor();
    settingsService.cache.siteStatus = 'unavailable';

    expect(monitor.getNextRunDelay({ intervalMs: 1000 })).toBe(2000);
    expect(monitor.getNextRunDelay({ intervalMs: 1000 })).toBe(4000);

    settingsService.cache.siteStatus = 'available';
    expect(monitor.getNextRunDelay({ intervalMs: 1000 })).toBe(1000);
  });
});
