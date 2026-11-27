// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RejectedReferrersCard from '../RejectedReferrersCard.js';
import en from '../../../../locales/en.json';
import fr from '../../../../locales/fr.json';

const propsFor = (locale, lang) => {
  const s = locale.partnerDashboard.rejectedReferrers;
  return {
    title: s.title,
    subtitle: s.subtitle,
    triggerLabel: s.trigger,
    hostColLabel: s.colHost,
    countColLabel: s.colCount,
    noDataLabel: s.noData,
    lang,
  };
};

const data = [
  { host: 'evil.example', count: 12 },
  { host: 'google.com', count: 3 },
];

describe('RejectedReferrersCard', () => {
  it('is collapsed by default', () => {
    const { container } = render(<RejectedReferrersCard {...propsFor(en, 'en')} data={data} />);
    expect(container.querySelector('details').open).toBe(false);
  });

  it('renders hosts as plain text, never as links', () => {
    const { container } = render(<RejectedReferrersCard {...propsFor(en, 'en')} data={data} />);
    expect(screen.getByText('evil.example')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(container.querySelector('a, gcds-link')).toBeNull();
  });

  it.each([['en', en], ['fr', fr]])('shows its %s labels', (lang, locale) => {
    render(<RejectedReferrersCard {...propsFor(locale, lang)} data={data} />);
    const s = locale.partnerDashboard.rejectedReferrers;
    expect(screen.getByRole('heading', { name: s.title })).toBeTruthy();
    expect(screen.getByText(s.subtitle)).toBeTruthy();
    expect(screen.getByText(s.trigger)).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: s.colHost })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: s.colCount })).toBeTruthy();
  });

  it('shows the empty state when there are no hosts', () => {
    render(<RejectedReferrersCard {...propsFor(en, 'en')} data={[]} />);
    expect(screen.getByText(en.partnerDashboard.rejectedReferrers.noData)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
