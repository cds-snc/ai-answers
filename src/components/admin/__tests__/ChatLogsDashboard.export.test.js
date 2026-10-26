/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import ChatLogsDashboard from '../ChatLogsDashboard.js';
import { waitForAnnouncement } from '../../../../test/liveAnnouncer.js';

vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

// Stand-in for FilterPanel: a plain Apply button that hands back whatever
// filters the test staged, plus the children slot and the aria-disabled
// treatment the real panel applies while filterLoading. The real panel is
// exercised in ChatLogsDashboard.panel.test.js.
const { mockFetch, staged } = vi.hoisted(() => ({ mockFetch: vi.fn(), staged: { filters: {} } }));
vi.mock('../FilterPanel.js', () => ({
  default: ({ onApplyFilters, onClearFilters, applyButtonText, filterLoading = false, children }) => (
    <div>
      {children}
      <button id="filter-clear-button" aria-disabled={filterLoading || undefined} onClick={onClearFilters}>clear</button>
      <button id="filter-apply-button" aria-disabled={filterLoading || undefined} onClick={() => onApplyFilters(staged.filters)}>
        {applyButtonText}
      </button>
    </div>
  ),
}));

vi.mock('../../../services/AuthService.js', () => ({ default: { fetch: mockFetch } }));

const okResponse = () => ({
  ok: true,
  headers: { get: () => null },
  blob: async () => new Blob(['x']),
});

describe('ChatLogsDashboard export', () => {
  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    staged.filters = {};
    vi.restoreAllMocks();
  });

  const setup = () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chat-logs');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const utils = render(<ChatLogsDashboard lang="en" />);
    fireEvent.click(utils.getByText('admin.chatLogs.getLogs'));
    return utils;
  };

  it('keeps the Export button focusable while exporting, marks the panel busy, and announces success', async () => {
    let resolveFetch;
    mockFetch.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const { container } = setup();
    const button = container.querySelector('#filter-apply-button');
    button.focus();
    fireEvent.click(button);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button);

    resolveFetch(okResponse());
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBeNull());
    await waitForAnnouncement('admin.chatLogs.exportSuccess', 'assertive');
    expect(document.activeElement).toBe(button);
  });

  it('ignores a second Export press while one is in flight', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { container } = setup();
    const button = container.querySelector('#filter-apply-button');
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('resets the export options on Clear all', async () => {
    const { container } = setup();
    const format = container.querySelector('#export-format');
    fireEvent.change(format, { target: { value: 'csv' } });
    expect(format.value).toBe('csv');
    fireEvent.click(container.querySelector('#filter-clear-button'));
    expect(format.value).toBe('xlsx');
  });

  it('maps the applied filters, view and format onto the export request', async () => {
    mockFetch.mockResolvedValue(okResponse());
    staged.filters = {
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-09-18T23:59:59.999Z',
      department: 'ESDC',
      urlEn: 'https://www.canada.ca/en',
      urlFr: '',
      userType: 'public',
      answerType: 'all',
      partnerEval: 'correct',
      aiEval: 'all',
      evalLogic: 'or',
    };
    const { container } = setup();
    fireEvent.change(container.querySelector('#export-format'), { target: { value: 'csv' } });
    fireEvent.click(container.querySelector('#filter-apply-button'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const q = new URL(mockFetch.mock.calls[0][0], 'http://localhost').searchParams;
    expect(q.get('startDate')).toBe(staged.filters.startDate);
    expect(q.get('endDate')).toBe(staged.filters.endDate);
    expect(q.get('department')).toBe('ESDC');
    expect(q.get('urlEn')).toBe('https://www.canada.ca/en');
    expect(q.has('urlFr')).toBe(false);
    expect(q.get('userType')).toBe('public');
    expect(q.has('answerType')).toBe(false);
    expect(q.get('partnerEval')).toBe('correct');
    expect(q.has('aiEval')).toBe(false);
    expect(q.get('evalLogic')).toBe('or');
    expect(q.get('view')).toBe('default');
    expect(q.get('format')).toBe('csv');
  });
});
