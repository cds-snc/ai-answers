import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/db/db-connect.js', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

const scenarioModelMock = vi.hoisted(() => ({
  find: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
}));

vi.mock('../../models/scenarioOverride.js', () => ({
  ScenarioOverride: scenarioModelMock,
}));

import { ScenarioOverrideService } from '../ScenarioOverrideService.js';

const exampleOverride = (overrides = {}) => ({
  _id: 'override-id',
  userId: 'user-1',
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
  scenarioModelMock.deleteOne.mockReset();
  ScenarioOverrideService.invalidateCache('user-1');
});

describe('ScenarioOverrideService', () => {
  it('caches overrides per user after initial fetch', async () => {
    const records = [exampleOverride({ departmentKey: 'HC-SC' }), exampleOverride({ departmentKey: 'CRA-ARC' })];
    const findLean = vi.fn().mockResolvedValue(records);
    scenarioModelMock.find.mockReturnValue({ lean: findLean });

    const first = await ScenarioOverrideService.getOverridesForUser('user-1');
    expect(first).toEqual(records);
    expect(scenarioModelMock.find).toHaveBeenCalledTimes(1);
    expect(findLean).toHaveBeenCalledTimes(1);

    const second = await ScenarioOverrideService.getOverridesForUser('user-1');
    expect(second).toEqual(records);
    expect(scenarioModelMock.find).toHaveBeenCalledTimes(1);
    expect(findLean).toHaveBeenCalledTimes(1);
  });

  it('returns null when no enabled override is found', async () => {
    const disabledLean = vi.fn().mockResolvedValue(exampleOverride({ enabled: false }));
    scenarioModelMock.findOne.mockReturnValue({ lean: disabledLean });

    const override = await ScenarioOverrideService.getActiveOverride('user-1', 'HC-SC');
    expect(override).toBeNull();
    expect(scenarioModelMock.findOne).toHaveBeenCalledWith({ userId: 'user-1', departmentKey: 'HC-SC' });
    expect(disabledLean).toHaveBeenCalledTimes(1);
  });

  it('returns override when enabled and caches it', async () => {
    const record = exampleOverride();
    const enabledLean = vi.fn().mockResolvedValue(record);
    scenarioModelMock.findOne.mockReturnValue({ lean: enabledLean });

    const override = await ScenarioOverrideService.getActiveOverride('user-1', 'HC-SC');
    expect(override).toEqual(record);
    expect(scenarioModelMock.findOne).toHaveBeenCalledTimes(1);
    expect(enabledLean).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const cached = await ScenarioOverrideService.getActiveOverride('user-1', 'HC-SC');
    expect(cached).toEqual(record);
    expect(scenarioModelMock.findOne).toHaveBeenCalledTimes(1);
    expect(enabledLean).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache on upsert', async () => {
    const record = exampleOverride({ overrideText: 'updated' });
    scenarioModelMock.findOneAndUpdate.mockResolvedValue(record);
    const invalidateSpy = vi.spyOn(ScenarioOverrideService, 'invalidateCache');

    const result = await ScenarioOverrideService.upsertOverride({
      userId: 'user-1',
      departmentKey: 'HC-SC',
      overrideText: 'updated',
      enabled: true,
    });

    expect(scenarioModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1', departmentKey: 'HC-SC' },
      { $set: { overrideText: 'updated', enabled: true }, $setOnInsert: { userId: 'user-1', departmentKey: 'HC-SC' } },
      { new: true, upsert: true, lean: true }
    );
    expect(result).toEqual(record);
    expect(invalidateSpy).toHaveBeenCalledWith('user-1', 'HC-SC');
    invalidateSpy.mockRestore();
  });

  it('removes cache entry on delete', async () => {
    scenarioModelMock.deleteOne.mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    const invalidateSpy = vi.spyOn(ScenarioOverrideService, 'invalidateCache');

    await ScenarioOverrideService.deleteOverride('user-1', 'HC-SC');

    expect(scenarioModelMock.deleteOne).toHaveBeenCalledWith({ userId: 'user-1', departmentKey: 'HC-SC' });
    expect(invalidateSpy).toHaveBeenCalledWith('user-1', 'HC-SC');
    invalidateSpy.mockRestore();
  });
});
