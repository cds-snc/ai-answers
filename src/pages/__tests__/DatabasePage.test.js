/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import DatabasePage from '../DatabasePage.js';

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockGetTableCounts, mockDropIndexes } = vi.hoisted(() => ({
  mockGetTableCounts: vi.fn(),
  mockDropIndexes: vi.fn(),
}));

vi.mock('../../services/DataStoreService.js', () => ({
  default: {
    getTableCounts: mockGetTableCounts,
    dropIndexes: mockDropIndexes,
  },
}));

vi.mock('../../services/AuthService.js', () => ({
  default: {
    fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ collections: [] }) }),
  },
}));

vi.mock('../../services/BatchService.js', () => ({ default: {} }));

vi.mock('streamsaver', () => ({
  default: { createWriteStream: vi.fn() },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsHeading: ({ children }) => <h2>{children}</h2>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

describe('DatabasePage StatusMessage roles', () => {
  afterEach(() => {
    cleanup();
    mockGetTableCounts.mockReset();
  });

  it('announces the initial table-counts load error as role="alert"', async () => {
    mockGetTableCounts.mockRejectedValue(new Error('counts unavailable'));

    render(<DatabasePage lang="en" />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('counts unavailable');
  });

  it('does not announce an error when counts load successfully', async () => {
    mockGetTableCounts.mockResolvedValue({ chats: 5 });

    render(<DatabasePage lang="en" />);

    await waitFor(() => {
      expect(screen.getByText('admin.database.tableRecordCounts')).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
