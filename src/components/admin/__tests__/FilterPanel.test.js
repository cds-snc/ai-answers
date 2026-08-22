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
// and class names instead — see getDateRangeInput. Switching off label-text
// queries drops the implicit "this control has a real accessible name" check
// that getByLabelText used to provide, so 'keeps native label associations…'
// below exists specifically to keep that coverage.
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

  it('keeps native label associations for the date-range trigger and department select', async () => {
    const { container } = renderPanel();
    const input = await waitFor(() => getDateRangeInput(container));
    const departmentSelect = container.querySelector('#department');

    // The tests below match these controls by id, not label text, so a
    // broken <label htmlFor> association wouldn't fail any of them — this
    // is the one assertion that still catches that regression. `.labels`
    // reflects the live for/id association regardless of what the label
    // text says, so it stays valid across copy changes.
    expect(input.labels).toHaveLength(1);
    expect(input.labels[0].textContent.trim().length).toBeGreaterThan(0);
    expect(departmentSelect.labels).toHaveLength(1);
    expect(departmentSelect.labels[0].textContent.trim().length).toBeGreaterThan(0);
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
    const { container, findAllByLabelText } = renderPanel({ autoApply: true, defaultUserType: 'public' });

    await waitFor(() => getDateRangeInput(container));

    // Wait for the applied-filters pill row to render, then check that each
    // pill removal button includes that pill's own label, not a generic
    // "Remove filter" name shared by every pill. defaultUserType 'public'
    // means two closable pills exist here: the date range, and the
    // "Public" user-type pill (see effectiveUserType in FilterPanel.js —
    // 'public' isn't the universal 'all', so it's a real, removable filter).
    const removeButtons = await findAllByLabelText(/Remove filter - /);
    expect(removeButtons.length).toBeGreaterThanOrEqual(2);
    const labels = removeButtons.map((b) => b.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).not.toContain('Remove filter');
    expect(labels.some((l) => l.includes('Public'))).toBe(true);
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

  it('never shows the "Advanced: All" info pill when showAdvancedSection is false', async () => {
    // Regression test: this pill used to render unconditionally whenever
    // answerType/partnerEval/aiEval/urlEn/urlFr were all at their default —
    // which is always true when showAdvancedSection={false}, since there's
    // no UI to change them. It referenced a "More filters" section that
    // wasn't on the page at all.
    const { container, queryByText } = renderPanel({ autoApply: true, showAdvancedSection: false });
    await waitFor(() => getDateRangeInput(container));
    expect(container.querySelector('.filter-advanced-details')).toBeNull();
    expect(queryByText('Advanced: All')).toBeNull();
  });

  it('hides the AND/OR evalLogic toggle when showCategoryFilters is false, even though showEvalLogic defaults to true', async () => {
    // Regression test: the toggle controls how partnerEval/aiEval combine,
    // so it's meaningless once those columns are hidden. Without this, the
    // documented "re-enable later with showAdvancedSection={true}
    // showCategoryFilters={false}" recipe would leave a combinator with
    // nothing left to combine.
    const { container } = renderPanel({ showCategoryFilters: false });
    await waitFor(() => getDateRangeInput(container));
    expect(container.querySelector('.filter-eval-logic')).toBeNull();
  });

  it('hides just the answer type / partner eval / AI eval columns when showCategoryFilters is false, keeping URL fields', async () => {
    // For MetricsDashboard.js / TechnicalMetricsDashboard.js: those three
    // columns are each a hard $match applied before the aggregation that
    // builds their own breakdown chart, so filtering by one is self-
    // defeating there (see the dashboards' showCategoryFilters comment) —
    // but urlEn/urlFr are a real, independent filter worth keeping.
    const { container, unmount } = renderPanel();
    await waitFor(() => getDateRangeInput(container));
    expect(container.querySelector('#url-en')).not.toBeNull();
    expect(container.querySelectorAll('.filter-checkbox-details')).toHaveLength(3);
    unmount();

    const { container: container2 } = renderPanel({ showCategoryFilters: false });
    await waitFor(() => getDateRangeInput(container2));
    // "More filters" itself still renders (unlike showAdvancedSection: false)
    expect(container2.querySelector('.filter-advanced-details')).not.toBeNull();
    expect(container2.querySelector('#url-en')).not.toBeNull();
    expect(container2.querySelector('#url-fr')).not.toBeNull();
    expect(container2.querySelectorAll('.filter-checkbox-details')).toHaveLength(0);
  });

  it('adds a space before the colon in "Label: value" pills for French, not English', async () => {
    // The "usersAll" info pill (built via formatPillLabel, the thing this
    // test is actually about) only renders when the effective user type is
    // genuinely 'all' — see effectiveUserType in FilterPanel.js. A non-'all'
    // default (e.g. 'public') renders a plain closable pill instead, which
    // doesn't go through formatPillLabel at all (see the tests below), so
    // this needs defaultUserType: 'all' to exercise the colon-spacing rule.
    const { container, queryByText } = renderPanel({ lang: 'fr', autoApply: true, defaultUserType: 'all' });
    await waitFor(() => getDateRangeInput(container));
    expect(queryByText('Utilisateurs : Tous')).not.toBeNull();
    expect(queryByText('Utilisateurs: Tous')).toBeNull();
  });

  it('renders a closable "Public" pill (not an info "Users: All" pill) when defaultUserType is "public"', async () => {
    // Regression test: MetricsDashboard.js / TechnicalMetricsDashboard.js set
    // defaultUserType="public". Before the fix, applying with the dropdown
    // left on its own default rendered a non-closable pill claiming
    // "Users: All" even though the query itself correctly stayed scoped to
    // public users — the pill was both mislabeled AND not removable. Now:
    // 'public' isn't the universal 'all', so it's treated as a real, active
    // filter — a closable pill showing the bare value "Public" (same
    // convention as every other closable pill, e.g. department), with a ×
    // that resets it to 'all' (see removeFilter's 'userType' branch).
    const { container, queryByText, findByLabelText } = renderPanel({ autoApply: true, defaultUserType: 'public' });
    await waitFor(() => getDateRangeInput(container));
    expect(queryByText('Users: All')).toBeNull();
    const removeButton = await findByLabelText('Remove filter - Public');
    expect(removeButton.closest('.filter-pill')?.className).toContain('filter-pill--closable');
  });

  it('still labels the at-rest user-type pill "All" when the default really is all', async () => {
    const { container, queryByText } = renderPanel({ autoApply: true, defaultUserType: 'all' });
    await waitFor(() => getDateRangeInput(container));
    expect(queryByText('Users: All')).not.toBeNull();
  });

  it('moves focus to the panel summary when Clear all is clicked from the pills row, instead of dropping it to <body>', async () => {
    // Regression test: the pills row's own inline "Clear all" button (only
    // rendered once there's a real, non-info pill - defaultUserType: 'public'
    // gets one for free, see the test above) unmounts along with the whole
    // row once handleClear resets appliedFilters to null. Before the fix,
    // the just-clicked button (and everything around it) disappeared from
    // the DOM with no focus redirect, silently dropping focus to <body>.
    const { container } = renderPanel({ autoApply: true, defaultUserType: 'public' });
    await waitFor(() => getDateRangeInput(container));

    const clearAllPillButton = await waitFor(() => {
      const btn = container.querySelector('.filter-pills__clear-all');
      if (!btn) throw new Error('pills row Clear all button not rendered yet');
      return btn;
    });

    clearAllPillButton.focus();
    expect(document.activeElement).toBe(clearAllPillButton);

    fireEvent.click(clearAllPillButton);

    expect(document.activeElement).toBe(container.querySelector('.filter-panel-summary'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('moves focus to the new "Users: All" pill when the userType pill is removed - it replaces it in the same slot', async () => {
    // Regression test: buildPills() always pushes exactly one userType pill
    // (real "Public" button or info "Users: All" span) at the same array
    // index, so whichever one now occupies that slot after removal is the
    // right thing to land on - not <body>.
    const { container, findByLabelText, queryByText } = renderPanel({ autoApply: true, defaultUserType: 'public' });
    await waitFor(() => getDateRangeInput(container));

    const removeButton = await findByLabelText('Remove filter - Public');
    removeButton.focus();
    expect(document.activeElement).toBe(removeButton);

    fireEvent.click(removeButton);

    await waitFor(() => expect(queryByText('Users: All')).not.toBeNull());
    expect(document.activeElement).toBe(queryByText('Users: All'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('does not let a stale index from clicking the date pill corrupt a later pill removal', async () => {
    // Regression test: the date pill's own removeFilter branch never
    // updates appliedFilters (it reopens the calendar via a separate,
    // already-working mechanism instead), so this effect's [appliedFilters]
    // dependency never fires for it. If its index were armed anyway, it
    // would sit stale until the *next* real appliedFilters change (e.g.
    // removing a different pill) incorrectly consumed it.
    const { container, findByLabelText, queryByText } = renderPanel({ autoApply: true, defaultUserType: 'public' });
    await waitFor(() => getDateRangeInput(container));

    // Date is always pushed first in buildPills(), so it's the first
    // closable pill button in the row.
    const dateRemoveButton = container.querySelector('.filter-bar__pills-row button.filter-pill--closable');
    expect(dateRemoveButton).not.toBeNull();
    fireEvent.click(dateRemoveButton);

    const userTypeRemoveButton = await findByLabelText('Remove filter - Public');
    fireEvent.click(userTypeRemoveButton);

    await waitFor(() => expect(queryByText('Users: All')).not.toBeNull());
    expect(document.activeElement).toBe(queryByText('Users: All'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('falls back to a remaining pill when a pill with no replacement (urlEn) is removed from the end of the row', async () => {
    // Regression test: unlike department/userType/partnerEval/aiEval, urlEn
    // has no "at default" fallback pill - removing it (when it's the last
    // pill in the row, via showCategoryFilters: false so partnerEval/aiEval's
    // own always-present info pills aren't there to shift into its slot)
    // means its array index no longer exists at all afterward. Falls back
    // to index-1 (department or userType, both always-present) rather than
    // losing focus to <body>.
    const { container, findByLabelText } = renderPanel({ autoApply: true, showCategoryFilters: false });
    await waitFor(() => getDateRangeInput(container));

    const urlEnInput = container.querySelector('#url-en');
    fireEvent.change(urlEnInput, { target: { value: 'canada.ca/test' } });
    fireEvent.click(container.querySelector('#filter-apply-button'));

    const removeButton = await findByLabelText(/canada\.ca\/test/);
    removeButton.focus();
    expect(document.activeElement).toBe(removeButton);

    fireEvent.click(removeButton);

    expect(document.activeElement).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(container.querySelector('.filter-bar__pills-row').contains(document.activeElement)).toBe(true);
  });
});
