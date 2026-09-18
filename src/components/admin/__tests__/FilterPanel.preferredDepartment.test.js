/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import moment from 'moment';
if (typeof window !== 'undefined') window.moment = moment;
import 'daterangepicker';

// Account preference (Account dashboard page): open dashboards with the
// user's own institution selected as the Partner institution filter.
const { authState } = vi.hoisted(() => ({ authState: { currentUser: null } }));
vi.mock('../../../contexts/AuthContext.js', () => ({ useAuth: () => authState }));

import FilterPanel from '../FilterPanel.js';

describe('FilterPanel preferred department (account preference)', () => {
  afterEach(() => {
    cleanup();
    document.querySelectorAll('.daterangepicker').forEach((el) => el.remove());
  });

  const renderPanel = (props = {}) => {
    const onApplyFilters = vi.fn();
    const onClearFilters = vi.fn();
    const utils = render(
      <FilterPanel lang="en" onApplyFilters={onApplyFilters} onClearFilters={onClearFilters} isVisible={true} {...props} />
    );
    return { ...utils, onApplyFilters, onClearFilters };
  };

  it('starts on the user institution when the preference is on, and auto-applies it', async () => {
    authState.currentUser = { institution: 'DND-MDN', preferences: { prefilterDepartment: true } };
    const { container, onApplyFilters } = renderPanel({ autoApply: true });
    await waitFor(() => expect(container.querySelector('#department')).toBeTruthy());
    expect(container.querySelector('#department').value).toBe('DND-MDN');
    expect(onApplyFilters).toHaveBeenCalledWith(expect.objectContaining({ department: 'DND-MDN' }));
  });

  it('Clear returns to the preferred institution, not to all', async () => {
    authState.currentUser = { institution: 'IRCC', preferences: { prefilterDepartment: true } };
    const { container, onClearFilters } = renderPanel();
    await waitFor(() => expect(container.querySelector('#department')).toBeTruthy());
    fireEvent.change(container.querySelector('#department'), { target: { value: 'FIN' } });
    expect(container.querySelector('#department').value).toBe('FIN');
    const clearButton = Array.from(container.querySelectorAll('button')).find((b) => /clear/i.test(b.textContent));
    fireEvent.click(clearButton);
    expect(container.querySelector('#department').value).toBe('IRCC');
    expect(onClearFilters).toHaveBeenCalledWith(expect.objectContaining({ department: 'IRCC' }));
  });

  it('group preference: applied as a hidden filter with a closable pill, dropped by the pill and restored by Clear', async () => {
    authState.currentUser = { group: 'Military transitions', preferences: { prefilterGroup: true } };
    const { container, onApplyFilters } = renderPanel({ autoApply: true });
    await waitFor(() => expect(onApplyFilters).toHaveBeenCalled());
    expect(onApplyFilters.mock.calls[0][0]).toEqual(expect.objectContaining({ group: 'Military transitions', department: '' }));
    const pill = Array.from(container.querySelectorAll('button')).find((b) => /Military transitions/.test(b.textContent));
    expect(pill).toBeTruthy();
    fireEvent.click(pill);
    await waitFor(() => expect(onApplyFilters.mock.calls.at(-1)[0].group).toBe(''));
    const clearButton = Array.from(container.querySelectorAll('button')).find((b) => /clear/i.test(b.textContent));
    fireEvent.click(clearButton);
    await waitFor(() => expect(onApplyFilters.mock.calls.at(-1)[0].group).toBe('Military transitions'));
  });

  it('ignores the institution when the preference is off or no institution is set', async () => {
    authState.currentUser = { institution: 'DND-MDN', preferences: { prefilterDepartment: false } };
    const first = renderPanel();
    await waitFor(() => expect(first.container.querySelector('#department')).toBeTruthy());
    expect(first.container.querySelector('#department').value).toBe('');
    cleanup();
    authState.currentUser = { institution: '', preferences: { prefilterDepartment: true } };
    const second = renderPanel();
    await waitFor(() => expect(second.container.querySelector('#department')).toBeTruthy());
    expect(second.container.querySelector('#department').value).toBe('');
  });
});
