import React, { useState } from 'react';
import { GcdsContainer, GcdsHeading, GcdsButton, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../../hooks/useTranslations.js';
import StatusMessage, { useRepeatableStatus } from '../../components/admin/StatusMessage.js';
import FeedbackInlineError from '../../components/chat/FeedbackInlineError.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import PassageResult from '../../components/experimental/PassageResult.js';
import { PassagesTestClientService } from '../../services/experimental/PassagesTestClientService.js';
import { usePassagesProbe } from '../../hooks/experimental/usePassagesProbe.js';
import { citedPageReturned, parseProbeCsv, probeResultsToCsv } from '../../utils/experimental/passagesProbe.js';
import { formatNumber } from '../../utils/numberFormat.js';

// Admin test page for Coveo passage retrieval (CRA only), Phase 1 of
// docs/plans/coveo-passage-retrieval.md. Runs only in the PR preview.

const MAX_PASSAGES_OPTIONS = [5, 10, 20];
const REASONS = ['out_of_scope', 'http_error', 'timeout', 'network_error', 'unexpected_response', 'not_configured', 'request_failed'];

function downloadText(text, fileName, type) {
    const url = window.URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

export default function ExperimentalPassagesPage({ lang = 'en' }) {
    const { t } = useTranslations(lang);

    const reasonText = (reason) => (REASONS.includes(reason)
        ? t(`experimental.passages.reason.${reason}`)
        : t('experimental.passages.reason.request_failed'));

    // Single query
    const [query, setQuery] = useState('');
    const [url, setUrl] = useState('');
    const [queryLang, setQueryLang] = useState('en');
    const [maxPassages, setMaxPassages] = useState(10);
    const [rawBody, setRawBody] = useState(null); // JSON text while editing a request
    const [sending, setSending] = useState(false);
    const [single, setSingle] = useState(null); // { result, contentLang }
    const singleStatus = useRepeatableStatus();
    const jsonError = useInlineFormError();

    // Probe run
    const [probeRows, setProbeRows] = useState(null);
    const [probeLang, setProbeLang] = useState('en');
    const [probeMax, setProbeMax] = useState(10);
    const fileStatus = useRepeatableStatus();
    const probe = usePassagesProbe();

    const showSingleOutcome = (result, contentLang) => {
        setSingle({ result, contentLang });
        if (result.ok) {
            singleStatus.announce(
                t('experimental.passages.singleDone').replace('{count}', () => formatNumber(result.passages.length, lang)),
                { variant: 'info' }
            );
        } else {
            singleStatus.announce(reasonText(result.reason), { isError: true, variant: 'error' });
        }
    };

    const send = async (runRequest, contentLang) => {
        setSending(true);
        singleStatus.clear();
        try {
            showSingleOutcome(await runRequest(), contentLang);
        } catch {
            setSingle(null);
            singleStatus.announce(t('experimental.passages.reason.request_failed'), { isError: true, variant: 'error' });
        } finally {
            setSending(false);
        }
    };

    const handleSend = () => {
        if (!query.trim()) return;
        send(() => PassagesTestClientService.runQuery({ query, url: url.trim() || undefined, lang: queryLang, maxPassages }), queryLang);
    };

    const handleSendRaw = () => {
        let body;
        try {
            body = JSON.parse(rawBody);
        } catch {
            body = null;
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            jsonError.triggerError();
            return;
        }
        jsonError.clearError();
        const contentLang = body.locale === 'fr' || body.localization?.locale?.startsWith?.('fr') ? 'fr' : 'en';
        send(() => PassagesTestClientService.runRaw(body), contentLang);
    };

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        setProbeRows(null);
        if (!file) {
            fileStatus.clear();
            return;
        }
        try {
            const rows = parseProbeCsv(await file.text());
            setProbeRows(rows);
            fileStatus.announce(
                t('experimental.passages.fileLoaded')
                    .replace('{count}', () => formatNumber(rows.length, lang))
                    .replace('{withUrl}', () => formatNumber(rows.filter((row) => row.url).length, lang)),
                { variant: 'info' }
            );
        } catch (err) {
            const key = err.code === 'MISSING_QUESTION_COLUMN' ? 'fileMissingQuestion' : 'fileInvalid';
            fileStatus.announce(t(`experimental.passages.${key}`), { isError: true, variant: 'error' });
        }
    };

    const fileStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    const probeFinishedMessage = probe.finished && (probe.finished.stopped
        ? t('experimental.passages.probeStopped')
        : t('experimental.passages.probeDone')
    ).replace('{count}', () => formatNumber(probe.finished.calls, lang));

    return (
        <GcdsContainer layout="page" className="mb-600">
            <GcdsHeading tag="h1">{t('experimental.passages.title')}</GcdsHeading>
            <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel')}>
                <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin')}</GcdsLink>
            </nav>
            <GcdsText className="mb-400">{t('experimental.passages.description')}</GcdsText>

            <section aria-labelledby="passages-single-heading" className="mb-600">
                <h2 id="passages-single-heading" className="mb-300">{t('experimental.passages.singleHeading')}</h2>
                <div className="d-grid gap-300">
                    <div>
                        <label htmlFor="passages-query" className="filter-label display-block mb-100">{t('experimental.passages.queryLabel')}</label>
                        <input id="passages-query" className="filter-input" type="text" value={query} maxLength={1000} onChange={(e) => setQuery(e.target.value)} />
                    </div>
                    <div>
                        <label htmlFor="passages-url" className="filter-label display-block mb-100">{t('experimental.passages.urlLabel')}</label>
                        <p id="passages-url-hint" className="font-size-text-sm-nr mb-100">{t('experimental.passages.urlHint')}</p>
                        <input id="passages-url" className="filter-input" type="url" value={url} maxLength={2000} aria-describedby="passages-url-hint" onChange={(e) => setUrl(e.target.value)} />
                    </div>
                    <div>
                        <label htmlFor="passages-lang" className="filter-label display-block mb-100">{t('experimental.passages.langLabel')}</label>
                        <select id="passages-lang" className="filter-input" value={queryLang} onChange={(e) => setQueryLang(e.target.value)}>
                            <option value="en">{t('batch.upload.language.english')}</option>
                            <option value="fr">{t('batch.upload.language.french')}</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="passages-max" className="filter-label display-block mb-100">{t('experimental.passages.maxLabel')}</label>
                        <select id="passages-max" className="filter-input" value={maxPassages} onChange={(e) => setMaxPassages(Number(e.target.value))}>
                            {MAX_PASSAGES_OPTIONS.map((n) => <option key={n} value={n}>{formatNumber(n, lang)}</option>)}
                        </select>
                    </div>
                    <div>
                        <GcdsButton onClick={handleSend} disabled={sending || !query.trim()}>
                            {t('experimental.passages.send')}
                        </GcdsButton>
                    </div>
                </div>

                {rawBody !== null && (
                    <div className="mt-400">
                        <label htmlFor="passages-raw" className="filter-label display-block mb-100">{t('experimental.passages.rawLabel')}</label>
                        <p id="passages-raw-hint" className="font-size-text-sm-nr mb-100">{t('experimental.passages.rawHint')}</p>
                        {jsonError.hasError && (
                            <FeedbackInlineError
                                id="passages-raw-error"
                                message={t('experimental.passages.rawInvalid')}
                                errorCount={jsonError.errorCount}
                                inputRef={jsonError.errorRef}
                            />
                        )}
                        <textarea
                            id="passages-raw"
                            className="filter-input"
                            lang="en"
                            value={rawBody}
                            rows={Math.max(12, rawBody.split('\n').length)}
                            style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}
                            aria-describedby={jsonError.hasError ? 'passages-raw-hint passages-raw-error' : 'passages-raw-hint'}
                            onChange={(e) => setRawBody(e.target.value)}
                        />
                        <div className="mt-200" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <GcdsButton onClick={handleSendRaw} disabled={sending}>
                                {t('experimental.passages.sendRaw')}
                            </GcdsButton>
                            <GcdsButton buttonRole="secondary" onClick={() => { setRawBody(null); jsonError.clearError(); }}>
                                {t('experimental.passages.closeRaw')}
                            </GcdsButton>
                        </div>
                    </div>
                )}

                <div className="mt-300">
                    {sending && <StatusMessage loading message={t('experimental.passages.sending')} />}
                    <StatusMessage
                        message={singleStatus.message}
                        variant={singleStatus.variant}
                        nonce={singleStatus.nonce}
                    />
                </div>

                {single && (
                    <>
                        <PassageResult result={single.result} contentLang={single.contentLang} lang={lang} t={t} />
                        {single.result.requestBody && rawBody === null && (
                            <div className="mt-300">
                                <GcdsButton
                                    buttonRole="secondary"
                                    onClick={() => setRawBody(JSON.stringify(single.result.requestBody, null, 2))}
                                >
                                    {t('experimental.passages.editRequest')}
                                </GcdsButton>
                            </div>
                        )}
                    </>
                )}
            </section>

            <section aria-labelledby="passages-probe-heading">
                <h2 id="passages-probe-heading" className="mb-300">{t('experimental.passages.probeHeading')}</h2>
                <GcdsText className="mb-300">{t('experimental.passages.probeDescription')}</GcdsText>
                <div className="d-grid gap-300">
                    <div>
                        <label htmlFor="passages-file" className="filter-label display-block mb-100">{t('experimental.passages.fileLabel')}</label>
                        <input id="passages-file" type="file" accept=".csv" onChange={handleFileChange} disabled={probe.running} />
                    </div>
                    <StatusMessage message={fileStatus.message} variant={fileStatus.variant} nonce={fileStatus.nonce} />
                    <div>
                        <label htmlFor="passages-probe-lang" className="filter-label display-block mb-100">{t('experimental.passages.langLabel')}</label>
                        <select id="passages-probe-lang" className="filter-input" value={probeLang} onChange={(e) => setProbeLang(e.target.value)} disabled={probe.running}>
                            <option value="en">{t('batch.upload.language.english')}</option>
                            <option value="fr">{t('batch.upload.language.french')}</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="passages-probe-max" className="filter-label display-block mb-100">{t('experimental.passages.maxLabel')}</label>
                        <select id="passages-probe-max" className="filter-input" value={probeMax} onChange={(e) => setProbeMax(Number(e.target.value))} disabled={probe.running}>
                            {MAX_PASSAGES_OPTIONS.map((n) => <option key={n} value={n}>{formatNumber(n, lang)}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <GcdsButton
                            onClick={() => probe.run(probeRows, { lang: probeLang, maxPassages: probeMax })}
                            disabled={probe.running || !probeRows?.length}
                        >
                            {t('experimental.passages.probeStart')}
                        </GcdsButton>
                        {probe.running && (
                            <GcdsButton buttonRole="secondary" onClick={probe.stop}>
                                {t('experimental.passages.probeStop')}
                            </GcdsButton>
                        )}
                    </div>
                </div>

                {probe.progress.total > 0 && (
                    <div className="mt-300">
                        <label htmlFor="passages-progress" className="filter-label display-block mb-100">
                            {t('experimental.passages.progress')
                                .replace('{done}', () => formatNumber(probe.progress.done, lang))
                                .replace('{total}', () => formatNumber(probe.progress.total, lang))}
                        </label>
                        <progress id="passages-progress" value={probe.progress.done} max={probe.progress.total} />
                    </div>
                )}

                {probeFinishedMessage && (
                    <div className="mt-300">
                        <StatusMessage message={probeFinishedMessage} variant={probe.finished.stopped ? 'warning' : 'info'} nonce={probe.finished.runId} />
                    </div>
                )}

                {probe.results.length > 0 && (
                    <>
                        {!probe.running && (
                            <div className="mt-300" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <GcdsButton
                                    buttonRole="secondary"
                                    onClick={() => downloadText(JSON.stringify(probe.results, null, 2), `passages-probe-${fileStamp()}.json`, 'application/json')}
                                >
                                    {t('experimental.passages.downloadJson')}
                                </GcdsButton>
                                <GcdsButton
                                    buttonRole="secondary"
                                    onClick={() => downloadText(`﻿${probeResultsToCsv(probe.results)}`, `passages-probe-${fileStamp()}.csv`, 'text/csv;charset=utf-8')}
                                >
                                    {t('experimental.passages.downloadCsv')}
                                </GcdsButton>
                            </div>
                        )}
                        <div className="mt-300" style={{ overflowX: 'auto' }}>
                            <table className="review-table table-slim-padding">
                                <caption>{t('experimental.passages.tableCaption')}</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">{t('experimental.passages.queryLabel')}</th>
                                        <th scope="col">{t('experimental.passages.col.mode')}</th>
                                        <th scope="col">{t('experimental.passages.col.outcome')}</th>
                                        <th scope="col">{t('experimental.passages.col.passages')}</th>
                                        <th scope="col">{t('experimental.passages.col.citedPage')}</th>
                                        <th scope="col">{t('experimental.passages.col.latency')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {probe.results.map((result, index) => (
                                        <tr key={index}>
                                            <td lang={result.lang}>{result.question}</td>
                                            <td>{t(`experimental.passages.mode.${result.mode}`)}</td>
                                            <td>
                                                {result.ok ? t('experimental.passages.outcomeOk') : reasonText(result.reason)}
                                                {result.reason === 'request_failed' && result.detail && <> <code lang="en">{result.detail}</code></>}
                                            </td>
                                            <td>{formatNumber(result.passages?.length || 0, lang)}</td>
                                            <td>{citedPageReturned(result.passages, result.citationUrl) ? t('common.yes') : t('common.no')}</td>
                                            <td>{result.latencyMs == null ? '—' : formatNumber(result.latencyMs, lang)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
        </GcdsContainer>
    );
}
