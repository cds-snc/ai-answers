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

  const headers = rows[0].map((header) => String(header ?? '').trim().toUpperCase());
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
        entry[key] = String(row[index] ?? '').trim();
      });
      return entry;
    })
    .filter((entry) => entry.REDACTEDQUESTION);
}

export function escapeCsvValue(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serializeCsvRows(rows) {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}
