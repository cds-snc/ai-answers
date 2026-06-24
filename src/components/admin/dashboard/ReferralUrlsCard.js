import React from 'react';
import CountTable from './CountTable.js';

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
  const rows = data.map((r) => ({ key: r.url, label: r.url, href: `https://${r.url}`, count: r.count }));

  return (
    <div className="dashboard-card">
      <details open={defaultOpen}>
        <summary className="card-title" style={{ cursor: 'pointer' }}>{title}</summary>
        {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}
        {rows.length === 0 ? (
          <p className="font-size-text-xsm-nr">{noDataLabel}</p>
        ) : (
          <CountTable labelColLabel={urlColLabel} countColLabel={countColLabel} rows={rows} lang={lang} />
        )}
      </details>
    </div>
  );
};

export default ReferralUrlsCard;
