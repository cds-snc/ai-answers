import React from 'react';
import { formatNumber } from '../../../utils/numberFormat.js';

// Collapsible list of the partner site pages that drove the most click-throughs
// (distinct conversations) to AI Answers. `data` is [{ url, count }], already
// normalized, merged and ranked server-side. URLs open in a new tab. Kept in a
// <details> so a long list doesn't crowd the dashboard until expanded.
const ReferralUrlsCard = ({
  title,
  subtitle,
  data = [],
  lang = 'en',
  urlColLabel,
  countColLabel,
  noDataLabel,
  defaultOpen = false,
}) => {
  const fmtN = (n) => formatNumber(n, lang);

  return (
    <div className="dashboard-card">
      <details open={defaultOpen}>
        <summary className="card-title" style={{ cursor: 'pointer' }}>{title}</summary>
        {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
        {data.length === 0 ? (
          <p className="font-size-text-xsm-nr">{noDataLabel}</p>
        ) : (
          <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '2px solid #e0e0e0', padding: '8px 8px' }}>{urlColLabel}</th>
                <th style={{ textAlign: 'right', borderBottom: '2px solid #e0e0e0', padding: '8px 8px' }}>{countColLabel}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.url}>
                  <td style={{ wordBreak: 'break-all', borderBottom: '1px solid #e0e0e0', padding: '8px 8px' }}>
                    <a href={`https://${row.url}`} target="_blank" rel="noopener noreferrer">
                      {row.url}
                    </a>
                  </td>
                  <td style={{ textAlign: 'right', borderBottom: '1px solid #e0e0e0', padding: '8px 8px', whiteSpace: 'nowrap' }}>
                    {fmtN(row.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
};

export default ReferralUrlsCard;
