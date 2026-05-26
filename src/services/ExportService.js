import ExcelJS from 'exceljs';
import { flatten } from 'flat';
import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from './AuthService.js';
import { serializeCsvRows } from '../utils/spreadsheets/csv.js';

function columnNumberToLetter(columnNumber) {
  let remainder = columnNumber;
  let letters = '';
  while (remainder > 0) {
    const current = (remainder - 1) % 26;
    letters = String.fromCharCode(65 + current) + letters;
    remainder = Math.floor((remainder - current - 1) / 26);
  }
  return letters || 'A';
}

class ExportService {
  static async exportChatLogs(format = 'json', filters = {}) {
    try {
      const queryParams = new URLSearchParams({
        ...filters,
        format
      }).toString();

      const response = await AuthService.fetch(getApiUrl(`db-chat-logs/export?${queryParams}`));

      if (!response.ok) throw new Error('Failed to export chat logs');

      const blob = await response.blob();
      const filename = `chat-logs-${new Date().toISOString()}.${format}`;

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting chat logs:', error);
      throw error;
    }
  }



  static jsonToFlatTable(data, headers) {
    // Ensure data is an array and not null/undefined
    if (!Array.isArray(data) || data.length === 0) {
      console.error('jsonToFlatTable: Received invalid or empty data', data);
      return { headers: [], rows: [] };
    }

    // Step 1: Filter out null/undefined objects before flattening
    const validItems = data.filter((item) => item && typeof item === 'object');

    if (validItems.length === 0) {
      console.error('jsonToFlatTable: No valid objects to process');
      return { headers: [], rows: [] };
    }

    // Step 2: Flatten each object safely
    const flattenedItems = validItems.map((obj) => flatten(obj));

    // Step 3: Create rows, ensuring consistent header order
    const rows = flattenedItems.map((item) => headers.map((header) => item[header] ?? ''));

    return rows;
  }

  static getHeaders(data) {
    if (!Array.isArray(data) || data.length === 0) {
      console.error('getHeaders: Received invalid or empty data', data);
      return [];
    }

    const validItems = data.filter((item) => item && typeof item === 'object');

    if (validItems.length === 0) {
      console.error('getHeaders: No valid objects to process');
      return [];
    }

    const flattenedItems = validItems.map((obj) => flatten(obj));
    return [...new Set(flattenedItems.flatMap(Object.keys))];
  }

  static worksheetDataToCSV(worksheetData, filename) {
    const csvText = serializeCsvRows(worksheetData);
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  }

  static async worksheetDataToExcel(worksheetData, filename) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Batch Data');

    worksheet.addRows(worksheetData);

    if (worksheet.rowCount > 0) {
      worksheet.getRow(1).font = { bold: true };
      worksheet.autoFilter = `A1:${columnNumberToLetter(Math.max(worksheet.columnCount, 1))}1`;
    }

    if (worksheetData.length > 0) {
      worksheetData[0].forEach((_, index) => {
        const maxLength = worksheetData.reduce((max, row) => {
          const value = row?.[index];
          const text = value === null || value === undefined ? '' : String(value);
          return Math.max(max, text.length);
        }, 10);
        worksheet.getColumn(index + 1).width = Math.min(maxLength + 2, 60);
      });
    }

    const excelBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  }

  static async toSpreadsheet(chats, headerOrder, type = 'excel', filename) {
    const worksheetData = [];
    const headersSet = new Set(
      chats.flatMap((chat) => ExportService.getHeaders(chat.interactions))
    );
    // headersSet.forEach(h => { if (h.includes('confidenceRating')) headersSet.delete(h); });
    let headers = ['uniqueID', ...Array.from(headersSet)];
    // Move any header containing 'autoEval' to the second to last, and 'answer.tools' to the last
    const answerToolsHeaders = headers.filter(h => h.includes('answer.tools'));
    const autoEvalHeaders = headers.filter(h => h.includes('autoEval'));
    const contextToolHeaders = headers.filter(h => h.includes('context.tools'));
    const otherHeaders = headers.filter(h => !h.includes('autoEval') && !h.includes('answer.tools') && !h.includes('context.tools'));
    headers = [...otherHeaders, ...autoEvalHeaders, ...contextToolHeaders, ...answerToolsHeaders];

    for (const chat of chats) {
      const interactions = chat.interactions.map((interaction) => ({
        ...interaction,
        uniqueID: chat.chatId
          ? `${chat.chatId}${interaction.interactionId}`
          : `${chat.batchId || 'batch'}_${interaction.interactionId}`,
      }));
      const items = interactions;
      const rows = ExportService.jsonToFlatTable(items, headers);
      const filteredHeaders = headers.filter(
        (header) => !header.includes('_id') && !header.includes('__v')
      );
      const filteredRows = rows.map((row) =>
        filteredHeaders.map((header) => row[headers.indexOf(header)])
      );

      // Make sure we include the referringUrl from both the chat level and interaction level
      const globalInfo = [chat.chatId, chat.pageLanguage, chat.aiProvider, chat.searchProvider, chat.user?.email || ''];
      const globalInfoHeaders = ['chatId', 'pageLanguage', 'aiService', 'searchService', 'user.email'];

      const rowsWithGlobalInfo = filteredRows.map((row) => globalInfo.concat(row));

      // Update headers to include chatInfoHeaders
      const updatedHeaders = globalInfoHeaders.concat(filteredHeaders);

      // Update orderedHeaders and orderedRows to include chatInfo
      const orderedHeaders = headerOrder
        .map((headerObj) => headerObj.dataLabel)
        .concat(
          updatedHeaders.filter(
            (header) => !headerOrder.some((headerObj) => headerObj.dataLabel === header)
          )
        );

      const orderedRows = rowsWithGlobalInfo.map((row) =>
        orderedHeaders.map((header) => row[updatedHeaders.indexOf(header)])
      );

      const finalHeaders = orderedHeaders.map((header) => {
        const headerObj = headerOrder.find((headerObj) => headerObj.dataLabel === header);
        return headerObj ? headerObj.outputLabel : header;
      });

      if (worksheetData.length === 0) {
        worksheetData.push(finalHeaders);
      }
      worksheetData.push(...orderedRows);
    }

    if (type === 'xlsx') {
      await ExportService.worksheetDataToExcel(worksheetData, filename);
    } else if (type === 'csv') {
      ExportService.worksheetDataToCSV(worksheetData, filename);
    }
  }

  static export(items, filename) {
    const headerOrder = [
      { dataLabel: 'uniqueID', outputLabel: 'uniqueID' },
      { dataLabel: 'chatId', outputLabel: 'chatId' },
      { dataLabel: 'user.email', outputLabel: 'userEmail' }, // <-- Add user email as 3rd column
      { dataLabel: 'createdAt', outputLabel: 'createdAt' },
      { dataLabel: 'pageLanguage', outputLabel: 'pageLanguage' },
      { dataLabel: 'referringUrl', outputLabel: 'referringUrl' },
      { dataLabel: 'question.language', outputLabel: 'questionLanguage' },
      { dataLabel: 'question.redactedQuestion', outputLabel: 'redactedQuestion' },
      { dataLabel: 'aiService', outputLabel: 'aiService' },
      { dataLabel: 'searchService', outputLabel: 'searchService' },
      { dataLabel: 'answer.citation.providedCitationUrl', outputLabel: 'citationUrl' },
      { dataLabel: 'answer.englishAnswer', outputLabel: 'englishAnswer' },
      { dataLabel: 'answer.content', outputLabel: 'answer' },
      { dataLabel: 'answer.sentences.0', outputLabel: 'sentence1' },
      { dataLabel: 'answer.sentences.1', outputLabel: 'sentence2' },
      { dataLabel: 'answer.sentences.2', outputLabel: 'sentence3' },
      { dataLabel: 'answer.sentences.3', outputLabel: 'sentence4' },
      { dataLabel: 'expertFeedback.feedback', outputLabel: 'feedback' },
      { dataLabel: 'expertFeedback.totalScore', outputLabel: 'expertFeedback.totalScore' },
      { dataLabel: 'expertFeedback.sentence1Score', outputLabel: 'expertFeedback.sentence1Score' },
      {
        dataLabel: 'expertFeedback.sentence1Explanation',
        outputLabel: 'expertFeedback.sentence1Explanation',
      },
      {
        dataLabel: 'expertFeedback.sentence1Harmful',
        outputLabel: 'expertFeedback.sentence1Harmful',
      },
      { dataLabel: 'expertFeedback.sentence2Score', outputLabel: 'expertFeedback.sentence2Score' },
      {
        dataLabel: 'expertFeedback.sentence2Explanation',
        outputLabel: 'expertFeedback.sentence2Explanation',
      },
      {
        dataLabel: 'expertFeedback.sentence2Harmful',
        outputLabel: 'expertFeedback.sentence2Harmful',
      },
      { dataLabel: 'expertFeedback.sentence3Score', outputLabel: 'expertFeedback.sentence3Score' },
      {
        dataLabel: 'expertFeedback.sentence3Explanation',
        outputLabel: 'expertFeedback.sentence3Explanation',
      },
      {
        dataLabel: 'expertFeedback.sentence3Harmful',
        outputLabel: 'expertFeedback.sentence3Harmful',
      },
      { dataLabel: 'expertFeedback.sentence4Score', outputLabel: 'expertFeedback.sentence4Score' },
      {
        dataLabel: 'expertFeedback.sentence4Explanation',
        outputLabel: 'expertFeedback.sentence4Explanation',
      },
      {
        dataLabel: 'expertFeedback.sentence4Harmful',
        outputLabel: 'expertFeedback.sentence4Harmful',
      },
      { dataLabel: 'expertFeedback.citationScore', outputLabel: 'expertFeedback.citationScore' },
      {
        dataLabel: 'expertFeedback.citationExplanation',
        outputLabel: 'expertFeedback.citationExplanation',
      },
      {
        dataLabel: 'expertFeedback.answerImprovement',
        outputLabel: 'expertFeedback.answerImprovement',
      },
      {
        dataLabel: 'expertFeedback.expertCitationUrl',
        outputLabel: 'expertFeedback.expertCitationUrl',
      },
      { dataLabel: 'publicFeedback.feedback', outputLabel: 'publicFeedback.feedback' },
      { dataLabel: 'publicFeedback.publicFeedbackReason', outputLabel: 'publicFeedback.publicFeedbackReason' },
      { dataLabel: 'publicFeedback.publicFeedbackScore', outputLabel: 'publicFeedback.publicFeedbackScore' }
    ];
    const type = filename.endsWith('.csv') ? 'csv' : filename.endsWith('.xlsx') ? 'xlsx' : 'xlsx';
    return ExportService.toSpreadsheet(items, headerOrder, type, filename);
  }
}

export default ExportService;
