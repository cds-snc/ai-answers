import React from 'react';
import { formatNumber } from '../../../utils/numberFormat.js';
import { BLOCK_QUERY_TYPES } from '../../../constants/blockedQueryTypes.js';

const EMPTY = { total: 0, en: 0, fr: 0 };

// Text-free counts of queries blocked by the safety/security guardrails before
// they reached the answer step. `blockedQueries` is the metric bundle's
// blockedQueries object ({ [type]: { total, en, fr }, total: {...} }).
const BlockedQueriesTable = ({ blockedQueries = {}, lang = 'en', t }) => {
  const fmtN = (n) => formatNumber(n, lang);
  const totals = blockedQueries.total || EMPTY;

  return (
    <table className="display" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>{t('blockedQueries.colType')}</th>
          <th style={{ textAlign: 'right' }}>{t('blockedQueries.colTotal')}</th>
          <th style={{ textAlign: 'right' }}>{t('blockedQueries.colEn')}</th>
          <th style={{ textAlign: 'right' }}>{t('blockedQueries.colFr')}</th>
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
          <td>{t('blockedQueries.totalRow')}</td>
          <td style={{ textAlign: 'right' }}>{fmtN(totals.total)}</td>
          <td style={{ textAlign: 'right' }}>{fmtN(totals.en)}</td>
          <td style={{ textAlign: 'right' }}>{fmtN(totals.fr)}</td>
        </tr>
      </tbody>
    </table>
  );
};

export default BlockedQueriesTable;
