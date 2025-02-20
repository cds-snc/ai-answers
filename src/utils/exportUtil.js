export const interactionsToSpreadsheet = async (interactions, type = 'excel') => {
  const items = interactions;
  const { headers, rows } = jsonToFlatTable(items);
  const filteredHeaders = headers.filter(
    (header) => !header.includes('_id') && !header.includes('__v')
  );
  const filteredRows = rows.map((row) =>
    filteredHeaders.map((header) => row[headers.indexOf(header)])
  );

  const uppercaseHeaders = filteredHeaders.map((header) =>
    header.toUpperCase().replace(/\./g, '_')
  );
  const worksheetData = [uppercaseHeaders, ...filteredRows];

  if (type === 'excel') {
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Bold the headings
    const headingRange = XLSX.utils.decode_range(worksheet['!ref']);
    for (let C = headingRange.s.c; C <= headingRange.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!worksheet[cellAddress]) continue;
      if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
      if (!worksheet[cellAddress].s.font) worksheet[cellAddress].s.font = {};
      worksheet[cellAddress].s.font.bold = true;
    }

    // Add filters
    worksheet['!autofilter'] = { ref: worksheet['!ref'] };

    // Adjust column widths
    const colWidths = worksheetData[0].map((_, colIndex) => ({
      wch: Math.max(
        ...worksheetData.map((row) => (row[colIndex] ? row[colIndex].toString().length : 10))
      ),
    }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Batch Data');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `batch_${batchId}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else if (type === 'csv') {
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Batch Data');

    const csvBuffer = XLSX.write(workbook, { bookType: 'csv', type: 'array' });
    const blob = new Blob([csvBuffer], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `batch_${batchId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
