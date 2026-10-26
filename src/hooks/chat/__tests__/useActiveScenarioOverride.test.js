/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useActiveScenarioOverride } from '../useActiveScenarioOverride.js';

const { mockGetActiveOverrideSummary, mockUseAuth } = vi.hoisted(() => ({
  mockGetActiveOverrideSummary: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../../../services/ScenarioOverrideService.js', () => ({
  default: { getActiveOverrideSummary: mockGetActiveOverrideSummary },
}));

vi.mock('../../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
}));

describe('useActiveScenarioOverride', () => {
  afterEach(() => {
    mockGetActiveOverrideSummary.mockReset();
    mockUseAuth.mockReset();
  });

  it('does not fetch while AuthContext is still resolving — the exact race that made the banner miss a fresh tab/page load', () => {
    mockUseAuth.mockReturnValue({ currentUser: null, loading: true });
    renderHook(() => useActiveScenarioOverride());
    expect(mockGetActiveOverrideSummary).not.toHaveBeenCalled();
  });

  it('does not fetch once AuthContext resolves to signed-out', async () => {
    mockUseAuth.mockReturnValue({ currentUser: null, loading: false });
    const { result } = renderHook(() => useActiveScenarioOverride());
    expect(mockGetActiveOverrideSummary).not.toHaveBeenCalled();
    expect(result.current.activeOverride).toBeNull();
  });

  it('fetches once AuthContext resolves to a signed-in user', async () => {
    mockGetActiveOverrideSummary.mockResolvedValue({ departmentKey: 'CRA-ARC', updatedAt: 't1' });
    mockUseAuth.mockReturnValue({ currentUser: { userId: 'u1', role: 'partner' }, loading: false });

    const { result } = renderHook(() => useActiveScenarioOverride());

    await waitFor(() => {
      expect(mockGetActiveOverrideSummary).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.activeOverride).toEqual({ departmentKey: 'CRA-ARC', updatedAt: 't1' });
    });
  });

  it('skips the fetch entirely when enabled:false (e.g. read-only review mode)', () => {
    mockUseAuth.mockReturnValue({ currentUser: { userId: 'u1', role: 'admin' }, loading: false });
    renderHook(() => useActiveScenarioOverride({ enabled: false }));
    expect(mockGetActiveOverrideSummary).not.toHaveBeenCalled();
  });
});
