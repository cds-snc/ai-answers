import React, { useState, useCallback, useRef } from 'react';
import { GcdsContainer, GcdsButton, GcdsText } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import DataStoreService from '../services/DataStoreService.js';
import StatusMessage from '../components/admin/StatusMessage.js';
import { announce } from '../utils/liveAnnouncer.js';
import { formatNumber } from '../utils/numberFormat.js';

// GC DS tokens; shared by the status badges and the summary boxes. The
// border matches the background so the shapes stay soft.
const STATUS_COLORS = {
    connected: { bg: 'var(--gcds-color-green-100)', color: 'var(--gcds-color-green-700)' },
    error: { bg: 'var(--gcds-color-red-100)', color: 'var(--gcds-color-red-700)' },
    warning: { bg: 'var(--gcds-color-yellow-100)', color: 'var(--gcds-color-yellow-750)' },
    not_configured: { bg: 'var(--gcds-color-grayscale-50)', color: 'var(--gcds-color-grayscale-700)' },
    testing: { bg: 'var(--gcds-color-blue-100)', color: 'var(--gcds-color-blue-700)' }
};

const StatusBadge = ({ status, t }) => {
    // The server sends raw English values; an unknown one is shown as-is.
    const labels = {
        connected: t('connectivity.connected'),
        error: t('connectivity.statusError'),
        warning: t('connectivity.statusWarning'),
        not_configured: t('connectivity.notConfigured'),
    };
    const style = STATUS_COLORS[status] || STATUS_COLORS.not_configured;

    return (
        <span data-status={status} style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '4px',
            backgroundColor: style.bg,
            color: style.color,
            border: `1px solid ${style.bg}`,
            fontWeight: 600,
            fontSize: '0.875rem',
            textTransform: 'uppercase'
        }}>
            {labels[status] ?? status.replace('_', ' ')}
        </span>
    );
};

const ServiceCard = ({ service, t, lang }) => {
    const { service: name, status, message, latencyMs, details } = service;

    return (
        <div className="dashboard-card p-300 mb-200">
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                {/* name, message and details come from the server in English only. */}
                <h3 lang="en" style={{ margin: 0, fontSize: '1.25rem' }}>{name}</h3>
                <StatusBadge status={status} t={t} />
            </div>

            <p lang="en" style={{ margin: '8px 0', color: '#666' }}>{message}</p>

            {latencyMs !== undefined && (
                <p style={{ margin: '4px 0', fontSize: '0.875rem', color: 'var(--gcds-text-secondary)' }}>
                    {t('connectivity.latency')} {formatNumber(latencyMs, lang)} {t('connectivity.millisecondsUnit')}
                </p>
            )}

            {details && (
                <details style={{ marginTop: '12px' }}>
                    {/* Site-wide summary styles; an inline colour here overrode the
                        white focus text, leaving blue on blue. */}
                    <summary>{t('connectivity.details')}</summary>
                    <pre lang="en" style={{
                        backgroundColor: '#f5f5f5',
                        padding: '12px',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        overflow: 'auto',
                        marginTop: '8px'
                    }}>
                        {JSON.stringify(details, null, 2)}
                    </pre>
                </details>
            )}
        </div>
    );
};

const SIMULATION_SETTINGS = [
    { key: 'connectivity.simulation.database', service: 'database' },
    { key: 'connectivity.simulation.search', service: 'search' },
    { key: 'connectivity.simulation.llm', service: 'llm' },
];

const ConnectivityPage = ({ lang = 'en' }) => {
    const { t } = useTranslations(lang);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Per service: true/false once loaded; null until then. These are
    // environment-wide settings, so each row shows its state rather than
    // guessing "off" before the load or after it fails.
    const [simulatedFailures, setSimulatedFailures] = useState({
        database: null,
        search: null,
        llm: null,
    });
    const [simulationLoadFailed, setSimulationLoadFailed] = useState(false);
    const [savingSimulation, setSavingSimulation] = useState({});
    // Service whose last save failed, or null.
    const [simulationSaveFailed, setSimulationSaveFailed] = useState(null);

    React.useEffect(() => {
        let active = true;
        async function loadSimulationSettings() {
            try {
                const entries = await Promise.all(SIMULATION_SETTINGS.map(async ({ key, service }) => ([
                    service,
                    String(await DataStoreService.getSettingStrict(key, 'false')) === 'true',
                ])));
                if (!active) return;
                setSimulatedFailures(Object.fromEntries(entries));
            } catch (err) {
                console.error('Error loading failure simulation settings:', err);
                if (active) setSimulationLoadFailed(true);
            }
        }
        loadSimulationSettings();
        return () => {
            active = false;
        };
    }, []);

    // A run already in flight queues one more run instead of overlapping,
    // however many toggles change during it - its results may predate them.
    const runInFlightRef = useRef(false);
    const rerunPendingRef = useRef(false);
    // Read after a toggle's save, not from the click-time render: a run can
    // finish while the save is still in progress.
    const hasResultsRef = useRef(false);

    const runTests = useCallback(async () => {
        if (runInFlightRef.current) {
            rerunPendingRef.current = true;
            return;
        }
        runInFlightRef.current = true;
        setLoading(true);

        try {
            do {
                rerunPendingRef.current = false;
                setError(null);
                try {
                    const response = await fetch('/api/util/util-connectivity', {
                        method: 'GET',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || `HTTP ${response.status}`);
                    }

                    const data = await response.json();
                    setResults(data);
                    hasResultsRef.current = true;
                    announce(
                        t('connectivity.testComplete')
                            .replace('{connected}', data.summary.connected)
                            .replace('{errors}', data.summary.errors)
                            .replace('{warnings}', data.summary.warnings)
                            .replace('{notConfigured}', data.summary.notConfigured)
                    );
                } catch (err) {
                    setError(err.message);
                }
            } while (rerunPendingRef.current);
        } finally {
            runInFlightRef.current = false;
            setLoading(false);
        }
    }, [t]);

    const toggleSimulation = useCallback(async (service) => {
        const setting = SIMULATION_SETTINGS.find((entry) => entry.service === service);
        if (!setting) return;

        const nextValue = !simulatedFailures[service];
        setSavingSimulation((current) => ({ ...current, [service]: true }));
        setSimulationSaveFailed(null);
        try {
            // setSetting throws on failure, so reaching here means nextValue is saved.
            await DataStoreService.setSetting(setting.key, String(nextValue));
            setSimulatedFailures((current) => ({ ...current, [service]: nextValue }));
            // aria-pressed changing after an async save isn't reliably read out.
            announce(t(nextValue ? 'connectivity.simulation.announceOn' : 'connectivity.simulation.announceOff')
                .replace('{service}', t(`connectivity.simulation.labels.${service}`)));
            // Results on screen (or on their way) no longer match the settings.
            if (hasResultsRef.current || runInFlightRef.current) runTests();
        } catch (err) {
            console.error(`Error saving ${service} failure simulation:`, err);
            setSimulationSaveFailed(service);
        } finally {
            setSavingSimulation((current) => ({ ...current, [service]: false }));
        }
    }, [simulatedFailures, runTests, t]);

    return (
        <GcdsContainer layout="page" className="mb-600">
            <h1 className="mb-400">
                {t('connectivity.title')}
            </h1>

            <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
                <a href={`/${lang}/admin`}>
                    {t('common.backToAdmin')}
                </a>
            </nav>

            <GcdsText className="mb-400">
                {t('connectivity.description')}
            </GcdsText>

            <div className="mb-400">
                <GcdsButton
                    onClick={runTests}
                    disabled={loading}
                >
                    {loading
                        ? t('connectivity.testing')
                        : t('connectivity.runTests')}
                </GcdsButton>
            </div>

            <section className="mb-400">
                <h2 id="simulation-heading" className="mb-300">{t('connectivity.simulation.title')}</h2>
                <GcdsText className="mb-300">{t('connectivity.simulation.description')}</GcdsText>

                <StatusMessage
                    variant={simulationLoadFailed ? 'error' : undefined}
                    message={simulationLoadFailed ? t('connectivity.simulation.loadFailed') : null}
                />
                {/* One compact row per service: name | joined On | Off pair. The
                    option in effect is blue (pressed). Native, not GcdsButton,
                    which only copies aria-pressed on load or click, so the saved
                    state wouldn't reach screen readers. Off until the settings
                    load. */}
                {/* filter-fields-full-size gives the names the field-label size
                    used on the other admin forms. */}
                <div className="canada-ca-toggle-rows filter-fields-full-size mb-300" role="group" aria-labelledby="simulation-heading">
                    {SIMULATION_SETTINGS.map(({ service }) => {
                        const isOn = simulatedFailures[service];
                        const isUnavailable = typeof isOn !== 'boolean' || Boolean(savingSimulation[service]);
                        const nameId = `simulation-${service}-name`;
                        return (
                            <div key={service}>
                                <span id={nameId} className="filter-label">{t(`connectivity.simulation.labels.${service}`)}</span>
                                <div className="canada-ca-toggle-group canada-ca-toggle-group--sm" role="group" aria-labelledby={nameId}>
                                    {[
                                        { value: true, label: t('connectivity.simulation.on') },
                                        { value: false, label: t('connectivity.simulation.off') },
                                    ].map(({ value, label }) => (
                                        <button
                                            key={String(value)}
                                            type="button"
                                            className="btn-secondary"
                                            aria-pressed={isOn === value}
                                            aria-disabled={isUnavailable ? 'true' : undefined}
                                            onClick={() => {
                                                if (isUnavailable || isOn === value) return;
                                                toggleSimulation(service);
                                            }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <StatusMessage
                    variant={simulationSaveFailed ? 'error' : undefined}
                    message={simulationSaveFailed
                        ? t('connectivity.simulation.saveFailed').replace('{service}', t(`connectivity.simulation.labels.${simulationSaveFailed}`))
                        : null}
                />
            </section>

            <StatusMessage variant={error ? 'error' : undefined}>
                {error && <><strong>{t('connectivity.error')}</strong> <code lang="en">{error}</code></>}
            </StatusMessage>

            {/* TODO: these counts should go through formatNumber(n, lang) per the
                project's number-formatting rule (AGENTS.md) — they're small today
                but this is a raw-number template that'll silently be wrong in fr-CA
                if these ever grow past 3 digits. */}
            {/* TODO: results.summary is dereferenced with no existence check — a
                malformed API response (results truthy, .summary missing) would
                throw during render. Pre-existing (predates the StatusMessage
                rollout that moved this block here), so out of scope for that
                pass — flagging rather than fixing blind. Revisit if
                DatabasePage.js's move to a { text, isError } status shape ends
                up establishing a shared "guard the response shape" pattern
                worth reusing here too. */}
            {results && (
                <>
                    <h2 className="mb-300">{t('connectivity.summaryHeading')}</h2>
                    <dl style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '16px',
                        margin: '0 0 24px'
                    }}>
                        <div style={{ textAlign: 'center', padding: '20px', backgroundColor: STATUS_COLORS.connected.bg, color: STATUS_COLORS.connected.color }}>
                            <dt>
                                {t('connectivity.connected')}
                            </dt>
                            <dd style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
                                {results.summary.connected}
                            </dd>
                        </div>
                        <div style={{ textAlign: 'center', padding: '20px', backgroundColor: STATUS_COLORS.error.bg, color: STATUS_COLORS.error.color }}>
                            <dt>
                                {t('connectivity.errors')}
                            </dt>
                            <dd style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
                                {results.summary.errors}
                            </dd>
                        </div>
                        <div style={{ textAlign: 'center', padding: '20px', backgroundColor: STATUS_COLORS.warning.bg, color: STATUS_COLORS.warning.color }}>
                            <dt>
                                {t('connectivity.warnings')}
                            </dt>
                            <dd style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
                                {results.summary.warnings}
                            </dd>
                        </div>
                        <div style={{ textAlign: 'center', padding: '20px', backgroundColor: STATUS_COLORS.not_configured.bg, color: STATUS_COLORS.not_configured.color }}>
                            <dt>
                                {t('connectivity.notConfigured')}
                            </dt>
                            <dd style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
                                {results.summary.notConfigured}
                            </dd>
                        </div>
                    </dl>

                    <p style={{ color: 'var(--gcds-text-secondary)', fontSize: '1rem', marginBottom: '16px' }}>
                        {t('connectivity.lastRun')} {new Date(results.timestamp).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
                    </p>

                    <h2 className="mb-300">{t('connectivity.serviceDetails')}</h2>

                    {results.services.map((service, index) => (
                        <ServiceCard key={index} service={service} t={t} lang={lang} />
                    ))}
                </>
            )}
        </GcdsContainer>
    );
};

export default ConnectivityPage;
