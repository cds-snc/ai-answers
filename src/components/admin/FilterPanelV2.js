// FilterPanelV2.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';

const FilterPanelV2 = ({ onApplyFilters, onClearFilters, isVisible = false, storageKey = 'adminFilterPanelV2_v1' }) => {
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

  // Default to last 7 days
  const getDefaultDates = useCallback(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
  }, []);

  const [dateRange, setDateRange] = useState(getDefaultDates());
  const [filterType, setFilterType] = useState('preset');
  const [presetValue, setPresetValue] = useState('7');
  const [department, setDepartment] = useState('');
  const [urlEn, setUrlEn] = useState('');
  const [urlFr, setUrlFr] = useState('');
  const [userType, setUserType] = useState('all');
  const [answerType, setAnswerType] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Load saved state from localStorage
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
          if (typeof parsed.urlEn === 'string') setUrlEn(parsed.urlEn);
          if (typeof parsed.urlFr === 'string') setUrlFr(parsed.urlFr);
          if (typeof parsed.userType === 'string') setUserType(parsed.userType);
          if (typeof parsed.answerType === 'string') setAnswerType(parsed.answerType);
          if (typeof parsed.showAdvancedFilters === 'boolean') setShowAdvancedFilters(parsed.showAdvancedFilters);
        } catch (e) {
          // ignore
        }
      }, 0);
    } catch (err) {
      // ignore corrupt localStorage entries
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Department options
  const departmentOptions = [
    { value: '', label: t('admin.filters.allDepartments') || 'All Departments' },
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
    { value: 'all', label: t('admin.filters.allUsers') || 'All Users' },
    { value: 'public', label: t('admin.filters.publicUsers') || 'Public Users' },
    { value: 'admin', label: t('admin.filters.adminUsers') || 'Admin Users' }
  ];

  // Answer type options
  const answerTypeOptions = [
    { value: 'all', label: t('admin.filters.allAnswerTypes') || 'All Answer Types' },
    { value: 'not-gc', label: 'Not GC' },
    { value: 'clarifying-question', label: 'Clarifying Question' },
    { value: 'pt-muni', label: 'PT/Muni' },
    { value: 'normal', label: 'Normal' }
  ];

  // Preset options (inspired by feedback viewer)
  const presetOptions = useMemo(() => ([
    {
      value: 'all',
      label: t('admin.filters.allDates') || 'All Dates',
      hours: null
    },
    {
      value: 'today',
      label: t('admin.filters.today') || 'Today',
      hours: 0,
      isToday: true
    },
    {
      value: 'yesterday',
      label: t('admin.filters.yesterday') || 'Yesterday',
      hours: 0,
      isYesterday: true
    },
    {
      value: '7',
      label: t('admin.filters.last7Days') || 'Last 7 Days',
      hours: 24 * 7
    },
    {
      value: '30',
      label: t('admin.filters.last30Days') || 'Last 30 Days',
      hours: 24 * 30
    },
    {
      value: 'thisMonth',
      label: t('admin.filters.thisMonth') || 'This Month',
      hours: 0,
      isThisMonth: true
    },
    {
      value: 'lastMonth',
      label: t('admin.filters.lastMonth') || 'Last Month',
      hours: 0,
      isLastMonth: true
    }
  ]), [t]);

  // Update date range when preset changes
  useEffect(() => {
    if (filterType === 'preset') {
      const preset = presetOptions.find(opt => opt.value === presetValue);
      if (!preset) return;

      if (presetValue === 'all') {
        // For "all", don't set specific dates
        return;
      }

      let start, end;
      end = new Date();

      if (preset.isToday) {
        start = new Date();
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (preset.isYesterday) {
        start = new Date();
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setHours(23, 59, 59, 999);
      } else if (preset.isThisMonth) {
        start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end = new Date();
      } else if (preset.isLastMonth) {
        end = new Date();
        end.setDate(0); // Last day of previous month
        end.setHours(23, 59, 59, 999);
        start = new Date(end);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
      } else if (preset.hours) {
        start = new Date(end.getTime() - preset.hours * 60 * 60 * 1000);
      }

      if (start && end) {
        const newRange = {
          startDate: formatDateTimeLocal(start),
          endDate: formatDateTimeLocal(end)
        };
        setDateRange(newRange);
      }
    }
  }, [filterType, presetValue, presetOptions]);

  const handleApply = () => {
    let filters = {
      department,
      urlEn,
      urlFr,
      userType,
      answerType,
      filterType
    };

    if (filterType === 'preset') {
      filters.presetValue = presetValue;
      if (presetValue !== 'all') {
        const startObj = parseDateTimeLocal(dateRange.startDate);
        const endObj = parseDateTimeLocal(dateRange.endDate);
        filters.startDate = startObj ? startObj.toISOString() : undefined;
        filters.endDate = endObj ? endObj.toISOString() : undefined;
      }
    } else if (filterType === 'custom') {
      const startObj = parseDateTimeLocal(dateRange.startDate);
      const endObj = parseDateTimeLocal(dateRange.endDate);
      filters.startDate = startObj ? startObj.toISOString() : undefined;
      filters.endDate = endObj ? endObj.toISOString() : undefined;
    }

    onApplyFilters(filters);
  };

  // Persist to localStorage when applying
  const handleApplyWithPersist = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload = {
          dateRange,
          filterType,
          presetValue,
          department,
          urlEn,
          urlFr,
          userType,
          answerType,
          showAdvancedFilters
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
    setPresetValue('7');
    setDepartment('');
    setUrlEn('');
    setUrlFr('');
    setUserType('all');
    setAnswerType('all');
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
    }
  };

  if (!isVisible) return null;

  return (
    <details className="filter-panel" open>
      <summary className="filter-panel-summary">
        {t('admin.filters.title') || 'Filters'}
      </summary>
      <div className="filter-panel-content">
        <div className="filter-grid">
          {/* Left column - Date/Time Range */}
          <div className="filter-column">
            <div className="filter-section">
              <h3 className="filter-section-title">
                {t('admin.filters.dateRange') || 'Date Range'}
              </h3>

              {/* Filter Type Toggle */}
              <div className="mb-3">
                <fieldset className="filter-fieldset">
                  <legend className="filter-legend">
                    {t('admin.dateRange.filterType') || 'Filter Type'}
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
                      <span>{t('admin.dateRange.presetRanges') || 'Preset Ranges'}</span>
                    </label>
                    <label className="filter-radio-item">
                      <input
                        type="radio"
                        name="filter-type"
                        value="custom"
                        checked={filterType === 'custom'}
                        onChange={(e) => handleFilterTypeChange(e.target.value)}
                      />
                      <span>{t('admin.dateRange.customRange') || 'Custom Range'}</span>
                    </label>
                  </div>
                </fieldset>
              </div>

              {/* Preset Options */}
              {filterType === 'preset' && (
                <div className="mb-3">
                  <label htmlFor="preset-select" className="filter-label">
                    {t('admin.dateRange.chooseRange') || 'Choose Range'}
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
                <div className="space-y-3">
                  <div>
                    <label htmlFor="start-datetime" className="filter-label">
                      {t('admin.dateRange.startDateTime') || 'Start Date/Time'}
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
                      {t('admin.dateRange.endDateTime') || 'End Date/Time'}
                    </label>
                    <input
                      type="datetime-local"
                      id="end-datetime"
                      value={dateRange.endDate}
                      onChange={(e) => handleDateChange('endDate', e.target.value)}
                      className="filter-input"
                    />
                  </div>
                </div>
              )}

              {/* Current Selection Display */}
              {filterType === 'preset' && presetValue !== 'all' && (
                <div className="current-selection">
                  <h4>{t('admin.dateRange.currentSelection') || 'Current Selection'}</h4>
                  <div className="current-selection-content">
                    <p>
                      <strong>{t('admin.dateRange.period') || 'Period:'}</strong>{' '}
                      {presetOptions.find(opt => opt.value === presetValue)?.label}
                    </p>
                    <div className="space-y-1">
                      <p>
                        <strong>{t('admin.dateRange.from') || 'From:'}</strong>{' '}
                        {(() => {
                          const d = parseDateTimeLocal(dateRange.startDate);
                          return d ? d.toLocaleString(t('locale') === 'fr' ? 'fr-CA' : 'en-CA') : '';
                        })()}
                      </p>
                      <p>
                        <strong>{t('admin.dateRange.to') || 'To:'}</strong>{' '}
                        {(() => {
                          const d = parseDateTimeLocal(dateRange.endDate);
                          return d ? d.toLocaleString(t('locale') === 'fr' ? 'fr-CA' : 'en-CA') : '';
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right column - Basic Filters */}
          <div className="filter-column">
            <div className="filter-section">
              <h3 className="filter-section-title">
                {t('admin.filters.basicFilters') || 'Basic Filters'}
              </h3>

              {/* Department */}
              <div className="filter-row">
                <label htmlFor="department" className="filter-label">
                  {t('admin.filters.department') || 'Department'}
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

              {/* User Type */}
              <div className="filter-row">
                <label htmlFor="user-type" className="filter-label">
                  {t('admin.filters.users') || 'User Type'}
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

              {/* Toggle Advanced Filters Button */}
              <div className="filter-row">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="filter-toggle-button"
                >
                  {showAdvancedFilters
                    ? (t('admin.filters.hideAdvanced') || '▲ Hide advanced filters')
                    : (t('admin.filters.showAdvanced') || '▼ Show advanced filters')
                  }
                </button>
              </div>

              {/* Advanced Filters */}
              {showAdvancedFilters && (
                <div className="filter-advanced-section">
                  <h4 className="filter-subsection-title">
                    {t('admin.filters.advancedFilters') || 'Advanced Filters'}
                  </h4>

                  {/* URL EN */}
                  <div className="filter-row">
                    <label htmlFor="url-en" className="filter-label">
                      {t('admin.filters.urlEn') || 'URL (EN)'}
                    </label>
                    <div className="filter-field">
                      <input
                        type="text"
                        id="url-en"
                        value={urlEn}
                        onChange={(e) => setUrlEn(e.target.value)}
                        placeholder={t('admin.filters.urlPlaceholder') || 'Filter by partial URL'}
                        className="filter-input"
                      />
                    </div>
                  </div>

                  {/* URL FR */}
                  <div className="filter-row">
                    <label htmlFor="url-fr" className="filter-label">
                      {t('admin.filters.urlFr') || 'URL (FR)'}
                    </label>
                    <div className="filter-field">
                      <input
                        type="text"
                        id="url-fr"
                        value={urlFr}
                        onChange={(e) => setUrlFr(e.target.value)}
                        placeholder={t('admin.filters.urlPlaceholder') || 'Filter by partial URL'}
                        className="filter-input"
                      />
                    </div>
                  </div>

                  {/* Answer Type */}
                  <div className="filter-row">
                    <label htmlFor="answer-type" className="filter-label">
                      {t('admin.filters.answerType') || 'Answer Type'}
                    </label>
                    <div className="filter-field">
                      <select
                        id="answer-type"
                        value={answerType}
                        onChange={(e) => setAnswerType(e.target.value)}
                        className="filter-select"
                      >
                        {answerTypeOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            onClick={handleApplyWithPersist}
            className="filter-button filter-button-primary"
          >
            {t('admin.filters.apply') || 'Apply Filters'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="filter-button filter-button-secondary"
          >
            {t('admin.filters.clearAll') || 'Clear All'}
          </button>
        </div>
      </div>
    </details>
  );
};

export default FilterPanelV2;
