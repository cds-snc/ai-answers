/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import EvalPanel from '../EvalPanel.js';
import EvaluationService from '../../../../services/EvaluationService.js';

const TRANSLATIONS = {
  'reviewPanels.autoEvalTitle': 'Automated evaluation',
  'reviewPanels.autoEvalDeletedAnnouncement': 'Automated evaluation deleted.',
  'reviewPanels.deleteEvaluation': 'Delete evaluation',
  'reviewPanels.scoreSuffix': 'Score: {score}',
  'reviewPanels.fallbackDetails': 'Fallback details',
  'reviewPanels.fallbackCandidateAnswer': 'Fallback candidate answer',
  'common.confirmDelete': 'Are you sure?',
  'common.error': 'Error',
  'common.loading': 'Loading...',
  'common.deleting': 'Deleting...',
  'common.yes': 'yes',
  'common.no': 'no',
  'eval.eval': 'Evaluation',
  'eval.reRun': 'Re-run',
  'eval.reRunning': 'Re-running...',
  'eval.processed': 'Processed',
  'eval.hasMatches': 'Has matches',
  'eval.fallback': 'Fallback',
  'eval.createdAt': 'Created at',
  'eval.updatedAt': 'Updated at',
};
const mockT = (key) => TRANSLATIONS[key] || key;

vi.mock('../../../../services/EvaluationService.js', () => ({
  default: { getEvaluation: vi.fn(), deleteEvaluation: vi.fn(), reEvaluate: vi.fn() },
}));
vi.mock('@gcds-core/components-react', () => ({
  GcdsButton: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
  GcdsIcon: ({ name }) => <span aria-hidden="true" data-icon={name} />,
}));

const baseAutoEval = {
  processed: true,
  hasMatches: true,
  fallbackType: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const buildMessage = (autoEval) => ({
  id: 'msg-1',
  interaction: { _id: 'interaction-1', autoEval },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EvalPanel', () => {
  it('renders nothing when the message has no auto-eval', () => {
    const { container } = render(
      <EvalPanel message={buildMessage(null)} t={mockT} lang="en" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the evaluation summary as dt/dd label:value pairs', () => {
    render(<EvalPanel message={buildMessage(baseAutoEval)} t={mockT} lang="en" />);
    const label = screen.getByText('Processed');
    expect(label.tagName).toBe('DT');
    expect(screen.getAllByText('yes')[0].tagName).toBe('DD');
  });

  // The audit's alternative fix (bold labels, not headings) is what shipped,
  // not the h4 promotion - every other disclosure in this file (Stage
  // timeline, Sentence match trace, Similarity scores, Agent candidate
  // choices) has zero internal headings, relying entirely on its own
  // <summary> for orientation; making "Fallback details" the one exception
  // would be arbitrary, and its sub-labels are only ever reachable after
  // that summary is already open anyway (a closed <details> hides its
  // content from the accessibility tree), so there's no "skip past the
  // parent" scenario a heading would actually solve here.
  it('renders the fallback-details sub-sections as dt/dd pairs, not headings', () => {
    const evalWithFallback = {
      ...baseAutoEval,
      fallbackCandidateAnswerText: 'A candidate answer.',
    };
    render(<EvalPanel message={buildMessage(evalWithFallback)} t={mockT} lang="en" />);
    fireEvent.click(screen.getByText('Fallback details'));
    expect(screen.queryAllByRole('heading', { level: 4 }).length).toBe(0);
    expect(screen.queryAllByRole('heading', { level: 5 }).length).toBe(0);
    const label = screen.getByText('Fallback candidate answer');
    expect(label.tagName).toBe('DT');
    expect(screen.getByText('A candidate answer.').tagName).toBe('DD');
  });

  it('shows a StatusMessage error box (not a bare unstyled div) on a failed re-run', async () => {
    EvaluationService.reEvaluate.mockRejectedValueOnce(new Error('boom'));
    render(<EvalPanel message={buildMessage(baseAutoEval)} t={mockT} lang="en" />);
    fireEvent.click(screen.getByRole('button', { name: /Re-run/i }));
    await waitFor(() => {
      expect(screen.queryByText(/boom/)).not.toBeNull();
    });
    expect(screen.getByText(/boom/).closest('.status-message--error-box')).not.toBeNull();
  });

  it('moves focus to an sr-only heading, not <body>, after a successful delete', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    EvaluationService.deleteEvaluation.mockResolvedValueOnce({});
    const message = buildMessage(baseAutoEval);
    render(<EvalPanel message={message} t={mockT} lang="en" />);

    fireEvent.click(screen.getByRole('button', { name: /Delete evaluation/i }));

    await waitFor(() => {
      expect(document.activeElement.tagName).toBe('H4');
    });
    expect(document.activeElement.textContent).toBe('Automated evaluation deleted.');
    expect(document.activeElement).not.toBe(document.body);
  });
});
