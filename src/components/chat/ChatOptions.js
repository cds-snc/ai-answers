import React, { useEffect, useRef, useState } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import { RoleBasedContent } from '../RoleBasedUI.js';
import { WORKFLOWS, AVAILABLE_MODELS, WORKFLOW_VALUES, MODEL_VALUES } from '../../config/workflows.js';
import StatusMessage, { useSrAnnouncer } from '../admin/StatusMessage.js';
import FeedbackInlineError from './FeedbackInlineError.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import { isWellFormedHttpUrl } from '../../utils/chat/referringUrl.js';

// workflowSelection / modelSelection are what the dropdowns show, which is not
// the same thing as what the chat will run: '' means "no override, follow the
// system settings", and the effective value in that case lives in
// ChatAppContainer (and is resolved server-side regardless).
const ChatOptions = ({
  safeT,
  modelSelection,
  handleAIToggle,
  workflowSelection,
  handleWorkflowChange,
  referringUrl,
  handleReferringUrlChange
}) => {
  // Workflow/Model apply live on change (like BatchUpload's GcdsSelects) —
  // the selected option is its own confirmation, no ambiguity to resolve.
  // Referring URL is explicit-submit instead: it's the one field here that
  // needs validation (a plain type="url" input never gets native browser
  // validation — that only fires on submit, and this wasn't a submit-driven
  // form before), and an explicit Apply makes that a normal submit failure
  // again, not an implicit background trigger — so the standard
  // focus-the-error-on-failure pattern (matching Settings' Save,
  // DatabasePage's Import) applies here too, no special-casing needed.
  const [draftUrl, setDraftUrl] = useState(referringUrl || '');
  const referringUrlError = useInlineFormError();
  // useInlineFormError only tracks *that* there's an error, not *which* one -
  // three different failures now share this one inline-error region (a
  // malformed URL, Apply with nothing typed, Clear with nothing applied),
  // so the message itself is tracked separately here.
  const [urlErrorMessage, setUrlErrorMessage] = useState('');
  const urlInputRef = useRef(null);
  // Visible confirmation that Apply/Clear actually took effect — nothing
  // else confirms a successful apply (unlike Workflow/Model, whose native
  // <select> already shows its own new value). Was sr-only; the
  // aria-disabled toggle on the buttons alone read as nothing-happened/
  // frozen with no visible feedback. nonce (bumped by announce()) forces
  // re-announcement even when the same text fires twice in a row (React
  // bails on an identical string update) — useSrAnnouncer's naming is a
  // holdover from its original sr-only use; the message/nonce bookkeeping
  // itself isn't sr-only-specific.
  const { message: successMessage, nonce: successNonce, announce: announceRaw, clear: clearSuccessMessage } = useSrAnnouncer();
  const announce = (key) => announceRaw(safeT(key));

  // Last value we told the parent to apply. Distinguishes an external
  // change to `referringUrl` (pageUrl auto-populate, a fresh chat) from the
  // prop settling to the value we just applied ourselves.
  const lastKnownUrlRef = useRef(referringUrl || '');

  useEffect(() => {
    const incoming = referringUrl || '';
    if (incoming !== lastKnownUrlRef.current) {
      // An external change (e.g. ChatAppContainer's initialReferringUrl
      // resolving asynchronously in review mode, after this field already
      // has focus) shouldn't overwrite text the user is actively typing.
      const isEditing = urlInputRef.current && document.activeElement === urlInputRef.current;
      lastKnownUrlRef.current = incoming;
      if (!isEditing) {
        setDraftUrl(incoming);
        referringUrlError.clearError();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referringUrl]);

  const handleUrlDraftChange = (e) => {
    setDraftUrl(e.target.value);
    // Don't show a stale error while retyping — only once Apply is pressed
    // again.
    referringUrlError.clearError();
  };

  const handleApplyUrl = (e) => {
    e.preventDefault();
    const trimmed = draftUrl.trim();
    // Neither button is ever disabled (prefer rejecting the interaction over
    // disabling the control - AGENTS.md/ChatViewer.js's own precedent: a
    // disabled control's reason is undiscoverable to a keyboard/screen-reader
    // user who never lands on it). Clearing is Clear's job now, not an empty
    // Apply - so an empty draft is a real error here, not a valid "remove
    // the override" submission.
    if (!trimmed) {
      setUrlErrorMessage(safeT('homepage.chat.options.referringUrl.emptyError'));
      referringUrlError.triggerError();
      // A stale "Referring URL applied/cleared." from an earlier action
      // otherwise keeps sitting there next to this new error, reading as
      // two contradictory outcomes for the same field at once.
      clearSuccessMessage();
      return;
    }
    if (!isWellFormedHttpUrl(trimmed)) {
      setUrlErrorMessage(safeT('homepage.chat.options.referringUrl.error'));
      referringUrlError.triggerError();
      clearSuccessMessage();
      return;
    }
    referringUrlError.clearError();
    // Normalize the displayed value too (e.g. a pasted trailing space).
    setDraftUrl(trimmed);
    if (trimmed !== lastKnownUrlRef.current) {
      lastKnownUrlRef.current = trimmed;
      handleReferringUrlChange({ target: { value: trimmed } });
      announce('homepage.chat.options.referringUrl.appliedAnnouncement');
    }
  };

  const handleClearAppliedUrl = () => {
    if (!referringUrl) {
      setUrlErrorMessage(safeT('homepage.chat.options.referringUrl.noUrlToClearError'));
      referringUrlError.triggerError();
      clearSuccessMessage();
      return;
    }
    referringUrlError.clearError();
    setDraftUrl('');
    lastKnownUrlRef.current = '';
    handleReferringUrlChange({ target: { value: '' } });
    announce('homepage.chat.options.referringUrl.removedAnnouncement');
    // Land back in the box, ready to type a new URL. No defer needed: the
    // Clear button stays mounted (no longer even conditionally disabled - see its
    // comment above), so there's no async re-render race to wait out.
    urlInputRef.current?.focus();
  };

  return (
    // Make the entire details panel visible to admin and partner; inside, restrict some controls to admin only
    <RoleBasedContent roles={["admin", "partner"]}>
      {/* Native <details>/<summary> — global.css already styles every one
          site-wide (border, arrow marker, GC DS-token focus ring), same
          pattern as SettingsPage.js's own sections, no extra classes needed
          for that. filter-fields-full-size: GC DS's normal desktop field
          size, matching SettingsPage.js, rather than FilterPanel's compact
          16px default — shared class, not new CSS (admin.css). */}
      <details className="filter-fields-full-size mt-400 mb-200">
        <summary>{safeT('homepage.chat.options.title')}</summary>
        {/* Admin-only controls. Live-apply, GC DS-token styled (.filter-select/
            .filter-label, matching SettingsPage): no draft, no Apply, the
            selected option is the only feedback needed. */}
        <RoleBasedContent roles={['admin']}>
          <div className="mrgn-bttm-10 settings-form-width">
            <label htmlFor="workflow" className="filter-label display-block">{safeT('homepage.chat.options.workflow.label')}</label>
            <select
              id="workflow"
              name="workflow"
              // Render blank rather than silently falling back to the first
              // option while the configured default is still loading — an
              // unmatched value here would misreport which workflow ran.
              //
              // TODO(follow-up, PR #1684 review): this `VALUES.includes(x) ? x
              // : fallback` shape is repeated 6+ times across this file,
              // ChatAppContainer.js, and SettingsPage.js. Per AGENTS.md's
              // "prefer central fixes for shared semantics", a shared helper
              // in src/config/workflows.js (e.g. `resolveWorkflow(value)` /
              // `resolveModel(value)`) would keep it from drifting.
              value={WORKFLOW_VALUES.includes(workflowSelection) ? workflowSelection : ''}
              onChange={handleWorkflowChange}
              className="filter-select"
            >
              <option value="">{safeT('homepage.chat.options.useSystemSettings')}</option>
              {WORKFLOWS.map(w => (
                <option key={w.value} value={w.value}>{safeT(w.labelKey)}</option>
              ))}
            </select>
          </div>

          <div className="mrgn-bttm-10 settings-form-width">
            <label htmlFor="model" className="filter-label display-block">{safeT('homepage.chat.options.model.label')}</label>
            <select
              id="model"
              name="model"
              value={MODEL_VALUES.includes(modelSelection) ? modelSelection : ''}
              onChange={handleAIToggle}
              className="filter-select"
            >
              <option value="">{safeT('homepage.chat.options.useSystemSettings')}</option>
              {AVAILABLE_MODELS.map(m => (
                <option key={m.value} value={m.value}>{safeT(m.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Search selection is hidden for now; Google is forced as the search
              provider. Commented out rather than aria-hidden + display:none:
              the outer <fieldset> still had browser-default border/padding,
              so it was creating a visible gap even with its content hidden.
              Kept here, inert, for whenever this is re-enabled:

              Re-enabling this also needs handleSearchToggle prop-threaded
              back in — it was removed as dead pass-through (ChatOptions no
              longer read it) once this block was commented out:
              ChatAppContainer.js's own JSX passing it to <ChatInterface>,
              and ChatInterface.js's own prop destructuring + its pass to
              <ChatOptions> below. The handler/state in ChatAppContainer.js
              itself (handleSearchToggle, selectedSearch) were left alone —
              still genuinely live, sent to the backend on every message —
              only the two-hop forwarding down to this now-commented-out UI
              was removed.

          <div className="search-toggle" aria-hidden="true">
            <fieldset className="ai-toggle_fieldset">
              <div className="ai-toggle_container" style={{ display: 'none' }}>
                <legend className="ai-toggle_legend">
                  {safeT('homepage.chat.options.searchSelection.label')}
                </legend>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="search-canadaca"
                    name="search-selection"
                    value="canadaca"
                    checked={false}
                    onChange={handleSearchToggle}
                    className="ai-toggle_radio-input"
                  />
                  <label htmlFor="search-canadaca">
                    {safeT('homepage.chat.options.searchSelection.canadaca')}
                  </label>
                </div>
                <div className="ai-toggle_option">
                  <input
                    type="radio"
                    id="search-google"
                    name="search-selection"
                    value="google"
                    checked={true}
                    onChange={handleSearchToggle}
                    className="ai-toggle_radio-input"
                  />
                  <label htmlFor="search-google">
                    {safeT('homepage.chat.options.searchSelection.google')}
                  </label>
                </div>
              </div>
            </fieldset>
          </div>
          */}
        </RoleBasedContent>

        {/* Referring URL visible to both admin and partner. No
            .settings-form-width cap here (unlike workflow/model above) — a
            long applied URL needs the panel's full width, not half of it.
            Reuses SettingsPage's .filter-label/.filter-input classes as-is
            (no new CSS). noValidate — type="url"'s native constraint
            validation would otherwise block submit on an invalid value
            before our own onSubmit (and FeedbackInlineError) run. */}
        <form onSubmit={handleApplyUrl} noValidate>
          <div className="mrgn-bttm-10">
            {referringUrlError.hasError && (
              <FeedbackInlineError
                id="referring-url-error"
                message={urlErrorMessage}
                errorCount={referringUrlError.errorCount}
                inputRef={referringUrlError.errorRef}
              />
            )}
            <label htmlFor="referring-url" className="filter-label display-block">
              {safeT('homepage.chat.options.referringUrl.label')}
            </label>
            <input
              id="referring-url"
              type="url"
              ref={urlInputRef}
              value={draftUrl}
              onChange={handleUrlDraftChange}
              className="filter-input"
              aria-describedby={referringUrlError.hasError ? 'referring-url-error' : undefined}
            />
            <GcdsButton type="submit" className="mt-200">
              {safeT('homepage.chat.options.referringUrl.applyLabel')}
            </GcdsButton>
            {/* Clears the currently-applied URL (reflects `referringUrl`, not
                the draft). Never disabled - clicking with nothing applied
                surfaces the same inline error region above ("No URL to
                clear") instead of a silently inert control (prefer
                rejecting the interaction over disabling it - see
                handleClearAppliedUrl/handleApplyUrl's own comments). */}
            <GcdsButton
              type="button"
              buttonRole="secondary"
              onClick={handleClearAppliedUrl}
              className="mt-200 mx-200"
            >
              {safeT('homepage.chat.options.referringUrl.clearLabel')}
            </GcdsButton>
            {/* Was sr-only — the only feedback Apply/Clear gave was the
                button's own aria-disabled toggle, easy to read as
                nothing-happened/frozen with no visible confirmation. Now a
                real visible success box; still persistent+nonce so a repeat
                Apply of the identical URL re-announces instead of React
                bailing on the unchanged string. */}
            <StatusMessage
              persistent
              variant="success"
              message={successMessage}
              nonce={successNonce}
            />
          </div>
        </form>
      </details>
    </RoleBasedContent>
  );
};

export default ChatOptions;
