import React, { useState, useCallback } from 'react';
import { GcdsContainer, GcdsButton, GcdsText } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import '../styles/App.css';

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

const ServiceCard = ({ service }) => {
    const { service: name, status, message, latencyMs, configured, details } = service;

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
                    Latency: {latencyMs}ms
                </p>
            )}

            {details && (
                <details style={{ marginTop: '12px' }}>
                    <summary style={{ cursor: 'pointer', color: '#0071bc' }}>Details</summary>
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

const ConnectivityPage = ({ lang = 'en' }) => {
    const { t } = useTranslations(lang);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

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
        <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
            <h1 className="mb-400">
                {t('connectivity.title', 'Service Connectivity Dashboard')}
            </h1>

            <GcdsText className="mb-400">
                {t('connectivity.description',
                    'Test connectivity to all external services and AI providers used by AI Answers. (Staging/Production Review)')}
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

            {error && (
                <div style={{
                    padding: '16px',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '4px',
                    color: '#721c24',
                    marginBottom: '20px'
                }}>
                    <strong>Error:</strong> {error}
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
                        <ServiceCard key={index} service={service} />
                    ))}
                </>
            )}
        </GcdsContainer>
    );
};

export default ConnectivityPage;
