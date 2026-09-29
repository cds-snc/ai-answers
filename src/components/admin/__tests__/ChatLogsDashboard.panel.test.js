/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import 'daterangepicker';
import ChatLogsDashboard from '../ChatLogsDashboard.js';

// Real FilterPanel and real translations here (see FilterPanel.test.js on
// why the translation mock can't apply from this directory anyway), so
// lookups anchor on ids and class names, not display copy.
vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, id }) => <button id={id} onClick={onClick}>{children}</button>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('../../../services/AuthService.js', () => ({ default: { fetch: mockFetch } }));

const okResponse = () => ({
  ok: true,
  headers: { get: () => null },
  blob: async () => new Blob(['x']),
});

describe('ChatLogsDashboard with the real FilterPanel', () => {
  beforeEach(() => {
    window.moment = undefined;
    globalThis.moment = undefined;
  });

  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    vi.restoreAllMocks();
    document.querySelectorAll('.daterangepicker').forEach((el) => el.remove());
  });

  const openPanel = async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chat-logs');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const utils = render(<ChatLogsDashboard lang="en" />);
    fireEvent.click(utils.container.querySelector('#get-logs-button'));
    await waitFor(() => {
      if (!utils.container.querySelector('#dateRangePicker')) throw new Error('panel not rendered yet');
    });
    return utils;
  };

  it('moves focus onto the panel summary after Get logs', async () => {
    const { container } = await openPanel();
    expect(document.activeElement).toBe(container.querySelector('.filter-panel-summary'));
  });

  it('renders the export options inside the panel, before the action buttons', async () => {
    const { container } = await openPanel();
    const content = container.querySelector('.filter-panel-content');
    const fieldset = content.querySelector('fieldset.export-controls');
    const actions = content.querySelector('.filter-actions');
    expect(fieldset.querySelector('legend').classList.contains('sr-only')).toBe(true);
    expect(fieldset.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sends the panel's date range with view and format", async () => {
    mockFetch.mockResolvedValue(okResponse());
    const { container } = await openPanel();
    fireEvent.change(container.querySelector('#export-view'), { target: { value: 'tools' } });
    fireEvent.click(container.querySelector('#filter-apply-button'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const q = new URL(mockFetch.mock.calls[0][0], 'http://localhost').searchParams;
    expect(q.get('startDate')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(q.get('endDate')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(q.get('view')).toBe('tools');
    expect(q.get('format')).toBe('xlsx');
  });

  it('keeps Clear all inert while an export is in flight', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { container } = await openPanel();
    const format = container.querySelector('#export-format');
    fireEvent.change(format, { target: { value: 'json' } });
    fireEvent.click(container.querySelector('#filter-apply-button'));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const clear = container.querySelector('.filter-button-secondary');
    expect(clear.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(clear);
    expect(format.value).toBe('json');
  });
});
