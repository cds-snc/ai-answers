/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import PartnerDashboard from '../PartnerDashboard.js';

const mockT = (key) => (key === 'partnerDashboard.evalInformedChats.subtitle' ? 'Up to {n}' : key);
vi.mock('../../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({ t: mockT }),
}));

const { mockUseDashboardMetrics } = vi.hoisted(() => ({ mockUseDashboardMetrics: vi.fn() }));
vi.mock('../../../hooks/admin/useDashboardMetrics.js', () => ({
  useDashboardMetrics: mockUseDashboardMetrics,
}));

vi.mock('../FilterPanel.js', () => ({ default: () => null }));
vi.mock('../dashboard/StatCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/DonutCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/HBarCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/StackedBarCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/DivergingBarCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/ReferralUrlsCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/CitationPagesCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/AnswerTypesCard.js', () => ({ default: () => null }));
vi.mock('../dashboard/ContentIssueChatsCard.js', () => ({
  default: ({ title, subtitle }) => <section data-title={title}>{subtitle}</section>,
}));
vi.mock('../dashboard/CollapsibleCard.js', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../dashboard/EvalAnalysisSection.js', () => ({ default: () => null }));
vi.mock('../dashboard/NoDataCard.js', () => ({ default: () => null }));

describe('PartnerDashboard eval-informed chats list', () => {
  afterEach(() => {
    cleanup();
    mockUseDashboardMetrics.mockReset();
  });

  it('says the list is capped at 20', () => {
    mockUseDashboardMetrics.mockReturnValue({
      metrics: {
        evalInformedChats: [
          { chatId: 'chat-1', interactionId: 'int-1', pageLanguage: 'en', createdAt: '2026-08-05T00:00:00Z' },
        ],
      },
      loading: false,
      error: null,
      fetchMetrics: vi.fn(),
    });

    const { container } = render(<PartnerDashboard lang="en" />);

    const list = container.querySelector('[data-title="partnerDashboard.evalInformedChats.title"]');
    expect(list.textContent).toBe('Up to 20');
  });
});
