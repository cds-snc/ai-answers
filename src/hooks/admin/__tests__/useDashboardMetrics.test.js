/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardMetrics } from '../useDashboardMetrics.js';

const getUsageMetrics = vi.fn();
const getSessionMetrics = vi.fn();
const getExpertMetrics = vi.fn();
const getAiEvalMetrics = vi.fn();
const getPublicFeedbackMetrics = vi.fn();
const getDepartmentMetrics = vi.fn();
const getTechnicalMetrics = vi.fn();
const getBlockedMetrics = vi.fn();

vi.mock('../../../services/MetricsService.js', () => ({
  default: {
    getUsageMetrics: (...args) => getUsageMetrics(...args),
    getSessionMetrics: (...args) => getSessionMetrics(...args),
    getExpertMetrics: (...args) => getExpertMetrics(...args),
    getAiEvalMetrics: (...args) => getAiEvalMetrics(...args),
    getPublicFeedbackMetrics: (...args) => getPublicFeedbackMetrics(...args),
    getDepartmentMetrics: (...args) => getDepartmentMetrics(...args),
    getTechnicalMetrics: (...args) => getTechnicalMetrics(...args),
    getBlockedMetrics: (...args) => getBlockedMetrics(...args),
  },
}));

describe('useDashboardMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUsageMetrics.mockResolvedValue({ totalQuestions: 12 });
    getSessionMetrics.mockResolvedValue({ totalConversations: 4 });
    getExpertMetrics.mockResolvedValue({});
    getAiEvalMetrics.mockResolvedValue({});
    getPublicFeedbackMetrics.mockResolvedValue({});
    getDepartmentMetrics.mockResolvedValue({});
    getTechnicalMetrics.mockResolvedValue({});
  });

  it('keeps the dashboard bundle when blocked metrics fail', async () => {
    getBlockedMetrics.mockRejectedValueOnce(new Error('blocked endpoint down'));

    const { result } = renderHook(() => useDashboardMetrics());

    await act(async () => {
      await result.current.fetchMetrics({
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-01-07T23:59:59.999Z',
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(null);
    expect(result.current.metrics.totalQuestions).toBe(12);
    expect(result.current.metrics.totalConversations).toBe(4);
    expect(result.current.metrics.blockedQueries).toEqual({});
  });
});
