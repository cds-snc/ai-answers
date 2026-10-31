import React from 'react';
import { GcdsText } from '@cdssnc/gcds-components-react';
import { formatDecimal, formatNumber } from '../../utils/numberFormat.js';
import { formatLocaleDate } from '../../utils/formatLocaleDate.js';

// Request and response JSON come from Coveo in English field names; tagged
// lang="en" so a screen reader doesn't read them in French.
const preStyle = {
    backgroundColor: 'var(--gcds-bg-light)',
    padding: '12px',
    fontSize: '0.875rem',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    marginTop: '8px',
};

/**
 * One passage test result: status line, each passage, and the request/response
 * JSON for checking what was actually sent.
 * @param {{ result: object, contentLang: 'en'|'fr', lang: string, t: Function }} props
 *   contentLang is the language of the pages searched (the request language).
 */
export default function PassageResult({ result, contentLang, lang, t }) {
    const passages = result.passages || [];

    return (
        <div className="mt-300">
            <GcdsText>
                {t('experimental.passages.resultLine')
                    .replace('{status}', () => (result.status == null ? '—' : String(result.status)))
                    .replace('{latency}', () => (result.latencyMs == null ? '—' : formatNumber(result.latencyMs, lang)))
                    .replace('{count}', () => formatNumber(passages.length, lang))}
            </GcdsText>

            {result.detail && (
                <GcdsText>
                    {t('experimental.passages.coveoDetail')} <code lang="en">{result.detail}</code>
                </GcdsText>
            )}

            {passages.length > 0 && (
                <ol className="mt-300">
                    {passages.map((passage, index) => (
                        <li key={`${passage.url}-${index}`} className="mb-300">
                            <div>
                                <strong>{t('experimental.passages.score')}</strong>{' '}
                                {passage.score == null ? '—' : formatDecimal(passage.score, lang)}
                                {' · '}
                                <a href={passage.url} lang={contentLang}>{passage.title || passage.url}</a>
                            </div>
                            <div className="font-size-text-sm-nr">
                                <strong>{t('experimental.passages.dateModified')}</strong>{' '}
                                {formatLocaleDate(passage.dateModified, lang, '—', { dateStyle: 'medium' })}
                                {' · '}
                                {t('experimental.passages.textLength').replace('{count}', () => formatNumber(passage.text.length, lang))}
                            </div>
                            <p lang={contentLang} style={{ whiteSpace: 'pre-wrap' }}>{passage.text}</p>
                        </li>
                    ))}
                </ol>
            )}

            <details className="mt-200">
                <summary>{t('experimental.passages.requestSent')}</summary>
                <pre lang="en" style={preStyle}>
                    {result.requestBody ? JSON.stringify(result.requestBody, null, 2) : '—'}
                </pre>
            </details>
            <details className="mt-200">
                <summary>{t('experimental.passages.rawResponse')}</summary>
                <pre lang="en" style={preStyle}>
                    {result.response ? JSON.stringify(result.response, null, 2) : '—'}
                </pre>
            </details>
        </div>
    );
}
