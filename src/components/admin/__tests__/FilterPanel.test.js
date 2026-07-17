/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockData, mockJQueryFactory } = vi.hoisted(() => {
  const mockData = {
    remove: vi.fn(),
    setStartDate: vi.fn(),
    setEndDate: vi.fn()
  };

  const mockJQueryFactory = vi.fn(() => {
    const mockApi = {
      daterangepicker: vi.fn((config) => {
        if (typeof window !== 'undefined') {
          if (typeof window.moment !== 'function') {
            throw new Error('window.moment was not initialized before daterangepicker');
          }
          if (typeof window.moment.localeData !== 'function') {
            throw new Error('window.moment is not a Moment instance');
          }
        }
        mockApi.__config = config;
        return mockApi;
      }),
      data: vi.fn((key) => (key === 'daterangepicker' ? mockData : undefined)),
      on: vi.fn(() => mockApi),
      off: vi.fn(() => mockApi)
    };

    return mockApi;
  });

  return {
    mockData,
    mockJQueryFactory
  };
});

vi.mock('jquery', () => ({
  default: mockJQueryFactory
}));

vi.mock('daterangepicker', () => ({
  default: {}
}));

vi.mock('daterangepicker/daterangepicker.css', () => ({}));

vi.mock('../../hooks/useTranslations.js', () => ({
  useTranslations: () => ({
    t: (key, defaultValue) => defaultValue || key
  })
}));

import FilterPanel from '../FilterPanel.js';

describe('FilterPanel', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.moment = undefined;
    }
    if (typeof globalThis !== 'undefined') {
      globalThis.moment = undefined;
    }
  });

  afterEach(() => {
    cleanup();
    mockJQueryFactory.mockClear();
    mockData.remove.mockClear();
    mockData.setStartDate.mockClear();
    mockData.setEndDate.mockClear();
  });

  it('initializes the date range picker with a shared Moment instance', async () => {
    const onApplyFilters = vi.fn();
    const onClearFilters = vi.fn();

    render(
      <FilterPanel
        lang="en"
        onApplyFilters={onApplyFilters}
        onClearFilters={onClearFilters}
        isVisible={true}
      />
    );

    await waitFor(() => {
      expect(mockJQueryFactory).toHaveBeenCalled();
    });

    expect(window.moment).toBeTypeOf('function');
    expect(window.moment.localeData).toBeTypeOf('function');
  });

  it('recovers when window.moment was replaced with an incompatible object', async () => {
    const onApplyFilters = vi.fn();
    const onClearFilters = vi.fn();

    window.moment = () => ({});
    window.moment.localeData = undefined;

    render(
      <FilterPanel
        lang="en"
        onApplyFilters={onApplyFilters}
        onClearFilters={onClearFilters}
        isVisible={true}
      />
    );

    await waitFor(() => {
      expect(mockJQueryFactory).toHaveBeenCalled();
    });

    expect(window.moment).toBeTypeOf('function');
    expect(window.moment.localeData).toBeTypeOf('function');
  });
});
