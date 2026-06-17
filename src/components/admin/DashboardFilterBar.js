import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { PARTNER_DEPARTMENTS } from '../../constants/partnerDepartments.js';

const toISODate = (d) => d.toISOString().split('T')[0];
const today = () => toISODate(new Date());

// Shared filter bar for the exec and partner dashboards.
// Owns department + date range; reports the selection to the parent via
// onApply({ startDate, endDate, department }). department is '' for "all partners".
// Fires onInitialLoad (if provided) or onApply once on mount with defaults
// (last 12 months, all partners). Pass onInitialLoad separately when the parent
// needs to distinguish the auto-load from an explicit user action.
const DashboardFilterBar = ({ lang = 'en', loading = false, onApply, onInitialLoad }) => {
  const { t } = useTranslations(lang);
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return toISODate(d);
  });
  const [endDate, setEndDate] = useState(today());

  // Keep the latest callbacks without retriggering the mount-load effect.
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onInitialLoadRef = useRef(onInitialLoad);
  onInitialLoadRef.current = onInitialLoad;

  useEffect(() => {
    const cb = onInitialLoadRef.current || onApplyRef.current;
    cb({ startDate, endDate, department });
    // Initial load only — subsequent loads are driven by the Apply button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = () => {
    if (startDate && endDate) onApply({ startDate, endDate, department });
  };

  return (
    <div className="filter-bar">
      {/* Department */}
      <div>
        <label htmlFor="dashboard-dept" className="filter-bar__label">
          {t('dashboardFilter.department')}
        </label>
        <select
          id="dashboard-dept"
          className="filter-bar__select"
          value={department}
          onChange={e => setDepartment(e.target.value)}
          disabled={loading}
        >
          <option value="">{t('dashboardFilter.allPartners')}</option>
          {PARTNER_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Start date */}
      <div>
        <label htmlFor="dashboard-start" className="filter-bar__label">
          {t('dashboardFilter.startDate')}
        </label>
        <input
          id="dashboard-start"
          type="date"
          className="filter-bar__input"
          value={startDate}
          max={endDate}
          onChange={e => setStartDate(e.target.value)}
          disabled={loading}
        />
      </div>

      {/* End date */}
      <div>
        <label htmlFor="dashboard-end" className="filter-bar__label">
          {t('dashboardFilter.endDate')}
        </label>
        <input
          id="dashboard-end"
          type="date"
          className="filter-bar__input"
          value={endDate}
          min={startDate}
          max={today()}
          onChange={e => setEndDate(e.target.value)}
          disabled={loading}
        />
      </div>

      <button
        className="filter-bar__apply"
        onClick={handleApply}
        disabled={loading || !startDate || !endDate}
      >
        {t('dashboardFilter.apply')}
      </button>

      {loading && <span className="filter-bar__loading">{t('dashboardFilter.loading')}</span>}
    </div>
  );
};

export default DashboardFilterBar;
