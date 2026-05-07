import React, { useEffect, useRef, useState } from 'react';
import { GcdsContainer, GcdsText, GcdsLink, GcdsButton } from '@cdssnc/gcds-components-react';
import { useTranslations } from '../hooks/useTranslations.js';
import { useChatLogs } from '../hooks/chatviewer/useChatLogs.js';
import { useChatTimeline } from '../hooks/chatviewer/useChatTimeline.js';
import { useChatLogsTable } from '../hooks/chatviewer/useChatLogsTable.js';
import MetadataModal from '../components/chatviewer/MetadataModal.js';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-xml-doc.js';

const ChatViewer = ({ lang = 'en' }) => {
  const { t } = useTranslations();
  const [chatId, setChatId] = useState('');
  const [logLevel, setLogLevel] = useState('');
  const [expandedMetadata, setExpandedMetadata] = useState(null);
  const tableRef = useRef(null);

  const { clearLogs, isRefreshingLogs, logs, refreshLogs } = useChatLogs(chatId);
  const stepTimeline = useChatTimeline(logs);

  useChatLogsTable({
    tableRef,
    logs,
    lang,
    logLevel,
    t,
    onExpandMetadata: setExpandedMetadata,
  });

  useEffect(() => {
    const storedChatId = localStorage.getItem('chatId');
    if (storedChatId) {
      setChatId(storedChatId);
    }
  }, []);

  const handleLogLevelChange = (e) => {
    setLogLevel(e.target.value);
  };

  const handleChatIdChange = (e) => {
    const newValue = e.target ? e.target.value : e;

    if (newValue !== chatId) {
      clearLogs();
      setExpandedMetadata(null);
    }

    setChatId(newValue);
  };

  const handleRefreshLogs = async () => {
    if (!chatId || isRefreshingLogs) {
      return;
    }

    await refreshLogs();
  };

  return (
    <>
      <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
        <h1 className="mb-400">{t('logging.title')}</h1>
        <nav className="mb-400">
          <GcdsText>
            <GcdsLink href={`/${lang}/admin`}>{t('logging.backToAdmin')}</GcdsLink>
          </GcdsText>
        </nav>

        <section className="mb-600">
          <div className="mb-400">
            <div>
              <label htmlFor="chatIdInput" className="block mb-2">
                {t('logging.enterChatId')}
              </label>
              <input
                id="chatIdInput"
                name="chatId"
                type="text"
                value={chatId}
                onChange={handleChatIdChange}
                required
                className="form-control p-2 border rounded w-full"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-end gap-6 flex-nowrap">
              <div className="flex items-center shrink-0">
                <label htmlFor="logLevelFilter" className="mr-3">
                  {t('logging.filterByLevel')}
                </label>
                <select
                  id="logLevelFilter"
                  value={logLevel}
                  onChange={handleLogLevelChange}
                  className="filter-select"
                  style={{ width: 'auto', minWidth: '8.5rem' }}
                >
                  <option value="">{t('logging.all')}</option>
                  <option value="info">{t('logging.info')}</option>
                  <option value="debug">{t('logging.debug')}</option>
                  <option value="warn">{t('logging.warn')}</option>
                  <option value="error">{t('logging.error')}</option>
                </select>
              </div>
              <GcdsButton
                id="refresh-logs-button"
                type="button"
                disabled={!chatId || isRefreshingLogs}
                onClick={handleRefreshLogs}
                className="whitespace-nowrap shrink-0"
              >
                {isRefreshingLogs ? t('logging.refreshPending') : t('logging.refresh')}
              </GcdsButton>
            </div>

            {chatId && stepTimeline && (
              <div className="bg-white shadow rounded-lg p-4">
                <h2 className="text-lg font-semibold mb-2">{t('logging.timeline.title')}</h2>
                {(stepTimeline.graphName || stepTimeline.userPerceivedMs != null) && (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: '0 0 0.75rem 0',
                      fontSize: '0.95rem',
                      lineHeight: 1.6,
                    }}
                  >
                    {stepTimeline.graphName && (
                      <li>
                        <strong>{t('logging.timeline.graph')}:</strong> {stepTimeline.graphName}
                      </li>
                    )}
                    {stepTimeline.userPerceivedMs != null && (
                      <li>
                        <strong>{t('logging.timeline.userPerceived')}:</strong>{' '}
                        {stepTimeline.userPerceivedMs} ms
                      </li>
                    )}
                  </ul>
                )}

                {stepTimeline.steps.length > 0 ? (
                  <table className="display" style={{ width: 'auto' }}>
                    <thead>
                      <tr>
                        <th>{t('logging.timeline.step')}</th>
                        <th style={{ textAlign: 'right' }}>{t('logging.timeline.start')}</th>
                        <th style={{ textAlign: 'right' }}>{t('logging.timeline.end')}</th>
                        <th style={{ textAlign: 'right' }}>{t('logging.timeline.duration')}</th>
                        <th style={{ textAlign: 'right' }}>{t('logging.timeline.pctOfTotal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stepTimeline.steps.flatMap((step) => {
                        const pct =
                          step.duration != null && stepTimeline.pctDenom
                            ? ((step.duration / stepTimeline.pctDenom) * 100).toFixed(1)
                            : null;
                        const note =
                          step.startRel == null
                            ? t('logging.timeline.skipped')
                            : step.endRel == null
                              ? t('logging.timeline.incomplete')
                              : null;
                        const rows = [
                          <tr key={step.name}>
                            <td>{step.name}</td>
                            <td style={{ textAlign: 'right' }}>{step.startRel ?? '-'}</td>
                            <td style={{ textAlign: 'right' }}>{step.endRel ?? '-'}</td>
                            <td style={{ textAlign: 'right' }}>
                              {step.duration != null ? step.duration : note ? `(${note})` : '-'}
                            </td>
                            <td style={{ textAlign: 'right' }}>{pct != null ? `${pct}%` : '-'}</td>
                          </tr>,
                        ];

                        if (step.breakdown) {
                          const dlPct = stepTimeline.pctDenom
                            ? ((step.breakdown.downloadDuration / stepTimeline.pctDenom) * 100).toFixed(1)
                            : null;
                          const genPct = stepTimeline.pctDenom
                            ? ((step.breakdown.generationDuration / stepTimeline.pctDenom) * 100).toFixed(1)
                            : null;

                          rows.push(
                            <tr key={`${step.name}-downloads`}>
                              <td style={{ paddingLeft: '1.5em' }}>
                                -> {t('logging.timeline.downloads')} (x{step.breakdown.downloadCount})
                              </td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>{step.breakdown.downloadDuration}</td>
                              <td style={{ textAlign: 'right' }}>{dlPct != null ? `${dlPct}%` : '-'}</td>
                            </tr>,
                            <tr key={`${step.name}-generation`}>
                              <td style={{ paddingLeft: '1.5em' }}>
                                -> {t('logging.timeline.generation')}
                              </td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>{step.breakdown.generationDuration}</td>
                              <td style={{ textAlign: 'right' }}>{genPct != null ? `${genPct}%` : '-'}</td>
                            </tr>
                          );
                        }

                        return rows;
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-gray-500">{t('logging.timeline.noTimeline')}</p>
                )}
              </div>
            )}

            {chatId && logs && (
              <div className="bg-white shadow rounded-lg">
                {logs.length > 0 ? (
                  <div className="p-4">
                    <table ref={tableRef} className="display">
                      <thead>
                        <tr>
                          <th>{t('logging.createdAt')}</th>
                          <th>{t('logging.level')}</th>
                          <th>{t('logging.message')}</th>
                          <th>{t('logging.metadata')}</th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                ) : (
                  <div className="p-4">
                    <p className="text-gray-500">{t('logging.noLogs')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </GcdsContainer>

      <MetadataModal
        metadata={expandedMetadata}
        onClose={() => setExpandedMetadata(null)}
        t={t}
      />
    </>
  );
};

export default ChatViewer;
