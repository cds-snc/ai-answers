/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEvalAnalysis } from '../useEvalAnalysis.js';

const create = vi.fn();
const list = vi.fn();

vi.mock('../../../services/EvalAnalysisService.js', () => ({
  default: {
    create: (...args) => create(...args),
    list: (...args) => list(...args),
    get: vi.fn()
  }
}));

describe('useEvalAnalysis.runAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // A request that times out can still finish on the server; the past-runs
  // list is the only way to find that run, so it refreshes either way.
  it('refreshes the past-runs list after a failed run', async () => {
    create.mockRejectedValueOnce(new Error('timeout'));
    list.mockResolvedValueOnce([{ _id: 'r1', status: 'complete' }]);
    const { result } = renderHook(() => useEvalAnalysis('en'));

    await act(() => result.current.runAnalysis({ department: 'CRA-ARC' }));

    expect(list).toHaveBeenCalledWith('CRA-ARC');
    expect(result.current.runError).toBeTruthy();
    expect(result.current.pastRuns).toEqual([{ _id: 'r1', status: 'complete' }]);
    expect(result.current.running).toBe(false);
  });

  it('refreshes the list after a successful run', async () => {
    create.mockResolvedValueOnce({ _id: 'a1', status: 'complete' });
    list.mockResolvedValueOnce([{ _id: 'a1', status: 'complete' }]);
    const { result } = renderHook(() => useEvalAnalysis('en'));

    await act(() => result.current.runAnalysis({ department: 'CRA-ARC' }));

    expect(result.current.analysis).toEqual({ _id: 'a1', status: 'complete' });
    expect(list).toHaveBeenCalledWith('CRA-ARC');
  });
});
