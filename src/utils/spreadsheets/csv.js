const QUESTION_HEADERS = [
  'PROBLEM DETAILS',
  'PROBLEMDETAILS',
  'QUESTION',
  'REDACTEDQUESTION',
  'REDACTED QUESTION',
];

export function parseDelimitedText(text) {
  const input = String(text ?? '');
  if (!input.trim()) {
    return [];
  }

  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      cell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

export function parseBatchCsv(csvText) {
  const rows = parseDelimitedText(csvText);

  if (!rows.length) {
    const error = new Error('EMPTY_CSV');
    error.code = 'EMPTY_CSV';
    throw error;
  }

  const headers = rows[0].map((header) =>
    restoreSpreadsheetText(String(header ?? '').trim()).toUpperCase()
  );
  const problemDetailsIndex = headers.findIndex((header) => QUESTION_HEADERS.includes(header));

  if (problemDetailsIndex === -1) {
    const error = new Error('MISSING_QUESTION_COLUMN');
    error.code = 'MISSING_QUESTION_COLUMN';
    throw error;
  }

  return rows
    .slice(1)
    .map((row) => {
      const entry = {};
      headers.forEach((header, index) => {
        const key =
          header === 'PROBLEM DETAILS' ||
          header === 'PROBLEMDETAILS' ||
          header === 'REDACTED QUESTION' ||
          header === 'QUESTION'
            ? 'REDACTEDQUESTION'
            : header;
        entry[key] = restoreSpreadsheetText(String(row[index] ?? '').trim());
      });
      return entry;
    })
    .filter((entry) => entry.REDACTEDQUESTION);
}

// Spreadsheet apps treat a leading =, +, -, @, tab, carriage return, or line
// feed as a formula. A question typed in the browser uses a line feed, and
// some apps skip that character and then read the formula. One leading
// apostrophe stores the cell as text. Apps do not agree on whether that
// apostrophe is hidden, so CSV import drops one when a formula starter
// follows, including after more apostrophes.
// Text that already starts with that marker, such as '=hello, gets one more
// apostrophe. Import then drops only the added one and the original stays.
// Without the extra apostrophe, '=hello would come back as =hello, and a
// header such as '=DETAILS would no longer match the name it was stored under.
// Null bytes are removed first: fast-csv deletes every \0 while writing, so
// "\0=..." would otherwise become a formula after this check. Arrays and other
// objects are checked as the joined text the writer emits.
// A leading + or - is left alone only when the cell is a plain number, so
// those columns still sort and sum. Other text, such as a phone number, is
// still prefixed.
const NEEDS_SPREADSHEET_TEXT_PREFIX = /^'*[=+\-@\t\r\n]/;
const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const SPREADSHEET_TEXT_PREFIX = /^'(?='*[=+\-@\t\r\n])/;

export function neutralizeSpreadsheetFormula(value) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  const text = String(value).replace(/\0/g, '');
  if (PLAIN_NUMBER.test(text) || !NEEDS_SPREADSHEET_TEXT_PREFIX.test(text)) {
    return text === value ? value : text;
  }
  return `'${text}`;
}

export function restoreSpreadsheetText(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(SPREADSHEET_TEXT_PREFIX, '');
}

export function escapeCsvValue(value) {
  const text = String(neutralizeSpreadsheetFormula(value) ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serializeCsvRows(rows) {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}
