import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { PARTNER_DEPARTMENTS } from '../../constants/partnerDepartments.js';
import { COLOURS } from '../../constants/dashboardColours.js';

const toISODate = (d) => d.toISOString().split('T')[0];
const today = () => toISODate(new Date());
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
};

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 };
const inputStyle = { padding: '6px 10px', border: '1px solid #bdbdbd', borderRadius: 4, fontSize: 14 };

// Shared filter bar for the exec and partner dashboards.
// Owns department + date range; reports the selection to the parent via
// onApply({ startDate, endDate, department }). department is '' for "all partners".
// Fires onApply once on mount with the defaults (last 30 days, all partners).
const DashboardFilterBar = ({ lang = 'en', loading = false, onApply }) => {
  const { t } = useTranslations(lang);
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate, setEndDate] = useState(today());

  // Keep the latest onApply without retriggering the mount-load effect.
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  useEffect(() => {
    onApplyRef.current({ startDate, endDate, department });
    // Initial load only — subsequent loads are driven by the Apply button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = () => {
    if (startDate && endDate) onApply({ startDate, endDate, department });
  };

  return (
    <div style={{
      background: '#f5f7fa',
      border: '1px solid #e0e0e0',
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 28,
      display: 'flex',
      alignItems: 'flex-end',
      gap: 20,
      flexWrap: 'wrap',
    }}>
      {/* Department */}
      <div>
        <label htmlFor="dashboard-dept" style={labelStyle}>
          {t('dashboardFilter.department')}
        </label>
        <select
          id="dashboard-dept"
          value={department}
          onChange={e => setDepartment(e.target.value)}
          disabled={loading}
          style={{ ...inputStyle, padding: '7px 12px', minWidth: 200 }}
        >
          <option value="">{t('dashboardFilter.allPartners')}</option>
          {PARTNER_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Start date */}
      <div>
        <label htmlFor="dashboard-start" style={labelStyle}>
          {t('dashboardFilter.startDate')}
        </label>
        <input
          id="dashboard-start"
          type="date"
          value={startDate}
          max={endDate}
          onChange={e => setStartDate(e.target.value)}
          disabled={loading}
          style={inputStyle}
        />
      </div>

      {/* End date */}
      <div>
        <label htmlFor="dashboard-end" style={labelStyle}>
          {t('dashboardFilter.endDate')}
        </label>
        <input
          id="dashboard-end"
          type="date"
          value={endDate}
          min={startDate}
          max={today()}
          onChange={e => setEndDate(e.target.value)}
          disabled={loading}
          style={inputStyle}
        />
      </div>

      <button
        onClick={handleApply}
        disabled={loading || !startDate || !endDate}
        style={{
          padding: '7px 20px', background: COLOURS.brand, color: '#fff',
          border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        }}
      >
        {t('dashboardFilter.apply')}
      </button>

      {loading && <span style={{ fontSize: 13, color: '#888', alignSelf: 'center' }}>{t('dashboardFilter.loading')}</span>}
    </div>
  );
};

export default DashboardFilterBar;
