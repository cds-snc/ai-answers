// FilterPanel.js - reimplemented using FilterPanelV2 UI
import React, { useState, useEffect, useRef } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import $ from 'jquery';
import moment from '../../utils/momentSetup.js';
import 'daterangepicker';
import 'daterangepicker/daterangepicker.css';
import { PARTNER_DEPARTMENTS } from '../../constants/partnerDepartments.js';

const FilterPanel = ({
  lang,
  onApplyFilters,
  onClearFilters,
  isVisible = false,
  autoApply = false,
  applyButtonText = null,
  applyDisabled = false,
  defaultUserType = 'all',
  defaultOpen = true,
  filterLoading = false,
  filterError = null,
  filterResultCount = null,
  hasAppliedFilters = false
}) => {
  const { t } = useTranslations(lang);
  const dateRangePickerRef = useRef(null);
  const dateRangePickerInstance = useRef(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // Set to true by handleClear so the auto-close effect doesn't immediately
  // re-close the panel after the clear re-fetch completes.
  const skipNextAutoClose = useRef(false);

  // Collapse when results load successfully; keep open on error or no results.
  // Skipped once after a Clear so the panel stays open for the user to re-filter.
  useEffect(() => {
    if (!hasAppliedFilters || filterLoading) return;
    if (skipNextAutoClose.current) {
      skipNextAutoClose.current = false;
      return;
    }
    if (filterError || filterResultCount === 0) {
      setIsOpen(true);
    } else if (filterResultCount > 0) {
      setIsOpen(false);
    }
  }, [hasAppliedFilters, filterLoading, filterError, filterResultCount]);

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

  // End is today 23:59 so the current day's data is included. The API queries
  // createdAt up to the end date that's sent, so today returns normally — there
  // is no backend cap at yesterday.
  const getDefaultDates = () => {
    const end = new Date();
    end.setHours(23, 59, 59, 0); // today, end of day
    const start = new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
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
  const [userType, setUserType] = useState(defaultUserType);
  const [answerType, setAnswerType] = useState([]);
  const [partnerEval, setPartnerEval] = useState([]);
  const [aiEval, setAiEval] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Tracks what has actually been applied — drives the pill display.
  // null means nothing has been applied yet (no pills shown).
  const [appliedFilters, setAppliedFilters] = useState(null);

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
        userType: defaultUserType,
        answerType: 'all',
        partnerEval: 'all',
        aiEval: 'all'
      };
      onApplyFilters(defaultFilters);
      setAppliedFilters(defaultFilters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize daterangepicker
  useEffect(() => {
    if (!dateRangePickerRef.current || dateRangePickerInstance.current) return;
    if (typeof window !== 'undefined') {
      window.moment = moment;
    }
    if (typeof globalThis !== 'undefined') {
      globalThis.moment = moment;
    }

    const locale = t('locale') === 'fr' ? 'fr' : 'en';
    const isFrench = locale === 'fr';

    // Parse current date range as local time
    const startDateObj = parseDateTimeLocal(dateRange.startDate);
    const endDateObj = parseDateTimeLocal(dateRange.endDate);

    // Configure daterangepicker with explicit local time
    const config = {
      startDate: startDateObj ? moment(startDateObj) : moment().subtract(6, 'days'),
      endDate: endDateObj ? moment(endDateObj) : moment(),
      opens: 'right',
      alwaysShowCalendars: true,
      maxDate: moment().endOf('day'),
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
        [isFrench ? "Aujourd'hui" : 'Today']: [moment().startOf('day'), moment().endOf('day')],
        [isFrench ? 'Hier' : 'Yesterday']: [moment().subtract(1, 'days').startOf('day'), moment().subtract(1, 'days').endOf('day')],
        [isFrench ? '7 derniers jours' : 'Last 7 Days']: [moment().subtract(6, 'days').startOf('day'), moment().endOf('day')],
        [isFrench ? '30 derniers jours' : 'Last 30 Days']: [moment().subtract(29, 'days').startOf('day'), moment().endOf('day')],
        [isFrench ? 'Ce mois-ci' : 'This Month']: [moment().startOf('month'), moment().endOf('day')],
        [isFrench ? 'Le mois dernier' : 'Last Month']: [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
      }
    };

    const $picker = $(dateRangePickerRef.current);
    $picker.daterangepicker(config);

    // Store instance
    dateRangePickerInstance.current = $picker.data('daterangepicker');

    // Handle date selection - convert moment to local time string
    $picker.on('apply.daterangepicker', function (ev, picker) {
      const startDate = picker.startDate.toDate();
      const endDate = picker.endDate.toDate();
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 0);
      setDateRange({
        startDate: formatDateTimeLocal(startDate),
        endDate: formatDateTimeLocal(endDate)
      });
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

  // Department options — partner list is shared across the app
  const departmentOptions = [
    { value: '', label: t('admin.filters.allDepartments') || 'All Departments' },
    ...PARTNER_DEPARTMENTS.map(d => ({ value: d, label: d })),
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
    { value: 'all', label: t('admin.filters.allAnswerTypes') },
    { value: 'not-gc', label: t('admin.filters.answerTypeNotGc') },
    { value: 'clarifying-question', label: t('admin.filters.answerTypeClarifying') },
    { value: 'pt-muni', label: t('admin.filters.answerTypePtMuni') },
    { value: 'normal', label: t('admin.filters.answerTypeNormal') }
  ];

  // Partner evaluation options
  const partnerEvalOptions = [
    { value: 'all', label: t('admin.filters.allPartnerEvals') },
    { value: 'noEval', label: t('admin.filters.noEvaluation') },
    { value: 'correct', label: t('admin.filters.evalCorrect') },
    { value: 'needsImprovement', label: t('admin.filters.evalNeedsImprovement') },
    { value: 'hasError', label: t('admin.filters.evalHasError') },
    { value: 'hasCitationError', label: t('admin.filters.evalHasCitationError') },
    { value: 'harmful', label: t('admin.filters.evalHarmful') }
  ];

  // AI evaluation options
  const aiEvalOptions = [
    { value: 'all', label: t('admin.filters.allAiEvals') },
    { value: 'noEval', label: t('admin.filters.noEvaluation') },
    { value: 'correct', label: t('admin.filters.evalCorrect') },
    { value: 'needsImprovement', label: t('admin.filters.evalNeedsImprovement') },
    { value: 'hasError', label: t('admin.filters.evalHasError') },
    { value: 'hasCitationError', label: t('admin.filters.evalHasCitationError') }
  ];

  const handleApply = () => {
    // Prefer the picker's live state over React state: the picker tracks the
    // user's calendar selection in real-time, so dates are correct even when
    // the user chose a custom range without clicking Apply inside the calendar.
    const picker = dateRangePickerInstance.current;
    const rawStart = picker ? picker.startDate.toDate() : parseDateTimeLocal(dateRange.startDate);
    const rawEnd = picker ? picker.endDate.toDate() : parseDateTimeLocal(dateRange.endDate);
    if (rawStart) rawStart.setHours(0, 0, 0, 0);
    if (rawEnd) rawEnd.setHours(23, 59, 59, 0);
    const startDateStr = rawStart ? formatDateTimeLocal(rawStart) : dateRange.startDate;
    const endDateStr = rawEnd ? formatDateTimeLocal(rawEnd) : dateRange.endDate;

    // Sync React state so the input reflects the applied dates if they changed.
    if (startDateStr !== dateRange.startDate || endDateStr !== dateRange.endDate) {
      setDateRange({ startDate: startDateStr, endDate: endDateStr });
    }

    const startObj = parseDateTimeLocal(startDateStr);
    const endObj = parseDateTimeLocal(endDateStr);

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

    setAppliedFilters(filters);
    onApplyFilters(filters);
  };

  const handleClear = () => {
    const defaultDates = getDefaultDates();
    setDateRange(defaultDates);
    setDepartment('');
    setUrlEn('');
    setUrlFr('');
    setUserType(defaultUserType);
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
      userType: defaultUserType,
      answerType: 'all',
      partnerEval: 'all',
      aiEval: 'all'
    };

    setAppliedFilters(null);
    setIsOpen(true);
    skipNextAutoClose.current = true;
    if (autoApply) {
      onApplyFilters(defaultFilters);
    } else {
      onClearFilters(defaultFilters);
    }
  };

  // Remove a single filter pill. For multi-select filters, `value` is the specific
  // value to remove; omit to reset the whole filter to default.
  const removeFilter = (key, value) => {
    const next = { ...appliedFilters };
    if (key === 'date') {
      const d = getDefaultDates();
      setDateRange(d);
      const s = parseDateTimeLocal(d.startDate);
      const e = parseDateTimeLocal(d.endDate);
      if (dateRangePickerInstance.current && s && e) {
        dateRangePickerInstance.current.setStartDate(moment(s));
        dateRangePickerInstance.current.setEndDate(moment(e));
      }
      next.startDate = s ? s.toISOString() : undefined;
      next.endDate = e ? e.toISOString() : undefined;
    } else if (key === 'department') { setDepartment(''); next.department = ''; }
    else if (key === 'userType') { setUserType(defaultUserType); next.userType = defaultUserType; }
    else if (key === 'urlEn') { setUrlEn(''); next.urlEn = ''; }
    else if (key === 'urlFr') { setUrlFr(''); next.urlFr = ''; }
    else if (key === 'answerType') {
      const remaining = (appliedFilters.answerType || '').split(',').filter(v => v !== value);
      setAnswerType(remaining);
      next.answerType = remaining.length > 0 ? remaining.join(',') : 'all';
    } else if (key === 'partnerEval') {
      const remaining = (appliedFilters.partnerEval || '').split(',').filter(v => v !== value);
      setPartnerEval(remaining);
      next.partnerEval = remaining.length > 0 ? remaining.join(',') : 'all';
    } else if (key === 'aiEval') {
      const remaining = (appliedFilters.aiEval || '').split(',').filter(v => v !== value);
      setAiEval(remaining);
      next.aiEval = remaining.length > 0 ? remaining.join(',') : 'all';
    }
    setAppliedFilters(next);
    onApplyFilters(next);
  };

  // Build pills from applied state.
  // Blue info pills (no ×) show the current state for always-present filters.
  // Grey closable pills (×) show when a filter differs from its default.
  const buildPills = () => {
    if (!appliedFilters) return [];
    const locale = lang === 'fr' ? 'fr-CA' : 'en-CA';
    const dateOpts = { year: 'numeric', month: 'short', day: 'numeric' };
    const pills = [];

    if (appliedFilters.startDate && appliedFilters.endDate) {
      const defaults = getDefaultDates();
      // appliedFilters dates are ISO UTC strings; extract local date for comparison
      // against the datetime-local strings in defaults (T23:59 local = next UTC day
      // in UTC- timezones, so substring on the raw ISO string gives the wrong date).
      const isoToLocalDate = (iso) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      // Only show as a non-closable info pill on dashboards that auto-load with
      // defaults (autoApply=true, i.e. PartnerDashboard). All other dashboards
      // always show the date pill with an X so the user can change it.
      const isDefaultDate = autoApply &&
        isoToLocalDate(appliedFilters.startDate) === defaults.startDate.substring(0, 10) &&
        isoToLocalDate(appliedFilters.endDate) === defaults.endDate.substring(0, 10);
      const s = new Date(appliedFilters.startDate).toLocaleDateString(locale, dateOpts);
      const e = new Date(appliedFilters.endDate).toLocaleDateString(locale, dateOpts);
      pills.push({ key: 'date', label: `${s} – ${e}`, info: isDefaultDate });
    }

    const deptIsDefault = !appliedFilters.department;
    pills.push({
      key: 'department',
      label: deptIsDefault ? t('admin.filters.allDepartments') : appliedFilters.department,
      info: deptIsDefault,
    });

    const userIsDefault = !appliedFilters.userType || appliedFilters.userType === defaultUserType;
    if (userIsDefault) {
      pills.push({ key: 'usersAll', label: `${t('admin.filters.users')}: ${t('admin.filters.allUsers')}`, info: true });
    } else {
      const userOpt = userTypeOptions.find(o => o.value === appliedFilters.userType);
      pills.push({ key: 'userType', label: userOpt ? userOpt.label : appliedFilters.userType });
    }

    const advancedDefault =
      (!appliedFilters.answerType || appliedFilters.answerType === 'all') &&
      (!appliedFilters.partnerEval || appliedFilters.partnerEval === 'all') &&
      (!appliedFilters.aiEval || appliedFilters.aiEval === 'all') &&
      !appliedFilters.urlEn &&
      !appliedFilters.urlFr;

    if (advancedDefault) {
      pills.push({ key: 'advancedAll', label: t('admin.filters.advancedAll'), info: true });
    } else {
      if (appliedFilters.urlEn) pills.push({ key: 'urlEn', label: `${t('admin.filters.urlEn')}: ${appliedFilters.urlEn}` });
      if (appliedFilters.urlFr) pills.push({ key: 'urlFr', label: `${t('admin.filters.urlFr')}: ${appliedFilters.urlFr}` });
      if (appliedFilters.answerType && appliedFilters.answerType !== 'all') {
        appliedFilters.answerType.split(',').forEach(val => {
          const opt = answerTypeOptions.find(o => o.value === val);
          pills.push({ key: 'answerType', value: val, label: opt ? opt.label : val });
        });
      }
      if (appliedFilters.partnerEval && appliedFilters.partnerEval !== 'all') {
        appliedFilters.partnerEval.split(',').forEach(val => {
          const opt = partnerEvalOptions.find(o => o.value === val);
          pills.push({ key: 'partnerEval', value: val, label: `${t('admin.filters.partnerEval')}: ${opt ? opt.label : val}` });
        });
      }
      if (appliedFilters.aiEval && appliedFilters.aiEval !== 'all') {
        appliedFilters.aiEval.split(',').forEach(val => {
          const opt = aiEvalOptions.find(o => o.value === val);
          pills.push({ key: 'aiEval', value: val, label: `${t('admin.filters.aiEval')}: ${opt ? opt.label : val}` });
        });
      }
    }

    return pills;
  };

  const pills = buildPills();

  if (!isVisible) return null;

  return (
    <div className="filter-panel-wrapper">
    <details className="filter-panel" open={isOpen} onToggle={(e) => setIsOpen(e.target.open)}>
      <summary className="filter-panel-summary">
        <SlidersHorizontal className="filter-panel-summary__icon" aria-hidden="true" />
        {t('admin.filters.title')}
        {appliedFilters && pills.length > 0 && (
          <span className="filter-panel-summary__count">{pills.length}</span>
        )}
      </summary>
      <div className="filter-panel-content">
        {/* Row 1: date range, partner institution, users */}
        <div className="filter-main-row">
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
        </div>

        {/* Row 2: advanced filters */}
        <p className="filter-advanced-title">{t('admin.filters.advancedTitle')}</p>
        <details
          className="filter-advanced-details"
          open={showAdvancedFilters}
          onToggle={(e) => { e.stopPropagation(); setShowAdvancedFilters(e.target.open); }}
        >
          <summary className="filter-advanced-summary">
            {t('admin.filters.showAdvanced')}
          </summary>
          <div className="filter-advanced-grid">
            {/* URL column — EN and FR stacked */}
            <div className="filter-column">
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

            {/* Answer type column */}
            <details className="filter-checkbox-details" open onToggle={(e) => e.stopPropagation()}>
              <summary className="filter-label">
                {t('admin.filters.answerType') || 'Answer Type'}
                {answerType.length > 0 && <span className="filter-count"> ({answerType.length})</span>}
              </summary>
              <div className="filter-checkbox-group">
                <label className="filter-checkbox-label">
                  <input type="checkbox" checked={answerType.length === 0} onChange={(e) => handleAnswerTypeAll(e.target.checked)} className="filter-checkbox" />
                  {t('admin.filters.allAnswerTypes') || 'All'}
                </label>
                {answerTypeOptions.filter(o => o.value !== 'all').map(option => (
                  <label key={option.value} className="filter-checkbox-label">
                    <input type="checkbox" value={option.value} checked={answerType.includes(option.value)} onChange={(e) => { if (e.target.checked) { setAnswerType([...answerType, option.value]); } else { setAnswerType(answerType.filter(v => v !== option.value)); } }} className="filter-checkbox" />
                    {option.label}
                  </label>
                ))}
              </div>
            </details>

            {/* Partner eval column */}
            <details className="filter-checkbox-details" open onToggle={(e) => e.stopPropagation()}>
              <summary className="filter-label">
                {t('admin.filters.partnerEval') || 'Partner Evaluation'}
                {partnerEval.length > 0 && <span className="filter-count"> ({partnerEval.length})</span>}
              </summary>
              <div className="filter-checkbox-group">
                <label className="filter-checkbox-label">
                  <input type="checkbox" checked={partnerEval.length === 0} onChange={(e) => handlePartnerEvalAll(e.target.checked)} className="filter-checkbox" />
                  {t('admin.filters.allPartnerEvals') || 'All'}
                </label>
                {partnerEvalOptions.filter(o => o.value !== 'all').map(option => (
                  <label key={option.value} className="filter-checkbox-label">
                    <input type="checkbox" value={option.value} checked={partnerEval.includes(option.value)} onChange={(e) => { if (e.target.checked) { setPartnerEval([...partnerEval, option.value]); } else { setPartnerEval(partnerEval.filter(v => v !== option.value)); } }} className="filter-checkbox" />
                    {option.label}
                  </label>
                ))}
              </div>
            </details>

            {/* AI eval column */}
            <details className="filter-checkbox-details" open onToggle={(e) => e.stopPropagation()}>
              <summary className="filter-label">
                {t('admin.filters.aiEval') || 'AI Evaluation'}
                {aiEval.length > 0 && <span className="filter-count"> ({aiEval.length})</span>}
              </summary>
              <div className="filter-checkbox-group">
                <label className="filter-checkbox-label">
                  <input type="checkbox" checked={aiEval.length === 0} onChange={(e) => handleAiEvalAll(e.target.checked)} className="filter-checkbox" />
                  {t('admin.filters.allAiEvals') || 'All'}
                </label>
                {aiEvalOptions.filter(o => o.value !== 'all').map(option => (
                  <label key={option.value} className="filter-checkbox-label">
                    <input type="checkbox" value={option.value} checked={aiEval.includes(option.value)} onChange={(e) => { if (e.target.checked) { setAiEval([...aiEval, option.value]); } else { setAiEval(aiEval.filter(v => v !== option.value)); } }} className="filter-checkbox" />
                    {option.label}
                  </label>
                ))}
              </div>
            </details>
          </div>
        </details>

        <div className="filter-actions">
          <button
            type="button"
            onClick={handleClear}
            className="filter-button filter-button-secondary"
          >
            {t('admin.filters.clearAll')}
          </button>
          <button
            id="filter-apply-button"
            type="button"
            onClick={handleApply}
            className="filter-button filter-button-primary"
            disabled={applyDisabled}
          >
            {applyButtonText || t('admin.filters.apply')}
          </button>
        </div>
      </div>
    </details>

    {pills.length > 0 && (
      <div className="filter-bar__pills-row">
        {pills.map(pill => (
          <span
            key={pill.value != null ? `${pill.key}-${pill.value}` : pill.key}
            className={`filter-pill${pill.info ? ' filter-pill--info' : ' filter-pill--closable'}`}
          >
            {pill.label}
            {!pill.info && (
              <button
                type="button"
                className="filter-pill__close"
                onClick={() => removeFilter(pill.key, pill.value)}
                aria-label={t('dashboardFilter.removeFilter')}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {pills.some(p => !p.info) && (
          <button
            type="button"
            className="filter-pills__clear-all"
            onClick={handleClear}
          >
            {t('admin.filters.clearAll')}
          </button>
        )}
      </div>
    )}
    </div>
  );
};



export default FilterPanel;
