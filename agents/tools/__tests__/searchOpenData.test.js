import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
import axios from 'axios';

import searchOpenDataTool from '../searchOpenData.js';

const baseDataset = {
  id: 'abc-123',
  name: 'abc-123',
  title: 'Air Quality Index',
  title_translated: { en: 'Air Quality Index', fr: 'Indice de la qualité de l\'air' },
  notes: 'Hourly air quality readings.',
  notes_translated: { en: 'Hourly air quality readings.', fr: 'Lectures horaires de la qualité de l\'air.' },
  organization: { title: 'Environment and Climate Change Canada' },
  resources: [
    { format: 'CSV' },
    { format: 'CSV' },
    { format: 'JSON' },
  ],
  metadata_modified: '2026-04-15T10:00:00.000Z',
};

const invokeTool = (input) => searchOpenDataTool.invoke(input);

describe('searchOpenData tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('formats a single result with bilingual title and EN/FR URLs', async () => {
    axios.get.mockResolvedValueOnce({ data: { result: { results: [baseDataset] } } });

    const output = await invokeTool({ query: 'air quality' });

    expect(output).toContain('**Air Quality Index** / Indice de la qualité de l\'air');
    expect(output).toContain('Organization: Environment and Climate Change Canada');
    expect(output).toContain('Description: Hourly air quality readings.');
    expect(output).toContain('Formats: CSV, JSON');
    expect(output).toContain('Last updated: 2026-04-15');
    expect(output).toContain('EN: https://open.canada.ca/data/en/dataset/abc-123');
    expect(output).toContain('FR: https://open.canada.ca/data/fr/dataset/abc-123');
  });

  it('uses French description when lang=fr', async () => {
    axios.get.mockResolvedValueOnce({ data: { result: { results: [baseDataset] } } });

    const output = await invokeTool({ query: 'qualité de l\'air', lang: 'fr' });

    expect(output).toContain('Description: Lectures horaires de la qualité de l\'air.');
  });

  it('falls back to id when name is missing', async () => {
    axios.get.mockResolvedValueOnce({
      data: { result: { results: [{ ...baseDataset, name: undefined }] } },
    });

    const output = await invokeTool({ query: 'air quality' });

    expect(output).toContain('EN: https://open.canada.ca/data/en/dataset/abc-123');
  });

  it('joins multiple results with --- separator', async () => {
    const second = {
      ...baseDataset,
      id: 'def-456',
      name: 'def-456',
      title: 'Water Quality',
      title_translated: { en: 'Water Quality', fr: 'Qualité de l\'eau' },
    };
    axios.get.mockResolvedValueOnce({ data: { result: { results: [baseDataset, second] } } });

    const output = await invokeTool({ query: 'quality' });

    expect(output.split('\n---\n')).toHaveLength(2);
    expect(output).toContain('Water Quality');
  });

  it('truncates descriptions over 300 characters', async () => {
    const longNotes = 'x'.repeat(500);
    axios.get.mockResolvedValueOnce({
      data: { result: { results: [{ ...baseDataset, notes_translated: { en: longNotes } }] } },
    });

    const output = await invokeTool({ query: 'long' });

    expect(output).toContain('x'.repeat(300) + '…');
    expect(output).not.toContain('x'.repeat(301) + '…');
  });

  it('returns "no datasets found" message when results empty', async () => {
    axios.get.mockResolvedValueOnce({ data: { result: { results: [] } } });

    const output = await invokeTool({ query: 'nonexistent' });

    expect(output).toContain('No datasets found');
    expect(output).toContain('nonexistent');
  });

  it('returns a graceful error message on API failure', async () => {
    axios.get.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const output = await invokeTool({ query: 'anything' });

    expect(output).toContain('Open data portal search failed');
    expect(output).toContain('https://search.open.canada.ca/opendata/');
    expect(output).toContain('https://rechercher.ouvert.canada.ca/donneesouvertes/');
  });

  it('clamps rows parameter to the maximum of 20', async () => {
    axios.get.mockResolvedValueOnce({ data: { result: { results: [] } } });

    await invokeTool({ query: 'a', rows: 500 });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/package_search'),
      expect.objectContaining({ params: expect.objectContaining({ rows: 20 }) }),
    );
  });

  it('uses default rows when not specified', async () => {
    axios.get.mockResolvedValueOnce({ data: { result: { results: [] } } });

    await invokeTool({ query: 'a' });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/package_search'),
      expect.objectContaining({ params: expect.objectContaining({ rows: 5 }) }),
    );
  });

  it('handles datasets with no resources gracefully', async () => {
    axios.get.mockResolvedValueOnce({
      data: { result: { results: [{ ...baseDataset, resources: undefined }] } },
    });

    const output = await invokeTool({ query: 'a' });

    expect(output).toContain('Formats: N/A');
  });
});
