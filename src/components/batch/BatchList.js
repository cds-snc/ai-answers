import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getCellRoot } from '../../utils/dataTableCellRoot.js';
import { buildLabelPillHtml, escapeHtml } from '../../utils/labelPill.js';
import DataTable from 'datatables.net-react';
import 'datatables.net-dt/css/dataTables.dataTables.css';
import DT from 'datatables.net-dt';
import { GcdsButton } from '@gcds-core/components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { usePausablePolling } from '../../hooks/usePauseToggle.js';
import PauseToggleButton from '../admin/PauseToggleButton.js';
import StatusMessage, { useSrAnnouncer } from '../admin/StatusMessage.js';
import { dataTableLanguage } from '../../utils/dataTableLanguage.js';
import { formatNumber } from '../../utils/numberFormat.js';
import { setColumnHeaderScope } from '../../utils/admin/dataTableAccessibility.js';
import BatchService from '../../services/BatchService.js';

DataTable.use(DT);

// Shared render for a row's Actions cell - previously four near-identical
// copies (one per status branch below), each hand-rolling the same
// "clicked -> self-focusing placeholder" logic. Consolidated so the focus-
// restoration fix below (pendingFocusRef) only has to be wired once instead
// of once per copy, which is exactly how this kind of bug slips into 3 of 4
// copies and gets missed in the others.
//
// Keeps something in the DOM in place of the button (rather than returning
// null) so focus isn't dropped to <body> the instant it's clicked, and
// announces the pending state - the row's cell gets replaced for real once
// `batches` refreshes and the table remounts (see `key={refreshKey}` below).
const RowActionButtons = ({ batchId, actions, t, pendingFocusRef }) => {
  const [clicked, setClicked] = useState(false);
  // Which `instant` actions (see the actions.map below) currently have an
  // in-flight async call - CSV/Excel export specifically. Unlike Process/
  // Delete/Cancel, exporting doesn't warrant swapping the whole row for the
  // "Processing…" placeholder (it's a near-instant download trigger, not a
  // multi-second operation, and BatchPage.js's own page-level StatusMessage
  // already announces the outcome) - this only disables the one button that
  // was actually clicked, for exactly as long as its own export call is
  // pending, so a second click on the same button while the first download
  // is still in flight can't fire a duplicate.
  const [pendingKeys, setPendingKeys] = useState(() => new Set());
  const containerRef = useRef(null);

  // Runs after every commit of this cell's content — i.e. once per
  // createdRow draw of this row, since getCellRoot mounts a brand new React
  // root (and therefore a brand new instance of this component) on every
  // draw rather than reusing one. If this draw is the one immediately
  // following a click on this exact row (armed by the onClick handler
  // below, consumed here so a later *unrelated* remount — e.g. the 10s
  // poll, pausable via the control above — doesn't keep stealing focus back
  // to a row the user has since moved on from), focus whatever this draw
  // actually rendered instead of leaving it to drop to <body> the way the
  // whole-table remount otherwise would. useEffect (not a plain post-render
  // querySelector) specifically because it's guaranteed to run only after
  // this render has actually committed to the DOM — the earlier version of
  // this fix queried the DOM immediately after root.render() and raced
  // React's own commit timing, intermittently focusing nothing at all.
  useEffect(() => {
    if (!pendingFocusRef.current.has(batchId)) return;
    const clickedKey = pendingFocusRef.current.get(batchId);
    pendingFocusRef.current.delete(batchId);
    // gcds-button is a shadow-DOM custom element with delegatesFocus: true
    // (Stencil) — .focus() on the host element itself correctly delegates
    // into its internal <button>, but a light-DOM querySelector('button')
    // won't match the host's own tag name, so it has to be named explicitly
    // alongside the plain-<button>/[tabindex] cases (the "Processing…"
    // placeholder below, and any future native control in this cell).
    //
    // Prefer the exact button that was clicked (data-action-key, set below)
    // over just "the row's first interactive element" - the actions array's
    // order isn't fixed across status branches (e.g. Cancel comes first in
    // one branch, Delete second in another), so grabbing the first match
    // can land focus on a completely different control than the one the
    // user actually clicked. Falls back to the first match only if that
    // specific action no longer exists in the redrawn row (e.g. the status
    // branch changed enough that the clicked action isn't offered anymore).
    const target = (clickedKey && containerRef.current?.querySelector(`[data-action-key="${clickedKey}"]`))
      || containerRef.current?.querySelector('gcds-button, button, [tabindex]');
    target?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (clicked) {
    return (
      <span role="status" aria-live="polite" tabIndex={-1} ref={(el) => el?.focus()}>
        {t('common.processing')}
      </span>
    );
  }
  return (
    <div ref={containerRef} className="table-row-actions" style={{ display: 'flex', gap: '8px' }}>
      {actions.map(({ key, label, icon, buttonRole, disabled, instant, onClick }) => (
        <GcdsButton
          key={key}
          data-action-key={key}
          size="small"
          buttonRole={buttonRole}
          disabled={disabled || pendingKeys.has(key)}
          onClick={async () => {
            if (instant) {
              // No pendingFocusRef/clicked-placeholder dance for these -
              // nothing is about to remount just because an export ran, so
              // there's no focus to rescue, just this one button to
              // temporarily disable against a double click.
              setPendingKeys((prev) => new Set(prev).add(key));
              try {
                await onClick();
              } finally {
                setPendingKeys((prev) => {
                  const next = new Set(prev);
                  next.delete(key);
                  return next;
                });
              }
              return;
            }
            // Arm the focus-restoration effect above *before* the click
            // handler runs — onProcess/onDelete/etc. can synchronously
            // trigger a `processingBatches`/`batches` change that bumps
            // `refreshKey`, remounting the whole DataTable (and this cell's
            // React root along with it) before the `clicked` placeholder
            // below ever gets to keep its own self-focus.
            pendingFocusRef.current.set(batchId, key);
            // A handler can return `false` to mean "the user backed out"
            // (e.g. handleDelete's window.confirm being cancelled) — don't
            // show the pending placeholder for that, and nothing is about
            // to remount, so clear the pending-focus request too.
            if (onClick() === false) {
              pendingFocusRef.current.delete(batchId);
              return;
            }
            setClicked(true);
          }}
        >
          {/* Purely decorative - the button's text (label) is already the
              full accessible name, matching StatusMessage.js's own
              raw-FA-icon precedent (GC DS's icon font has no download
              glyph, hence fa- instead of GcdsIcon here too). inline-flex
              wrapper, not just the icon span alone: GcdsButton's own
              shadow-DOM slot stacks its light-DOM children in a column by
              default, so an icon + text passed as two siblings rendered
              icon-above-text instead of side by side - forcing our own
              horizontal layout on the wrapper doesn't depend on what the
              slot itself does with it. */}
          {icon ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
              <span className={`fa fa-solid fa-${icon}`} aria-hidden="true"></span>
              {label}
            </span>
          ) : label}
        </GcdsButton>
      ))}
    </div>
  );
};

const BatchList = ({ onProcess, onCancel, onDelete, onExport, batchStatus, lang, processingBatches = [], announceCompletions = false }) => {
  const [batches, setBatches] = useState([]);
  const [searchText] = useState('');
  // refreshKey forces the DataTable to remount when batches change
  const [refreshKey, setRefreshKey] = useState(0);
  const { t } = useTranslations(lang);

  // Single sr-only, persistent live region shared by every announcement this
  // component makes (pause/resume, batch completions below) - one region,
  // not one per event type, so a screen reader user doesn't have several
  // near-simultaneous live regions competing. useSrAnnouncer's nonce forces
  // a remount on every trigger so two back-to-back announcements with
  // coincidentally identical text - e.g. pausing twice, or two different
  // batches sharing a name completing in separate polls - both still get
  // announced instead of the second being a silent no-op React bails on.
  const { message: announcement, nonce: announceNonce, announce } = useSrAnnouncer();

  // Tracks whether the *previous* render was paused, so the resume
  // announcement only fires on an actual paused->resumed transition, not on
  // initial mount (which also starts "not paused").
  const wasPausedRef = useRef(false);

  // batchId -> normalized status, from the *previous* fetch - lets
  // fetchBatches below tell "just became processed" apart from "was already
  // processed last time too" or "first time we've ever seen this batch".
  const prevStatusMapRef = useRef(new Map());

  // Whether the *previous* render's filtered list was empty - lets the
  // remount effect below tell "still nothing to show" apart from "something
  // actually changed." Starts true: nothing's rendered yet on mount either way.
  const wasEmptyRef = useRef(true);

  // The user's last-chosen sort, carried across the poll-driven remounts
  // below. Unlike ChatDashboardPage.js/EvalDashboardPage.js, which keep one
  // DataTables instance alive across a poll (updating its data via
  // ajax.reload(), so sort/search/page state just naturally survives), this
  // table remounts a *fresh* DataTables instance on every poll tick (see
  // key={refreshKey} - needed so row action cells pick up the latest
  // processingBatches closure). A fresh instance has no memory of its
  // predecessor, so without this, `order` in options below would silently
  // reset to the hardcoded default every ~10s, discarding whatever column
  // the user just clicked to sort by. `initComplete`'s order.dt listener
  // keeps this updated; the `order` option and the explicit re-sort both
  // read from it instead of a literal, so each new instance picks up where
  // the last one left off.
  const sortOrderRef = useRef([[2, 'desc']]);

  // See handleDelete's own comment - the durable focus target a successful
  // delete redirects to, since the deleted row's own focus restoration
  // structurally can't happen.
  const pauseButtonRef = useRef(null);

  // Maps every batch _id RowActionButtons has armed for focus restoration to
  // the specific action key that was clicked (added the instant a button is
  // clicked, consumed/removed once that row's cell re-renders after the
  // remount below). A Map, not a single scalar: a plain "last clicked id"
  // would get clobbered if a second row's button is clicked before the
  // first row's remount lands, silently dropping the first row's focus
  // restoration. Keyed by action (not just batchId) so the redraw-
  // consumption path can refocus the *specific* control that was clicked -
  // see RowActionButtons' own comment for why grabbing the row's first
  // interactive element isn't good enough (e.g. Cancel is the first button
  // in some status branches, Delete the second - clicking Delete and
  // landing back on Cancel is exactly the bug this key exists to prevent).
  const pendingFocusRef = useRef(new Map());

  // Fetch all statuses
  const fetchStatuses = useCallback(async (batches) => {
    try {
      return await BatchService.getBatchStatuses(batches);
    } catch (error) {
      console.error('Error fetching statuses:', error);
      // Return the original batches fallback so caller can proceed with array
      return batches || [];
    }
  }, []); // No dependencies needed as it doesn't use any external values

  // Normalize status values from server to the canonical values the UI expects
  const normalizeStatus = (s) => {
    if (!s && s !== 0) return 'unknown';
    const st = String(s).toLowerCase();
    // map server-side names to client expected names
    if (st === 'processing') return 'in_progress';
    if (st === 'inprogress') return 'in_progress';
    if (st === 'in_progress') return 'in_progress';
    if (st === 'processed') return 'processed';
    if (st === 'completed') return 'completed';
    if (st === 'finalizing') return 'finalizing';
    if (st === 'validating') return 'validating';
    if (st === 'failed') return 'failed';
    if (st === 'expired' || st === 'not_found') return 'expired';
    if (st === 'cancelled' || st === 'canceled') return 'canceled';
    return st;
  };

  // Memoize the columns configuration to prevent unnecessary re-renders
  const columns = useMemo(
    () => [
      { title: t('batch.list.columns.batchName'), data: 'name' },
      {
        title: t('batch.list.columns.batchId'),
        data: null,
        render: (data, type, row) => {
          // Display the Mongo document _id for clarity; do not display the legacy batchId here.
          return row && (row._id || row.id) ? String(row._id || row.id) : '';
        },
      },
      { title: t('batch.list.columns.createdDate'), data: 'createdAt' },
      { title: t('batch.list.columns.provider'), data: 'aiProvider' },
      { title: t('batch.list.columns.workflow'), data: 'workflow' },
      {
        title: t('batch.list.columns.type'),
        data: 'type',
        render: (data) => t(`batch.list.types.${data}`) || data,
      },
      {
        title: t('batch.list.columns.status'),
        data: 'status',
        render: (data) => {
          const normalized = normalizeStatus(data);
          const label = t(`batch.list.statuses.${normalized}`) || normalized;
          // Pill treatment matches Chat/Eval dashboards' shared .label
          // colour tiers (admin.css) - each status's own name is the CSS
          // class, and admin.css chains it onto the tier it belongs to
          // (see that file's comments): processed -> green, in_progress ->
          // blue, uploaded -> grey, unknown -> yellow. These four are the
          // *only* statuses this column can ever actually show:
          // BatchService.getBatchStatuses recomputes `status` from item
          // stats on every fetch and only ever produces one of these four -
          // completed/failed/validating/finalizing/expired/canceled can
          // never reach this render function no matter what's stored in the
          // DB, so they don't get a pill (or a colour decision) at all.
          const pillStatuses = ['processed', 'in_progress', 'uploaded', 'unknown'];
          if (pillStatuses.includes(normalized)) {
            return buildLabelPillHtml(normalized, label);
          }
          return escapeHtml(label);
        },
      },
      {
        // Content is written straight into the cell via totalsCell.innerText
        // in createdRow below, entirely outside DataTables' own data/render
        // pipeline (data: null with no render function) - DataTables has no
        // value to sort or search on here, unlike the Batch ID column above
        // (data: null too, but its render() return value IS what DataTables
        // sorts/searches against). Same reasoning as ChatDashboardPage.js/
        // EvalDashboardPage.js marking their own DOM-injected/non-data
        // columns orderable: false rather than leaving DataTables' default
        // (orderable: true) to sort on nothing.
        title: t('batch.list.columns.totals'),
        data: null,
        orderable: false,
        searchable: false,
      },
      {
        // Same reasoning as the Totals column above, plus this one's content
        // is a row of buttons (React-rendered via createdRow), not text -
        // "sorting"/"searching" button labels doesn't mean anything. Matches
        // ChatDashboardPage.js's own action-type column.
        title: t('batch.list.columns.action'),
        data: null,
        defaultContent: '',
        orderable: false,
        searchable: false,
      },
    ],
    [t]
  );

  // Fetch batches
  const fetchBatches = useCallback(async () => {
    try {
      const batches = await BatchService.getBatchList();
      const updatedBatches = await fetchStatuses(batches) || batches || [];
      const list = Array.isArray(updatedBatches) ? updatedBatches : [];

      // Relevant to know regardless of which section (Incomplete/Completed)
      // the admin is looking at - a batch finishing is exactly the kind of
      // change polling exists to surface, and unlike every other change
      // this table announces, it's not tied to something the admin just
      // clicked themselves. announceCompletions gates this to a single
      // BatchList instance (see BatchPage.js) - getBatchList() returns
      // every batch regardless of the batchStatus this instance filters to,
      // so both instances would otherwise detect and announce the same
      // transition at the same time.
      if (announceCompletions) {
        const newlyCompleted = [];
        // A batch failing mid-run (a backend error, not a click the admin
        // made) would be just as worth announcing as a completion - but
        // there's no way to detect it from here: `status` above always
        // comes from BatchService.getBatchStatuses, which recomputes it
        // purely from item stats into one of unknown/uploaded/processed/
        // processing - 'failed' is never one of the values it produces, no
        // matter what's actually stored server-side. A real "batch failed"
        // announcement needs getBatchStatuses itself to expose that as its
        // own signal (e.g. surfacing stats.failed distinctly) before this
        // can detect it - not implemented here, flagging as a TODO rather
        // than a dead branch that silently never fires.
        for (const b of list) {
          const id = String(b._id || b.id);
          const status = normalizeStatus(b.status);
          const prevStatus = prevStatusMapRef.current.get(id);
          // prevStatus === undefined means this is the first time this
          // instance has ever seen the batch (initial load, or a batch
          // created after mount) - not a completion event, just its
          // starting state, so it's excluded rather than announced.
          if (prevStatus === undefined) continue;
          if (status === 'processed' && prevStatus !== 'processed') {
            newlyCompleted.push(b.name || id);
          }
        }
        prevStatusMapRef.current = new Map(list.map((b) => [String(b._id || b.id), normalizeStatus(b.status)]));
        if (newlyCompleted.length) {
          announce(t('batch.list.completedAnnouncement').replace('{names}', () => newlyCompleted.join(', ')));
        }
      }

      setBatches(list);
    } catch (error) {
      console.error('Error fetching batches:', error);
    }
  }, [fetchStatuses, announceCompletions, announce, t]);

  // WCAG 2.2.2 (Pause, Stop, Hide): the 10s poll below keeps rebuilding the
  // table, which is exactly the kind of auto-updating content that
  // criterion requires a way to stop.
  const { isPaused, togglePause } = usePausablePolling(fetchBatches, 10000, [lang, fetchBatches]);

  // Pause/resume announcement - shares the same sr-only region as
  // completions above rather than its own, see `announce`'s own comment.
  useEffect(() => {
    if (isPaused) {
      announce(t('common.pausedIndicator'));
    } else if (wasPausedRef.current) {
      announce(t('common.resumedIndicator'));
    }
    wasPausedRef.current = isPaused;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  // Filter batches based on batchStatus and search text (use normalized status)
  const filteredBatches = useMemo(() => (batches || []).filter((batch) => {
    const norm = normalizeStatus(batch.status);
    const desired = (batchStatus || '').split(',').map((s) => s.trim()).filter(Boolean);
    // If caller asked for the umbrella "incomplete" group, include unknown statuses
    const matchesStatus = desired.includes(norm) ||
      (desired.includes('incomplete') && ['in_progress', 'processing', 'inprogress', 'unknown'].includes(norm));

    return (
      matchesStatus &&
      Object.values(batch).some((value) =>
        value?.toString().toLowerCase().includes(searchText.toLowerCase())
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [batches, batchStatus, searchText]);

  // Whenever the *filtered* list or local processing markers change, bump
  // the refresh key so DataTable remounts. This ensures the action buttons
  // rendered into table cells (via createRoot) see the latest
  // `processingBatches` value and update immediately when the user clicks
  // Process instead of waiting for the next polling cycle.
  // Note: lang is intentionally excluded — language switches always trigger
  // full page navigation so the component remounts naturally with the correct lang.
  //
  // Two things this list is deliberately frozen against while `isPaused`:
  //   1. Its own 10s poll, via usePausablePolling's guardPoll - already
  //      true before this fix, `batches` simply doesn't update while paused.
  //   2. `processingBatches` - NOT already handled: it's shared BatchPage.js
  //      state, passed identically to *both* BatchList instances (Incomplete
  //      and Completed batches), so clicking Process in one list bumped this
  //      list's own refreshKey too, remounting it regardless of whether
  //      *this* list's own pause button was on. That's the "pause controls
  //      cancel each other out" bug - pausing one list never actually froze
  //      it against activity in the other. Gating the whole effect on
  //      `isPaused` (not just the fetch) fixes both at once, and doubles as
  //      "catch up now" on resume: isPaused is a dependency, so flipping it
  //      back to false re-runs this effect immediately with whatever
  //      changed while frozen, rather than waiting for the next poll tick.
  //
  // Exception, independent of pause: an empty list polling into another
  // empty list has nothing to remount for - every row-level closure this
  // remount exists to refresh belongs to a row, and there are none. Skipping
  // that no-op remount is what stops this list (e.g. "Incomplete batches"
  // once nothing's left incomplete) from visibly flickering every 10s for as
  // long as it stays empty.
  useEffect(() => {
    if (isPaused) return;
    const isEmpty = filteredBatches.length === 0;
    if (isEmpty && wasEmptyRef.current) return;
    wasEmptyRef.current = isEmpty;
    setRefreshKey((r) => r + 1);
  }, [filteredBatches, processingBatches, isPaused]);

  // Handle button actions mapped to explicit handlers
  const handleExport = (batchId, type, batchName) => onExport && onExport(batchId, type, batchName);
  const handleDelete = (batchId, batchName) => {
    // window.confirm()'s own chrome (title bar, OK/Cancel) is fixed browser
    // styling, but the message text is ours - naming the batch instead of
    // "this batch" matters here specifically because a delete confirm can
    // be triggered from a keyboard-focused button with no visual context
    // (which row it belongs to) still on screen once the dialog covers it.
    const message = batchName
      ? t('batch.list.actions.confirmDeleteNamed').replace('{name}', () => batchName)
      : t('batch.list.actions.confirmDelete');
    if (!window.confirm(message)) return false;
    (async () => {
      try {
        // onDelete resolves true/false (BatchPage.js) rather than
        // throwing on failure - it already owns its own page-level
        // success/error StatusMessage, so this only needs the boolean to
        // decide whether to name the batch in the shared sr-only region
        // below, not to duplicate that outcome text itself.
        const succeeded = await (onDelete && onDelete(batchId, batchName));
        if (succeeded) {
          if (batchName) {
            announce(t('batch.list.deletedAnnouncement').replace('{name}', () => batchName));
          }
          // A deleted row never comes back on the next fetch, so createdRow
          // never runs for this batchId again - the usual
          // pendingFocusRef-consumption path (RowActionButtons' own effect)
          // structurally can't fire, and the table remount below would
          // otherwise tear down the self-focused "Processing…" placeholder
          // with nothing left to catch focus, dropping it to <body>. Clear
          // the now-unconsumable entry and land focus somewhere durable and
          // visible instead - the pause button is the nearest always-
          // mounted, always-visible control, not torn down by the remount
          // (it lives outside the remounted DataTable subtree).
          pendingFocusRef.current.delete(batchId);
          // Deferred, not called directly here: RowActionButtons' cell is
          // its own separate React root (getCellRoot/createRoot), and the
          // "Processing…" placeholder's self-focus (its own ref callback,
          // still mounted at this exact moment) is scheduled through that
          // root's own commit - which resolves *after* this microtask, so
          // calling focus() synchronously here loses the race the instant
          // that commit lands and the placeholder re-focuses itself.
          // setTimeout (a real macrotask) reliably runs after React's own
          // scheduled commit settles, unlike another microtask tick.
          setTimeout(() => pauseButtonRef.current?.focus(), 0);
        }
      } catch (err) {
        // onDelete doesn't currently throw (BatchPage.js's always resolves
        // true/false), but this is a fire-and-forget IIFE with nothing else
        // awaiting it - an uncaught rejection here would otherwise surface
        // as an unhandled promise rejection with no user-facing feedback at
        // all, rather than just missing the announcement.
        console.error('Error deleting batch:', err);
      } finally {
        // Reflect the delete as soon as it actually finishes instead of
        // waiting up to 10s for the next scheduled poll - the delete
        // request itself is fast, the lag users were seeing was purely the
        // UI not refetching until the next tick. Respects pause rather than
        // bypassing it, though: fetchBatches() is only called here directly
        // (not through the poll's guardPoll) so it's not itself gated by
        // isPaused - checking it explicitly keeps a paused view genuinely
        // frozen, same as everywhere else in this file, rather than this
        // one action quietly overriding the user's own pause choice.
        if (!isPaused) fetchBatches();
      }
    })();
    return true;
  };
  // Pass workflow through when invoking onProcess so restarts can reuse the saved workflow
  const handleProcess = (batchId, provider, workflow, batchName) => {
    // Starting a process is a much stronger signal than "leave this alone
    // while I read the table" (what pause is for) - the opposite, really:
    // agreeing to kick something off implies wanting to watch it move,
    // and while paused, this row's own outcome (Process disabling, its
    // status/totals advancing) would otherwise sit frozen right alongside
    // the button you just clicked to start it. Simpler than trying to
    // special-case "this one action stays live while everything else
    // around it stays frozen" - just resume.
    //
    // Resuming un-skips the *next* scheduled poll tick, but that tick is on
    // its own 10s clock (usePausablePolling) and doesn't reset just because
    // we resumed - so without an explicit fetch here, the table can sit
    // looking frozen for up to 10s after a click that was supposed to make
    // it live again. Force an immediate refetch the same way handleDelete
    // does, instead of waiting on the poll.
    if (isPaused) {
      togglePause();
      fetchBatches();
    }
    onProcess && onProcess(batchId, provider, workflow, batchName);
  };
  const handleCancel = (batchId, provider, batchName) => onCancel && onCancel(batchId, provider, batchName);

  return (
    <div>
      <PauseToggleButton ref={pauseButtonRef} isPaused={isPaused} onToggle={togglePause} t={t} className="mb-200" />
      {/* sr-only + persistent: the accessible half only, shared by every
          announcement this component makes (pause, resume, batch
          completions - see `announce`'s own comment above), same pattern as
          ChatDashboardPage.js/EvalDashboardPage.js's own persistent sr-only
          search-announcement StatusMessage. Decoupled from the visible
          pause badge below on purpose - that badge only ever reflects
          isPaused, but this region also has to carry completion
          announcements the badge has no visual counterpart for. */}
      <StatusMessage variant="info" persistent nonce={announceNonce} message={announcement || undefined} className="sr-only" />
      {/* Visible half - purely decorative (aria-hidden; the sr-only
          StatusMessage above is the real announcement), a design element
          rather than a StatusMessage box: reassures a sighted user the
          table genuinely isn't about to redraw out from under them, not
          "this table is disabled" - doesn't dim/fade the table itself,
          since every row action stays fully usable while paused (only the
          10s auto-refresh poll stops). */}
      {isPaused && (
        <div className="dashboard-table-paused-indicator mb-200" aria-hidden="true">
          <span className="fa fa-solid fa-pause" aria-hidden="true"></span>
          {t('common.pausedIndicator')}
        </div>
      )}
      <div className="dashboard-table-container">
        <DataTable
          data={filteredBatches}
          columns={columns} // Use memoized columns
          // Same base classes as ChatDashboardPage.js/EvalDashboardPage.js's
          // tables - dashboard-table is what every sort-icon/sort-column
          // rule in admin.css is scoped to (table.dataTable.dashboard-table
          // thead > tr > th...), so without it sortable headers render with
          // DataTables' own unstyled defaults instead of matching those
          // pages. No --grouped modifier: that's specific to their rowspan
          // grouping (multi-turn chats sharing a Chat ID), which this table
          // doesn't have - one row per batch, always. zebra-stable-on-hover
          // is a general-purpose utility (admin.css) for any `display`-class
          // DataTable that wants its zebra stripe to look identical whether
          // or not the pointer is over the row - not specific to this table,
          // reusable on others that want the same thing.
          className="display dashboard-table zebra-stable-on-hover"
          options={{
            paging: true,
            searching: true,
            ordering: true,
            // Read from sortOrderRef, not a literal - carries the user's
            // last-chosen sort across this table's poll-driven remounts
            // instead of always resetting to Created Date desc. See
            // sortOrderRef's own comment above for why that's necessary here
            // specifically (unlike Chat/Eval's tables, which never remount).
            order: sortOrderRef.current,
            // Search top-left, entries-per-page + "Showing X to Y of Z" both
            // bottom-left above pagination, paging alone bottom-right - same
            // shared layout as ChatDashboardPage.js/EvalDashboardPage.js's
            // tables, not this table inventing its own placement.
            layout: {
              topStart: 'search',
              topEnd: {},
              bottomStart: { features: ['pageLength', 'info'] },
              bottomEnd: { paging: { firstLast: false } },
            },
            language: {
              ...dataTableLanguage(lang),
              // Visually just a "Filter" placeholder box, like the chat
              // viewer's log entries and the settings history table; the
              // <label> DataTables builds keeps an sr-only name (DataTables
              // inserts this string as HTML).
              search: `<span class="sr-only">${escapeHtml(t('batch.list.filterLabel'))}</span>`,
              searchPlaceholder: t('admin.common.filterPlaceholder'),
            },
            initComplete: function () {
              const api = this.api();
              try {
                // scope="col" only - no search-term pill here, the box's own
                // native clear (x) does that job.
                setColumnHeaderScope(api);
              } catch (e) {
                console.error('BatchList: setColumnHeaderScope failed', e);
              }
              try {
                // Keeps sortOrderRef current so the *next* remount (10s
                // poll) starts from wherever the user just sorted to,
                // instead of resetting - see sortOrderRef's own comment.
                api.on('order.dt', () => { sortOrderRef.current = api.order(); });
              } catch (e) {
                console.error('BatchList: order.dt listener registration failed', e);
              }
            },
            createdRow: (row, data) => {
              const { _id, status: rawStatus, aiProvider } = data;
              const status = normalizeStatus(rawStatus);
              const batchId = String(_id);
              const cells = row.querySelectorAll('td');
              // Manually paint DataTables' own .sorting_1/2/3 classes onto
              // the currently-sorted column's cell(s), instead of relying on
              // DataTables' internal classing (_fnSortingClasses), which
              // only reruns on redraw once its own internal `bSorted` flag
              // is set - true automatically for server-side tables, but for
              // this client-side one (data prop, no ajax) that flag needs an
              // explicit sort *action*, and three different ways of
              // triggering one through the DataTables API from initComplete
              // (synchronously, deferred via setTimeout, different `order`
              // values) all failed to make it stick. Doing it directly here
              // sidesteps that internal machinery entirely - createdRow
              // already reliably runs per row (the action buttons prove it),
              // and the class names are the only thing admin.css's existing
              // sort-highlight rules (table.dataTable.display > tbody tr >
              // .sorting_1, already shared with Chat/Eval) actually need;
              // nothing else about how DataTables tracks sorting internally
              // matters for the CSS to apply.
              cells.forEach((cell) => cell.classList.remove('sorting_1', 'sorting_2', 'sorting_3'));
              (sortOrderRef.current || []).forEach(([colIndex], i) => {
                if (i > 2) return; // admin.css/DataTables only define sorting_1/2/3
                const cell = cells[colIndex];
                if (cell) cell.classList.add(`sorting_${i + 1}`);
              });
              // Totals column is after status - find it as the cell before the actions cell
              const actionsCell = row.querySelector('td:last-child');
              const totalsCell = actionsCell ? actionsCell.previousElementSibling : cells[cells.length - 2];
              // Populate totals: prefer stats from service, fallback to 0/0
              try {
                const stats = data.stats || {};
                const total = Number(stats.total || 0);
                const processed = Number(stats.processed || 0);
                const failed = Number(stats.failed || 0);
                const finished = Number(stats.finished ?? processed + failed);
                if (totalsCell) {
                  totalsCell.innerText = t('batch.list.totalsLabel').replace('{finished}', formatNumber(finished, lang)).replace('{total}', formatNumber(total, lang));
                }
              } catch (e) {
                // ignore totals rendering errors
              }
              // Unmounts any previous root mounted on this cell before creating
              // the new one, so redraws don't leak roots.
              const root = getCellRoot(actionsCell);

              // If processed >= total show download/delete actions
              const stats = data.stats || {};
              const total = Number(stats.total || 0);
              const processedCount = Number(stats.processed || 0);
              const failedCount = Number(stats.failed || 0);
              const finishedCount = Number(stats.finished ?? processedCount + failedCount);
              // Show both Process and Delete buttons for running batches
              const isLocallyProcessing = processingBatches.includes(batchId);
              const workflow = data.workflow || data?.workflow || 'Default';

              const deleteAction = {
                key: 'delete',
                label: t('batch.list.actions.delete'),
                buttonRole: 'danger',
                onClick: () => handleDelete(_id, data.name),
              };

              let actions;
              if (
                (finishedCount >= total && status === 'processed') ||
                ['in_progress', 'processing', 'inprogress'].includes(status)
              ) {
                actions = [
                  ...(finishedCount >= total && status === 'processed'
                    ? [
                        { key: 'csv', label: t('batch.list.actions.csv'), icon: 'download', instant: true, onClick: () => handleExport(_id, 'csv', data.name) },
                        { key: 'excel', label: t('batch.list.actions.excel'), icon: 'download', instant: true, onClick: () => handleExport(_id, 'excel', data.name) },
                      ]
                    : []),
                  ...(['in_progress', 'processing', 'inprogress'].includes(status) || finishedCount < total
                    ? [
                        {
                          key: 'process',
                          label: t('batch.list.actions.process'),
                          disabled: isLocallyProcessing,
                          onClick: () => {
                            // Don't allow pressing Process if this batch is marked locally processing
                            if (isLocallyProcessing) return false;
                            handleProcess(_id, aiProvider, workflow, data.name);
                          },
                        },
                      ]
                    : []),
                  deleteAction,
                ];
              } else if (finishedCount < total || total === 0) {
                actions = [
                  {
                    key: 'process',
                    label: t('batch.list.actions.process'),
                    disabled: isLocallyProcessing,
                    onClick: () => {
                      if (isLocallyProcessing) return false;
                      handleProcess(_id, aiProvider, workflow, data.name);
                    },
                  },
                  deleteAction,
                ];
              } else if (status === 'completed') {
                actions = [
                  { key: 'process', label: t('batch.list.actions.process'), onClick: () => handleProcess(_id, aiProvider, workflow, data.name) },
                  deleteAction,
                ];
              } else {
                actions = [
                  { key: 'cancel', label: t('batch.list.actions.cancel'), onClick: () => handleCancel(_id, aiProvider, data.name) },
                  deleteAction,
                ];
              }

              // Focus restoration for the row this cell belongs to (if it was
              // the one just clicked) happens inside RowActionButtons itself,
              // via a useEffect that fires once this render actually commits
              // — see its own comment for why that's more reliable than
              // trying to coordinate it from out here.
              root.render(<RowActionButtons batchId={batchId} actions={actions} t={t} pendingFocusRef={pendingFocusRef} />);
            },
          }}
          // Key forces a full remount when batches change so rows (and actions)
          // re-render with the latest statuses returned from the backend.
          key={refreshKey}
        >
          <caption className="sr-only">{t(batchStatus === 'processed' ? 'batch.sections.processed.title' : 'batch.sections.running.title')}</caption>
        </DataTable>
      </div>
    </div>
  );
};

export default BatchList;
