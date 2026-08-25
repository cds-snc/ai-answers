/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import ScenarioOverrideBanner from '../ScenarioOverrideBanner.js';

vi.mock('@gcds-core/components-react', () => ({
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const t = (key) => (key === 'homepage.chat.scenarioOverride.banner' ? 'Testing local scenario override for: {department}.' : key);

describe('ScenarioOverrideBanner', () => {
  afterEach(() => cleanup());

  it('renders an empty, but present, status region when nothing is active (never conditionally unmounted)', () => {
    render(<ScenarioOverrideBanner activeOverride={null} t={t} />);
    const region = screen.getByRole('status');
    expect(region.className).toContain('scenario-override-banner--empty');
    expect(region.textContent).toBe('');
  });

  it('names the active department, informational only — no link', () => {
    render(<ScenarioOverrideBanner activeOverride={{ departmentKey: 'CBSA-ASFC', updatedAt: null }} t={t} />);
    expect(screen.getByText(/CBSA-ASFC/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('collapses back to the empty state once activeOverride clears', () => {
    const { rerender } = render(<ScenarioOverrideBanner activeOverride={{ departmentKey: 'CBSA-ASFC', updatedAt: null }} t={t} />);
    expect(screen.getByText(/CBSA-ASFC/)).toBeTruthy();

    rerender(<ScenarioOverrideBanner activeOverride={null} t={t} />);
    const region = screen.getByRole('status');
    expect(region.className).toContain('scenario-override-banner--empty');
    expect(region.textContent).toBe('');
  });
});
