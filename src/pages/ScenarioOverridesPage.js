import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GcdsContainer, GcdsText, GcdsLink, GcdsButton } from '@gcds-core/components-react';
import ScenarioOverrideService from '../services/ScenarioOverrideService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import LoadingOverlay from '../components/admin/LoadingOverlay.js';
import FeedbackInlineError from '../components/chat/FeedbackInlineError.js';
import { useInlineFormError } from '../hooks/useInlineFormError.js';
import ScenarioSubmitInstructions from '../components/scenario/ScenarioSubmitInstructions.js';
// The `diff` package is a valid dependency but some eslint configurations
// (especially with ESM/Type:module projects) may incorrectly flag it as
// unresolved. Add an inline disable for import/no-unresolved on this line.
// eslint-disable-next-line import/no-unresolved
import { diffLines } from 'diff';

const SUPPORTED_DEPARTMENTS = ['AAFC-AAC', 'BAC-LAC', 'CBSA-ASFC', 'CEO-BEC', 'CDS-SNC', 'CRA-ARC', 'DND-MDN', 'ECCC', 'EDSC-ESDC', 'FedDev-Ontario', 'FedNor', 'FIN', 'HC-SC', 'IRCC', 'ISED-ISDE', 'JUS', 'NRCan-RNCan', 'PacifiCan', 'PrairiesCan', 'SAC-ISC', 'StatCan', 'TC', 'TBS-SCT', 'VAC-ACC'];

// Renders one diff column (default vs. edited) using the `diff` package's
// diffLines. Unlike a plain background-colour diff, each changed line also
// carries a visible +/- glyph and a matching sr-only word — colour alone
// isn't a valid change indicator (WCAG 1.4.1), and this was flagged in the
// accessibility audit for this exact page. Unchanged-side placeholders keep
// the two columns line-aligned; they're aria-hidden since they carry no
// content of their own.
const renderDiffColumn = (oldText, newText, side, t) => {
  const parts = diffLines(oldText || '', newText || '');
  return parts.map((part, idx) => {
    const { added, removed, value } = part;
    const key = `${idx}-${added ? 'a' : removed ? 'r' : 'c'}`;
    if (added) {
      if (side === 'right') {
        return (
          <div key={key} style={{ whiteSpace: 'pre-wrap', backgroundColor: '#e6ffed', color: '#222' }}>
            <strong aria-hidden="true">+ </strong>
            <span className="sr-only">{t('scenarioOverrides.diff.addedLabel')} </span>
            {value}
          </div>
        );
      }
      return <div key={key} aria-hidden="true" />;
    }
    if (removed) {
      if (side === 'left') {
        return (
          <div key={key} style={{ whiteSpace: 'pre-wrap', backgroundColor: '#ffecec', color: '#222' }}>
            <strong aria-hidden="true">- </strong>
            <span className="sr-only">{t('scenarioOverrides.diff.removedLabel')} </span>
            {value}
          </div>
        );
      }
      return <div key={key} aria-hidden="true" />;
    }
    return <div key={key} style={{ whiteSpace: 'pre-wrap', color: '#222' }}>{value}</div>;
  });
};

// Safe wrapper that catches exceptions from renderDiffColumn so a diff error
// doesn't crash the whole page/router. Returns fallback UI on error.
const safeRenderDiffColumn = (oldText, newText, side, t) => {
  try {
    return renderDiffColumn(oldText, newText, side, t);
  } catch (err) {
    try { console.error('Diff render error:', err); } catch (e) { /* ignore */ }
    return <pre style={{ color: '#d3080c' }}>Unable to render diff.</pre>;
  }
};

const formatTimestamp = (value, lang) => {
  if (!value) {
    return null;
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return null;
  }
};

// Local ErrorBoundary moved to module scope so it's stable across renders.
class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    try { console.error('ScenarioOverridesPage error:', error, info); } catch (e) { /* ignore */ }
  }
  render() {
    if (this.state.hasError) {
      // this.props.t?.(...), not this.props.t(...): a fallback render must
      // never itself throw (there's no boundary above this one to catch a
      // secondary error) — optional-chain the call rather than restoring
      // main's old `t ? t(key, 'fallback text') : 'fallback text'` guard,
      // which duplicated a literal fallback string alongside every locale
      // key (against this repo's t()-takes-only-a-key convention).
      return (
        <GcdsContainer layout="page" className="mb-600">
          <h1 className="mb-400">{this.props.t?.('scenarioOverrides.title')}</h1>
          <p style={{ color: '#d3080c' }}>{this.props.t?.('scenarioOverrides.error.fallback')}</p>
          <p>{this.state.error?.toString?.() || ''}</p>
        </GcdsContainer>
      );
    }
    return this.props.children;
  }
}

const ScenarioOverridesPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();
  const [searchParams] = useSearchParams();

  // Deep-link support: the chat page's "Return and edit scenario" link
  // (ChatInterface.js) appends ?department=<key> so landing here after
  // testing picks up straight where you were, instead of a blank selector
  // you'd have to reselect from scratch. Computed once, outside either
  // useState, so both departmentKey's and loading's initializers agree —
  // loading has to start true (not its usual false) when a department
  // arrives pre-selected this way, or the section briefly commits with
  // loading:false and stale/empty department data on the very first paint,
  // before the load effect below has run even once. That's exactly the
  // window the #scenario-department-heading focus effect below raced: it
  // focused the heading during that premature first commit, then the load
  // effect's real setLoading(true) unmounted it (dropping focus to <body>),
  // and by the time the genuine data arrived the one-time guard had already
  // fired. Falls back to '' (nothing pre-selected) for an unrecognized or
  // missing value rather than trusting the query string outright.
  const initialDepartmentFromQuery = (() => {
    const requested = searchParams.get('department');
    return requested && SUPPORTED_DEPARTMENTS.includes(requested) ? requested : '';
  })();
  const [departmentKey, setDepartmentKey] = useState(initialDepartmentFromQuery);
  const [loading, setLoading] = useState(Boolean(initialDepartmentFromQuery));
  const [loadError, setLoadError] = useState(null);

  const [defaultText, setDefaultText] = useState('');
  const [overrideText, setOverrideText] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  // Separate from `dirty` (which also flips on the checkbox itself — using
  // it to gate the checkbox would make an unchecked box impossible to ever
  // check, since the checkbox would be the only thing that could unlock
  // itself). Tracks specifically "has the scenario text been edited this
  // session, not yet saved" — while true, `overrideText` doesn't necessarily
  // match what's on the server, so the checkbox falls back to staging a
  // pending change (needs an explicit Save) instead of applying immediately.
  // Resets on department load and after a successful save (using it up — a
  // further save needs a fresh edit).
  const [textEdited, setTextEdited] = useState(false);
  // Checking "use this scenario for testing" against text that doesn't
  // differ from the default is a rejected interaction, not a disabled one —
  // see the checkbox's own comment for why (disabled controls are pulled out
  // of the tab order, so the reason for being disabled is undiscoverable to
  // keyboard/screen-reader users; SC 3.3.1 Error Identification is the
  // pattern this codebase already uses for exactly this shape of
  // validation elsewhere).
  const { hasError: hasEnabledError, errorCount: enabledErrorCount, errorRef: enabledErrorRef, triggerError: triggerEnabledError, clearError: clearEnabledError } = useInlineFormError();

  // "Copy scenario text" below the textarea — the text is already loaded
  // into local state here (unlike the chat page's now-removed copy button,
  // which had to fetch it), so this is just a clipboard write, no request.
  const [copyStatus, setCopyStatus] = useState(null); // 'copied' | 'error'
  const handleCopyScenarioText = async () => {
    // A different action's stale outcome shouldn't keep sitting on screen
    // once you've moved on to this one (see SettingsPage.js's status
    // handling for the same convention) — clears Save/Revert's leftover
    // success/error the same way those two already clear this one below.
    setSaveStatus(null);
    try {
      await navigator.clipboard.writeText(overrideText || '');
      setCopyStatus('copied');
    } catch (error) {
      setCopyStatus('error');
    }
  };

  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  // Covers both Save's and Revert's outcome — one shared announcement
  // region rather than two, since only one of the two actions is ever
  // in flight at a time.
  const [saveStatus, setSaveStatus] = useState(null); // { variant: 'success' | 'error', message }
  // Disabling the Save button while it still has focus (mid-save) drops
  // focus to <body> in every browser — moving focus onto the outcome
  // message once the save settles gives keyboard/screen-reader users
  // somewhere sensible to land instead of silently resetting to the top of
  // the page.
  const saveStatusRef = useRef(null);
  const copyStatusRef = useRef(null);
  // Every action on this page already clears both saveStatus and
  // copyStatus explicitly (department switch, text edit, checkbox,
  // Save/Revert/Copy themselves) — but a click on something that isn't one
  // of those (the heading, the diff view, empty space) previously left a
  // stale outcome sitting on screen indefinitely. This is the general
  // catch-all: any click outside both status regions clears them. Refs
  // (not saveStatus/copyStatus in a dependency array) so the listener is
  // attached once and always reads current values, rather than being
  // torn down and re-attached on every status change. Calling the setters
  // when already null is a harmless no-op (React bails on the identical
  // value), so this doesn't need to check current state first.
  useEffect(() => {
    const handleDocumentClick = (event) => {
      const target = event.target;
      const insideSave = saveStatusRef.current && saveStatusRef.current.contains(target);
      const insideCopy = copyStatusRef.current && copyStatusRef.current.contains(target);
      if (insideSave || insideCopy) return;
      setSaveStatus(null);
      setCopyStatus(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);
  // Deep-link landing spot: the chat page's banner link
  // (ScenarioOverrideBanner.js) appends #scenario-department-heading so
  // arriving here scrolls to and announces the right department's heading,
  // not just a blank page top — a plain browser anchor jump can't do this on
  // its own since the heading doesn't exist in the DOM until the async
  // department fetch below resolves.
  //
  // pendingHashFocusRef, not a plain effect keyed on `loading`: an earlier
  // version raced React's own effect ordering — departmentKey changing and
  // `loading` flipping true happen in *separate* effects, so a hash-focus
  // effect keyed on [loading, departmentKey] could fire on the render in
  // between, while `loading` still held its stale pre-fetch value and the
  // heading had no real data yet. That focus then got dropped when the
  // section unmounted (loading correctly flipping true moments later), and
  // a one-time-only guard meant it never got a second chance once the real
  // data arrived. Setting the ref only inside the load effect's own success
  // callback below — and consuming it in an effect gated on that same
  // load's `loading` actually having gone false — ties the focus call
  // directly to "the real data for this exact request has landed," so it
  // can't fire early, and (unlike a permanent one-time guard) it's ready to
  // fire again for a later deep-link click within the same mounted session.
  const departmentHeadingRef = useRef(null);
  const pendingHashFocusRef = useRef(false);
  useEffect(() => {
    if (loading || loadError || !departmentKey || !pendingHashFocusRef.current) return;
    pendingHashFocusRef.current = false;
    departmentHeadingRef.current?.focus();
  }, [loading, loadError, departmentKey]);

  // Load the selected department's scenario. Only one department is ever
  // loaded/edited at a time — see AGENTS.md-adjacent discussion in the PR:
  // this page used to render all ~24 departments at once (each in its own
  // collapsed <details>), which was both the source of several accessibility
  // findings (a shared aria-label across 20 textareas) and encouraged
  // editing more than one department "at once," which the override system
  // was never meant to support as a workflow (see disableOtherOverrides in
  // services/ScenarioOverrideService.js — only one department's override can
  // be enabled for a user at a time).
  useEffect(() => {
    if (!departmentKey) {
      setDefaultText('');
      setOverrideText('');
      setEnabled(false);
      setUpdatedAt(null);
      setDirty(false);
      setTextEdited(false);
      setLoadError(null);
      setSaveStatus(null);
      clearEnabledError();
      setCopyStatus(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveStatus(null);
    clearEnabledError();
    setCopyStatus(null);

    ScenarioOverrideService.getDepartmentScenario(departmentKey)
      .then((data) => {
        if (cancelled) return;
        setDefaultText(data.defaultText);
        setOverrideText(data.overrideText || data.defaultText);
        setEnabled(data.enabled);
        setUpdatedAt(data.updatedAt);
        setDirty(false);
        setTextEdited(false);
        // Real data for this exact department has now landed — arm the
        // focus effect above rather than calling .focus() directly here:
        // `loading` is still true at this point (setLoading(false) hasn't
        // run yet, in .finally() below), so the heading isn't actually
        // rendered/mounted yet.
        if (window.location.hash === '#scenario-department-heading') {
          pendingHashFocusRef.current = true;
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(t('scenarioOverrides.status.loadError'));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [departmentKey, language, t]);

  const handleDepartmentChange = (event) => {
    const next = event.target.value;
    if (dirty && !window.confirm(t('scenarioOverrides.status.unsavedChangesConfirm'))) {
      return;
    }
    setDepartmentKey(next);
  };

  const handleTextChange = (event) => {
    setOverrideText(event.target.value);
    setDirty(true);
    setTextEdited(true);
    clearEnabledError();
    setSaveStatus(null);
    setCopyStatus(null);
  };

  // Shared by handleSave and handleEnabledChange's immediate-apply branch
  // below — same request shape, same conflict-vs-generic error split, same
  // saving/focus cleanup either way. Only what differs per caller is
  // parameterized: the text/enabled values actually being sent, the
  // success message (a static "Scenario saved." for an explicit Save vs.
  // "now active"/"no longer active" for the checkbox), and any extra
  // state each caller needs to update on success/error.
  const performSave = async ({ overrideText: textToSave, enabled: enabledToSave, buildSuccessMessage, onSuccess, onError }) => {
    setSaving(true);
    setSaveStatus(null);
    setCopyStatus(null);
    try {
      const response = await ScenarioOverrideService.saveOverride({
        departmentKey,
        overrideText: textToSave,
        enabled: enabledToSave,
        expectedUpdatedAt: updatedAt,
      });
      const nowEnabled = Boolean(response?.enabled ?? enabledToSave);
      setEnabled(nowEnabled);
      setUpdatedAt(response?.updatedAt || new Date().toISOString());
      setDirty(false);
      onSuccess?.(response, nowEnabled);
      setSaveStatus({ variant: 'success', message: buildSuccessMessage(nowEnabled) });
    } catch (error) {
      onError?.(error);
      // Another tab/window changed this department since this one last
      // loaded it — a generic "try again" would just fail the same way
      // again, so this gets its own message telling them to reload instead
      // of retrying blind.
      setSaveStatus({
        variant: 'error',
        message: error?.code === 'SCENARIO_OVERRIDE_CONFLICT'
          ? t('scenarioOverrides.status.conflictError')
          : t('scenarioOverrides.status.saveError'),
      });
    } finally {
      setSaving(false);
      // Runs after the disabled Save button (or the disabled checkbox) has
      // already dropped focus to <body> — reclaims it onto the outcome
      // message, success or error alike.
      saveStatusRef.current?.focus?.();
    }
  };

  const handleEnabledChange = async (event) => {
    const checked = event.target.checked;
    const hasMeaningfulText = (overrideText || '').trim() !== (defaultText || '').trim();
    // Turning it OFF is always allowed. Turning it ON requires the override
    // text to actually differ from the default — checking the box against
    // untouched default text would "enable" nothing meaningful. This isn't
    // gated on having edited *this session* specifically: a difference a
    // prior save already produced is just as real. Reject the interaction
    // (React's controlled `checked` just snaps back to its previous value
    // since we don't update `enabled`) and surface why via an inline error,
    // rather than pre-emptively disabling the checkbox (see hasEnabledError's
    // own comment for why).
    if (checked && !hasMeaningfulText) {
      triggerEnabledError();
      return;
    }
    clearEnabledError();

    // Once a scenario is already saved and there's no unsaved text edit
    // pending (overrideText still matches what's actually on the server),
    // the checkbox alone applies/un-applies it immediately — it takes effect
    // for real rather than staging a change that still needs an explicit
    // Save click.
    if (updatedAt && !textEdited) {
      setEnabled(checked);
      await performSave({
        overrideText: (overrideText || '').trim(),
        enabled: checked,
        buildSuccessMessage: (nowEnabled) => (nowEnabled
          ? t('scenarioOverrides.status.enabledSuccess')
          : t('scenarioOverrides.status.disabledSuccess')),
        onError: () => setEnabled(!checked),
      });
      return;
    }

    setEnabled(checked);
    setDirty(true);
    setSaveStatus(null);
    setCopyStatus(null);
  };

  const handleSave = async () => {
    const trimmed = (overrideText || '').trim();
    if (!trimmed) {
      setSaveStatus({ variant: 'error', message: t('scenarioOverrides.status.saveError') });
      return;
    }
    await performSave({
      overrideText: trimmed,
      enabled,
      buildSuccessMessage: () => t('scenarioOverrides.status.saveSuccess'),
      onSuccess: (response) => {
        setOverrideText(typeof response?.overrideText === 'string' ? response.overrideText : trimmed);
        // This edit has now been saved — re-checking the box after
        // unchecking it again would need a fresh edit, same as the first
        // time.
        setTextEdited(false);
      },
    });
  };

  // Deletes the saved override outright — not "discard my in-progress
  // edits" (that's just re-selecting the department, or leaving text
  // dirty), but "permanently give this department back its original
  // scenario." Destructive and hard to undo, so: danger-styled button +
  // window.confirm() gate, matching every other destructive admin action in
  // this codebase (see DatabasePage.js's delete/repair actions).
  const handleRevert = async () => {
    if (!window.confirm(t('scenarioOverrides.status.revertConfirm'))) {
      return;
    }
    setReverting(true);
    setSaveStatus(null);
    setCopyStatus(null);
    try {
      await ScenarioOverrideService.deleteOverride(departmentKey);
      setOverrideText(defaultText);
      setEnabled(false);
      setUpdatedAt(null);
      setDirty(false);
      setTextEdited(false);
      setSaveStatus({ variant: 'success', message: t('scenarioOverrides.status.revertSuccess') });
    } catch (error) {
      setSaveStatus({ variant: 'error', message: t('scenarioOverrides.status.revertError') });
    } finally {
      setReverting(false);
      saveStatusRef.current?.focus?.();
    }
  };

  const pageTitle = t('scenarioOverrides.title');
  const intro = t('scenarioOverrides.intro');
  const emptyLabel = t('scenarioOverrides.empty.never');
  const hasDiff = Boolean(departmentKey) && (defaultText || '').trim() !== (overrideText || '').trim();
  const formattedUpdatedAt = formatTimestamp(updatedAt, lang);
  // Whether there's a saved, currently-active override to test — not tied
  // to "did a save just happen" (that was the old testLinkVisible flag,
  // which reset on every unrelated edit/toggle and only ever showed
  // transiently right after clicking Save). This shows the link any time
  // you land on a department with an active saved override, revisit or not.
  // !dirty matters: an unsaved text edit means `overrideText` no longer
  // matches what's actually live on the server, so the link would test
  // stale (already-saved) text rather than the change on screen — hide it
  // until that edit is saved (or discarded) rather than let it point at the
  // wrong content.
  const showTestLink = Boolean(enabled && updatedAt && !dirty);

  return (
    <PageErrorBoundary t={t}>
      <GcdsContainer layout="page" className="mb-600">
        <h1 className="mb-400">{pageTitle}</h1>
        <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
          <GcdsLink href={`/${lang}/admin`}>
            {t('common.backToAdmin')}
          </GcdsLink>
        </nav>

        {/* Explains what this page does regardless of whether a department
            is picked yet — distinct from the department-specific editing UI
            below, which stays hidden until a department is selected. */}
        <GcdsText className="mb-400">{intro}</GcdsText>

        <label htmlFor="scenario-department-select" className="filter-label display-block">
          {t('scenarioOverrides.departmentSelect.label')}
        </label>
        {/* disabled during saving/reverting: nothing guarded the department
            switch against an in-flight request landing after the user
            switched away — the immediate-apply checkbox toggle in
            particular never sets `dirty` (see handleEnabledChange), so
            handleDepartmentChange's dirty-confirm guard alone couldn't
            catch it. A stale response's setEnabled/setUpdatedAt/
            setSaveStatus calls would silently overwrite whatever department
            had since been loaded, and steal focus onto its status message.
            Same self-evident-reason disabled pattern already used by the
            checkbox and Save/Revert/Copy buttons on this page. */}
        <select
          id="scenario-department-select"
          className="filter-select settings-form-width mb-400"
          value={departmentKey}
          onChange={handleDepartmentChange}
          disabled={saving || reverting}
        >
          <option value="">{t('scenarioOverrides.departmentSelect.placeholder')}</option>
          {SUPPORTED_DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>

        {/* Was previously an inline StatusMessage reusing status.saving —
            wrong on two counts: nothing is being saved while a department's
            data is loading (it's the department-select fetch, not Save),
            and there's nothing else usable on screen at this point anyway
            (the whole department-specific section below stays hidden until
            this resolves — see the !loading && !loadError guard further
            down), so a full-page overlay communicates that better than an
            inline message would. common.loading, not a scenario-specific
            key: this is a plain generic "loading" state with nothing
            scenario-specific to say. */}
        {departmentKey && loading && (
          <LoadingOverlay message={t('common.loading')} />
        )}

        {departmentKey && loadError && (
          <StatusMessage variant="error" message={loadError} />
        )}

        {departmentKey && !loading && !loadError && (
          // aria-labelledby names this region by the department heading —
          // otherwise it's an unlabeled landmark, indistinguishable from
          // any other region when navigating by landmark.
          <section aria-labelledby="scenario-department-heading">
            <h2 id="scenario-department-heading" ref={departmentHeadingRef} tabIndex={-1} className="mt-100 mb-0">{departmentKey}</h2>
            <div className="mb-200" style={{ fontSize: '0.9rem', color: '#54616c' }}>
              {t('scenarioOverrides.table.lastUpdated')}: {formattedUpdatedAt || emptyLabel}
            </div>

            <label htmlFor="scenario-override-text" className="filter-label display-block mb-100">
              {t('scenarioOverrides.editor.label')}
            </label>
            {/* filter-input: the same GC DS-token bordered field styling as
                the department select above and SettingsPage's own redaction
                textareas (className="filter-input") — reused rather than
                left as an unstyled/ad-hoc-styled native textarea. */}
            <textarea
              id="scenario-override-text"
              className="filter-input"
              value={overrideText}
              onChange={handleTextChange}
              rows={Math.max(30, (overrideText || '').split('\n').length)}
              style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}
              aria-describedby={saveStatus?.variant === 'error' ? 'scenario-save-status' : undefined}
            />

            {/* Only appears when there's an actual difference to show — an
                empty/unopenable disclosure with nothing behind it is just
                noise. */}
            {hasDiff && (
              <details className="mb-200 mt-200">
                <summary style={{ cursor: 'pointer' }}>{t('scenarioOverrides.diff.heading')}</summary>
                {/* One bordered box, not two side-by-side boxes with a gap
                    between them (which read as separate boxes melting into
                    each other) — the divider between columns is a single
                    border-right on the left column, matching the same GC DS
                    thick-border token .filter-input uses elsewhere on this
                    page. Each column is an exact 50%, not flex-grow-derived.
                    font-size-text-xsm-nr: fixed 16px that doesn't shrink
                    responsively (global.css), matching this page's other
                    form-field text. */}
                <div
                  className="font-size-text-xsm-nr mt-100"
                  style={{
                    display: 'flex',
                    border: 'var(--gcds-input-border-width) solid var(--gcds-input-default-text)',
                    borderRadius: 'var(--gcds-input-border-radius)',
                    overflowX: 'auto',
                  }}
                >
                  <div
                    style={{
                      width: '50%',
                      boxSizing: 'border-box',
                      padding: '0.5rem',
                      borderRight: 'var(--gcds-input-border-width) solid var(--gcds-input-default-text)',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{t('scenarioOverrides.diff.defaultLabel')}</div>
                    {safeRenderDiffColumn(defaultText, overrideText, 'left', t)}
                  </div>
                  <div style={{ width: '50%', boxSizing: 'border-box', padding: '0.5rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{t('scenarioOverrides.diff.overrideLabel')}</div>
                    {safeRenderDiffColumn(defaultText, overrideText, 'right', t)}
                  </div>
                </div>
              </details>
            )}

            {/* gc-chckbxrdio md: the GC DS checkbox styling (see global.css),
                regular/medium size — same as BatchUpload.js and
                ExpertFeedbackComponent.js — not FilterPanel's compact .sm
                checkbox groups (this isn't a dense filter sidebar).
                Label must stay a sibling of the input, not a wrapper, for
                the CSS's input + label selectors to apply.
                Always enabled/clickable — checking it on against text that
                doesn't differ from the default is rejected with an inline
                error (see handleEnabledChange), not blocked by disabling the
                control. Once a scenario is already saved, toggling this
                applies/un-applies it immediately (no separate Save click
                needed) as long as there's no unsaved text edit pending.
                Only one department can be active for testing at a time
                (disableOtherOverrides, services/ScenarioOverrideService.js)
                — checking this one silently turns off any other department
                this same user has enabled; that's internal plumbing the
                person testing doesn't need surfaced as UI copy. */}
            <div className="gc-chckbxrdio md mt-200 mb-200">
              {/* Convention (see SettingsPage.js's SettingsTextArea): the
                  inline error renders above the field it describes, not
                  below. */}
              {hasEnabledError && (
                <FeedbackInlineError
                  id="scenario-enabled-error"
                  message={t('scenarioOverrides.table.enabledError')}
                  errorCount={enabledErrorCount}
                  inputRef={enabledErrorRef}
                />
              )}
              <div className="checkbox">
                <input
                  type="checkbox"
                  id="scenario-enabled"
                  checked={enabled}
                  onChange={handleEnabledChange}
                  disabled={saving || reverting}
                  aria-describedby={hasEnabledError ? 'scenario-enabled-error' : undefined}
                />
                <label htmlFor="scenario-enabled">{t('scenarioOverrides.table.enabled')}</label>
              </div>
            </div>

            {/* Save requires: something to persist (dirty), and a non-empty
                scenario — deliberately NOT the "use this scenario for
                testing" checkbox. Saving and testing are separate actions:
                you can save a draft with testing off and come back to enable
                it later, or enable it immediately after (see
                handleEnabledChange's immediate-apply path). Revert and Copy
                are both only meaningful once something's actually been saved
                (updatedAt). Copy also requires !dirty — unsaved edits in the
                textarea haven't been persisted yet, so copying them to hand
                to the AI Answers team would misrepresent what "this
                scenario" is on the server; save (or discard the edit) first.
                Same self-evident-reason disabled pattern as Revert, not the
                reject-with-inline-error treatment the enabled checkbox uses
                (there the reason wasn't otherwise visible on screen — here
                it's obvious from the rest of the page). Revert is
                danger-styled since it
                permanently deletes the saved override, gated behind
                window.confirm() like every other destructive admin action
                in this codebase. */}
            {/* Same reasoning as the department-load overlay above: every
                other control on the page is already disabled while either
                of these is in flight (select, checkbox, Save/Revert/Copy
                all gate on saving || reverting), so there's nothing left to
                do until it resolves — a full-page overlay says that more
                clearly than an inline message would. Only one of the two
                is ever true at a time in practice (Revert is itself
                disabled while saving, and vice versa). */}
            {(saving || reverting) && (
              <LoadingOverlay message={saving ? t('scenarioOverrides.status.saving') : t('scenarioOverrides.status.reverting')} />
            )}

            {/* saving/reverting no longer swap these buttons' own labels —
                the LoadingOverlay below covers that (there's nothing else
                actionable on the page while either is in flight anyway, per
                the same reasoning as the department-load overlay above), so
                keeping a second, separate "is this in progress" signal on
                the button itself would just be redundant. */}
            <GcdsButton
              type="button"
              onClick={handleSave}
              disabled={saving || reverting || !dirty || !overrideText.trim()}
            >
              {t('scenarioOverrides.buttons.save')}
            </GcdsButton>{' '}
            <GcdsButton
              type="button"
              buttonRole="danger"
              onClick={handleRevert}
              disabled={saving || reverting || !updatedAt}
            >
              {t('scenarioOverrides.buttons.revert')}
            </GcdsButton>{' '}
            <GcdsButton
              type="button"
              buttonRole="secondary"
              onClick={handleCopyScenarioText}
              disabled={saving || reverting || !updatedAt || dirty}
            >
              {t('scenarioOverrides.buttons.copy')}
            </GcdsButton>
            {/* A completed copy is a real outcome, same as save/revert — the
                success/error box states, not the plain no-variant style.
                persistent + tag="div": same reasoning as scenario-save-status
                below — without both, this was populated-on-insertion (missed
                by AT) the first time it ever appeared, and StatusMessage's
                resolved tag flips <p> (empty) → <div> (variant set) between
                renders without tag="div" pinned, forcing React to destroy
                and recreate the node either way. */}
            <StatusMessage
              ref={copyStatusRef}
              tag="div"
              persistent
              variant={copyStatus === 'copied' ? 'success' : copyStatus === 'error' ? 'error' : undefined}
              message={
                copyStatus === 'copied' ? t('scenarioOverrides.status.copied')
                  : copyStatus === 'error' ? t('scenarioOverrides.status.copyError')
                    : undefined
              }
            />

            {/* persistent: this region exists (empty) from first render, so
                a save outcome landing in it is a content *change* an AT
                picks up, not a fresh insertion with text already in it —
                the exact failure mode StatusMessage.js's own doc comment
                warns about. tabIndex + ref let handleSave reclaim focus
                here once the (disabled, and therefore focus-dropping) Save
                button settles. tag="div" is pinned explicitly: without it,
                StatusMessage's resolved tag flips from <p> (empty) to <div>
                (once variant is set) between renders, which forces React to
                destroy and recreate the node — silently reintroducing the
                same populated-on-insertion problem persistent exists to fix. */}
            <StatusMessage
              id="scenario-save-status"
              ref={saveStatusRef}
              tabIndex={-1}
              tag="div"
              persistent
              variant={saveStatus?.variant}
              message={saveStatus?.variant === 'error' ? saveStatus.message : undefined}
            >
              {saveStatus?.variant === 'success' ? (
                <>
                  <span className="gcds-icon fa fa-solid fa-check-circle" aria-hidden="true"></span>
                  {saveStatus.message}
                </>
              ) : undefined}
            </StatusMessage>

            {/* Pulled out of the success message on purpose — this reflects
                current state ("is there an active saved scenario right now"),
                not "did a save just happen," so it needs to be able to show
                up on a plain revisit too, not only glued to a one-off save
                outcome. Always mounted (role="status", not conditionally
                rendered) so it appearing is a content *change* an AT picks
                up, not a fresh insertion with text already in it — same
                "populated on insertion" concern as scenario-save-status
                above and ScenarioOverrideBanner.js. */}
            <div className="mt-300" role="status" aria-live="polite">
              {showTestLink && (
                <p className="mt-100">
                  <GcdsLink href={`/${lang}`} target="_blank" rel="noopener noreferrer">
                    {t('scenarioOverrides.testLink')}
                  </GcdsLink>
                </p>
              )}
            </div>

            {/* Below the save-outcome StatusMessage so it reads as "next
                step after that outcome," not squeezed between the buttons
                and their own result. No lang/departmentKey passed — no
                "return to edit" link here, since you're already on this
                page (see ScenarioSubmitInstructions.js's own comment). */}
            <ScenarioSubmitInstructions t={t} />
          </section>
        )}
      </GcdsContainer>
    </PageErrorBoundary>
  );
};

export default ScenarioOverridesPage;
