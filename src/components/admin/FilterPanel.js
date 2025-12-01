// FilterPanel.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';

const FilterPanel = ({ onApplyFilters, onClearFilters, isVisible = false, storageKey = 'chatFilterPanelState_v1' }) => {
  const { t } = useTranslations();
  
  // Helper function to format date for datetime-local input
  const formatDateTimeLocal = (date) => {
    const d = new Date(date);
    const pad = (num) => String(num).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };
  // Helper to parse datetime-local input string into a local Date object
  const parseDateTimeLocal = (dateTimeLocal) => {
    if (!dateTimeLocal || typeof dateTimeLocal !== 'string') return null;
    const parts = dateTimeLocal.split('T');
    if (parts.length !== 2) return null;
    const [datePart, timePart] = parts;
    if (!datePart || !timePart) return null;
    const dateArr = datePart.split('-').map(Number);
    const timeArr = timePart.split(':').map(Number);
    if (
      dateArr.length !== 3 ||
      timeArr.length < 2 ||
      dateArr.some(isNaN) ||
      timeArr.some(isNaN)
    ) return null;
    return new Date(dateArr[0], dateArr[1] - 1, dateArr[2], timeArr[0], timeArr[1]);
  };

  const STORAGE_KEY = storageKey;

  // Default to last 24 hours
  const getDefaultDates = useCallback(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
  }, []);

  const [dateRange, setDateRange] = useState(getDefaultDates());
  const [filterType, setFilterType] = useState('preset');
  const [presetValue, setPresetValue] = useState('1');
  const [department, setDepartment] = useState('');
  const [referringUrl, setReferringUrl] = useState('');
  const [userType, setUserType] = useState('all');

  // Load saved state from localStorage (if available).
  // Run on next tick so it overrides initial default/preset effects.
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed) return;

      setTimeout(() => {
        try {
          if (parsed.dateRange && parsed.dateRange.startDate && parsed.dateRange.endDate) {
            setDateRange(parsed.dateRange);
          }
          if (parsed.filterType) setFilterType(parsed.filterType);
          if (parsed.presetValue) setPresetValue(parsed.presetValue);
          if (typeof parsed.department === 'string') setDepartment(parsed.department);
          if (typeof parsed.referringUrl === 'string') setReferringUrl(parsed.referringUrl);
          if (typeof parsed.userType === 'string') setUserType(parsed.userType);
        } catch (e) {
          // ignore
        }
      }, 0);
    } catch (err) {
      // ignore corrupt localStorage entries
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

 

  // Department options based on systemPrompt modules
  const departmentOptions = [
    { value: '', label: t('admin.filters.allDepartments') },
    { value: 'CBSA-ASFC', label: 'CBSA-ASFC' },
    { value: 'CDS-SNC', label: 'CDS-SNC' },
    { value: 'CRA-ARC', label: 'CRA-ARC' },
    { value: 'ECCC', label: 'ECCC' },
    { value: 'EDSC-ESDC', label: 'EDSC-ESDC' },
    { value: 'FIN', label: 'FIN' },
    { value: 'HC-SC', label: 'HC-SC' },
    { value: 'IRCC', label: 'IRCC' },
    { value: 'ISED-ISDE', label: 'ISED-ISDE' },
    { value: 'NRCan-RNCan', label: 'NRCan-RNCan' },
    { value: 'PHAC-ASPC', label: 'PHAC-ASPC' },
    { value: 'PSPC-SPAC', label: 'PSPC-SPAC' },
    { value: 'RCAANC-CIRNAC', label: 'RCAANC-CIRNAC' },
    { value: 'SAC-ISC', label: 'SAC-ISC' },
    { value: 'TBS-SCT', label: 'TBS-SCT' }
  ];

  // User type options
  const userTypeOptions = [
    { value: 'all', label: t('admin.filters.allUsers') || 'All' },
    { value: 'public', label: t('admin.filters.publicUsers') || 'Public' },
    { value: 'admin', label: t('admin.filters.adminUsers') || 'Admin' }
  ];

  // Preset options
  const presetOptions = useMemo(() => ([
    { 
      value: '1', 
      label: t('admin.chatLogs.last1Day'), 
      hours: 24 
    },
    { 
      value: '7', 
      label: t('admin.chatLogs.last7Days'), 
      hours: 24 * 7 
    },
    { 
      value: '30', 
      label: t('admin.chatLogs.last30Days'), 
      hours: 24 * 30 
    },
    { 
      value: '60', 
      label: t('admin.chatLogs.last60Days'), 
      hours: 24 * 60 
    },
    { 
      value: '90', 
      label: t('admin.chatLogs.last90Days'), 
      hours: 24 * 90 
    },
    { 
      value: 'all', 
      label: t('admin.chatLogs.allLogs'), 
      hours: null 
    }
  ]), [t]);

  // Update date range when preset changes
  useEffect(() => {
    if (filterType === 'preset') {
      // When switching to preset, reset custom date range to default
      setDateRange(getDefaultDates());
      if (presetValue !== 'all') {
        const end = new Date();
        const hours = presetOptions.find(opt => opt.value === presetValue)?.hours;
        if (hours) {
          const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
          const newRange = {
            startDate: formatDateTimeLocal(start),
            endDate: formatDateTimeLocal(end)
          };
          setDateRange(newRange);
        }
      }
    }
    if (filterType === 'custom') {
      // When switching to custom, clear preset value
      setPresetValue('1');
    }
  }, [filterType, presetValue, getDefaultDates, presetOptions]);

  const handleApply = () => {
    let filters = {
      department,
      referringUrl,
      userType,
      filterType
    };
    if (filterType === 'preset') {
      filters.presetValue = presetValue;
      if (presetValue !== 'all') {
        // Convert local datetime-local input to UTC ISO string
        const startObj = parseDateTimeLocal(dateRange.startDate);
        const endObj = parseDateTimeLocal(dateRange.endDate);
        filters.startDate = startObj ? startObj.toISOString() : undefined;
        filters.endDate = endObj ? endObj.toISOString() : undefined;
      }
      // If 'all', do not send startDate/endDate
    } else if (filterType === 'custom') {
      // Convert custom local datetime-local input to UTC ISO string
      const startObj = parseDateTimeLocal(dateRange.startDate);
      const endObj = parseDateTimeLocal(dateRange.endDate);
      filters.startDate = startObj ? startObj.toISOString() : undefined;
      filters.endDate = endObj ? endObj.toISOString() : undefined;
    }
    onApplyFilters(filters);
  };

  // Also persist immediately when the user clicks Apply to avoid races
  // where effects may not have flushed to localStorage before a reload.
  const handleApplyWithPersist = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload = {
          dateRange,
          filterType,
          presetValue,
          department,
          referringUrl,
          userType
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (err) {
      // ignore
    }
    handleApply();
  };

  const handleClear = () => {
    const defaultDates = getDefaultDates();
    setDateRange(defaultDates);
    setFilterType('preset');
    setPresetValue('1');
    setDepartment('');
    setReferringUrl('');
    setUserType('all');
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      // ignore
    }
    onClearFilters();
  };

  const handleDateChange = (field, value) => {
    const newRange = { ...dateRange, [field]: value };
    setDateRange(newRange);
  };

  const handlePresetChange = (value) => {
    setPresetValue(value);
  };

  const handleFilterTypeChange = (type) => {
    setFilterType(type);
    if (type === 'preset') {
      setDateRange(getDefaultDates());
    } else if (type === 'custom') {
      setPresetValue('1');
    }
  };

  const quickSetToday = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const newRange = {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
    setDateRange(newRange);
    setFilterType('custom');
  };

  const quickSetYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(yesterday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(yesterday);
    end.setHours(23, 59, 59, 999);
    
    const newRange = {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
    setDateRange(newRange);
    setFilterType('custom');
  };

  const quickSetThisWeek = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    
    const newRange = {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
    setDateRange(newRange);
    setFilterType('custom');
  };

  if (!isVisible) return null;

  return (
    <details className="filter-panel" open>
      <summary className="filter-panel-summary">
        {t('admin.filters.title')}
      </summary>
      <div className="filter-panel-content">
        <div className="filter-grid">
          {/* Left column - Date/Time Range */}
          <div className="filter-column">
            <div className="filter-row">
              <label className="filter-label">
                {t('admin.filters.dateRange')}
              </label>
              
              {/* Filter Type Toggle */}
              <div className="mb-2">
                <fieldset className="filter-fieldset">
                  <legend className="filter-legend">
                    {t('admin.dateRange.filterType')}
                  </legend>
                  <div className="filter-radio-group">
                    <label className="filter-radio-item">
                      <input
                        type="radio"
                        name="filter-type"
                        value="preset"
                        checked={filterType === 'preset'}
                        onChange={(e) => handleFilterTypeChange(e.target.value)}
                      />
                      <span>{t('admin.dateRange.presetRanges')}</span>
                    </label>
                    <label className="filter-radio-item">
                      <input
                        type="radio"
                        name="filter-type"
                        value="custom"
                        checked={filterType === 'custom'}
                        onChange={(e) => handleFilterTypeChange(e.target.value)}
                      />
                      <span>{t('admin.dateRange.customRange')}</span>
                    </label>
                  </div>
                </fieldset>
              </div>

              {/* Preset Options */}
              {filterType === 'preset' && (
                <div className="mb-2">
                  <label htmlFor="preset-select" className="filter-label">
                    {t('admin.dateRange.chooseRange')}
                  </label>
                  <select
                    id="preset-select"
                    value={presetValue}
                    onChange={(e) => handlePresetChange(e.target.value)}
                    className="filter-select"
                  >
                    {presetOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom Date/Time Range */}
              {filterType === 'custom' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="start-datetime" className="filter-label">
                      {t('admin.dateRange.startDateTime')}
                    </label>
                    <input
                      type="datetime-local"
                      id="start-datetime"
                      value={dateRange.startDate}
                      onChange={(e) => handleDateChange('startDate', e.target.value)}
                      className="filter-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="end-datetime" className="filter-label">
                      {t('admin.dateRange.endDateTime')}
                    </label>
                    <input
                      type="datetime-local"
                      id="end-datetime"
                      value={dateRange.endDate}
                      onChange={(e) => handleDateChange('endDate', e.target.value)}
                      className="filter-input"
                    />
                  </div>
                  
                  {/* Quick Set Buttons */}
                  <div className="quick-set-buttons">
                    <button
                      onClick={quickSetToday}
                      className="quick-set-button"
                    >
                      {t('admin.dateRange.today')}
                    </button>
                    <button
                      onClick={quickSetYesterday}
                      className="quick-set-button"
                    >
                      {t('admin.dateRange.yesterday')}
                    </button>
                    <button
                      onClick={quickSetThisWeek}
                      className="quick-set-button"
                    >
                      {t('admin.dateRange.thisWeek')}
                    </button>
                  </div>
                </div>
              )}

              {/* Current Selection Display */}
              <div className="current-selection">
                <h3>{t('admin.dateRange.currentSelection')}</h3>
                <div className="current-selection-content">
                  {filterType === 'preset' && presetValue !== 'all' && (
                    <p>
                      <strong>{t('admin.dateRange.period')}</strong>{' '}
                      {presetOptions.find(opt => opt.value === presetValue)?.label}
                    </p>
                  )}
                  {filterType === 'preset' && presetValue === 'all' && (
                    <p>
                      <strong>{t('admin.dateRange.period')}</strong>{' '}
                      {t('admin.chatLogs.allLogs')}
                    </p>
                  )}
                  {(filterType === 'custom' || (filterType === 'preset' && presetValue !== 'all')) && (
                    <div className="space-y-1">
                      <p>
                        <strong>{t('admin.dateRange.from')}</strong>{' '}
                        {(() => {
                          const d = parseDateTimeLocal(dateRange.startDate);
                          return d ? d.toLocaleString(t('locale') === 'fr' ? 'fr-CA' : 'en-CA') : t('admin.dateRange.invalidDate');
                        })()}
                      </p>
                      <p>
                        <strong>{t('admin.dateRange.to')}</strong>{' '}
                        {(() => {
                          const d = parseDateTimeLocal(dateRange.endDate);
                          return d ? d.toLocaleString(t('locale') === 'fr' ? 'fr-CA' : 'en-CA') : t('admin.dateRange.invalidDate');
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right column - Department and Referring URL */}
          <div className="filter-column">
            <div className="filter-row">
              <label htmlFor="department" className="filter-label">
                {t('admin.filters.department')}
              </label>
              <div className="filter-field">
                <select
                  id="department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="filter-select"
                >
                  {departmentOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="filter-row">
              <label htmlFor="referring-url" className="filter-label">
                {t('admin.filters.referringUrl')}
              </label>
              <div className="filter-field">
                <input
                  type="text"
                  id="referring-url"
                  value={referringUrl}
                  onChange={(e) => setReferringUrl(e.target.value)}
                  placeholder={t('admin.filters.referringUrlPlaceholder')}
                  className="filter-input"
                />
              </div>
            </div>

            <div className="filter-row">
              <label htmlFor="user-type" className="filter-label">
                {t('admin.filters.users')}
              </label>
              <div className="filter-field">
                <select
                  id="user-type"
                  value={userType}
                  onChange={(e) => setUserType(e.target.value)}
                  className="filter-select"
                >
                  {userTypeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            onClick={handleApplyWithPersist}
            className="filter-button filter-button-primary"
          >
            {t('admin.filters.apply')}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="filter-button filter-button-secondary"
          >
            {t('admin.filters.clearAll')}
          </button>
        </div>
      </div>
    </details>
  );
};

export default FilterPanel;
