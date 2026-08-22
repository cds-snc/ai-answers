import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/db/db-connect.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const scenarioModelMock = vi.hoisted(() => ({
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateMany: vi.fn(),
  deleteOne: vi.fn(),
}));

vi.mock('../../models/scenarioOverride.js', () => ({
  ScenarioOverride: scenarioModelMock,
}));

import { ScenarioOverrideService } from '../ScenarioOverrideService.js';

const exampleOverride = (overrides = {}) => ({
  _id: 'override-id',
  userId: '64fec1000000000000000001',
  departmentKey: 'HC-SC',
  overrideText: 'custom text',
  enabled: true,
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  scenarioModelMock.find.mockReset();
  scenarioModelMock.findOne.mockReset();
  scenarioModelMock.findOneAndUpdate.mockReset();
  scenarioModelMock.updateMany.mockReset();
  scenarioModelMock.deleteOne.mockReset();
  ScenarioOverrideService.invalidateCache('64fec1000000000000000001');
});

describe('ScenarioOverrideService', () => {
  it('caches overrides per user after initial fetch', async () => {
    const records = [exampleOverride({ departmentKey: 'HC-SC' }), exampleOverride({ departmentKey: 'CRA-ARC' })];
    const findLean = vi.fn().mockResolvedValue(records);
    scenarioModelMock.find.mockReturnValue({ lean: findLean });

    const first = await ScenarioOverrideService.getOverridesForUser('64fec1000000000000000001');
    expect(first).toEqual(records);
    expect(scenarioModelMock.find).toHaveBeenCalledTimes(1);
    expect(findLean).toHaveBeenCalledTimes(1);

    const second = await ScenarioOverrideService.getOverridesForUser('64fec1000000000000000001');
    expect(second).toEqual(records);
    expect(scenarioModelMock.find).toHaveBeenCalledTimes(1);
    expect(findLean).toHaveBeenCalledTimes(1);
  });

  it('returns null when no enabled override is found', async () => {
    const disabledLean = vi.fn().mockResolvedValue(exampleOverride({ enabled: false }));
    scenarioModelMock.findOne.mockReturnValue({ lean: disabledLean });

    const override = await ScenarioOverrideService.getActiveOverride('64fec1000000000000000001', 'HC-SC');
    expect(override).toBeNull();
    expect(scenarioModelMock.findOne).toHaveBeenCalledWith({ userId: '64fec1000000000000000001', departmentKey: 'HC-SC' });
    expect(disabledLean).toHaveBeenCalledTimes(1);
  });

  it('getOverride returns a disabled record too — unlike getActiveOverride, which stays enabled-only for GraphWorkflowHelper', async () => {
    const disabled = exampleOverride({ enabled: false });
    const disabledLean = vi.fn().mockResolvedValue(disabled);
    scenarioModelMock.findOne.mockReturnValue({ lean: disabledLean });

    const override = await ScenarioOverrideService.getOverride('64fec1000000000000000001', 'HC-SC');
    expect(override).toEqual(disabled);
  });

  it('getOverride and getActiveOverride share the same cache entry, not separate fetches', async () => {
    const disabled = exampleOverride({ enabled: false });
    const disabledLean = vi.fn().mockResolvedValue(disabled);
    scenarioModelMock.findOne.mockReturnValue({ lean: disabledLean });

    const first = await ScenarioOverrideService.getOverride('64fec1000000000000000001', 'HC-SC');
    const second = await ScenarioOverrideService.getActiveOverride('64fec1000000000000000001', 'HC-SC');

    expect(first).toEqual(disabled);
    expect(second).toBeNull(); // disabled, so getActiveOverride still filters it out
    expect(scenarioModelMock.findOne).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it('returns override when enabled and caches it', async () => {
    const record = exampleOverride();
    const enabledLean = vi.fn().mockResolvedValue(record);
    scenarioModelMock.findOne.mockReturnValue({ lean: enabledLean });

    const override = await ScenarioOverrideService.getActiveOverride('64fec1000000000000000001', 'HC-SC');
    expect(override).toEqual(record);
    expect(scenarioModelMock.findOne).toHaveBeenCalledTimes(1);
    expect(enabledLean).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const cached = await ScenarioOverrideService.getActiveOverride('64fec1000000000000000001', 'HC-SC');
    expect(cached).toEqual(record);
    expect(scenarioModelMock.findOne).toHaveBeenCalledTimes(1);
    expect(enabledLean).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache on upsert, and creates only when no doc exists yet (expectedUpdatedAt omitted)', async () => {
    const record = exampleOverride({ overrideText: 'updated' });
    scenarioModelMock.findOneAndUpdate.mockResolvedValue(record);
    const invalidateSpy = vi.spyOn(ScenarioOverrideService, 'invalidateCache');

    const result = await ScenarioOverrideService.upsertOverride({
      userId: '64fec1000000000000000001',
      departmentKey: 'HC-SC',
      overrideText: 'updated',
      enabled: true,
    });

    expect(scenarioModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: '64fec1000000000000000001', departmentKey: 'HC-SC', updatedAt: { $exists: false } },
      { $set: { overrideText: 'updated', enabled: true }, $setOnInsert: { userId: '64fec1000000000000000001', departmentKey: 'HC-SC' } },
      { new: true, upsert: true, lean: true }
    );
    expect(result).toEqual(record);
    expect(invalidateSpy).toHaveBeenCalledWith('64fec1000000000000000001', 'HC-SC');
    invalidateSpy.mockRestore();
  });

  it('throws SCENARIO_OVERRIDE_CONFLICT when a doc already exists and expectedUpdatedAt was omitted (another tab created it first)', async () => {
    const duplicateKeyError = Object.assign(new Error('duplicate key'), { code: 11000 });
    scenarioModelMock.findOneAndUpdate.mockRejectedValue(duplicateKeyError);

    await expect(ScenarioOverrideService.upsertOverride({
      userId: '64fec1000000000000000001',
      departmentKey: 'HC-SC',
      overrideText: 'updated',
      enabled: true,
    })).rejects.toMatchObject({ code: 'SCENARIO_OVERRIDE_CONFLICT' });
  });

  it('matches on the exact expectedUpdatedAt when provided, and updates without upserting', async () => {
    const record = exampleOverride({ overrideText: 'updated' });
    scenarioModelMock.findOneAndUpdate.mockResolvedValue(record);
    const expectedUpdatedAt = '2026-01-01T00:00:00.000Z';

    await ScenarioOverrideService.upsertOverride({
      userId: '64fec1000000000000000001',
      departmentKey: 'HC-SC',
      overrideText: 'updated',
      enabled: true,
      expectedUpdatedAt,
    });

    expect(scenarioModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: '64fec1000000000000000001', departmentKey: 'HC-SC', updatedAt: new Date(expectedUpdatedAt) },
      { $set: { overrideText: 'updated', enabled: true } },
      { new: true, lean: true }
    );
  });

  it('throws SCENARIO_OVERRIDE_CONFLICT when expectedUpdatedAt no longer matches (modified in another tab)', async () => {
    scenarioModelMock.findOneAndUpdate.mockResolvedValue(null);

    await expect(ScenarioOverrideService.upsertOverride({
      userId: '64fec1000000000000000001',
      departmentKey: 'HC-SC',
      overrideText: 'updated',
      enabled: true,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    })).rejects.toMatchObject({ code: 'SCENARIO_OVERRIDE_CONFLICT' });
  });

  it('disableOtherOverrides only touches this user\'s other enabled departments, not other users', async () => {
    scenarioModelMock.updateMany.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
    const invalidateSpy = vi.spyOn(ScenarioOverrideService, 'invalidateCache');

    await ScenarioOverrideService.disableOtherOverrides('64fec1000000000000000001', 'HC-SC');

    expect(scenarioModelMock.updateMany).toHaveBeenCalledWith(
      { userId: '64fec1000000000000000001', departmentKey: { $ne: 'HC-SC' }, enabled: true },
      { $set: { enabled: false } }
    );
    expect(invalidateSpy).toHaveBeenCalledWith('64fec1000000000000000001');
    invalidateSpy.mockRestore();
  });

  it('removes cache entry on delete', async () => {
    scenarioModelMock.deleteOne.mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    const invalidateSpy = vi.spyOn(ScenarioOverrideService, 'invalidateCache');

    await ScenarioOverrideService.deleteOverride('64fec1000000000000000001', 'HC-SC');

    expect(scenarioModelMock.deleteOne).toHaveBeenCalledWith({ userId: '64fec1000000000000000001', departmentKey: 'HC-SC' });
    expect(invalidateSpy).toHaveBeenCalledWith('64fec1000000000000000001', 'HC-SC');
    invalidateSpy.mockRestore();
  });
});
