import React from 'react';
import CollapsibleCard from './CollapsibleCard.js';
import CountTable from './CountTable.js';

// Collapsible list of the GC pages AI Answers cited most often, by question
// (`citations` = [{ url, count }], normalized/merged/ranked server-side).
// Title and subtitle are always visible; the table sits behind `triggerLabel`.
// The answer-type breakdown that used to render alongside this table now
// lives in its own card — see AnswerTypesCard.js.
const CitationPagesCard = ({
  title,
  subtitle,
  triggerLabel,
  citations = [],
  urlColLabel,
  countColLabel,
  noDataLabel,
  lang = 'en',
  defaultOpen = false,
}) => {
  const rows = citations.map((c) => ({ key: c.url, label: c.url, href: `https://${c.url}`, count: c.count }));

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

export default CitationPagesCard;
