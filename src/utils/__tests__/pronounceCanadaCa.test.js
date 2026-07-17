/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { canadaCaAriaLabel, CanadaCaAccessibleLabel } from '../pronounceCanadaCa.js';

afterEach(() => {
  cleanup();
});

describe('canadaCaAriaLabel', () => {
  describe('bare prose mentions', () => {
    it('substitutes a single bare "Canada.ca" mention (en)', () => {
      expect(canadaCaAriaLabel('Learn more on Canada.ca today', 'en')).toBe(
        'Learn more on Canada dot CA today'
      );
    });

    it('substitutes a single bare "Canada.ca" mention (fr)', () => {
      expect(canadaCaAriaLabel('En savoir plus sur Canada.ca', 'fr')).toBe(
        'En savoir plus sur Canada point CA'
      );
    });

    it('substitutes every occurrence in the same string', () => {
      expect(
        canadaCaAriaLabel('Canada.ca is helpful. Canada.ca has answers.', 'en')
      ).toBe('Canada dot CA is helpful. Canada dot CA has answers.');
    });

    it('defaults to English when lang is omitted', () => {
      expect(canadaCaAriaLabel('Learn more on Canada.ca today')).toBe(
        'Learn more on Canada dot CA today'
      );
    });

    it('is case-sensitive — lowercase "canada.ca" is not touched', () => {
      expect(canadaCaAriaLabel('Learn more on canada.ca today', 'en')).toBe(null);
    });
  });

  describe('URL exclusions', () => {
    it('does not substitute "www.Canada.ca"', () => {
      expect(canadaCaAriaLabel('Visit www.Canada.ca for more', 'en')).toBe(
        'Visit www.Canada.ca for more'
      );
    });

    it('does not substitute "://Canada.ca"', () => {
      expect(canadaCaAriaLabel('See https://Canada.ca for details', 'en')).toBe(
        'See https://Canada.ca for details'
      );
    });

    it('does not substitute "Canada.ca/" followed by a path', () => {
      expect(canadaCaAriaLabel('Read more at Canada.ca/en/services', 'en')).toBe(
        'Read more at Canada.ca/en/services'
      );
    });

    it('still substitutes a bare mention alongside an excluded URL in the same string', () => {
      expect(
        canadaCaAriaLabel('Canada.ca links to www.Canada.ca for details', 'en')
      ).toBe('Canada dot CA links to www.Canada.ca for details');
    });
  });

  describe('no-op cases', () => {
    it('returns null when the string has no "Canada.ca" mention', () => {
      expect(canadaCaAriaLabel('Ask a follow-up question', 'en')).toBe(null);
    });

    it('returns null for non-string input', () => {
      expect(canadaCaAriaLabel(undefined, 'en')).toBe(null);
      expect(canadaCaAriaLabel(null, 'en')).toBe(null);
      expect(canadaCaAriaLabel(42, 'en')).toBe(null);
    });

    it('returns null for an empty string', () => {
      expect(canadaCaAriaLabel('', 'en')).toBe(null);
    });
  });
});

describe('CanadaCaAccessibleLabel', () => {
  it('renders the default span with a computed aria-label and aria-hidden visible text when the text mentions Canada.ca', () => {
    render(<CanadaCaAccessibleLabel text="Ask a Canada.ca question" lang="en" />);
    const el = screen.getByText('Ask a Canada.ca question', { selector: '[aria-hidden="true"]' });
    expect(el).toBeTruthy();
    expect(el.parentElement.tagName).toBe('SPAN');
    expect(el.parentElement.getAttribute('aria-label')).toBe('Ask a Canada dot CA question');
  });

  it('renders plain text with no aria-label when there is no Canada.ca mention', () => {
    render(<CanadaCaAccessibleLabel text="Ask a follow-up question" lang="en" />);
    const el = screen.getByText('Ask a follow-up question');
    expect(el.getAttribute('aria-label')).toBe(null);
    expect(el.querySelector('[aria-hidden]')).toBe(null);
  });

  it('renders as the element given in the "as" prop', () => {
    render(<CanadaCaAccessibleLabel as="h2" text="Ask a Canada.ca question" lang="en" />);
    const heading = screen.getByRole('heading', { level: 2, hidden: true });
    expect(heading.getAttribute('aria-label')).toBe('Ask a Canada dot CA question');
  });

  it('forwards other props (e.g. href, className) to the rendered element', () => {
    render(
      <CanadaCaAccessibleLabel
        as="a"
        href="https://example.com"
        className="my-link"
        text="Canada.ca Terms and conditions"
        lang="en"
      />
    );
    const link = screen.getByRole('link', { hidden: true });
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.className).toBe('my-link');
    expect(link.getAttribute('aria-label')).toBe('Canada dot CA Terms and conditions');
  });

  it('the computed aria-label always wins over a caller-supplied aria-label prop', () => {
    render(
      <CanadaCaAccessibleLabel
        text="Ask a Canada.ca question"
        lang="en"
        aria-label="should not appear"
      />
    );
    const el = screen.getByText('Ask a Canada.ca question', { selector: '[aria-hidden="true"]' });
    expect(el.parentElement.getAttribute('aria-label')).toBe('Ask a Canada dot CA question');
  });

  it('uses the French phonetic phrase when lang="fr"', () => {
    render(<CanadaCaAccessibleLabel text="Posez une question sur Canada.ca" lang="fr" />);
    const el = screen.getByText('Posez une question sur Canada.ca', { selector: '[aria-hidden="true"]' });
    expect(el.parentElement.getAttribute('aria-label')).toBe(
      'Posez une question sur Canada point CA'
    );
  });
});
