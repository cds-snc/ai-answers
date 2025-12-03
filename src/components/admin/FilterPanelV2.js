// FilterPanelV2.js - Compact filter panel with daterangepicker
import React, { useState, useEffect, useRef } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import $ from 'jquery';
import moment from 'moment';
import 'daterangepicker';
import 'daterangepicker/daterangepicker.css';

const FilterPanelV2 = ({ onApplyFilters, onClearFilters, isVisible = false, storageKey = 'adminFilterPanelV2_v1' }) => {
  const { t } = useTranslations();
  const dateRangePickerRef = useRef(null);
  const dateRangePickerInstance = useRef(null);

  const [startDate, setStartDate] = useState(moment().subtract(6, 'days'));
  const [endDate, setEndDate] = useState(moment());
  const [department, setDepartment] = useState('');
  const [urlEn, setUrlEn] = useState('');
  const [urlFr, setUrlFr] = useState('');
  const [userType, setUserType] = useState('all');
  const [answerType, setAnswerType] = useState('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const STORAGE_KEY = storageKey;

  // Load saved state from localStorage
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed) return;

      if (parsed.startDate) setStartDate(moment(parsed.startDate));
      if (parsed.endDate) setEndDate(moment(parsed.endDate));
      if (typeof parsed.department === 'string') setDepartment(parsed.department);
      if (typeof parsed.urlEn === 'string') setUrlEn(parsed.urlEn);
      if (typeof parsed.urlFr === 'string') setUrlFr(parsed.urlFr);
      if (typeof parsed.userType === 'string') setUserType(parsed.userType);
      if (typeof parsed.answerType === 'string') setAnswerType(parsed.answerType);
      if (typeof parsed.showAdvancedFilters === 'boolean') setShowAdvancedFilters(parsed.showAdvancedFilters);
    } catch (err) {
      // ignore corrupt localStorage entries
    }
  }, [STORAGE_KEY]);

  // Initialize daterangepicker
  useEffect(() => {
    if (!dateRangePickerRef.current || dateRangePickerInstance.current) return;

    const locale = t('locale') === 'fr' ? 'fr' : 'en';
    const isFrench = locale === 'fr';

    // Configure daterangepicker with presets like feedback viewer
    const config = {
      startDate: startDate,
      endDate: endDate,
      opens: 'left',
      alwaysShowCalendars: true,
      locale: {
        format: 'YYYY/MM/DD',
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
        [isFrench ? 'Aujourd\'hui' : 'Today']: [moment(), moment()],
        [isFrench ? 'Hier' : 'Yesterday']: [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
        [isFrench ? '7 derniers jours' : 'Last 7 Days']: [moment().subtract(6, 'days'), moment()],
        [isFrench ? '30 derniers jours' : 'Last 30 Days']: [moment().subtract(29, 'days'), moment()],
        [isFrench ? 'Ce mois-ci' : 'This Month']: [moment().startOf('month'), moment().endOf('month')],
        [isFrench ? 'Le mois dernier' : 'Last Month']: [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
      }
    };

    const $picker = $(dateRangePickerRef.current);
    $picker.daterangepicker(config);

    // Store instance
    dateRangePickerInstance.current = $picker.data('daterangepicker');

    // Handle date selection
    $picker.on('apply.daterangepicker', function(ev, picker) {
      setStartDate(picker.startDate);
      setEndDate(picker.endDate);
    });

    // Cleanup
    return () => {
      if ($picker.data('daterangepicker')) {
        $picker.off('apply.daterangepicker');
        $picker.data('daterangepicker').remove();
      }
    };
  }, [t, startDate, endDate]);

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

  const handleApply = () => {
    const filters = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      department,
      urlEn,
      urlFr,
      userType,
      answerType
    };

    // Persist to localStorage
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload = {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
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

    onApplyFilters(filters);
  };

  const handleClear = () => {
    setStartDate(moment().subtract(6, 'days'));
    setEndDate(moment());
    setDepartment('');
    setUrlEn('');
    setUrlFr('');
    setUserType('all');
    setAnswerType('all');
    setShowAdvancedFilters(false);

    // Update daterangepicker
    if (dateRangePickerInstance.current) {
      dateRangePickerInstance.current.setStartDate(moment().subtract(6, 'days'));
      dateRangePickerInstance.current.setEndDate(moment());
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      // ignore
    }

    onClearFilters();
  };

  if (!isVisible) return null;

  return (
    <details className="filter-panel" open>
      <summary className="filter-panel-summary">
        {t('admin.filters.title') || 'Filters'}
      </summary>
      <div className="filter-panel-content">
        <div className="filter-grid">
          {/* Left column - Date Range */}
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

            {/* Advanced Filters - Collapsible */}
            <details
              className="filter-advanced-details"
              open={showAdvancedFilters}
              onToggle={(e) => setShowAdvancedFilters(e.target.open)}
            >
              <summary className="filter-advanced-summary">
                {t('admin.filters.showAdvanced')}
              </summary>
              <div className="filter-advanced-section">
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

                <div className="filter-row">
                  <label htmlFor="answer-type" className="filter-label">
                    {t('admin.filters.answerType') || 'Answer Type'}
                  </label>
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
            </details>
          </div>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            onClick={handleApply}
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
