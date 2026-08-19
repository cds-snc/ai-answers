import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async () => true),
  partnerOrAdminMiddleware: vi.fn(async () => true),
  withProtection: (handler) => handler,
}));

const scenarioOverrideServiceMock = vi.hoisted(() => ({
  getActiveOverride: vi.fn(),
  getOverridesForUser: vi.fn(),
  upsertOverride: vi.fn(),
  deleteOverride: vi.fn(),
}));

vi.mock('../services/ScenarioOverrideService.js', () => ({
  ScenarioOverrideService: scenarioOverrideServiceMock,
}));

let handler;

beforeEach(async () => {
  scenarioOverrideServiceMock.getActiveOverride.mockReset();
  scenarioOverrideServiceMock.getOverridesForUser.mockReset();
  scenarioOverrideServiceMock.upsertOverride.mockReset();
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
    expect(scenarioOverrideServiceMock.getActiveOverride).not.toHaveBeenCalled();
    expect(scenarioOverrideServiceMock.getOverridesForUser).not.toHaveBeenCalled();
  });

  it('accepts "FedDev-Ontario" on GET', async () => {
    // Regression test: FedDev-Ontario's abbrKey previously had a space
    // ('FedDev Ontario'), which requireLiteralString's default pattern
    // rejected, silently 400ing every request for this department. The
    // abbrKey now uses a hyphen like the app's other RDA partners, which the
    // default pattern already allows — no special-case validation needed.
    scenarioOverrideServiceMock.getActiveOverride.mockResolvedValue(null);

    const req = {
      method: 'GET',
      query: { departmentKey: 'FedDev-Ontario' },
      user: { userId: '64fec1000000000000000001', role: 'partner' },
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(scenarioOverrideServiceMock.getActiveOverride).toHaveBeenCalledWith(
      '64fec1000000000000000001',
      'FedDev-Ontario'
    );
    const [payload] = res.json.mock.calls.at(-1);
    expect(payload.departmentKey).toBe('FedDev-Ontario');
    expect(typeof payload.defaultText).toBe('string');
    expect(payload.defaultText.length).toBeGreaterThan(0);
  });
});
