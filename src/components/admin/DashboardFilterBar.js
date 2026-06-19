import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { PARTNER_DEPARTMENTS } from '../../constants/partnerDepartments.js';

const toISODate = (d) => d.toISOString().split('T')[0];
const todayStr = () => toISODate(new Date());

// Absolute floor — no data exists before this date. Used as the fallback
// min for custom inputs before the real first-data date loads from the DB.
const DATA_START_DATE = '2025-10-01';

// Government of Canada fiscal year quarters:
//   Q1: April 1 – June 30
//   Q2: July 1 – September 30
//   Q3: October 1 – December 31
//   Q4: January 1 – March 31
// "Last quarter" returns the current fiscal quarter (date-aware).
// Future enhancement: let the user pick individual quarters via a Q1/Q2/Q3/Q4 toggle.
const getCurrentFiscalQuarter = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  if (month >= 4 && month <= 6)  return { startDate: `${year}-04-01`, endDate: `${year}-06-30` };
  if (month >= 7 && month <= 9)  return { startDate: `${year}-07-01`, endDate: `${year}-09-30` };
  if (month >= 10 && month <= 12) return { startDate: `${year}-10-01`, endDate: `${year}-12-31` };
  return { startDate: `${year}-01-01`, endDate: `${year}-03-31` }; // Q4
};

const getDateRange = (preset, customStart, customEnd, allTimeStart) => {
  const endDate = todayStr();
  if (preset === 'last30') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return { startDate: toISODate(d), endDate };
  }
  if (preset === 'lastQuarter') return getCurrentFiscalQuarter();
  // "All time" will become a "last year" toggle once sufficient historical data exists.
  if (preset === 'allTime') return { startDate: allTimeStart || DATA_START_DATE, endDate };
  if (preset === 'custom') return { startDate: customStart || DATA_START_DATE, endDate: customEnd || endDate };
  return { startDate: DATA_START_DATE, endDate };
};

const PRESETS = ['last30', 'lastQuarter', 'allTime', 'custom'];

// Filter bar for the exec dashboard.
// Presets: Last 30 days | Last quarter | All time (default) | Custom.
// Non-custom presets and department changes auto-apply immediately.
// Custom requires the user to set dates and click Apply in the expanded row.
// Clicking the active Custom button collapses the row without applying.
// `minDate` (YYYY-MM-DD, optional): the earliest date with actual data in the DB.
// Defaults to DATA_START_DATE; the parent should pass the real first-data date
// once known so the All time range and custom calendar snap to a meaningful start.
const DashboardFilterBar = ({ lang = 'en', loading = false, onApply, onInitialLoad, minDate = DATA_START_DATE }) => {
  const { t } = useTranslations(lang);

  const [department, setDepartment] = useState('');
  const [datePreset, setDatePreset] = useState('allTime');
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(DATA_START_DATE);
  const [customEnd, setCustomEnd] = useState(todayStr);

  // Applied state — drives the pill display
  const [appliedDept, setAppliedDept] = useState('');
  const [appliedPreset, setAppliedPreset] = useState('allTime');
  const [appliedCustomStart, setAppliedCustomStart] = useState('');
  const [appliedCustomEnd, setAppliedCustomEnd] = useState('');

  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onInitialLoadRef = useRef(onInitialLoad);
  onInitialLoadRef.current = onInitialLoad;

  // Refs for use inside effects to avoid stale closures
  const appliedDeptRef = useRef(appliedDept);
  appliedDeptRef.current = appliedDept;
  const appliedPresetRef = useRef(appliedPreset);
  appliedPresetRef.current = appliedPreset;

  // Fire initial load once on mount with "all time" defaults.
  // Known issue: as data volume grows, auto-loading the default range on mount
  // may be slow. If that becomes a problem, this should be changed to require
  // an explicit Apply click — drop onInitialLoad from the caller and the bar
  // will wait for Apply before fetching.
  useEffect(() => {
    const { startDate, endDate } = getDateRange('allTime', null, null, DATA_START_DATE);
    const cb = onInitialLoadRef.current || onApplyRef.current;
    cb({ startDate, endDate, department: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the custom panel on Escape and revert to the last applied preset.
  useEffect(() => {
    if (!showCustom) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowCustom(false);
        setDatePreset(appliedPreset);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showCustom, appliedPreset]);

  // Once the real first-data date arrives, snap the All time range to it.
  const didSnapAllTime = useRef(false);
  useEffect(() => {
    if (!minDate || minDate === DATA_START_DATE) return;
    if (appliedPresetRef.current !== 'allTime' || didSnapAllTime.current) return;
    didSnapAllTime.current = true;
    onApplyRef.current({ startDate: minDate, endDate: todayStr(), department: appliedDeptRef.current });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate]);

  const fireApply = (preset, dept) => {
    const allTimeStart = preset === 'allTime' ? (minDate || DATA_START_DATE) : undefined;
    const { startDate, endDate } = getDateRange(preset, customStart, customEnd, allTimeStart);
    if (!startDate || !endDate) return;
    setAppliedDept(dept);
    setAppliedPreset(preset);
    onApplyRef.current({ startDate, endDate, department: dept });
  };

  const handlePresetClick = (preset) => {
    if (preset === 'custom') {
      if (showCustom) {
        // Close the custom row; revert pending selection to last applied preset.
        setShowCustom(false);
        setDatePreset(appliedPreset);
      } else {
        // Pre-fill custom inputs from the current preset's computed range.
        const allTimeStart = datePreset === 'allTime' ? (minDate || DATA_START_DATE) : undefined;
        const { startDate, endDate } = getDateRange(datePreset, customStart, customEnd, allTimeStart);
        setCustomStart(startDate);
        setCustomEnd(endDate);
        setDatePreset('custom');
        setShowCustom(true);
      }
      return;
    }
    setShowCustom(false);
    setDatePreset(preset);
    // Only reset the snap guard when minDate hasn't arrived yet. Once it's known,
    // fireApply already uses the correct value — resetting here would cause the
    // snap effect to fire a redundant second fetch when loading completes.
    if (preset === 'allTime' && (!minDate || minDate === DATA_START_DATE)) {
      didSnapAllTime.current = false;
    }
    fireApply(preset, department);
  };

  const handleDeptChange = (newDept) => {
    setDepartment(newDept);
    if (datePreset === 'custom') {
      // Close the custom panel and apply with the last confirmed preset so the
      // dept change takes effect immediately (consistent with non-custom behaviour).
      setShowCustom(false);
      setDatePreset(appliedPreset);
      fireApply(appliedPreset, newDept);
    } else {
      fireApply(datePreset, newDept);
    }
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return;
    const { startDate, endDate } = getDateRange('custom', customStart, customEnd);
    setAppliedDept(department);
    setAppliedPreset('custom');
    setAppliedCustomStart(startDate);
    setAppliedCustomEnd(endDate);
    setShowCustom(false);
    onApplyRef.current({ startDate, endDate, department });
  };

  const handleReset = () => {
    setDepartment('');
    setDatePreset('allTime');
    setShowCustom(false);
    setAppliedDept('');
    setAppliedPreset('allTime');
    setAppliedCustomStart('');
    setAppliedCustomEnd('');
    // We're applying the correct all-time range right here using the known minDate,
    // so the snap effect must not re-fire when loading completes.
    didSnapAllTime.current = true;
    const allTimeStart = minDate || DATA_START_DATE;
    onApplyRef.current({ startDate: allTimeStart, endDate: todayStr(), department: '' });
  };

  const isDefault = appliedDept === '' && appliedPreset === 'allTime';

  const getPillDateLabel = () => {
    if (appliedPreset === 'custom' && appliedCustomStart && appliedCustomEnd) {
      const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
      const opts = { year: 'numeric', month: 'short', day: 'numeric' };
      const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
      return `${parse(appliedCustomStart).toLocaleDateString(locale, opts)} – ${parse(appliedCustomEnd).toLocaleDateString(locale, opts)}`;
    }
    return t(`dashboardFilter.${appliedPreset}`);
  };

  const pillPartner = appliedDept || t('dashboardFilter.allPartners');
  const pillDate = getPillDateLabel();

  return (
    <div className="filter-bar-wrapper">
      <div className="filter-bar">
      {/* Row 1: partner selector + date presets on one row */}
      <div className="filter-bar__row">
        <div className="filter-bar__field">
          <label htmlFor="dashboard-dept" className="filter-bar__label">
            {t('dashboardFilter.department')}
          </label>
          <select
            id="dashboard-dept"
            className="filter-bar__select"
            value={department}
            onChange={e => handleDeptChange(e.target.value)}
            disabled={loading}
          >
            <option value="">{t('dashboardFilter.allPartners')}</option>
            {PARTNER_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="filter-bar__field filter-bar__field--grow">
          <label className="filter-bar__label">{t('dashboardFilter.dateRange')}</label>
          <div className="filter-bar__presets">
            {PRESETS.map(p => (
              <button
                key={p}
                type="button"
                className={[
                  'filter-bar__preset',
                  datePreset === p && p !== 'custom' ? 'filter-bar__preset--active' : '',
                  p === 'custom' && showCustom ? 'filter-bar__preset--custom-open' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handlePresetClick(p)}
                disabled={loading}
              >
                {t(`dashboardFilter.${p}`)}
                {p === 'custom' && (
                  <span className="filter-bar__preset-chevron" aria-hidden="true">
                    {showCustom ? '▴' : '▾'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: custom date inputs + apply — only when custom is expanded */}
      {showCustom && (
        <div className="filter-bar__row filter-bar__row--custom">
          <div className="filter-bar__field">
            <label htmlFor="dashboard-custom-start" className="filter-bar__label">
              {t('dashboardFilter.startDate')}
            </label>
            <input
              id="dashboard-custom-start"
              type="date"
              className="filter-bar__input"
              value={customStart}
              min={minDate}
              max={customEnd || todayStr()}
              onChange={e => setCustomStart(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="filter-bar__field">
            <label htmlFor="dashboard-custom-end" className="filter-bar__label">
              {t('dashboardFilter.endDate')}
            </label>
            <input
              id="dashboard-custom-end"
              type="date"
              className="filter-bar__input"
              value={customEnd}
              min={customStart || minDate}
              max={todayStr()}
              onChange={e => setCustomEnd(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            type="button"
            className="filter-bar__apply"
            onClick={handleCustomApply}
            disabled={loading || !customStart || !customEnd}
          >
            {t('dashboardFilter.apply')}
          </button>
        </div>
      )}

      </div>

      {/* Pills row — outside the bordered filter box */}
      <div className="filter-bar__pills-row">
        <span className="filter-bar__showing">{t('dashboardFilter.showing')}</span>
        <span className={`filter-pill${isDefault ? '' : ' filter-pill--closable'}`}>
          {pillPartner} · {pillDate}
          {!isDefault && (
            <button
              type="button"
              className="filter-pill__close"
              onClick={handleReset}
              aria-label={t('dashboardFilter.removeFilter')}
              disabled={loading}
            >
              ×
            </button>
          )}
        </span>
        {loading && <span className="filter-bar__loading">{t('dashboardFilter.loading')}</span>}
      </div>
    </div>
  );
};

export default DashboardFilterBar;
