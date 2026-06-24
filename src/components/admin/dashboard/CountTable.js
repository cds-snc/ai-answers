import React from 'react';
import { formatNumber } from '../../../utils/numberFormat.js';

// Plain two-column "label / count" table shared by the dashboard's collapsible
// list cards (top referral pages, top citation pages, answer-type breakdown).
// Row dividers keep the count readable across a full-width row. `rows` is
// [{ key, label, count, href? }] — when `href` is set the label renders as a
// new-tab link.
const CountTable = ({ labelColLabel, countColLabel, rows = [], lang = 'en' }) => {
  const fmtN = (n) => formatNumber(n, lang);
  const cell = { borderBottom: '1px solid #e0e0e0', padding: '8px 8px' };
  const head = { borderBottom: '2px solid #e0e0e0', padding: '8px 8px' };

  return (
    <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: 'left' }}>{labelColLabel}</th>
          <th style={{ ...head, textAlign: 'right' }}>{countColLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td style={{ ...cell, wordBreak: 'break-all' }}>
              {row.href ? (
                <a href={row.href} target="_blank" rel="noopener noreferrer">{row.label}</a>
              ) : (
                row.label
              )}
            </td>
            <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtN(row.count)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default CountTable;
