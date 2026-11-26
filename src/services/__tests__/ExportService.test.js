import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ExportService from '../ExportService.js';

describe('ExportService spreadsheet helpers', () => {
  let originalDocument;
  let originalUrl;
  let createdBlobs;
  let clickedDownloads;

  beforeEach(() => {
    originalDocument = global.document;
    originalUrl = global.URL;
    createdBlobs = [];
    clickedDownloads = [];

    global.URL = {
      createObjectURL: vi.fn((blob) => {
        createdBlobs.push(blob);
        return 'blob:download-url';
      }),
    };

    global.document = {
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      createElement: vi.fn(() => ({
        style: {},
        setAttribute: vi.fn(),
        click: vi.fn(() => {
          clickedDownloads.push(true);
        }),
      })),
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.URL = originalUrl;
    vi.restoreAllMocks();
  });

  it('downloads CSV output without xlsx', async () => {
    ExportService.worksheetDataToCSV(
      [
        ['Name', 'Value'],
        ['Alpha, Inc.', 'He said "yes"'],
      ],
      'batch.csv'
    );

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedDownloads).toHaveLength(1);
    expect(global.document.createElement).toHaveBeenCalledWith('a');
    expect(createdBlobs).toHaveLength(1);
    await expect(createdBlobs[0].text()).resolves.toBe(
      'Name,Value\r\n"Alpha, Inc.","He said ""yes"""'
    );
  });

  it('prefixes formula-leading text in downloaded CSV files', async () => {
    ExportService.worksheetDataToCSV([['Question'], ['=1+1'], ['Plain text']], 'batch.csv');

    await expect(createdBlobs[0].text()).resolves.toBe("Question\r\n'=1+1\r\nPlain text");
  });

  it('downloads xlsx output through exceljs', async () => {
    await ExportService.worksheetDataToExcel(
      [
        ['Name', 'Value'],
        ['Alpha', 'Beta'],
      ],
      'batch.xlsx'
    );

    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedDownloads).toHaveLength(1);
    expect(global.document.createElement).toHaveBeenCalledWith('a');
    expect(createdBlobs).toHaveLength(1);
    expect(createdBlobs[0].size).toBeGreaterThan(0);
  });
});
