/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSearchAnnouncement } from '../useSearchAnnouncement.js';

const t = (key) => {
  const map = {
    'admin.common.searchResultsAnnouncement': '{count} results found.',
    'admin.common.searchResultsUpdatedAnnouncement': 'Search results updated.',
  };
  return map[key] || key;
};
const fmtN = (n) => String(n);

describe('useSearchAnnouncement', () => {
  it('announces a count-based message on a new non-zero-result search term', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('tax', 12));

    expect(result.current.searchAnnouncement).toBe('12 results found.');
    expect(result.current.searchAnnounceNonce).toBe(1);
    expect(result.current.zeroResultNonce).toBe(0);
  });

  it('uses the count-less message when count is null', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('tax', null));

    expect(result.current.searchAnnouncement).toBe('Search results updated.');
    expect(result.current.searchAnnounceNonce).toBe(1);
  });

  it('does not re-announce on a redraw of the same search term', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('tax', 12));
    act(() => result.current.noteSearchResult('tax', 12));

    expect(result.current.searchAnnounceNonce).toBe(1);
  });

  it('bumps zeroResultNonce on every zero-result completion, even repeats', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('nomatch', 0));
    act(() => result.current.noteSearchResult('nomatch', 0));

    expect(result.current.zeroResultNonce).toBe(2);
    // no "0 results found" sr-only announcement - the visible zero-result
    // StatusMessage (gated on zeroResultNonce) covers that case instead.
    expect(result.current.searchAnnounceNonce).toBe(0);
  });

  it('announce() and reset() support the Filters-cleared case', () => {
    const { result } = renderHook(() => useSearchAnnouncement({ t, fmtN }));

    act(() => result.current.noteSearchResult('tax', 12));
    act(() => result.current.announce('Filters cleared.'));
    act(() => result.current.reset());
    act(() => result.current.noteSearchResult('tax', 12));

    expect(result.current.searchAnnouncement).toBe('12 results found.');
    // announce (1) + 2 noteSearchResult calls (2) = 3, since reset() makes
    // the repeated 'tax' term count as new again
    expect(result.current.searchAnnounceNonce).toBe(3);
  });
});
