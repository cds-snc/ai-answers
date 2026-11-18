import React from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { getPartnerGroupLabel } from '../../constants/partnerGroups.js';

// Admin-only picker for whose batches BatchPage lists. Values match
// parseBatchScope in api/util/batch-access.js. "Mine" shows the signed-in
// email, like the self-assign picker, since one person may have several
// accounts.
const BatchScopeSelect = ({ id, lang = 'en', value, onChange, filters, currentUser }) => {
  const { t } = useTranslations(lang);
  const { institutions = [], groups = [], users = [] } = filters || {};
  const selfId = currentUser?.userId ? String(currentUser.userId) : '';
  const otherUsers = users.filter((u) => u.id !== selfId);

  return (
    <div className="filter-row mb-400 text-measure">
      <label htmlFor={id} className="filter-label">{t('batch.scope.label')}</label>
      <select
        id={id}
        className="filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <optgroup label={t('batch.scope.mine')}>
          <option value="mine">{currentUser?.email || t('batch.scope.mine')}</option>
        </optgroup>
        {institutions.length > 0 && (
          <optgroup label={t('batch.scope.institutions')}>
            {institutions.map((inst) => (
              <option key={inst} value={`institution:${inst}`}>{inst}</option>
            ))}
          </optgroup>
        )}
        {groups.length > 0 && (
          <optgroup label={t('batch.scope.groups')}>
            {groups.map((group) => (
              <option key={group} value={`group:${group}`}>{getPartnerGroupLabel(group, lang)}</option>
            ))}
          </optgroup>
        )}
        <optgroup label={t('batch.scope.allBatches')}>
          <option value="all">{t('batch.scope.allUsers')}</option>
          {otherUsers.map((u) => (
            <option key={u.id} value={`user:${u.id}`}>{u.email}</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
};

export default BatchScopeSelect;
