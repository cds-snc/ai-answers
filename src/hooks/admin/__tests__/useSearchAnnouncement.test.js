/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchAnnouncement } from '../useSearchAnnouncement.js';

const announce = vi.fn();
vi.mock('../../../utils/liveAnnouncer.js', () => ({
  announce: (...args) => announce(...args),
}));

const t = (key) => {
  const map = {
    'admin.common.searchResultsAnnouncement': '{count} results found.',
    'admin.common.searchResultsUpdatedAnnouncement': 'Search results updated.',
  };
  return map[key] || key;
};
const fmtN = (n) => String(n);

describe('useSearchAnnouncement', () => {
  beforeEach(() => announce.mockClear());

  it('reports whether it announced, so the caller can skip noteLoadResult for the same fetch', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));
    let announced;

    act(() => { announced = result.current.noteSearchResult('tax', 12); });
    expect(announced).toBe(true);

    // Same term again (paging/sorting): silent, so the caller announces
    // "Results loaded." instead.
    act(() => { announced = result.current.noteSearchResult('tax', 12); });
    expect(announced).toBe(false);

    // Zero results: the visible box announces, this doesn't.
    act(() => { announced = result.current.noteSearchResult('nomatch', 0); });
    expect(announced).toBe(false);

    // No term at all (a filter apply): not a search announcement.
    act(() => { announced = result.current.noteSearchResult('', 40); });
    expect(announced).toBe(false);
  });

  it('announces a count-based message on a new non-zero-result search term', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('tax', 12));

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('12 results found.');
    expect(result.current.zeroResultNonce).toBe(0);
  });

  it('uses the count-less message when count is null', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('tax', null));

    expect(announce).toHaveBeenCalledWith('Search results updated.');
  });

  it('does not re-announce on a redraw of the same search term', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('tax', 12));
    act(() => result.current.noteSearchResult('tax', 12));

    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('bumps zeroResultNonce on every zero-result completion, even repeats', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('nomatch', 0));
    act(() => result.current.noteSearchResult('nomatch', 0));

    expect(result.current.zeroResultNonce).toBe(2);
    // no "0 results found" announcement - the visible zero-result
    // StatusMessage (gated on zeroResultNonce) covers that case instead.
    expect(announce).not.toHaveBeenCalled();
  });

  it('announce() and reset() support the Filters-cleared case', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('tax', 12));
    act(() => result.current.announce('Filters cleared.'));
    act(() => result.current.reset());
    act(() => result.current.noteSearchResult('tax', 12));

    // announce (1) + 2 noteSearchResult calls (2) = 3, since reset() makes
    // the repeated 'tax' term count as new again
    expect(announce.mock.calls.map((c) => c[0])).toEqual([
      '12 results found.',
      'Filters cleared.',
      '12 results found.',
    ]);
  });
});
