/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from 'jquery';

// Real jquery + the real daterangepicker plugin run fine under jsdom, and
// give much higher-fidelity coverage of the keyboard-accessibility patch in
// FilterPanel.js than a hand-rolled mock of the plugin's API surface would.
import 'daterangepicker';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => defaultValue || key
  })
}));

import FilterPanel from '../FilterPanel.js';

describe('FilterPanel', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.moment = undefined;
    }
    if (typeof globalThis !== 'undefined') {
      globalThis.moment = undefined;
    }
  });

  afterEach(() => {
    cleanup();
    // The plugin appends its popup container to <body> and doesn't remove
    // it until the component's cleanup effect runs; guard against leakage
    // between tests if a test ends mid-open.
    document.querySelectorAll('.daterangepicker').forEach((el) => el.remove());
  });

  const renderPanel = (props = {}) => {
    const onApplyFilters = vi.fn();
    const onClearFilters = vi.fn();
    const utils = render(
      <FilterPanel
        lang="en"
        onApplyFilters={onApplyFilters}
        onClearFilters={onClearFilters}
        isVisible={true}
        {...props}
      />
    );
    return { ...utils, onApplyFilters, onClearFilters };
  };

  it('initializes the date range picker with a shared Moment instance', async () => {
    renderPanel();

    await waitFor(() => {
      expect(window.moment).toBeTypeOf('function');
    });
    expect(window.moment.localeData).toBeTypeOf('function');
  });

  it('recovers when window.moment was replaced with an incompatible object', async () => {
    window.moment = () => ({});
    window.moment.localeData = undefined;

    renderPanel();

    await waitFor(() => {
      expect(window.moment).toBeTypeOf('function');
    });
    expect(window.moment.localeData).toBeTypeOf('function');
  });

  it('marks the date-range trigger as a collapsed popup by default', async () => {
    const { getByLabelText } = renderPanel();
    const input = await waitFor(() => getByLabelText('Date range (24-hour)'));

    expect(input.getAttribute('aria-haspopup')).toBe('dialog');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not let the plugin close the popup on Tab (the bug this PR fixes)', async () => {
    const { getByLabelText } = renderPanel();
    const input = await waitFor(() => getByLabelText('Date range (24-hour)'));

    fireEvent.focus(input);

    const instance = $(input).data('daterangepicker');
    await waitFor(() => expect(instance.isShowing).toBe(true));

    // Before the fix, the plugin's own keydown.daterangepicker handler
    // called hide() on Tab/Enter — closing the popup the instant a keyboard
    // user tried to move into it.
    fireEvent.keyDown(input, { key: 'Tab', keyCode: 9, which: 9 });

    expect(instance.isShowing).toBe(true);
  });

  it('closes when focus actually moves to the next field (real Tab)', async () => {
    const { getByLabelText } = renderPanel();
    const input = await waitFor(() => getByLabelText('Date range (24-hour)'));
    const departmentSelect = getByLabelText('Partner institution');

    fireEvent.focus(input);
    const instance = $(input).data('daterangepicker');
    await waitFor(() => expect(instance.isShowing).toBe(true));

    // jsdom's .focus() moves real document focus and fires native
    // focusout/focusin, the same way a browser Tab keypress does — unlike
    // fireEvent.keyDown above, which only dispatches a keydown event.
    departmentSelect.focus();

    await waitFor(() => expect(instance.isShowing).toBe(false));
  });

  it('makes preset ranges and calendar cells keyboard-focusable with labels', async () => {
    const { getByLabelText } = renderPanel();
    const input = await waitFor(() => getByLabelText('Date range (24-hour)'));

    fireEvent.focus(input);

    const instance = $(input).data('daterangepicker');
    await waitFor(() => expect(instance.isShowing).toBe(true));

    const rangeItems = instance.container[0].querySelectorAll('.ranges li');
    expect(rangeItems.length).toBeGreaterThan(0);
    rangeItems.forEach((li) => {
      expect(li.getAttribute('tabindex')).toBe('0');
      expect(li.getAttribute('role')).toBe('button');
    });

    const activeCell = instance.container[0].querySelector('td.available[tabindex="0"]');
    expect(activeCell).toBeTruthy();
    expect(activeCell.getAttribute('role')).toBe('gridcell');
    expect(activeCell.getAttribute('aria-label')).toBeTruthy();

    // "next month" is only rendered when a later month is still selectable
    // (the picker's maxDate is capped at today), so only .prev is guaranteed
    // to exist for whatever month is showing when the test runs.
    const prevNav = instance.container[0].querySelector('th.prev');
    expect(prevNav.getAttribute('tabindex')).toBe('0');
    expect(prevNav.getAttribute('aria-label')).toBe('Previous month');
  });

  it('selects a preset range via Enter on the list item', async () => {
    const { getByLabelText } = renderPanel();
    const input = await waitFor(() => getByLabelText('Date range (24-hour)'));

    fireEvent.focus(input);
    const instance = $(input).data('daterangepicker');
    await waitFor(() => expect(instance.isShowing).toBe(true));

    const todayItem = Array.from(instance.container[0].querySelectorAll('.ranges li')).find(
      (li) => li.getAttribute('data-range-key') === 'Today'
    );
    expect(todayItem).toBeTruthy();

    fireEvent.keyDown(todayItem, { key: 'Enter' });

    // Selecting a preset range applies immediately and closes the popup.
    await waitFor(() => expect(instance.isShowing).toBe(false));
  });

  it('closes on Escape and returns focus to the trigger input', async () => {
    const { getByLabelText } = renderPanel();
    const input = await waitFor(() => getByLabelText('Date range (24-hour)'));

    fireEvent.focus(input);
    const instance = $(input).data('daterangepicker');
    await waitFor(() => expect(instance.isShowing).toBe(true));

    const rangeItem = instance.container[0].querySelector('.ranges li');
    fireEvent.keyDown(rangeItem, { key: 'Escape' });

    await waitFor(() => expect(instance.isShowing).toBe(false));
    expect(document.activeElement).toBe(input);
  });

  it('gives each pill remove button a distinct accessible name', async () => {
    const { getByLabelText, findByLabelText } = renderPanel({ autoApply: true, defaultUserType: 'public' });

    await waitFor(() => getByLabelText('Date range (24-hour)'));

    // Wait for the applied-filters pill row to render, then check that the
    // pill removal button includes the pill's own label, not a generic
    // "Remove filter" name shared by every pill.
    const removeButton = await findByLabelText(/Remove filter - /);
    expect(removeButton.getAttribute('aria-label')).not.toBe('Remove filter');
  });

  it('shows the AND/OR eval-logic toggle by default, hides it when showEvalLogic is false', async () => {
    const { getByLabelText, queryByLabelText, unmount } = renderPanel();
    await waitFor(() => getByLabelText('Date range (24-hour)'));
    expect(queryByLabelText('Combine partner and AI evaluation filters')).not.toBeNull();
    unmount();

    const { getByLabelText: getByLabelText2, queryByLabelText: queryByLabelText2 } = renderPanel({ showEvalLogic: false });
    await waitFor(() => getByLabelText2('Date range (24-hour)'));
    expect(queryByLabelText2('Combine partner and AI evaluation filters')).toBeNull();
  });
});
