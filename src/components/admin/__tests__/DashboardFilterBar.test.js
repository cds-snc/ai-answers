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
};
const mockT = (key) => TRANSLATIONS[key] || key;
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

import DashboardFilterBar from '../DashboardFilterBar.js';

describe('DashboardFilterBar', () => {
  afterEach(() => cleanup());

  it('moves focus to the Custom preset toggle when the date pill is reset, instead of dropping it to <body>', () => {
    // Regression test: resetting the date pill (its own × button, handleReset)
    // flips isDefault back to true, swapping the just-clicked <button> for a
    // plain non-interactive <span> - handleCustomApply already redirects focus
    // to customToggleRef in the equivalent apply case; handleReset didn't.
    render(<DashboardFilterBar lang="en" onApply={vi.fn()} />);

    // Apply a non-default preset first so the pill renders as a real,
    // closable <button> (isDefault === false) rather than the info span.
    fireEvent.click(screen.getByText('Last 30 days'));

    const removeButton = screen.getByLabelText(/Remove filter/);
    removeButton.focus();
    expect(document.activeElement).toBe(removeButton);

    fireEvent.click(removeButton);

    const customToggle = screen.getByText('Custom').closest('button');
    expect(document.activeElement).toBe(customToggle);
    expect(document.activeElement).not.toBe(document.body);
  });
});
