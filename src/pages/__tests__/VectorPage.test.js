/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VectorPage from '../VectorPage.js';

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockReinitialize } = vi.hoisted(() => ({ mockReinitialize: vi.fn() }));
vi.mock('../../services/VectorService.js', () => ({
  default: {
    reinitialize: mockReinitialize,
    getMetadataBackfillJob: vi.fn().mockResolvedValue({ job: null }),
    getStats: vi.fn(),
    getMetadataStatus: vi.fn(),
    lookupMetadata: vi.fn(),
  },
}));

vi.mock('../../services/DataStoreService.js', () => ({ default: {} }));
vi.mock('../../components/admin/SimilarChatsDashboard.js', () => ({ default: () => null }));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsDetails: ({ children }) => <details>{children}</details>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('VectorPage StatusMessage roles (reinitialize index)', () => {
  afterEach(() => {
    cleanup();
    mockReinitialize.mockReset();
    vi.restoreAllMocks();
  });

  it('announces a failed reinitialize as role="alert"', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockReinitialize.mockRejectedValue(new Error('index build failed'));

    renderWithRouter(<VectorPage lang="en" />);

    const button = await screen.findByText('vector.reinitializeIndex');
    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('index build failed');
  });

  it('shows no error state before any action', async () => {
    renderWithRouter(<VectorPage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('vector.reinitializeIndex')).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
