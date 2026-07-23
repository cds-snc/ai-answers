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
  hasAppliedFilters = false,
  // Partner/Metrics dashboards go through metrics-common.js's
  // parseRequestFilters, which pushes partnerEval/aiEval as two separate
  // sequential $match pipeline stages rather than a combinable condition —
  // neither the AND/OR evalLogic toggle nor the "Content issue" pseudo-
  // category are wired up there yet, so both are hidden rather than
  // offering a choice that silently matches nothing. Chat/Eval/AutoEval
  // (via the shared getChatFilterConditions) support both and keep the
  // default.
  showEvalLogic = true,
  // Hides the whole "More filters" section (URL, answer type, partner
  // eval, AI eval) — for a dashboard whose charts don't break results down
  // by those categories, applying one just silently shrinks every number
  // with no visible way to tell why (see PartnerDashboard's own comment).
  showAdvancedSection = true
}) => {
  const { t } = useTranslations(lang);
  const dateRangePickerRef = useRef(null);
  const dateRangePickerInstance = useRef(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // Drives aria-expanded on the date-range trigger input.
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  // Set to true by handleClear so the auto-close effect doesn't immediately
  // re-close the panel after the clear re-fetch completes.
  const skipNextAutoClose = useRef(false);
  // Holds the previously applied date range so cancel on the picker restores it.
  const datePickerCancelRestoreRef = useRef(null);
  // Tracks the start date clicked when only one date has been selected so far.
  // If the user clicks outside the picker before picking an end date, we apply
  // a same-day range rather than reverting to the previous selection.
  const pendingStartRef = useRef(null);

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
  // How partnerEval and aiEval combine when both have a selection — only
  // matters once both are non-empty; harmless otherwise. Defaults to 'and'
  // to preserve existing filter behaviour for anyone who never touches it.
  const [evalLogic, setEvalLogic] = useState('and');
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
        aiEval: 'all',
        evalLogic: 'and'
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
    pendingStartRef.current = null;

    // When the user clicks a date cell, track whether an end date was also set.
    // If only a start was clicked (endDate is null), save it so outsideClick can
    // apply it as a same-day range instead of reverting.
    const instance = dateRangePickerInstance.current;
    instance.container.on('mouseup.singleclick', 'td.available', function () {
      if (!instance.endDate) {
        pendingStartRef.current = instance.startDate ? instance.startDate.clone() : null;
      } else {
        pendingStartRef.current = null;
      }
    });

    // --- Keyboard accessibility patch for the daterangepicker plugin ---
    // The plugin only wires up mouse interaction for its calendar grid and
    // preset list (mousedown/click, no tabindex or keydown support), and its
    // own keydown handler closes the popup on Tab or Enter — which would
    // otherwise make the whole widget unusable without a mouse (WCAG 2.1.1).
    // We drop that handler and layer roving-tabindex keyboard navigation,
    // labelling, and focus management on top instead.
    $picker.off('keydown.daterangepicker');

    const container = instance.container;

    // Focus the trigger input without letting the plugin's own
    // focus.daterangepicker handler immediately reopen the popup.
    const refocusInput = () => {
      $picker.off('focus.daterangepicker');
      dateRangePickerRef.current.focus();
      $picker.on('focus.daterangepicker', $.proxy(instance.show, instance));
    };

    const hideAndRefocus = () => {
      instance.hide();
      refocusInput();
    };

    // Keeps exactly one cell per rendered calendar tabbable (roving
    // tabindex), and gives every cell/nav control the name/role a keyboard
    // or screen-reader user needs. Re-run after every re-render, since the
    // plugin replaces the whole calendar-table innerHTML on month nav, date
    // selection, or range selection.
    const setupCalendarA11y = () => {
      container.find('td.available').attr('tabindex', '-1');
      container.find('.drp-calendar').each(function (sideIndex, calEl) {
        const $cal = $(calEl);
        const side = $cal.hasClass('left') ? 'left' : 'right';
        const calendarDates = (side === 'left' ? instance.leftCalendar : instance.rightCalendar).calendar;

        $cal.find('td[data-title]').each(function () {
          const $cell = $(this);
          const match = /^r(\d+)c(\d+)$/.exec($cell.attr('data-title') || '');
          if (!match || !calendarDates) return;
          const row = parseInt(match[1], 10);
          const col = parseInt(match[2], 10);
          const cellDate = calendarDates[row] && calendarDates[row][col];
          if (!cellDate) return;
          $cell.attr({
            role: 'gridcell',
            'aria-label': cellDate.clone().locale(isFrench ? 'fr' : 'en').format('LL'),
            'aria-selected': $cell.hasClass('active') ? 'true' : 'false'
          });
        });

        const $target = $cal.find('td.available.active').first().length
          ? $cal.find('td.available.active').first()
          : ($cal.find('td.available.today').first().length
            ? $cal.find('td.available.today').first()
            : $cal.find('td.available').first());
        $target.attr('tabindex', '0');
      });

      container.find('.ranges li').attr({ tabindex: '0', role: 'button' });
      container.find('th.prev').attr({
        tabindex: '0',
        role: 'button',
        'aria-label': t('admin.filters.previousMonth')
      });
      container.find('th.next').attr({
        tabindex: '0',
        role: 'button',
        'aria-label': t('admin.filters.nextMonth')
      });

      // Selecting a date (keyboard or mouse, since cells are now focusable)
      // replaces the calendar's innerHTML, which detaches the focused cell
      // and silently drops focus to <body> mid-interaction. Recover it onto
      // the newly-rendered roving cell so the popup doesn't look like it
      // lost focus — restricted to while the popup is actually open, so
      // this never fires on the initial (hidden) render.
      if (instance.isShowing && document.activeElement === document.body) {
        const $roving = container.find('td.available[tabindex="0"]').first();
        if ($roving.length) $roving.trigger('focus');
      }
    };
    setupCalendarA11y();

    const gridObserver = new MutationObserver(setupCalendarA11y);
    container.find('.calendar-table').each(function () {
      gridObserver.observe(this, { childList: true });
    });

    // Close the popup once focus genuinely leaves it (e.g. Tab to the next
    // field) — the plugin used to do this itself via the keydown handler we
    // removed above, but that handler closed on every Tab, including a Tab
    // meant to move *into* the popup. This instead only closes when focus
    // lands somewhere outside both the trigger input and the popup.
    const isInsidePickerOrInput = (el) =>
      !!el && (el === dateRangePickerRef.current || (container[0] && container[0].contains(el)));

    const closeIfFocusLeavesPicker = (e) => {
      if (!instance.isShowing) return;
      const next = e.relatedTarget;
      if (next !== undefined) {
        if (!isInsidePickerOrInput(next)) instance.hide();
        return;
      }
      // Some browsers omit relatedTarget on focusout (e.g. when a focused
      // element is removed from the DOM by a calendar re-render) — re-check
      // on the next tick. The MutationObserver above runs first (a
      // microtask, ahead of this macrotask) and will have already recovered
      // focus into the popup if that's what happened, so this only fires
      // for a genuine external focus loss.
      setTimeout(() => {
        if (!isInsidePickerOrInput(document.activeElement)) instance.hide();
      }, 0);
    };

    $picker.on('focusout.daterangepicker-a11y', closeIfFocusLeavesPicker);
    container.on('focusout.daterangepicker-a11y', closeIfFocusLeavesPicker);

    // Moves focus to the cell at (row, col) within a given calendar side,
    // if an available one exists there.
    const moveToCell = ($cal, row, col) => {
      const $cell = $cal.find(`td[data-title="r${row}c${col}"]`);
      if ($cell.length && $cell.hasClass('available')) {
        container.find('td.available[tabindex="0"]').attr('tabindex', '-1');
        $cell.attr('tabindex', '0').trigger('focus');
        return true;
      }
      return false;
    };

    container.on('keydown.daterangepicker-a11y', 'td.available', function (e) {
      const $cell = $(this);
      const $cal = $cell.closest('.drp-calendar');
      const match = /^r(\d+)c(\d+)$/.exec($cell.attr('data-title') || '');
      const row = match ? parseInt(match[1], 10) : null;
      const col = match ? parseInt(match[2], 10) : null;
      if (row === null) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          $cell.trigger('mousedown');
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (!moveToCell($cal, row, col + 1)) {
            const $other = $cal.hasClass('left') ? container.find('.drp-calendar.right') : null;
            if ($other && $other.length) moveToCell($other, row, 0);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (!moveToCell($cal, row, col - 1)) {
            const $other = $cal.hasClass('right') ? container.find('.drp-calendar.left') : null;
            if ($other && $other.length) moveToCell($other, row, 6);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveToCell($cal, row + 1, col);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveToCell($cal, row - 1, col);
          break;
        case 'Escape':
          e.preventDefault();
          hideAndRefocus();
          break;
        default:
          break;
      }
    });

    container.on('keydown.daterangepicker-a11y', '.ranges li', function (e) {
      const $li = $(this);
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          $li.trigger('click');
          break;
        case 'ArrowDown': {
          e.preventDefault();
          const $next = $li.next('li');
          if ($next.length) $next.trigger('focus');
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const $prev = $li.prev('li');
          if ($prev.length) $prev.trigger('focus');
          break;
        }
        case 'Escape':
          e.preventDefault();
          hideAndRefocus();
          break;
        default:
          break;
      }
    });

    container.on('keydown.daterangepicker-a11y', 'th.prev, th.next', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $(this).trigger('click');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideAndRefocus();
      }
    });

    $picker.on('show.daterangepicker', () => setIsDatePickerOpen(true));
    // Return focus to the trigger input on close, but only when focus was
    // still inside the popup (Escape, Apply, Cancel via keyboard) or lost to
    // <body> — not when the user dismissed it by clicking another control,
    // which should keep the focus they just placed.
    $picker.on('hide.daterangepicker', () => {
      setIsDatePickerOpen(false);
      const active = document.activeElement;
      const focusWasInsidePicker = active && container[0] && container[0].contains(active);
      const focusWasLost = !active || active === document.body;
      if (focusWasInsidePicker || focusWasLost) {
        refocusInput();
      }
    });

    // Handle date selection - convert moment to local time string
    $picker.on('apply.daterangepicker', function (ev, picker) {
      pendingStartRef.current = null;
      datePickerCancelRestoreRef.current = null;
      const startDate = picker.startDate.toDate();
      const endDate = picker.endDate.toDate();
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 0);
      setDateRange({
        startDate: formatDateTimeLocal(startDate),
        endDate: formatDateTimeLocal(endDate)
      });
    });

    // Restore previously applied dates if user cancels after clicking the date pill X
    $picker.on('cancel.daterangepicker', function () {
      pendingStartRef.current = null;
      if (datePickerCancelRestoreRef.current) {
        const { startDate, endDate } = datePickerCancelRestoreRef.current;
        dateRangePickerInstance.current.setStartDate(moment(new Date(startDate)));
        dateRangePickerInstance.current.setEndDate(moment(new Date(endDate)));
        setDateRange({ startDate: formatDateTimeLocal(new Date(startDate)), endDate: formatDateTimeLocal(new Date(endDate)) });
        datePickerCancelRestoreRef.current = null;
      }
    });

    // If the user clicked one date but didn't pick an end before clicking outside,
    // apply that single date as a same-day range instead of reverting.
    $picker.on('outsideClick.daterangepicker', function () {
      const pending = pendingStartRef.current;
      pendingStartRef.current = null;
      if (pending) {
        const dateObj = pending.toDate();
        const start = new Date(dateObj);
        const end = new Date(dateObj);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 0);
        setDateRange({
          startDate: formatDateTimeLocal(start),
          endDate: formatDateTimeLocal(end)
        });
      }
    });

    // Cleanup
    return () => {
      gridObserver.disconnect();
      container.off('keydown.daterangepicker-a11y');
      container.off('focusout.daterangepicker-a11y');
      $picker.off('focusout.daterangepicker-a11y');
      if ($picker.data('daterangepicker')) {
        $picker.off('apply.daterangepicker');
        $picker.off('cancel.daterangepicker');
        $picker.off('outsideClick.daterangepicker');
        $picker.off('show.daterangepicker');
        $picker.off('hide.daterangepicker');
        $picker.off('focus.daterangepicker');
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
  // Ordered to match ExpertFeedbackComponent's actual per-sentence flow:
  // Correct / Needs improvement / Incorrect, then Content issue, then
  // Harmful (shown only when Incorrect) — repeated per sentence. Citation
  // rating is its own section evaluated after all sentences, so it comes
  // last here too.
  const partnerEvalOptions = [
    { value: 'all', label: t('admin.filters.allPartnerEvals') },
    { value: 'noEval', label: t('admin.filters.noEvaluation') },
    { value: 'correct', label: t('admin.filters.evalCorrect') },
    { value: 'needsImprovement', label: t('admin.filters.evalNeedsImprovement') },
    { value: 'hasError', label: t('admin.filters.evalHasError') },
    // Independent of the score category above — a partner/admin tags this
    // per-sentence during evaluation, so an answer can be e.g. "correct"
    // and still have a content issue flagged. Reuses showEvalLogic since
    // both this and evalLogic depend on getChatFilterConditions, which
    // Partner/Metrics dashboards don't go through (see FilterPanel's own
    // showEvalLogic prop comment) — selecting it there would silently match
    // nothing rather than actually filter.
    ...(showEvalLogic ? [{ value: 'hasContentIssue', label: t('admin.filters.evalHasContentIssue') }] : []),
    { value: 'harmful', label: t('admin.filters.evalHarmful') },
    { value: 'hasCitationError', label: t('admin.filters.evalHasCitationError') }
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
      aiEval: aiEval.length > 0 ? aiEval.join(',') : 'all',
      evalLogic
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
    setEvalLogic('and');
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
      aiEval: 'all',
      evalLogic: 'and'
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
      // Save applied dates so cancel can restore them — pill must always match what's in effect.
      datePickerCancelRestoreRef.current = {
        startDate: appliedFilters.startDate,
        endDate: appliedFilters.endDate,
      };
      const d = getDefaultDates();
      setDateRange(d);
      const s = parseDateTimeLocal(d.startDate);
      const e = parseDateTimeLocal(d.endDate);
      if (dateRangePickerInstance.current && s && e) {
        dateRangePickerInstance.current.setStartDate(moment(s));
        dateRangePickerInstance.current.setEndDate(moment(e));
      }
      setIsOpen(true);
      setTimeout(() => {
        if (dateRangePickerInstance.current) {
          dateRangePickerInstance.current.show();
        }
      }, 50);
      return;
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
      const s = new Date(appliedFilters.startDate).toLocaleDateString(locale, dateOpts);
      const e = new Date(appliedFilters.endDate).toLocaleDateString(locale, dateOpts);
      pills.push({ key: 'date', label: `${s} – ${e}` });
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
              aria-haspopup="dialog"
              aria-expanded={isDatePickerOpen}
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
        {showAdvancedSection && (
        <>
        <p className="filter-advanced-title">{t('admin.filters.advancedTitle')}</p>
        <details
          className="filter-advanced-details details-form"
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
              {showEvalLogic && (
                <>
                <p className="filter-advanced-title">{t('admin.filters.evalPairTitle')}</p>
                <div className="gc-chckbxrdio sm filter-eval-logic" role="radiogroup" aria-label={t('admin.filters.evalLogicGroupLabel')}>
                  <div className="radio">
                    <input type="radio" name="evalLogic" id="evalLogic-and" checked={evalLogic === 'and'} onChange={() => setEvalLogic('and')} />
                    <label htmlFor="evalLogic-and">{t('admin.filters.evalLogicAnd')}</label>
                  </div>
                  <div className="radio">
                    <input type="radio" name="evalLogic" id="evalLogic-or" checked={evalLogic === 'or'} onChange={() => setEvalLogic('or')} />
                    <label htmlFor="evalLogic-or">{t('admin.filters.evalLogicOr')}</label>
                  </div>
                </div>
                </>
              )}
            </div>

            {/* Answer type column */}
            <details className="filter-checkbox-details details-form" open onToggle={(e) => e.stopPropagation()}>
              <summary className="filter-label">
                {t('admin.filters.answerType') || 'Answer Type'}
                {answerType.length > 0 && <span className="filter-count"> ({answerType.length})</span>}
              </summary>
              <fieldset className="gc-chckbxrdio sm filter-checkbox-group" aria-label={t('admin.filters.answerType')}>
                <div className="checkbox">
                  <input type="checkbox" id="answerType-all" checked={answerType.length === 0} onChange={(e) => handleAnswerTypeAll(e.target.checked)} />
                  <label htmlFor="answerType-all">{t('admin.filters.allAnswerTypes') || 'All'}</label>
                </div>
                {answerTypeOptions.filter(o => o.value !== 'all').map(option => (
                  <div className="checkbox" key={option.value}>
                    <input type="checkbox" id={`answerType-${option.value}`} value={option.value} checked={answerType.includes(option.value)} onChange={(e) => { if (e.target.checked) { setAnswerType([...answerType, option.value]); } else { setAnswerType(answerType.filter(v => v !== option.value)); } }} />
                    <label htmlFor={`answerType-${option.value}`}>{option.label}</label>
                  </div>
                ))}
              </fieldset>
            </details>

            {/* Partner eval + AI eval are boxed individually, side by side,
                with an AND/OR toggle spanning both underneath — controls how
                the two filters combine when both have a selection. */}
            <div className="filter-column">
              <div className="filter-eval-pair">
                <details className="filter-checkbox-details details-form filter-eval-box" open onToggle={(e) => e.stopPropagation()}>
                  <summary className="filter-label">
                    {t('admin.filters.partnerEval') || 'Partner Evaluation'}
                    {partnerEval.length > 0 && <span className="filter-count"> ({partnerEval.length})</span>}
                  </summary>
                  <fieldset className="gc-chckbxrdio sm filter-checkbox-group" aria-label={t('admin.filters.partnerEval')}>
                    <div className="checkbox">
                      <input type="checkbox" id="partnerEval-all" checked={partnerEval.length === 0} onChange={(e) => handlePartnerEvalAll(e.target.checked)} />
                      <label htmlFor="partnerEval-all">{t('admin.filters.allPartnerEvals') || 'All'}</label>
                    </div>
                    {partnerEvalOptions.filter(o => o.value !== 'all').map(option => (
                      <div className="checkbox" key={option.value}>
                        <input type="checkbox" id={`partnerEval-${option.value}`} value={option.value} checked={partnerEval.includes(option.value)} onChange={(e) => { if (e.target.checked) { setPartnerEval([...partnerEval, option.value]); } else { setPartnerEval(partnerEval.filter(v => v !== option.value)); } }} />
                        <label htmlFor={`partnerEval-${option.value}`}>{option.label}</label>
                      </div>
                    ))}
                  </fieldset>
                </details>

                <details className="filter-checkbox-details details-form filter-eval-box" open onToggle={(e) => e.stopPropagation()}>
                  <summary className="filter-label">
                    {t('admin.filters.aiEval') || 'AI Evaluation'}
                    {aiEval.length > 0 && <span className="filter-count"> ({aiEval.length})</span>}
                  </summary>
                  <fieldset className="gc-chckbxrdio sm filter-checkbox-group" aria-label={t('admin.filters.aiEval')}>
                    <div className="checkbox">
                      <input type="checkbox" id="aiEval-all" checked={aiEval.length === 0} onChange={(e) => handleAiEvalAll(e.target.checked)} />
                      <label htmlFor="aiEval-all">{t('admin.filters.allAiEvals') || 'All'}</label>
                    </div>
                    {aiEvalOptions.filter(o => o.value !== 'all').map(option => (
                      <div className="checkbox" key={option.value}>
                        <input type="checkbox" id={`aiEval-${option.value}`} value={option.value} checked={aiEval.includes(option.value)} onChange={(e) => { if (e.target.checked) { setAiEval([...aiEval, option.value]); } else { setAiEval(aiEval.filter(v => v !== option.value)); } }} />
                        <label htmlFor={`aiEval-${option.value}`}>{option.label}</label>
                      </div>
                    ))}
                  </fieldset>
                </details>
              </div>
            </div>
          </div>
        </details>
        </>
        )}

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
                aria-label={`${t('dashboardFilter.removeFilter')} - ${pill.label}`}
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
