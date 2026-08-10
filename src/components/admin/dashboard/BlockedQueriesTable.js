import React from 'react';
import { formatNumber } from '../../../utils/numberFormat.js';
import { BLOCK_QUERY_TYPES } from '../../../constants/blockedQueryTypes.js';

const EMPTY = { total: 0, en: 0, fr: 0 };

// Text-free counts of queries blocked by the safety/security guardrails before
// they reached the answer step. `blockedQueries` is the metric bundle's
// blockedQueries object ({ [type]: { total, en, fr }, total: {...} }).
//
// TODO: currently unused — not imported by any page or component. Was built
// for the technical dashboard's blocked-query section, which was confirmed
// intentionally not present. Delete this file if no use is found for it.
const BlockedQueriesTable = ({ blockedQueries = {}, lang = 'en', t }) => {
  const fmtN = (n) => formatNumber(n, lang);
  const totals = blockedQueries.total || EMPTY;

  return (
    <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <caption className="sr-only">{t('blockedQueries.byTypeTitle')}</caption>
      {/* This table has headers on both axes (col headers below + the Total
          row header further down) — scope is what disambiguates which axis
          each <th> labels in that mixed case (WCAG 1.3.1, technique H63).
          For a simple single-axis header row, <th> alone is normally enough. */}
      <thead>
        <tr>
          <th scope="col" style={{ textAlign: 'left' }}>{t('blockedQueries.colType')}</th>
          <th scope="col" style={{ textAlign: 'right' }}>{t('blockedQueries.colTotal')}</th>
          <th scope="col" style={{ textAlign: 'right' }}>{t('blockedQueries.colEn')}</th>
          <th scope="col" style={{ textAlign: 'right' }}>{t('blockedQueries.colFr')}</th>
        </tr>
      </thead>
      <tbody>
        {BLOCK_QUERY_TYPES.map((type) => {
          const row = blockedQueries[type] || EMPTY;
          return (
            <tr key={type}>
              <td>{t(`blockedQueries.types.${type}`)}</td>
              <td style={{ textAlign: 'right' }}>{fmtN(row.total)}</td>
              <td style={{ textAlign: 'right' }}>{fmtN(row.en)}</td>
              <td style={{ textAlign: 'right' }}>{fmtN(row.fr)}</td>
            </tr>
          );
        })}
        <tr style={{ fontWeight: 600 }}>
          <th scope="row" style={{ textAlign: 'left', fontWeight: 600 }}>{t('blockedQueries.totalRow')}</th>
          <td style={{ textAlign: 'right' }}>{fmtN(totals.total)}</td>
          <td style={{ textAlign: 'right' }}>{fmtN(totals.en)}</td>
          <td style={{ textAlign: 'right' }}>{fmtN(totals.fr)}</td>
        </tr>
      </tbody>
    </table>
  );
};

export default BlockedQueriesTable;
