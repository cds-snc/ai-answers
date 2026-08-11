/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import SettingsAuditValue, { AUDIT_VALUE_PREVIEW_LENGTH } from '../SettingsAuditValue.js';

const renderValue = (value) => render(
  React.createElement(SettingsAuditValue, { value, emptyLabel: 'Not applicable' })
);

describe('SettingsAuditValue', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a short value as plain text', () => {
    const { container } = renderValue('available');

    expect(screen.getByText('available')).toBeTruthy();
    expect(container.querySelector('details')).toBeNull();
  });

  it('renders the empty label for a missing value', () => {
    renderValue(null);

    expect(screen.getByText('Not applicable')).toBeTruthy();
  });

  it('keeps an empty string distinct from a missing value', () => {
    const { container } = renderValue('');

    // '' is a real audited value — settings in EMPTY_ALLOWED_SETTINGS can be
    // cleared — so it must not be reported as "not applicable".
    expect(screen.queryByText('Not applicable')).toBeNull();
    expect(container.querySelector('.settings-audit-value')).toBeTruthy();
  });

  it('collapses a long value behind a disclosure showing a preview', () => {
    const longValue = 'w'.repeat(AUDIT_VALUE_PREVIEW_LENGTH + 40);
    const { container } = renderValue(longValue);

    const details = container.querySelector('details');
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);

    const summary = container.querySelector('summary');
    expect(summary.textContent).toBe(`${'w'.repeat(AUDIT_VALUE_PREVIEW_LENGTH)}…`);

    // The full value is present in the DOM, revealed by expanding.
    expect(screen.getByText(longValue)).toBeTruthy();
  });

  it('does not truncate a value sitting exactly at the preview length', () => {
    const { container } = renderValue('x'.repeat(AUDIT_VALUE_PREVIEW_LENGTH));

    expect(container.querySelector('details')).toBeNull();
  });
});
