import React from 'react';
import CollapsibleCard from './CollapsibleCard.js';
import CountTable from './CountTable.js';

// Collapsible list of the partner site pages that drove the most click-throughs
// (distinct conversations) to AI Answers. `data` is [{ url, count }], already
// normalized, merged and ranked server-side. URLs open in a new tab. Title and
// subtitle are always visible; the table itself sits behind `triggerLabel`.
const ReferralUrlsCard = ({
  title,
  subtitle,
  triggerLabel,
  data = [],
  lang = 'en',
  urlColLabel,
  countColLabel,
  noDataLabel,
  defaultOpen = false,
}) => {
  const rows = data.map((r) => ({ key: r.url, label: r.url, href: `https://${r.url}`, count: r.count }));

  return (
    <CollapsibleCard heading={title} subtext={subtitle} triggerLabel={triggerLabel} defaultOpen={defaultOpen}>
      {rows.length === 0 ? (
        <p className="font-size-text-xsm-nr">{noDataLabel}</p>
      ) : (
        <CountTable labelColLabel={urlColLabel} countColLabel={countColLabel} rows={rows} lang={lang} captionLabel={title} />
      )}
    </CollapsibleCard>
  );
};

export default ReferralUrlsCard;
