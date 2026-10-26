import React from 'react';
import CollapsibleCard from './CollapsibleCard.js';
import CountTable from './CountTable.js';

// Collapsible breakdown of how questions split across answer types (how many
// got a citation vs. didn't). `rows` = [{ key, label, count }], fixed order,
// supplied by the page. Split out from CitationPagesCard into its own card —
// title/subtitle are always visible; the table sits behind `triggerLabel`.
const AnswerTypesCard = ({
  title,
  subtitle,
  triggerLabel,
  rows = [],
  typeColLabel,
  countColLabel,
  noDataLabel,
  lang = 'en',
  defaultOpen = false,
}) => (
  <CollapsibleCard heading={title} subtext={subtitle} triggerLabel={triggerLabel} defaultOpen={defaultOpen}>
    {rows.length === 0 ? (
      <p className="font-size-text-xsm-nr">{noDataLabel}</p>
    ) : (
      <CountTable labelColLabel={typeColLabel} countColLabel={countColLabel} rows={rows} lang={lang} captionLabel={title} />
    )}
  </CollapsibleCard>
);

export default AnswerTypesCard;
