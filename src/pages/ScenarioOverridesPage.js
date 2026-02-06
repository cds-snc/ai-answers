import React, { useEffect, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import ScenarioOverrideService from '../services/ScenarioOverrideService.js';
import AuthService from '../services/AuthService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
// The `diff` package is a valid dependency but some eslint configurations
// (especially with ESM/Type:module projects) may incorrectly flag it as
// unresolved. Add an inline disable for import/no-unresolved on this line.
// eslint-disable-next-line import/no-unresolved
import { diffLines } from 'diff';

const SUPPORTED_DEPARTMENTS = ['CBSA-ASFC', 'CEO-BEC', 'CDS-SNC', 'CRA-ARC', 'ECCC', 'EDSC-ESDC', 'FIN', 'HC-SC', 'IRCC', 'ISED-ISDE', 'JUS', 'NRCan-RNCan', 'PSPC-SPAC', 'SAC-ISC', 'StatCan', 'TBS-SCT'];

// Render a simple column for diffs using the `diff` package's diffLines
const renderDiffColumn = (oldText, newText, side = 'left') => {
  const parts = diffLines(oldText || '', newText || '');
  // For the left column, show parts that are common or removed; for right, common or added
  return parts.map((part, idx) => {
    const { added, removed, value } = part;
    const key = `${idx}-${added ? 'a' : removed ? 'r' : 'c'}`;
    const commonStyle = { whiteSpace: 'pre-wrap', color: '#222' };
    if (added) {
      if (side === 'right') return <div key={key} style={{ backgroundColor: '#e6ffed', ...commonStyle }}>{value}</div>;
      return <div key={key} style={{ color: '#999', ...commonStyle }}>{''}</div>;
    }
    if (removed) {
      if (side === 'left') return <div key={key} style={{ backgroundColor: '#ffecec', ...commonStyle }}>{value}</div>;
      return <div key={key} style={{ color: '#999', ...commonStyle }}>{''}</div>;
    }
    return <div key={key} style={commonStyle}>{value}</div>;
  });
};

// (Removed overlay HTML builders — simplified diff rendering uses react elements below.)

// Safe wrapper that catches exceptions from renderDiffColumn so a diff error
// doesn't crash the whole page/router. Returns fallback UI on error.
const safeRenderDiffColumn = (oldText, newText, side = 'left') => {
  try {
    return renderDiffColumn(oldText, newText, side);
  } catch (err) {
    // Log so we can diagnose in browser console
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
      return (
        <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
          <h1 className="mb-400">{this.props.t ? this.props.t('scenarioOverrides.title', 'Scenario overrides') : 'Scenario overrides'}</h1>
          <p style={{ color: '#d3080c' }}>{this.props.t ? this.props.t('scenarioOverrides.error.fallback', 'An error occurred while loading this page.') : 'An error occurred while loading this page.'}</p>
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

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState(null);

  // refs to keep focus on textareas during edits
  const textareaRefs = useRef({});
  const autosaveTimers = useRef({});
  // keep latest rows in a ref so async callbacks/readers don't close over stale state
  const latestRowsRef = useRef([]);

  // track whether we've performed the initial load; subsequent refreshes should merge
  // server values with local in-progress edits rather than overriding them.

  // keep saving state separate from rows so updating the "saving" flag doesn't
  // replace textarea content or affect caret/scroll. Keyed by departmentKey.
  const [savingMap, setSavingMap] = useState({});

  // simplified UI: we won't maintain DOM overlays here. Keep refs for potential small enhancements.

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try { console.log('ScenarioOverridesPage: loading overrides...'); } catch (e) { /* ignore */ }
      setLoading(true);
      try {
        const data = await ScenarioOverrideService.listOverrides();
        if (!isMounted) return;
        try { console.log('Auth user during load:', AuthService.getUser()); } catch (e) { /* ignore */ }
        try { console.log('Raw listOverrides response:', data); } catch (e) { /* ignore */ }
        const serverRows = SUPPORTED_DEPARTMENTS.map((dept) => {
          const entry = Array.isArray(data) ? data.find((item) => item?.departmentKey === dept) : null;
          // Normalize whitespace for consistent display and diffing: trim leading/trailing whitespace
          const defaultTextRaw = entry?.defaultText ?? '';
          const overrideTextRaw = (typeof entry?.overrideText === 'string') ? entry.overrideText : '';
          const defaultText = (defaultTextRaw && typeof defaultTextRaw === 'string') ? defaultTextRaw.trim() : '';
          return {
            departmentKey: dept,
            defaultText,
            enabled: Boolean(entry?.enabled),
            updatedAt: entry?.updatedAt || null,
          };
        });


        const mapped = SUPPORTED_DEPARTMENTS.map((dept) => {
          const entry = Array.isArray(data) ? data.find((item) => item?.departmentKey === dept) : null;
          const defaultTextRaw = entry?.defaultText ?? '';
          const overrideTextRaw = (typeof entry?.overrideText === 'string') ? entry.overrideText : '';
          const defaultText = (defaultTextRaw && typeof defaultTextRaw === 'string') ? defaultTextRaw.trim() : '';
          const overrideText = (overrideTextRaw && typeof overrideTextRaw === 'string' && overrideTextRaw.length > 0) ? overrideTextRaw.trim() : defaultText;
          const result = {
            departmentKey: dept,
            defaultText,
            // If server override empty, fall back to defaultText
            overrideText,
            enabled: Boolean(entry?.enabled),
            updatedAt: entry?.updatedAt || null,
            // control details state to avoid browser collapse on re-mount
            editOpen: false,
            diffOpen: false,
            dirty: false,
            saving: false,
            error: null,
          };
          try { console.log('Loaded override for', dept, { defaultText, overrideText: result.overrideText, enabled: result.enabled, updatedAt: result.updatedAt }); } catch (e) { /* ignore */ }
          return result;
        });
        setRows(mapped);
        setGlobalError(null);
      } catch (error) {
        if (!isMounted) return;
        setGlobalError(t('scenarioOverrides.status.loadError', 'Unable to load overrides.'));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => { isMounted = false; };
  }, [t, language]);

  // keep the latest rows snapshot in a ref for callbacks
  useEffect(() => {
    latestRowsRef.current = rows;
  }, [rows]);

  // simplified UI: we won't maintain DOM overlays here. Keep refs for potential small enhancements.

  const handleFieldChange = (index, updates) => {
    // Use functional updater to avoid stale closures
    setRows((prev) => prev.map((row, idx) => {
      if (idx !== index) return row;
      return {
        ...row,
        ...updates,
        // ensure the edit details remain open while typing
        editOpen: updates.overrideText !== undefined ? true : row.editOpen,
        dirty: true,
        error: null,
      };
    }));

    // after state update, attempt to restore focus to the override textarea
    // use a short timeout so DOM updates have applied
    setTimeout(() => {
      const rowsSnapshot = textareaRefs.current;
      const latest = latestRowsRef.current;
      const key = latest && latest[index] && latest[index].departmentKey ? `override-${latest[index].departmentKey}` : null;
      if (key && rowsSnapshot[key]) {
        try { rowsSnapshot[key].focus(); } catch (e) { /* ignore */ }
      }
    }, 0);

    // Autosave behavior: if the override text changed, debounce save
    if (updates.overrideText !== undefined) {
      const latest = latestRowsRef.current;
      const dept = latest && latest[index] && latest[index].departmentKey;
      if (dept) {
        if (autosaveTimers.current[dept]) {
          clearTimeout(autosaveTimers.current[dept]);
        }
        autosaveTimers.current[dept] = setTimeout(() => {
          delete autosaveTimers.current[dept];
          handleSave(index);
        }, 1000);
      }
    }

    // If enabled toggled, save immediately (cancel any pending autosave)
    if (updates.enabled !== undefined) {
      const latest = latestRowsRef.current;
      const dept = latest && latest[index] && latest[index].departmentKey;
      if (dept && autosaveTimers.current[dept]) {
        clearTimeout(autosaveTimers.current[dept]);
        delete autosaveTimers.current[dept];
      }
      // schedule immediate save after state update
      setTimeout(() => handleSave(index), 0);
    }
  };

  // handleReset removed

  const handleSave = async (index) => {
    setGlobalError(null);

    // read the latest row snapshot to avoid stale closures
    const row = (latestRowsRef.current && latestRowsRef.current[index]) ? latestRowsRef.current[index] : rows[index];
    // Preserve the user's exact textarea content locally to avoid moving the cursor.
    // Only trim when constructing the payload to send to the server.
    const userText = (typeof row.overrideText === 'string') ? row.overrideText : '';
    const payloadText = (userText && userText.length > 0) ? userText.trim() : (row.defaultText || '').trim();
    if (!payloadText) {
      // Keep the user's text intact; just surface a save error.
      const deptKeyEmpty = row && row.departmentKey;
      if (deptKeyEmpty) setSavingMap((s) => ({ ...s, [deptKeyEmpty]: false }));
      setRows((prev) => prev.map((r, idx) => idx === index ? { ...r, error: t('scenarioOverrides.status.saveError', 'Unable to save override.') } : r));
      return;
    }

    // mark saving in the separate map to avoid changing textarea props
    if (row && row.departmentKey) setSavingMap((s) => ({ ...s, [row.departmentKey]: true }));

    try {
      try { console.log('handleSave invoked for', row.departmentKey, { payloadText, enabled: Boolean(row.enabled) }); } catch (e) { /* ignore */ }
      try { console.log('Saving override', { departmentKey: row.departmentKey, payloadText, enabled: Boolean(row.enabled) }); } catch (e) { /* ignore */ }
      const response = await ScenarioOverrideService.saveOverride({
        departmentKey: row.departmentKey,
        overrideText: payloadText,
        enabled: Boolean(row.enabled),
      });
      try { console.log('Save response for', row.departmentKey, response); } catch (e) { /* ignore */ }
      setRows((prev) => prev.map((r, idx) => {
        if (idx !== index) return r;
        // After a successful save, prefer the server-returned overrideText when provided.
        // Otherwise keep the user's in-progress override text so the cursor doesn't jump.
        const newOverrideText = (typeof response?.overrideText === 'string') ? response.overrideText : userText;
        return {
          ...r,
          overrideText: newOverrideText,
          enabled: Boolean(response?.enabled ?? row.enabled),
          updatedAt: response?.updatedAt || new Date().toISOString(),
          dirty: false,
          error: null,
        };
      }));
      if (row && row.departmentKey) setSavingMap((s) => ({ ...s, [row.departmentKey]: false }));
    } catch (error) {
      // clear saving flag and set error
      if (row && row.departmentKey) setSavingMap((s) => ({ ...s, [row.departmentKey]: false }));
      setRows((prev) => prev.map((r, idx) => idx === index ? { ...r, error: t('scenarioOverrides.status.saveError', 'Unable to save override.') } : r));
      setGlobalError(t('scenarioOverrides.status.saveError', 'Unable to save override.'));
    }
  };

  const pageTitle = t('scenarioOverrides.title', 'Scenario overrides');
  const description1 = t('scenarioOverrides.description1', 'Edit your department scenario and test the changes. Open the Edit window, make your changes, and when you\'re ready to test, check the Apply edits button. To test, go back to your admin menu, and use the select the top \'Use AI Answers...\' option. It will apply your changes.');
  const description2 = t('scenarioOverrides.description2', 'If you\'re happy with the changes, alert the DTO team and they\'ll push the changes into the live AI Answers version.');
  const loadingLabel = t('scenarioOverrides.status.saving', 'Saving...');
  const emptyLabel = t('scenarioOverrides.empty.never', 'Never');

  return (
    <PageErrorBoundary t={t}>
      <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
        {/* no overlay styles needed in simplified UI */}
        <h1 className="mb-400">{pageTitle}</h1>
        <nav className="mb-400">
          <GcdsLink href={`/${language}/admin`}>
            {t('common.backToAdmin', 'Back to Admin')}
          </GcdsLink>
        </nav>
        <GcdsText className="mb-200">{description1}</GcdsText>
        <GcdsText className="mb-400">{description2}</GcdsText>

        {loading && <p>{loadingLabel}</p>}

        {!loading && globalError && (
          <p style={{ color: '#d3080c' }}>{globalError}</p>
        )}

        {/* Global success messages removed; per-override saving indicators remain */}

        {!loading && rows.map((row, index) => {
          const formattedUpdatedAt = formatTimestamp(row.updatedAt, lang);
          return (
            <section key={row.departmentKey} className="mb-500">
              <header className="mb-200">
                <h2 className="mb-100">{row.departmentKey}</h2>
                <div style={{ fontSize: '0.9rem', color: '#54616c' }}>
                  <span>{t('scenarioOverrides.table.lastUpdated', 'Last updated')}: {formattedUpdatedAt || emptyLabel}</span>
                  {/* updatedBy removed: overrides are scoped per-user (userId) so showing
                     an additional "updated by" field is redundant. */}
                </div>
              </header>

              {/* original default details removed — default is shown in the left diff column */}

              {row.error && (
                <p style={{ color: '#d3080c' }}>{row.error}</p>
              )}

              {/* Two details blocks: one for editing the override, one for viewing the side-by-side diff */}
              <details className="mb-200" open={row.editOpen} onToggle={(e) => handleFieldChange(index, { editOpen: e.target.open })}>
                <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{t('scenarioOverrides.sections.editOverride', 'Edit override')}</span>
                  <span style={{ marginLeft: '1rem', color: '#54616c', fontSize: '0.9rem' }}>
                    {(savingMap[row.departmentKey]) ? loadingLabel : (row.dirty ? t('scenarioOverrides.status.saving', 'Saving...') : null)}
                  </span>
                </summary>
                <div style={{ marginTop: '0.5rem' }}>
                  <textarea
                    aria-label={t('scenarioOverrides.table.overrideLabel', 'Override text')}
                    value={row.overrideText && row.overrideText.length > 0 ? row.overrideText : row.defaultText}
                    onChange={(e) => handleFieldChange(index, { overrideText: e.target.value })}
                    rows={Math.max(8, (row.overrideText || row.defaultText || '').split('\n').length)}
                    ref={(el) => { if (el) textareaRefs.current[`override-${row.departmentKey}`] = el; }}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.95rem' }}
                  />
                  {/* saving indicator moved above so the details block doesn't jump */}
                </div>
              </details>

              <details className="mb-200" open={row.diffOpen} onToggle={(e) => handleFieldChange(index, { diffOpen: e.target.open })}>
                <summary style={{ cursor: 'pointer' }}>{t('scenarioOverrides.sections.visualDiff', 'Visual diff (side-by-side)')}</summary>
                <div style={{ marginTop: '0.5rem', border: '1px solid #e1e1e1', borderRadius: '4px', padding: '0.5rem', overflowX: 'auto' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{t('scenarioOverrides.table.defaultLabel', 'Default')}</div>
                      <div style={{ backgroundColor: '#fff', padding: '0.5rem', borderRadius: '4px' }}>
                        {safeRenderDiffColumn(row.defaultText || '', row.overrideText || '', 'left')}
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{t('scenarioOverrides.table.overrideLabel', 'Override')}</div>
                      <div style={{ backgroundColor: '#fff', padding: '0.5rem', borderRadius: '4px' }}>
                        {safeRenderDiffColumn(row.defaultText || '', row.overrideText || '', 'right')}
                      </div>
                    </div>
                  </div>
                </div>
              </details>

              <div className="mb-400">
                <label style={{ marginRight: '1rem', display: 'inline-flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(event) => handleFieldChange(index, { enabled: event.target.checked })}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>{t('scenarioOverrides.table.enabled', 'Use override')}</span>
                </label>
                {/* per-override saving indicator moved into the edit summary to avoid layout jumps */}
              </div>
            </section>
          );
        })}
      </GcdsContainer>
    </PageErrorBoundary>
  );
};

export default ScenarioOverridesPage;
