/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EvalPage from '../EvalPage.js';
import { waitForAnnouncement } from '../../../test/liveAnnouncer.js';

const templates = {
  'eval.allEvalsGenerated': 'Generated {processed} ok {failed} failed',
  'eval.deleteEvalsSuccess': 'Deleted {deleted} and {expertFeedbackDeleted}',
  'eval.generateEvalsFailed': 'Generate failed: {error}',
  'admin.common.fetchError': 'Load failed: {error}',
};
const mockT = (key) => templates[key] ?? key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { svc } = vi.hoisted(() => ({
  svc: {
    getExpertFeedbackCount: vi.fn(),
    getEvalNonEmptyCount: vi.fn(),
    getEvalMetrics: vi.fn(),
    generateEvals: vi.fn(),
    deleteEvals: vi.fn(),
  },
}));
vi.mock('../../services/EvaluationService.js', () => ({ default: svc }));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsDetails: ({ children }) => <div>{children}</div>,
  GcdsFieldset: ({ children, legend }) => <fieldset><legend>{legend}</legend>{children}</fieldset>,
  GcdsIcon: ({ name }) => <span data-icon={name} />,
}));

const metrics = { total: 10, processed: 9, hasMatches: 4, noMatchByReason: { no_qa_match: 5 }, fallbackByType: {} };

describe('EvalPage', () => {
  beforeEach(() => {
    svc.getExpertFeedbackCount.mockResolvedValue(3);
    svc.getEvalNonEmptyCount.mockResolvedValue(4);
    svc.getEvalMetrics.mockResolvedValue(metrics);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.values(svc).forEach(fn => fn.mockReset());
  });

  it('shows counts and metrics as label/value lists', async () => {
    render(<EvalPage lang="en" />);
    await waitFor(() => expect(screen.getByText('admin.evalPage.label.expertEvaluations')).toBeTruthy());
    expect(screen.getByText('admin.evalPage.label.expertEvaluations').closest('dl')).toBeTruthy();
    expect(screen.getByText('eval.noMatchReasonTypes.no_qa_match')).toBeTruthy();
    expect(document.querySelector('table')).toBeNull();
  });

  it('keeps generating until nothing is left and reports the totals of every batch', async () => {
    svc.generateEvals
      .mockResolvedValueOnce({ remaining: 5, processed: 2, failed: 1, lastProcessedId: 'a' })
      .mockResolvedValueOnce({ remaining: 0, processed: 3, failed: 0, lastProcessedId: 'b' });

    render(<EvalPage lang="en" />);
    fireEvent.click(screen.getByText('admin.evalPage.button.generate'));

    await waitForAnnouncement('Generated 5 ok 1 failed', 'polite');
    expect(svc.generateEvals).toHaveBeenCalledTimes(2);
    expect(svc.generateEvals.mock.calls[1][0].lastProcessedId).toBe('a');
    expect(window.alert).not.toHaveBeenCalled();
    // Initial load + reload after the run.
    await waitFor(() => expect(svc.getEvalMetrics).toHaveBeenCalledTimes(2));
  });

  it('shows a generate failure on the page with its detail', async () => {
    svc.generateEvals.mockRejectedValue(new Error('server down'));

    render(<EvalPage lang="en" />);
    fireEvent.click(screen.getByText('admin.evalPage.button.generate'));

    await waitForAnnouncement('Generate failed: server down', 'assertive');
    expect(document.querySelector('.status-message--error-box')).toBeTruthy();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('confirms a delete, reports the result and reloads the metrics', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    svc.deleteEvals.mockResolvedValue({ deleted: 7, expertFeedbackDeleted: 2 });

    render(<EvalPage lang="en" />);
    await waitFor(() => expect(svc.getEvalMetrics).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('admin.evalPage.button.deleteAll'));

    await waitForAnnouncement('Deleted 7 and 2', 'polite');
    expect(window.confirm).toHaveBeenCalledWith('eval.deleteEvalsConfirm');
    expect(window.alert).not.toHaveBeenCalled();
    await waitFor(() => expect(svc.getEvalMetrics).toHaveBeenCalledTimes(2));
  });

  it('says so when there is nothing to delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    svc.deleteEvals.mockResolvedValue({ deleted: 0, expertFeedbackDeleted: 0 });

    render(<EvalPage lang="en" />);
    fireEvent.click(screen.getByText('admin.evalPage.button.deleteEmpty'));

    await waitForAnnouncement('eval.deleteEmptyEvalsNone', 'polite');
    expect(document.querySelector('.status-message--info-box')).toBeTruthy();
  });

  it('does nothing when the delete is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<EvalPage lang="en" />);
    fireEvent.click(screen.getByText('admin.evalPage.button.deleteEmpty'));

    expect(svc.deleteEvals).not.toHaveBeenCalled();
  });

  it('announces a successful refresh', async () => {
    render(<EvalPage lang="en" />);
    await waitFor(() => expect(svc.getEvalMetrics).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('admin.evalPage.metrics.refresh'));

    await waitForAnnouncement('admin.evalPage.metrics.refreshed', 'polite');
  });

  it('shows a refresh failure instead of zeros', async () => {
    render(<EvalPage lang="en" />);
    await waitFor(() => expect(svc.getEvalMetrics).toHaveBeenCalledTimes(1));
    svc.getEvalMetrics.mockRejectedValue(new Error('timeout'));
    fireEvent.click(screen.getByText('admin.evalPage.metrics.refresh'));

    await waitForAnnouncement('Load failed: timeout', 'assertive');
  });
});
