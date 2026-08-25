import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async () => true),
  partnerOrAdminMiddleware: vi.fn(async () => true),
  withProtection: (handler) => handler,
}));

const scenarioOverrideServiceMock = vi.hoisted(() => ({
  getActiveOverride: vi.fn(),
  getOverride: vi.fn(),
  getOverridesForUser: vi.fn(),
  upsertOverride: vi.fn(),
  disableOtherOverrides: vi.fn(),
  deleteOverride: vi.fn(),
}));

vi.mock('../services/ScenarioOverrideService.js', () => ({
  ScenarioOverrideService: scenarioOverrideServiceMock,
}));

let handler;

beforeEach(async () => {
  scenarioOverrideServiceMock.getActiveOverride.mockReset();
  scenarioOverrideServiceMock.getOverride.mockReset();
  scenarioOverrideServiceMock.getOverridesForUser.mockReset();
  scenarioOverrideServiceMock.upsertOverride.mockReset();
  scenarioOverrideServiceMock.disableOtherOverrides.mockReset();
  scenarioOverrideServiceMock.deleteOverride.mockReset();
  ({ default: handler } = await import('../api/scenario/scenario-overrides.js'));
});

function makeRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    end: vi.fn(() => res),
    setHeader: vi.fn(() => res),
  };
  return res;
}

describe('scenario-overrides api', () => {
  it('rejects invalid department keys on GET before calling the service', async () => {
    const req = {
      method: 'GET',
      query: { departmentKey: 'bogus' },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid department key' });
    expect(scenarioOverrideServiceMock.getOverride).not.toHaveBeenCalled();
    expect(scenarioOverrideServiceMock.getOverridesForUser).not.toHaveBeenCalled();
  });

  it('accepts "FedDev-Ontario" on GET', async () => {
    // Regression test: FedDev-Ontario's abbrKey previously had a space
    // ('FedDev Ontario'), which requireLiteralString's default pattern
    // rejected, silently 400ing every request for this department. The
    // abbrKey now uses a hyphen like the app's other RDA partners, which the
    // default pattern already allows — no special-case validation needed.
    scenarioOverrideServiceMock.getOverride.mockResolvedValue(null);

    const req = {
      method: 'GET',
      query: { departmentKey: 'FedDev-Ontario' },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(scenarioOverrideServiceMock.getOverride).toHaveBeenCalledWith(
      '64fec1000000000000000001',
      'FedDev-Ontario'
    );
    const [payload] = res.json.mock.calls.at(-1);
    expect(payload.departmentKey).toBe('FedDev-Ontario');
    expect(typeof payload.defaultText).toBe('string');
    expect(payload.defaultText.length).toBeGreaterThan(0);
  });

  it('GET returns a saved override even when enabled is false — saving is decoupled from the testing checkbox', async () => {
    // Regression test: this route used to call getActiveOverride (enabled-
    // only), so a scenario saved with testing off disappeared on reload —
    // the editor showed default text and updatedAt: null as if nothing had
    // ever been saved, and re-saving from that stale state produced a false
    // "modified elsewhere" 409 (see upsertOverride's expectedUpdatedAt
    // handling). getOverride must return the record regardless of enabled.
    scenarioOverrideServiceMock.getOverride.mockResolvedValue({
      overrideText: 'a saved draft, testing off',
      enabled: false,
      updatedAt: 't1',
    });

    const req = {
      method: 'GET',
      query: { departmentKey: 'HC-SC' },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    const [payload] = res.json.mock.calls.at(-1);
    expect(payload.override).toEqual({
      overrideText: 'a saved draft, testing off',
      enabled: false,
      updatedAt: 't1',
    });
  });

  it('activeOnly GET returns just the one enabled department, not the full default-scenario payload', async () => {
    scenarioOverrideServiceMock.getOverridesForUser.mockResolvedValue([
      { departmentKey: 'HC-SC', enabled: false, updatedAt: 't1' },
      { departmentKey: 'CRA-ARC', enabled: true, updatedAt: 't2' },
    ]);

    const req = {
      method: 'GET',
      query: { activeOnly: 'true' },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ active: { departmentKey: 'CRA-ARC', updatedAt: 't2' } });
    expect(scenarioOverrideServiceMock.getActiveOverride).not.toHaveBeenCalled();
  });

  it('activeOnly GET returns active: null when nothing is enabled', async () => {
    scenarioOverrideServiceMock.getOverridesForUser.mockResolvedValue([
      { departmentKey: 'HC-SC', enabled: false, updatedAt: 't1' },
    ]);

    const req = {
      method: 'GET',
      query: { activeOnly: 'true' },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ active: null });
  });

  it('POST rejects a request with overrideText omitted entirely', async () => {
    const req = {
      method: 'POST',
      body: { departmentKey: 'HC-SC', enabled: false },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(scenarioOverrideServiceMock.upsertOverride).not.toHaveBeenCalled();
  });

  it('POST rejects a blank overrideText', async () => {
    const req = {
      method: 'POST',
      body: { departmentKey: 'HC-SC', overrideText: '   ', enabled: true },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(scenarioOverrideServiceMock.upsertOverride).not.toHaveBeenCalled();
  });

  it('POST with enabled:true disables this user\'s other enabled departments after a successful save', async () => {
    scenarioOverrideServiceMock.upsertOverride.mockResolvedValue({
      overrideText: 'edited text',
      enabled: true,
      updatedAt: 't4',
    });

    const req = {
      method: 'POST',
      body: { departmentKey: 'HC-SC', overrideText: 'edited text', enabled: true },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(scenarioOverrideServiceMock.disableOtherOverrides).toHaveBeenCalledWith(
      '64fec1000000000000000001',
      'HC-SC'
    );
  });

  it('POST forwards expectedUpdatedAt to the service, and returns 409 (not 500) on a concurrency conflict', async () => {
    const conflictError = Object.assign(new Error('Scenario override was modified elsewhere'), {
      code: 'SCENARIO_OVERRIDE_CONFLICT',
    });
    scenarioOverrideServiceMock.upsertOverride.mockRejectedValue(conflictError);

    const req = {
      method: 'POST',
      body: {
        departmentKey: 'HC-SC',
        overrideText: 'edited text',
        enabled: true,
        expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(scenarioOverrideServiceMock.upsertOverride).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: '2026-01-01T00:00:00.000Z' })
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SCENARIO_OVERRIDE_CONFLICT' })
    );
    // A conflict is an expected concurrent-edit outcome, not a save
    // failure — the one-active-department side effect must not run.
    expect(scenarioOverrideServiceMock.disableOtherOverrides).not.toHaveBeenCalled();
  });
});
