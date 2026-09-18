/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import EvalPage from '../EvalPage.js';

const mockT = (key) => key;
vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

vi.mock('../../hooks/usePageParam.js', () => ({
  usePageContext: () => ({ language: 'en' }),
}));

vi.mock('../../services/EvaluationService.js', () => ({
  default: {
    getExpertFeedbackCount: vi.fn().mockResolvedValue(3),
    getEvalNonEmptyCount: vi.fn().mockResolvedValue(2),
    getEvalMetrics: vi.fn().mockResolvedValue({
      total: 10,
      processed: 8,
      hasMatches: 5,
      noMatchByReason: { no_similar: 2 },
      fallbackByType: { citation: 1 },
    }),
  },
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsText: ({ children }) => <p>{children}</p>,
  GcdsButton: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  GcdsDetails: ({ children }) => <details>{children}</details>,
  GcdsLink: ({ children, href }) => <a href={href}>{children}</a>,
}));

describe('EvalPage metrics tables', () => {
  afterEach(() => cleanup());

  it('names each metrics table after its adjacent heading', async () => {
    render(<EvalPage lang="en" />);

    for (const key of [
      'admin.evalPage.metrics.title',
      'admin.evalPage.metrics.noMatchReasons',
      'admin.evalPage.metrics.fallbackTypes',
    ]) {
      const table = await screen.findByRole('table', { name: key });
      expect(table.querySelector('caption').classList.contains('sr-only')).toBe(true);
    }
  });
});
