/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import OutageComponent from '../OutageComponent.js';

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => defaultValue || key,
  }),
}));

vi.mock('@gcds-core/components-react', () => ({
  GcdsContainer: ({ children }) => <div>{children}</div>,
  GcdsNotice: ({ children, noticeRole, noticeTitle, noticeTitleTag }) => (
    <section data-notice-role={noticeRole} data-notice-title={noticeTitle} data-notice-title-tag={noticeTitleTag}>
      {children}
    </section>
  ),
  GcdsText: ({ children }) => <div>{children}</div>,
}));

describe('OutageComponent', () => {
  it('renders a warning notice with the current GCDS prop contract', () => {
    render(<OutageComponent lang="en" />);

    const notice = screen.getByText('outage.message').closest('section');
    expect(notice).toBeTruthy();
    expect(notice?.getAttribute('data-notice-role')).toBe('warning');
    expect(notice?.getAttribute('data-notice-title')).toBe('outage.title');
    expect(notice?.getAttribute('data-notice-title-tag')).toBe('h2');
  });
});
