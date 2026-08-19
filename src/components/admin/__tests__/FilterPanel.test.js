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

// No translation mock here on purpose. There used to be a
// vi.mock('../../hooks/useTranslations.js') at this point, but from this file's
// directory that specifier resolves to src/components/hooks/useTranslations.js,
// which does not exist — the component's identical-looking specifier resolves
// from src/components/admin/ to src/hooks/useTranslations.js. So the mock never
// applied and these tests have always run against the real hook and the real
// locale files. Keep it that way: the French punctuation test below is only
// meaningful against real translations. The consequence is that display copy is
// not a safe thing to query on, so element lookups below anchor on stable ids
// and class names instead — see getDateRangeInput.
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

  // Most tests below need the date-range input, either as the element under
  // test or just as a signal that the picker has finished initializing.
  // Look it up by its stable id rather than its label text: these tests run
  // against the real locale files, so matching display copy couples every one
  // of them to en.json wording. That is exactly how this suite broke — the
  // label was "Date range (24-hour)" until it was shortened to "Date range",
  // and ten tests started failing on an unrelated copy change.
  const getDateRangeInput = (container) => {
    const input = container.querySelector('#dateRangePicker');
    if (!input) throw new Error('#dateRangePicker has not rendered yet');
    return input;
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
    const { container } = renderPanel();
    const input = await waitFor(() => getDateRangeInput(container));

    expect(input.getAttribute('aria-haspopup')).toBe('dialog');
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not let the plugin close the popup on Tab (the bug this PR fixes)', async () => {
    const { container } = renderPanel();
    const input = await waitFor(() => getDateRangeInput(container));

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
    const { container } = renderPanel();
    const input = await waitFor(() => getDateRangeInput(container));
    const departmentSelect = container.querySelector('#department');

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
    const { container } = renderPanel();
    const input = await waitFor(() => getDateRangeInput(container));

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
    const { container } = renderPanel();
    const input = await waitFor(() => getDateRangeInput(container));

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
    const { container } = renderPanel();
    const input = await waitFor(() => getDateRangeInput(container));

    fireEvent.focus(input);
    const instance = $(input).data('daterangepicker');
    await waitFor(() => expect(instance.isShowing).toBe(true));

    const rangeItem = instance.container[0].querySelector('.ranges li');
    fireEvent.keyDown(rangeItem, { key: 'Escape' });

    await waitFor(() => expect(instance.isShowing).toBe(false));
    expect(document.activeElement).toBe(input);
  });

  it('gives each pill remove button a distinct accessible name', async () => {
    const { container, findByLabelText } = renderPanel({ autoApply: true, defaultUserType: 'public' });

    await waitFor(() => getDateRangeInput(container));

    // Wait for the applied-filters pill row to render, then check that the
    // pill removal button includes the pill's own label, not a generic
    // "Remove filter" name shared by every pill.
    const removeButton = await findByLabelText(/Remove filter - /);
    expect(removeButton.getAttribute('aria-label')).not.toBe('Remove filter');
  });

  it('shows the AND/OR eval-logic toggle and its label by default, hides both when showEvalLogic is false', async () => {
    const { container, unmount } = renderPanel();
    await waitFor(() => getDateRangeInput(container));
    expect(container.querySelector('.filter-eval-logic')).not.toBeNull();
    // The eval-pair title used to render outside the showEvalLogic conditional,
    // so it stayed on screen with the radios hidden. Counting the section
    // titles states that regression without depending on their wording: two
    // when the toggle shows, one ("More filters"'s own title) when it doesn't.
    expect(container.querySelectorAll('.filter-advanced-title')).toHaveLength(2);
    unmount();

    const { container: container2 } = renderPanel({ showEvalLogic: false });
    await waitFor(() => getDateRangeInput(container2));
    expect(container2.querySelector('.filter-eval-logic')).toBeNull();
    expect(container2.querySelectorAll('.filter-advanced-title')).toHaveLength(1);
  });

  it('shows the whole "More filters" section by default, hides it when showAdvancedSection is false', async () => {
    // "Answer Type" etc. live inside the (collapsed-by-default) "More
    // filters" <details>, and jsdom doesn't surface a closed <details>'s
    // content to queries — same as a real browser. So this checks for the
    // <details> element itself rather than reaching inside it.
    const { container, unmount } = renderPanel();
    await waitFor(() => getDateRangeInput(container));
    expect(container.querySelector('.filter-advanced-details')).not.toBeNull();
    unmount();

    const { container: container2 } = renderPanel({ showAdvancedSection: false });
    await waitFor(() => getDateRangeInput(container2));
    expect(container2.querySelector('.filter-advanced-details')).toBeNull();
  });

  it('adds a space before the colon in "Label: value" pills for French, not English', async () => {
    const { container, queryByText } = renderPanel({ lang: 'fr', autoApply: true, defaultUserType: 'public' });
    await waitFor(() => getDateRangeInput(container));
    // autoApply's default filters set userType to defaultUserType, so this
    // renders the "usersAll" pill via formatPillLabel — French needs
    // "Utilisateurs : Tous" (space before ':'), not "Utilisateurs: Tous".
    expect(queryByText('Utilisateurs : Tous')).not.toBeNull();
    expect(queryByText('Utilisateurs: Tous')).toBeNull();
  });
});
