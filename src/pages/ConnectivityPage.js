import React, { useState, useCallback } from 'react';
import { GcdsContainer, GcdsButton, GcdsText } from '@gcds-core/components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import DataStoreService from '../services/DataStoreService.js';

const StatusBadge = ({ status }) => {
    const colors = {
        connected: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
        error: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
        warning: { bg: '#fff3cd', color: '#856404', border: '#ffeeba' },
        not_configured: { bg: '#e2e3e5', color: '#383d41', border: '#d6d8db' },
        testing: { bg: '#cce5ff', color: '#004085', border: '#b8daff' }
    };

    const style = colors[status] || colors.not_configured;

    return (
        <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '4px',
            backgroundColor: style.bg,
            color: style.color,
            border: `1px solid ${style.border}`,
            fontWeight: 600,
            fontSize: '0.875rem',
            textTransform: 'uppercase'
        }}>
            {status.replace('_', ' ')}
        </span>
    );
};

const ServiceCard = ({ service, t }) => {
    const { service: name, status, message, latencyMs, details } = service;

    return (
        <div style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '16px',
            backgroundColor: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{name}</h3>
                <StatusBadge status={status} />
            </div>

            <p style={{ margin: '8px 0', color: '#666' }}>{message}</p>

            {latencyMs !== undefined && (
                <p style={{ margin: '4px 0', fontSize: '0.875rem', color: '#888' }}>
                    {t('connectivity.latency')}: {latencyMs}ms
                </p>
            )}

            {details && (
                <details style={{ marginTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', color: '#0071bc' }}>{t('connectivity.details')}</summary>
                    <pre style={{
                        backgroundColor: '#f5f5f5',
                        padding: '12px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
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
    const [simulatedFailures, setSimulatedFailures] = useState({
        database: false,
        search: false,
        llm: false,
    });
    const [savingSimulation, setSavingSimulation] = useState({});

    React.useEffect(() => {
        let active = true;
        async function loadSimulationSettings() {
            const entries = await Promise.all(SIMULATION_SETTINGS.map(async ({ key, service }) => ([
                service,
                String(await DataStoreService.getSetting(key, 'false')) === 'true',
            ])));
            if (!active) return;
            setSimulatedFailures(Object.fromEntries(entries));
        }
        loadSimulationSettings();
        return () => {
            active = false;
        };
    }, []);

    const toggleSimulation = useCallback(async (service) => {
        const setting = SIMULATION_SETTINGS.find((entry) => entry.service === service);
        if (!setting) return;

        const nextValue = !simulatedFailures[service];
        setSavingSimulation((current) => ({ ...current, [service]: true }));
        try {
            await DataStoreService.setSetting(setting.key, String(nextValue));
            const saved = await DataStoreService.getSetting(setting.key, 'false');
            setSimulatedFailures((current) => ({ ...current, [service]: String(saved) === 'true' }));
        } finally {
            setSavingSimulation((current) => ({ ...current, [service]: false }));
        }
    }, [simulatedFailures]);

    const runTests = useCallback(async () => {
        setLoading(true);
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
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    return (
        <GcdsContainer layout="page" className="mb-600">
            <h1 className="mb-400">
                {t('connectivity.title', 'Service Connectivity Dashboard')}
            </h1>

            <nav className="mb-400">
                <a href={`/${lang}/admin`}>
                    {t('common.backToAdmin')}
                </a>
            </nav>

            <GcdsText className="mb-400">
                {t('connectivity.description',
                    'Test connectivity to all external services and AI providers used by AI Answers.')}
            </GcdsText>

            <div className="mb-400">
                <GcdsButton
                    onClick={runTests}
                    disabled={loading}
                >
                    {loading
                        ? t('connectivity.testing', 'Testing connections...')
                        : t('connectivity.runTests', 'Run Connectivity Tests')}
                </GcdsButton>
            </div>

            <section className="mb-400">
                <h2 className="mb-300">{t('connectivity.simulation.title')}</h2>
                <GcdsText className="mb-300">{t('connectivity.simulation.description')}</GcdsText>

                {SIMULATION_SETTINGS.map(({ service }) => (
                    <div key={service} className="mb-200">
                        <span className="mr-200">{t(`connectivity.simulation.labels.${service}`)}</span>
                        <GcdsButton
                            onClick={() => toggleSimulation(service)}
                            disabled={Boolean(savingSimulation[service])}
                            aria-label={`${t(`connectivity.simulation.labels.${service}`)} ${simulatedFailures[service]
                                ? t('connectivity.simulation.disable')
                                : t('connectivity.simulation.enable')}`}
                        >
                            {simulatedFailures[service]
                                ? t('connectivity.simulation.disable')
                                : t('connectivity.simulation.enable')}
                        </GcdsButton>
                    </div>
                ))}
            </section>

            {error && (
                <div style={{
                    padding: '16px',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '4px',
                    color: '#721c24',
                    marginBottom: '20px'
                }}>
                    <strong>{t('connectivity.error')}:</strong> {error}
                </div>
            )}

            {results && (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '16px',
                        padding: '20px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        marginBottom: '24px'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#155724' }}>
                                {results.summary.connected}
                            </div>
                            <div style={{ color: '#666' }}>
                                {t('connectivity.connected', 'Connected')}
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#721c24' }}>
                                {results.summary.errors}
                            </div>
                            <div style={{ color: '#666' }}>
                                {t('connectivity.errors', 'Errors')}
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#856404' }}>
                                {results.summary.warnings}
                            </div>
                            <div style={{ color: '#666' }}>
                                {t('connectivity.warnings', 'Warnings')}
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#383d41' }}>
                                {results.summary.notConfigured}
                            </div>
                            <div style={{ color: '#666' }}>
                                {t('connectivity.notConfigured', 'Not Configured')}
                            </div>
                        </div>
                    </div>

                    <p style={{ color: '#888', fontSize: '0.875rem', marginBottom: '16px' }}>
                        {t('connectivity.lastRun', 'Last run')}: {new Date(results.timestamp).toLocaleString()}
                    </p>

                    <h2 className="mb-300">{t('connectivity.serviceDetails', 'Service Details')}</h2>

                    {results.services.map((service, index) => (
                        <ServiceCard key={index} service={service} t={t} />
                    ))}
                </>
            )}
        </GcdsContainer>
    );
};

export default ConnectivityPage;
