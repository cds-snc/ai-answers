/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTechnicalMetrics } from '../useTechnicalMetrics.js';

const getTechnicalMetrics = vi.fn();
const getUsageMetrics = vi.fn();
const getBlockedMetrics = vi.fn();

vi.mock('../../../services/MetricsService.js', () => ({
  default: {
    getTechnicalMetrics: (...args) => getTechnicalMetrics(...args),
    getUsageMetrics: (...args) => getUsageMetrics(...args),
    getBlockedMetrics: (...args) => getBlockedMetrics(...args),
  },
}));

describe('useTechnicalMetrics hasAnySectionSettled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is false before any fetch, true once any one section settles', async () => {
    getTechnicalMetrics.mockResolvedValue({});
    getUsageMetrics.mockResolvedValue({});
    getBlockedMetrics.mockResolvedValue({});

    const { result } = renderHook(() => useTechnicalMetrics());
    expect(result.current.hasAnySectionSettled).toBe(false);

    await act(async () => {
      result.current.handleApplyFilters({ startDate: '2026-01-01', endDate: '2026-01-02' });
    });

    await waitFor(() => expect(result.current.hasAnySectionSettled).toBe(true));
  });

  it('settles even when the section errors, not only on success', async () => {
    getTechnicalMetrics.mockRejectedValue(new Error('down'));
    getUsageMetrics.mockResolvedValue({});
    getBlockedMetrics.mockResolvedValue({});

    const { result } = renderHook(() => useTechnicalMetrics());

    await act(async () => {
      result.current.handleApplyFilters({ startDate: '2026-01-01', endDate: '2026-01-02' });
    });

    await waitFor(() => expect(result.current.hasAnySectionSettled).toBe(true));
  });

  it('resets to false at the start of a new fetch cycle', async () => {
    getTechnicalMetrics.mockResolvedValue({});
    getUsageMetrics.mockResolvedValue({});
    getBlockedMetrics.mockResolvedValue({});

    const { result } = renderHook(() => useTechnicalMetrics());

    await act(async () => {
      result.current.handleApplyFilters({ startDate: '2026-01-01', endDate: '2026-01-02' });
    });
    await waitFor(() => expect(result.current.hasAnySectionSettled).toBe(true));

    // A second Apply starts a fresh cycle - resets before anything settles
    // again, same as hasStartedLoading's own reset in the same call.
    act(() => {
      result.current.handleApplyFilters({ startDate: '2026-02-01', endDate: '2026-02-02' });
    });
    expect(result.current.hasAnySectionSettled).toBe(false);

    await waitFor(() => expect(result.current.hasAnySectionSettled).toBe(true));
  });
});
