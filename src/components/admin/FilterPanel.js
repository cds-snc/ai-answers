// FilterPanel.js - reimplemented using FilterPanelV2 UI
import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import $ from 'jquery';
import moment from 'moment';
import 'daterangepicker';
import 'daterangepicker/daterangepicker.css';

const FilterPanel = ({
  onApplyFilters,
  onClearFilters,
  isVisible = false,
  autoApply = false,
  applyButtonText = null,
  applyDisabled = false
}) => {
  const { t } = useTranslations();
  const dateRangePickerRef = useRef(null);
  const dateRangePickerInstance = useRef(null);

  // Helper function to format date for display (local time)
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

  // Helper to parse datetime string into a local Date object
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
    // Explicitly create Date with local time components
    return new Date(dateArr[0], dateArr[1] - 1, dateArr[2], timeArr[0], timeArr[1]);
  };

  // Default to last 7 days (local time)
  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
  };

  // Store dates as strings (like original FilterPanel.js)
  const [dateRange, setDateRange] = useState(getDefaultDates());
  const [department, setDepartment] = useState('');
  const [urlEn, setUrlEn] = useState('');
  const [urlFr, setUrlFr] = useState('');
  const [userType, setUserType] = useState('all');
  const [answerType, setAnswerType] = useState([]);
  const [partnerEval, setPartnerEval] = useState([]);
  const [aiEval, setAiEval] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // If autoApply is enabled, apply default filters on mount
  useEffect(() => {
    if (autoApply) {
      const startObj = parseDateTimeLocal(dateRange.startDate);
      const endObj = parseDateTimeLocal(dateRange.endDate);
      const defaultFilters = {
        startDate: startObj ? startObj.toISOString() : undefined,
        endDate: endObj ? endObj.toISOString() : undefined,
        department: '',
        urlEn: '',
        urlFr: '',
        userType: 'all',
        answerType: 'all',
        partnerEval: 'all',
        aiEval: 'all'
      };
      onApplyFilters(defaultFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize daterangepicker
  useEffect(() => {
    if (!dateRangePickerRef.current || dateRangePickerInstance.current) return;

    const locale = t('locale') === 'fr' ? 'fr' : 'en';
    const isFrench = locale === 'fr';

    // Parse current date range as local time
    const startDateObj = parseDateTimeLocal(dateRange.startDate);
    const endDateObj = parseDateTimeLocal(dateRange.endDate);

    // Configure daterangepicker with explicit local time
    const config = {
      startDate: startDateObj ? moment(startDateObj) : moment().subtract(6, 'days'),
      endDate: endDateObj ? moment(endDateObj) : moment(),
      opens: 'left',
      alwaysShowCalendars: true,
      timePicker: true,
      timePicker24Hour: true,
      timePickerSeconds: false,
      locale: {
        format: 'YYYY/MM/DD HH:mm',
        separator: ' - ',
        applyLabel: isFrench ? 'Appliquer' : 'Apply',
        cancelLabel: isFrench ? 'Annuler' : 'Cancel',
        fromLabel: isFrench ? 'De' : 'From',
        toLabel: isFrench ? 'À' : 'To',
        customRangeLabel: isFrench ? 'Plage personnalisée' : 'Custom Range',
        weekLabel: 'S',
        daysOfWeek: isFrench
          ? ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa']
          : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
        monthNames: isFrench
          ? ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
          : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        firstDay: isFrench ? 1 : 0
      },
      ranges: {
        [isFrench ? 'Aujourd\'hui' : 'Today']: [moment().startOf('day'), moment().endOf('day')],
        [isFrench ? 'Hier' : 'Yesterday']: [moment().subtract(1, 'days').startOf('day'), moment().subtract(1, 'days').endOf('day')],
        [isFrench ? '7 derniers jours' : 'Last 7 Days']: [moment().subtract(6, 'days').startOf('day'), moment()],
        [isFrench ? '30 derniers jours' : 'Last 30 Days']: [moment().subtract(29, 'days').startOf('day'), moment()],
        [isFrench ? 'Ce mois-ci' : 'This Month']: [moment().startOf('month'), moment().endOf('month')],
        [isFrench ? 'Le mois dernier' : 'Last Month']: [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
      }
    };

    const $picker = $(dateRangePickerRef.current);
    $picker.daterangepicker(config);

    // Store instance
    dateRangePickerInstance.current = $picker.data('daterangepicker');

    // Handle date selection - convert moment to local time string
    $picker.on('apply.daterangepicker', function (ev, picker) {
      // Get moment objects from picker and convert to Date objects (local time)
      const startDate = picker.startDate.toDate();
      const endDate = picker.endDate.toDate();

      // Format as local time strings (same as original FilterPanel.js)
      const newRange = {
        startDate: formatDateTimeLocal(startDate),
        endDate: formatDateTimeLocal(endDate)
      };
      setDateRange(newRange);
    });

    // Cleanup
    return () => {
      if ($picker.data('daterangepicker')) {
        $picker.off('apply.daterangepicker');
        $picker.data('daterangepicker').remove();
        dateRangePickerInstance.current = null;
      }
    };
  }, [t, dateRange.endDate, dateRange.startDate]);

  // Prevent nested details from closing parent details
  const handleNestedToggle = (e) => {
    e.stopPropagation();
  };

  // Handle "All" checkbox for answer types
  const handleAnswerTypeAll = (checked) => {
    if (checked) {
      setAnswerType([]);
    }
  };

  // Handle "All" checkbox for partner eval
  const handlePartnerEvalAll = (checked) => {
    if (checked) {
      setPartnerEval([]);
    }
  };

  // Handle "All" checkbox for AI eval
  const handleAiEvalAll = (checked) => {
    if (checked) {
      setAiEval([]);
    }
  };

  // Department options
  const departmentOptions = [
    { value: '', label: t('admin.filters.allDepartments') || 'All Departments' },
    { value: 'CBSA-ASFC', label: 'CBSA-ASFC' },
    { value: 'CEO-BEC', label: 'CEO-BEC' },
    { value: 'CDS-SNC', label: 'CDS-SNC' },
    { value: 'CRA-ARC', label: 'CRA-ARC' },
    { value: 'ECCC', label: 'ECCC' },
    { value: 'EDSC-ESDC', label: 'EDSC-ESDC' },
    { value: 'FIN', label: 'FIN' },
    { value: 'HC-SC', label: 'HC-SC' },
    { value: 'IRCC', label: 'IRCC' },
    { value: 'ISED-ISDE', label: 'ISED-ISDE' },
    { value: 'JUS', label: 'JUS' },
    { value: 'NRCan-RNCan', label: 'NRCan-RNCan' },
    { value: 'PHAC-ASPC', label: 'PHAC-ASPC' },
    { value: 'PSPC-SPAC', label: 'PSPC-SPAC' },
    { value: 'RCAANC-CIRNAC', label: 'RCAANC-CIRNAC' },
    { value: 'SAC-ISC', label: 'SAC-ISC' },
    { value: 'StatCan', label: 'StatCan' },
    { value: 'TBS-SCT', label: 'TBS-SCT' }
  ];

  // User type options
  const userTypeOptions = [
    { value: 'all', label: t('admin.filters.allUsers') || 'All Users' },
    { value: 'public', label: t('admin.filters.publicUsers') || 'Public Users' },
    { value: 'referredPublic', label: t('admin.filters.referredPublicUsers') || 'Public Referred' },
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

  // Partner evaluation options
  const partnerEvalOptions = [
    { value: 'all', label: t('admin.filters.allPartnerEvals') || 'All' },
    { value: 'noEval', label: t('admin.filters.noEvaluation') || 'No Evaluation' },
    { value: 'correct', label: t('metrics.dashboard.expertScored.correct') || 'Correct' },
    { value: 'needsImprovement', label: t('metrics.dashboard.expertScored.needsImprovement') || 'Needs Improvement' },
    { value: 'hasError', label: t('metrics.dashboard.expertScored.hasError') || 'Has Error' },
    { value: 'hasCitationError', label: t('metrics.dashboard.expertScored.hasCitationError') || 'Has Citation Error' },
    { value: 'harmful', label: t('metrics.dashboard.expertScored.harmful') || 'Harmful' }
  ];

  // AI evaluation options
  const aiEvalOptions = [
    { value: 'all', label: t('admin.filters.allAiEvals') || 'All' },
    { value: 'noEval', label: t('admin.filters.noEvaluation') || 'No Evaluation' },
    { value: 'correct', label: t('metrics.dashboard.aiScored.correct') || 'Correct' },
    { value: 'needsImprovement', label: t('metrics.dashboard.aiScored.needsImprovement') || 'Needs Improvement' },
    { value: 'hasError', label: t('metrics.dashboard.aiScored.hasError') || 'Has Error' },
    { value: 'hasCitationError', label: t('metrics.dashboard.aiScored.hasCitationError') || 'Has Citation Error' }
  ];

  const handleApply = () => {
    // Parse local datetime strings and convert to UTC ISO strings for backend
    const startObj = parseDateTimeLocal(dateRange.startDate);
    const endObj = parseDateTimeLocal(dateRange.endDate);

    const filters = {
      startDate: startObj ? startObj.toISOString() : undefined,
      endDate: endObj ? endObj.toISOString() : undefined,
      department,
      urlEn,
      urlFr,
      userType,
      answerType: answerType.length > 0 ? answerType.join(',') : 'all',
      partnerEval: partnerEval.length > 0 ? partnerEval.join(',') : 'all',
      aiEval: aiEval.length > 0 ? aiEval.join(',') : 'all'
    };

    onApplyFilters(filters);
  };

  const handleClear = () => {
    const defaultDates = getDefaultDates();
    setDateRange(defaultDates);
    setDepartment('');
    setUrlEn('');
    setUrlFr('');
    setUserType('all');
    setAnswerType([]);
    setPartnerEval([]);
    setAiEval([]);
    setShowAdvancedFilters(false);

    // Update daterangepicker
    if (dateRangePickerInstance.current) {
      const startObj = parseDateTimeLocal(defaultDates.startDate);
      const endObj = parseDateTimeLocal(defaultDates.endDate);
      if (startObj && endObj) {
        dateRangePickerInstance.current.setStartDate(moment(startObj));
        dateRangePickerInstance.current.setEndDate(moment(endObj));
      }
    }

    // Build default filters and notify parent
    const startObj = parseDateTimeLocal(defaultDates.startDate);
    const endObj = parseDateTimeLocal(defaultDates.endDate);
    const defaultFilters = {
      startDate: startObj ? startObj.toISOString() : undefined,
      endDate: endObj ? endObj.toISOString() : undefined,
      department: '',
      urlEn: '',
      urlFr: '',
      userType: 'all',
      answerType: 'all',
      partnerEval: 'all',
      aiEval: 'all'
    };

    if (autoApply) {
      onApplyFilters(defaultFilters);
    }
    onClearFilters(defaultFilters);
  };

  if (!isVisible) return null;

  return (
    <details className="filter-panel" open>
      <summary className="filter-panel-summary">
        {t('admin.filters.title') || 'Filters'}
      </summary>
      <div className="filter-panel-content">
        <div className="filter-grid">
          {/* Left column - Date Range and URL Filters */}
          <div className="filter-column">
            <div className="filter-row">
              <label htmlFor="dateRangePicker" className="filter-label">
                {t('admin.filters.dateRange') || 'Date Range'}
              </label>
              <input
                ref={dateRangePickerRef}
                type="text"
                id="dateRangePicker"
                className="filter-input"
                readOnly
                style={{ backgroundColor: 'white', cursor: 'pointer' }}
              />
            </div>

            <div className="filter-row">
              <label htmlFor="url-en" className="filter-label">
                {t('admin.filters.urlEn') || 'URL (EN)'}
              </label>
              <input
                type="text"
                id="url-en"
                value={urlEn}
                onChange={(e) => setUrlEn(e.target.value)}
                placeholder={t('admin.filters.urlPlaceholder') || 'Filter by partial URL'}
                className="filter-input"
              />
            </div>

            <div className="filter-row">
              <label htmlFor="url-fr" className="filter-label">
                {t('admin.filters.urlFr') || 'URL (FR)'}
              </label>
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

          {/* Right column - Basic Filters */}
          <div className="filter-column">
            <div className="filter-row">
              <label htmlFor="department" className="filter-label">
                {t('admin.filters.department') || 'Department'}
              </label>
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

            <div className="filter-row">
              <label htmlFor="user-type" className="filter-label">
                {t('admin.filters.users') || 'User Type'}
              </label>
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

            {/* Advanced Filters - Collapsible (Closed by default) */}
            <details
              className="filter-advanced-details"
              open={showAdvancedFilters}
              onToggle={(e) => setShowAdvancedFilters(e.target.open)}
            >
              <summary className="filter-advanced-summary">
                {t('admin.filters.showAdvanced')}
              </summary>
              <div className="filter-advanced-section mt-100">
                <div className="filter-row">
                  <details className="filter-checkbox-details" onToggle={handleNestedToggle}>
                    <summary className="filter-label">
                      {t('admin.filters.answerType') || 'Answer Type'}
                      {answerType.length > 0 && <span className="filter-count"> ({answerType.length})</span>}
                    </summary>
                    <div className="filter-checkbox-group">
                      <label className="filter-checkbox-label">
                        <input
                          type="checkbox"
                          checked={answerType.length === 0}
                          onChange={(e) => handleAnswerTypeAll(e.target.checked)}
                          className="filter-checkbox"
                        />
                        {t('admin.filters.allAnswerTypes') || 'All Answer Types'}
                      </label>
                      {answerTypeOptions
                        .filter(option => option.value !== 'all')
                        .map(option => (
                          <label key={option.value} className="filter-checkbox-label">
                            <input
                              type="checkbox"
                              value={option.value}
                              checked={answerType.includes(option.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAnswerType([...answerType, option.value]);
                                } else {
                                  setAnswerType(answerType.filter(v => v !== option.value));
                                }
                              }}
                              className="filter-checkbox"
                            />
                            {option.label}
                          </label>
                        ))}
                    </div>
                  </details>
                </div>
                <div className="filter-row">
                  <details className="filter-checkbox-details" onToggle={handleNestedToggle}>
                    <summary className="filter-label">
                      {t('admin.filters.partnerEval') || 'Partner Evaluation'}
                      {partnerEval.length > 0 && <span className="filter-count"> ({partnerEval.length})</span>}
                    </summary>
                    <div className="filter-checkbox-group">
                      <label className="filter-checkbox-label">
                        <input
                          type="checkbox"
                          checked={partnerEval.length === 0}
                          onChange={(e) => handlePartnerEvalAll(e.target.checked)}
                          className="filter-checkbox"
                        />
                        {t('admin.filters.allPartnerEvals') || 'All'}
                      </label>
                      {partnerEvalOptions
                        .filter(option => option.value !== 'all')
                        .map(option => (
                          <label key={option.value} className="filter-checkbox-label">
                            <input
                              type="checkbox"
                              value={option.value}
                              checked={partnerEval.includes(option.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPartnerEval([...partnerEval, option.value]);
                                } else {
                                  setPartnerEval(partnerEval.filter(v => v !== option.value));
                                }
                              }}
                              className="filter-checkbox"
                            />
                            {option.label}
                          </label>
                        ))}
                    </div>
                  </details>
                </div>
                <div className="filter-row mb-100">
                  <details className="filter-checkbox-details" onToggle={handleNestedToggle}>
                    <summary className="filter-label">
                      {t('admin.filters.aiEval') || 'AI Evaluation'}
                      {aiEval.length > 0 && <span className="filter-count"> ({aiEval.length})</span>}
                    </summary>
                    <div className="filter-checkbox-group">
                      <label className="filter-checkbox-label">
                        <input
                          type="checkbox"
                          checked={aiEval.length === 0}
                          onChange={(e) => handleAiEvalAll(e.target.checked)}
                          className="filter-checkbox"
                        />
                        {t('admin.filters.allAiEvals') || 'All'}
                      </label>
                      {aiEvalOptions
                        .filter(option => option.value !== 'all')
                        .map(option => (
                          <label key={option.value} className="filter-checkbox-label">
                            <input
                              type="checkbox"
                              value={option.value}
                              checked={aiEval.includes(option.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAiEval([...aiEval, option.value]);
                                } else {
                                  setAiEval(aiEval.filter(v => v !== option.value));
                                }
                              }}
                              className="filter-checkbox"
                            />
                            {option.label}
                          </label>
                        ))}
                    </div>
                  </details>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="filter-actions">
          <button
            id="filter-apply-button"
            type="button"
            onClick={handleApply}
            className="filter-button filter-button-primary"
            disabled={applyDisabled}
          >
            {applyButtonText || t('admin.filters.apply') || 'Apply Filters'}
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



export default FilterPanel;
