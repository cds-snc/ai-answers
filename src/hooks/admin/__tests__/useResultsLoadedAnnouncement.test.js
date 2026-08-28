/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useResultsLoadedAnnouncement } from '../useResultsLoadedAnnouncement.js';

const announce = vi.fn();
vi.mock('../../../utils/liveAnnouncer.js', () => ({
  announce: (...args) => announce(...args),
}));

const t = (key) => key;

// Drives a loading → not-loading transition with the given end state.
function finishLoad(props) {
  const { rerender } = renderHook((p) => useResultsLoadedAnnouncement(p), {
    initialProps: { loading: true, count: undefined, error: null, t },
  });
  rerender({ loading: false, error: null, t, ...props });
}

describe('useResultsLoadedAnnouncement', () => {
  beforeEach(() => announce.mockClear());

  it('announces "Results loaded." assertively once a fetch finishes with data', () => {
    finishLoad({ count: 42 });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('admin.common.resultsLoaded', { assertive: true });
  });

  it('treats a null count (rows exist, no cheap count) as data, like noteLoadResult', () => {
    finishLoad({ count: null });
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('is silent on zero — the visible "no data" box announces that itself', () => {
    finishLoad({ count: 0 });
    expect(announce).not.toHaveBeenCalled();
  });

  it('is silent when the fetch failed, even though stale metrics still give a count', () => {
    finishLoad({ count: 42, error: new Error('500') });
    expect(announce).not.toHaveBeenCalled();
  });

  it('is silent when the fetch failed and the error is a boolean flag', () => {
    finishLoad({ count: 42, error: true });
    expect(announce).not.toHaveBeenCalled();
  });

  it('does not announce without a loading → not-loading transition', () => {
    renderHook(() => useResultsLoadedAnnouncement({ loading: false, count: 42, error: null, t }));
    expect(announce).not.toHaveBeenCalled();
  });
});
