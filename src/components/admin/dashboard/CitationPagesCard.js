import React from 'react';
import CountTable from './CountTable.js';

// Collapsible card with two tables:
//  1. Top citation pages — the GC pages AI Answers cited most often, by question
//     (`citations` = [{ url, count }], normalized/merged/ranked server-side).
//  2. Answer-type breakdown — how questions split across answer types, for
//     context on how many got a citation (normal) vs. didn't (`answerTypeRows`
//     = [{ key, label, count }], fixed order, supplied by the page).
const CitationPagesCard = ({
  title,
  subtitle,
  citations = [],
  urlColLabel,
  countColLabel,
  answerTypesTitle,
  answerTypeColLabel,
  answerTypeRows = [],
  noDataLabel,
  lang = 'en',
  defaultOpen = false,
}) => {
  const citationRows = citations.map((c) => ({ key: c.url, label: c.url, href: `https://${c.url}`, count: c.count }));

  return (
    <div className="dashboard-card">
      <details open={defaultOpen}>
        <summary className="card-title" style={{ cursor: 'pointer' }}>{title}</summary>
        {subtitle && <p className="card-subtitle font-size-text-xsm-nr">{subtitle}</p>}

        {citationRows.length === 0 ? (
          <p className="font-size-text-xsm-nr">{noDataLabel}</p>
        ) : (
          <CountTable labelColLabel={urlColLabel} countColLabel={countColLabel} rows={citationRows} lang={lang} />
        )}

        {answerTypeRows.length > 0 && (
          <>
            <h4 className="card-subtitle mt-400">{answerTypesTitle}</h4>
            <CountTable labelColLabel={answerTypeColLabel} countColLabel={countColLabel} rows={answerTypeRows} lang={lang} />
          </>
        )}
      </details>
    </div>
  );
};

export default CitationPagesCard;
