import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import ChartDataTable from './ChartDataTable.js';

// Slim expand/collapse revealing a chart's data as a real HTML table — the
// text alternative to the chart above it, which only exposes its values via
// a mouse-hover tooltip (WCAG 1.1.1 · 2.1.1). A native <details>, not a
// button toggle: the chart itself always stays visible: this only reveals
// the table alongside it. No expand/collapse icon override — inherits
// global.css's generic `details > summary::before`/`summary:focus` styling,
// same as CollapsibleCard.js's <details>; the table icon here is a separate,
// additional cue for what this particular disclosure reveals.
const ChartDataToggle = ({ label, caption, columns, rows }) => (
  <details className="chart-data-toggle">
    <summary className="chart-data-toggle__summary">
      <FontAwesomeIcon icon="fa-solid fa-table" aria-hidden="true" />
      {label}
    </summary>
    <ChartDataTable caption={caption} columns={columns} rows={rows} />
  </details>
);

export default ChartDataToggle;
