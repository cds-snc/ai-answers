/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce, ensureLiveAnnouncer, getAnnouncedText, getAnnouncedTexts } from '../liveAnnouncer.js';

describe('liveAnnouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ensureLiveAnnouncer creates one polite and one assertive region, once', () => {
    ensureLiveAnnouncer();
    ensureLiveAnnouncer();
    const status = document.querySelectorAll('[role="status"]');
    const alert = document.querySelectorAll('[role="alert"]');
    expect(status).toHaveLength(1);
    expect(alert).toHaveLength(1);
    expect(status[0].getAttribute('aria-live')).toBe('polite');
    expect(alert[0].getAttribute('aria-live')).toBe('assertive');
    // Only the added child is read, not the whole region again.
    expect(status[0].getAttribute('aria-atomic')).toBe('false');
    expect(status[0].className).toBe('sr-only');
  });

  it('holds announcements made right after the regions are created on page load', () => {
    ensureLiveAnnouncer();
    announce('No data found');
    vi.advanceTimersByTime(500);
    expect(getAnnouncedText()).toBe('');
    vi.advanceTimersByTime(1500);
    expect(getAnnouncedTexts()).toEqual(['No data found']);
  });

  it('appends into the pre-existing region as an addition, not a new live region', () => {
    ensureLiveAnnouncer();
    vi.advanceTimersByTime(2000);
    const region = document.querySelector('[role="status"]');
    announce('Saved');
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(region.children).toHaveLength(1);
    expect(getAnnouncedText('polite')).toBe('Saved');
  });

  it('speaks a normal announcement immediately', () => {
    announce('Saved');
    expect(getAnnouncedTexts()).toEqual(['Saved']);
  });

  it('routes assertive announcements to the alert region', () => {
    announce('Failed', { assertive: true });
    expect(getAnnouncedText('assertive')).toBe('Failed');
    expect(getAnnouncedText('polite')).toBe('');
  });

  it('spaces out announcements made in quick succession, keeping their order', () => {
    announce('No data found for the selected filters.');
    announce('Results loaded.');
    announce('Filters cleared.');
    expect(getAnnouncedTexts()).toEqual(['No data found for the selected filters.']);
    vi.advanceTimersByTime(400);
    expect(getAnnouncedTexts()).toEqual(['No data found for the selected filters.', 'Results loaded.']);
    vi.advanceTimersByTime(400);
    expect(getAnnouncedTexts()).toEqual(['No data found for the selected filters.', 'Results loaded.', 'Filters cleared.']);
  });

  it('speaks a skippable message only after its grace period', () => {
    announce('Loading', { skippable: true });
    vi.advanceTimersByTime(400);
    expect(getAnnouncedTexts()).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(getAnnouncedTexts()).toEqual(['Loading']);
  });

  it('drops an unspoken skippable message when something newer arrives (fast load)', () => {
    announce('Loading', { skippable: true });
    vi.advanceTimersByTime(200);
    announce('Results loaded.');
    expect(getAnnouncedTexts()).toEqual(['Results loaded.']);
    vi.advanceTimersByTime(2000);
    expect(getAnnouncedTexts()).toEqual(['Results loaded.']);
  });

  it('drops an unspoken skippable polite message when an assertive one arrives', () => {
    announce('Loading', { skippable: true });
    vi.advanceTimersByTime(200);
    announce('Results loaded.', { assertive: true });
    vi.advanceTimersByTime(2000);
    expect(getAnnouncedTexts('assertive')).toEqual(['Results loaded.']);
    expect(getAnnouncedTexts('polite')).toEqual([]);
  });

  it('keeps a skippable message that was already spoken (slow load)', () => {
    announce('Loading', { skippable: true });
    vi.advanceTimersByTime(500);
    announce('Results loaded.');
    vi.advanceTimersByTime(400);
    expect(getAnnouncedTexts()).toEqual(['Loading', 'Results loaded.']);
  });

  it('adds an identical repeat as its own new child', () => {
    announce('No chat found');
    announce('No chat found');
    vi.advanceTimersByTime(400);
    const region = document.querySelector('[role="status"]');
    expect(region.children).toHaveLength(2);
    expect(region.children[1]).not.toBe(region.children[0]);
  });

  it('ignores empty or whitespace-only text', () => {
    announce('');
    announce('   ');
    announce(null);
    vi.runAllTimers();
    expect(getAnnouncedText()).toBe('');
  });

  it('removes an announcement after a while, leaving newer ones', () => {
    announce('Saved');
    vi.advanceTimersByTime(5000);
    announce('Done');
    vi.advanceTimersByTime(5000);
    expect(getAnnouncedTexts()).toEqual(['Done']);
    vi.advanceTimersByTime(5000);
    expect(getAnnouncedTexts()).toEqual([]);
  });
});
