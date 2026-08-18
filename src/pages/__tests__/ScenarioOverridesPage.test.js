/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScenarioOverridesPage from '../ScenarioOverridesPage.js';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockT = (key, fallback) => fallback || key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockListOverrides, mockSaveOverride } = vi.hoisted(() => ({
  mockListOverrides: vi.fn(),
  mockSaveOverride: vi.fn(),
}));

vi.mock('../../services/ScenarioOverrideService.js', () => ({
  default: {
    listOverrides: mockListOverrides,
    saveOverride: mockSaveOverride,
  },
}));

vi.mock('../../services/AuthService.js', () => ({
  default: { getUser: vi.fn(() => ({ email: 'test@example.com' })) },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('ScenarioOverridesPage per-row error wiring', () => {
  afterEach(() => {
    cleanup();
    mockListOverrides.mockReset();
    mockSaveOverride.mockReset();
  });

  it('gives the row error StatusMessage an id matching the textarea\'s aria-describedby', async () => {
    mockListOverrides.mockResolvedValue([
      { departmentKey: 'AAFC-AAC', defaultText: 'Default scenario text', overrideText: '', enabled: false },
    ]);
    mockSaveOverride.mockRejectedValue(new Error('save failed'));

    renderWithRouter(<ScenarioOverridesPage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('AAFC-AAC')).toBeTruthy();
    });

    // SUPPORTED_DEPARTMENTS renders a section per department regardless of
    // mock data, so scope to the AAFC-AAC section specifically.
    const section = screen.getByText('AAFC-AAC').closest('section');

    // Toggling "Use override" triggers an immediate save (no debounce), which
    // will reject via the mock above.
    const checkbox = within(section).getByRole('checkbox');
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockSaveOverride).toHaveBeenCalled();
    });

    const errorNode = await screen.findByRole('alert');
    expect(errorNode.id).toBe('override-error-AAFC-AAC');

    const textarea = screen.getByLabelText(/AAFC-AAC/);
    expect(textarea.getAttribute('aria-describedby')).toBe('override-error-AAFC-AAC');
  });

  it('leaves aria-describedby unset when there is no error', async () => {
    mockListOverrides.mockResolvedValue([
      { departmentKey: 'AAFC-AAC', defaultText: 'Default scenario text', overrideText: '', enabled: false },
    ]);

    renderWithRouter(<ScenarioOverridesPage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('AAFC-AAC')).toBeTruthy();
    });

    const textarea = screen.getByLabelText(/AAFC-AAC/);
    expect(textarea.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
