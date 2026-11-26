/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEvalAnalysis } from '../useEvalAnalysis.js';

const create = vi.fn();
const list = vi.fn();
const get = vi.fn();

vi.mock('../../../services/EvalAnalysisService.js', () => ({
  default: {
    create: (...args) => create(...args),
    list: (...args) => list(...args),
    get: (...args) => get(...args)
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

  // A run can take minutes. If the filters change meanwhile, the section
  // calls clearAnalysis; the old result must not show under the new filters
  // or refill the list with the old institution's runs.
  it('drops a run result that comes back after the filters changed', async () => {
    let resolveRun;
    create.mockReturnValueOnce(new Promise((resolve) => { resolveRun = resolve; }));
    const { result } = renderHook(() => useEvalAnalysis('en'));

    let runPromise;
    act(() => { runPromise = result.current.runAnalysis({ department: 'CRA-ARC' }); });
    expect(result.current.running).toBe(true);
    act(() => result.current.clearAnalysis());
    expect(result.current.running).toBe(false);

    await act(async () => {
      resolveRun({ _id: 'old', status: 'complete' });
      await runPromise;
    });

    expect(result.current.analysis).toBeNull();
    expect(result.current.running).toBe(false);
    expect(list).not.toHaveBeenCalled();
  });

  it('drops a past report that finishes loading after a run started', async () => {
    let resolveLoad;
    get.mockReturnValueOnce(new Promise((resolve) => { resolveLoad = resolve; }));
    let resolveRun;
    create.mockReturnValueOnce(new Promise((resolve) => { resolveRun = resolve; }));
    list.mockResolvedValue([]);
    const { result } = renderHook(() => useEvalAnalysis('en'));

    let loadPromise;
    let runPromise;
    act(() => { loadPromise = result.current.loadAnalysis('past'); });
    act(() => { runPromise = result.current.runAnalysis({ department: 'CRA-ARC' }); });
    expect(result.current.loadingAnalysisId).toBeNull();

    await act(async () => {
      resolveLoad({ _id: 'past', status: 'complete' });
      await loadPromise;
    });
    expect(result.current.analysis).toBeNull();
    expect(result.current.running).toBe(true);

    await act(async () => {
      resolveRun({ _id: 'new', status: 'complete' });
      await runPromise;
    });
    expect(result.current.analysis).toEqual({ _id: 'new', status: 'complete' });
  });

  it('records which institution the past-runs list belongs to and returns it', async () => {
    list.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useEvalAnalysis('en'));
    let runs;
    await act(async () => { runs = await result.current.refreshList('CRA-ARC'); });
    expect(runs).toEqual([]);
    expect(result.current.pastRunsDepartment).toBe('CRA-ARC');
  });

  it('counts finished past-report loads, so a repeat view can re-announce', async () => {
    get.mockResolvedValue({ _id: 'r1', status: 'running' });
    const { result } = renderHook(() => useEvalAnalysis('en'));
    await act(() => result.current.loadAnalysis('r1'));
    await act(() => result.current.loadAnalysis('r1'));
    expect(result.current.loadCount).toBe(2);
  });
});
