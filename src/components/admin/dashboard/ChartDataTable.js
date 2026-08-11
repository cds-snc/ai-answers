import React from 'react';

// Real HTML data table mirroring what a Recharts SVG chart's hover-only
// tooltip shows, so keyboard/screen-reader users — who never trigger a mouse
// hover — get the same numbers sighted mouse users get (WCAG 1.1.1 · 2.1.1).
// TODO: currently rendered visible on purpose for review; switch to a
// visually-hidden (sr-only) table once confirmed correct, since the chart
// itself already shows this data graphically for sighted users.
// `columns` = translated header strings; `rows` = array of arrays of cell
// content, one row per data point, cells in the same order as `columns`.
const ChartDataTable = ({ caption, columns, rows }) => {
  if (!rows || rows.length === 0) return null;
  return (
    <table className="chart-data-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((col) => <th key={col} scope="col">{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => <td key={j}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default ChartDataTable;
