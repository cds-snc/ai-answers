import React from 'react';
import CollapsibleCard from './CollapsibleCard.js';
import CountTable from './CountTable.js';

// Collapsible list of sites outside the Government of Canada that sent signed-out
// visitors to AI Answers (AIA-006). The server dropped those referrers before
// answering and kept only the hostname. `data` is [{ host, count }], counted by
// distinct conversation and ranked server-side.
//
// Hosts are plain text, never links: unlike ReferralUrlsCard's GC pages, these
// sites may be hostile.
const RejectedReferrersCard = ({
  title,
  subtitle,
  triggerLabel,
  data = [],
  lang = 'en',
  hostColLabel,
  countColLabel,
  noDataLabel,
  defaultOpen = false,
}) => {
  const rows = data.map((r) => ({ key: r.host, label: r.host, count: r.count }));

  return (
    <CollapsibleCard heading={title} subtext={subtitle} triggerLabel={triggerLabel} defaultOpen={defaultOpen}>
      {rows.length === 0 ? (
        <p className="font-size-text-xsm-nr">{noDataLabel}</p>
      ) : (
        <CountTable labelColLabel={hostColLabel} countColLabel={countColLabel} rows={rows} lang={lang} captionLabel={title} />
      )}
    </CollapsibleCard>
  );
};

export default RejectedReferrersCard;
