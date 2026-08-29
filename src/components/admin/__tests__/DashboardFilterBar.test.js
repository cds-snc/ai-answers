/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TRANSLATIONS = {
  'dashboardFilter.last30': 'Last 30 days',
  'dashboardFilter.custom': 'Custom',
  'dashboardFilter.removeFilter': 'Remove filter',
  'dashboardFilter.dateRange': 'Date range',
  'dashboardFilter.apply': 'Apply',
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

import DashboardFilterBar from '../DashboardFilterBar.js';

describe('DashboardFilterBar', () => {
  afterEach(() => cleanup());

  it('moves focus to the Date range heading when the date pill is reset, instead of dropping it to <body>', () => {
    // Regression test: resetting the date pill (its own × button, handleReset)
    // flips isDefault back to true, swapping the just-clicked <button> for a
    // plain non-interactive <span>. Lands on the "Date range" label
    // (dateRangeHeadingRef), not the "Custom" preset toggle - see the second
    // test below for why the toggle button isn't a safe target for any
    // fetch-triggering close.
    render(<DashboardFilterBar lang="en" onApply={vi.fn()} />);

    // Apply a non-default preset first so the pill renders as a real,
    // closable <button> (isDefault === false) rather than the info span.
    fireEvent.click(screen.getByText('Last 30 days'));

    const removeButton = screen.getByLabelText(/Remove filter/);
    removeButton.focus();
    expect(document.activeElement).toBe(removeButton);

    fireEvent.click(removeButton);

    expect(document.activeElement).toBe(screen.getByText('Date range'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('moves focus to the Date range heading synchronously on Apply, before the loading state that would otherwise disable and blur the clicked button', () => {
    // Regression test: fireApply previously had no focus handling at all -
    // a keyboard/screen-reader user who clicked a preset button relied on
    // that button staying focused. But every preset button here, including
    // the one just clicked, carries disabled={loading}, and onApply's fetch
    // flips loading true in the very same tick the click fires. A real
    // browser blurs a focused element the instant it's disabled, dropping
    // focus to <body> with no signal of what happened. The fix redirects
    // focus synchronously, before onApply is even called - landing on a
    // target ("Date range") that's never subject to loading at all, not on
    // a deferred check that would just lose the same race a tick later.
    const { rerender } = render(<DashboardFilterBar lang="en" loading={false} onApply={vi.fn()} />);

    const last30Button = screen.getByText('Last 30 days').closest('button');
    last30Button.focus();
    expect(document.activeElement).toBe(last30Button);

    fireEvent.click(last30Button);
    expect(document.activeElement).toBe(screen.getByText('Date range'));

    // Confirm the redirect actually holds once loading catches up and
    // disables the (no-longer-focused) button - not just that it fired.
    rerender(<DashboardFilterBar lang="en" loading={true} onApply={vi.fn()} />);
    expect(last30Button.disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByText('Date range'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('moves focus to the Date range heading when Apply is clicked inside the expanded custom-date row', () => {
    // Regression test for handleCustomApply's retarget (customToggleRef ->
    // dateRangeHeadingRef): the custom row (inputs + this Apply button)
    // unmounts the instant showCustom flips false, so whatever's clicked
    // disappears from the DOM - landing on a target outside that row is the
    // whole point, and nothing asserted which target before this test.
    const { container } = render(<DashboardFilterBar lang="en" onApply={vi.fn()} />);

    fireEvent.click(screen.getByText('Custom'));
    fireEvent.change(container.querySelector('#dashboard-custom-start'), { target: { value: '2026-01-01' } });
    fireEvent.change(container.querySelector('#dashboard-custom-end'), { target: { value: '2026-01-31' } });

    const customApplyButton = container.querySelector('.filter-bar__apply');
    customApplyButton.focus();
    expect(document.activeElement).toBe(customApplyButton);

    fireEvent.click(customApplyButton);

    expect(document.activeElement).toBe(screen.getByText('Date range'));
    expect(document.activeElement).not.toBe(document.body);
  });
});
