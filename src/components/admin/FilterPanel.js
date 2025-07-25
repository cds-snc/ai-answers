// FilterPanel.js
import React, { useState, useEffect } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';

const FilterPanel = ({ onApplyFilters, onClearFilters, isVisible = false }) => {
  const { t } = useTranslations();
  
  // Helper function to format date for datetime-local input
  const formatDateTimeLocal = (date) => {
    const d = new Date(date);
    // Subtract timezone offset to get local time
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  // Default to last 24 hours
  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
  };

  const [dateRange, setDateRange] = useState(getDefaultDates());
  const [filterType, setFilterType] = useState('preset');
  const [presetValue, setPresetValue] = useState('1');
  const [department, setDepartment] = useState('');
  const [referringUrl, setReferringUrl] = useState('');

  // Department options based on systemPrompt modules
  const departmentOptions = [
    { value: '', label: t('admin.filters.allDepartments') },
    { value: 'CRA-ARC', label: 'CRA-ARC' },
    { value: 'EDSC-ESDC', label: 'EDSC-ESDC' },
    { value: 'SAC-ISC', label: 'SAC-ISC' },
    { value: 'PSPC-SPAC', label: 'PSPC-SPAC' },
    { value: 'IRCC', label: 'IRCC' }
  ];

  // Preset options
  const presetOptions = [
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
  ];

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
  }, [filterType, presetValue]);

  const handleApply = () => {
    let filters = {
      department,
      referringUrl,
      filterType
    };
    if (filterType === 'preset') {
      filters.presetValue = presetValue;
      if (presetValue !== 'all') {
        filters.startDate = dateRange.startDate + ':00Z';
        filters.endDate = dateRange.endDate + ':00Z';
      }
      // If 'all', do not send startDate/endDate
    } else if (filterType === 'custom') {
      filters.startDate = dateRange.startDate + ':00Z';
      filters.endDate = dateRange.endDate + ':00Z';
    }
    onApplyFilters(filters);
  };

  const handleClear = () => {
    const defaultDates = getDefaultDates();
    setDateRange(defaultDates);
    setFilterType('preset');
    setPresetValue('1');
    setDepartment('');
    setReferringUrl('');
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
                        {new Date(dateRange.startDate + ':00Z').toLocaleString(t('locale') === 'fr' ? 'fr-CA' : 'en-CA')}
                      </p>
                      <p>
                        <strong>{t('admin.dateRange.to')}</strong>{' '}
                        {new Date(dateRange.endDate + ':00Z').toLocaleString(t('locale') === 'fr' ? 'fr-CA' : 'en-CA')}
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
          </div>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            onClick={handleApply}
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