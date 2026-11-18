import React, { useId } from 'react';
import { GcdsLink } from '@gcds-core/components-react';
import { useTranslations } from '../../../hooks/useTranslations.js';
import CollapsibleCard from './CollapsibleCard.js';
import { formatNumber } from '../../../utils/numberFormat.js';
import { formatLocaleDate } from '../../../utils/formatLocaleDate.js';
import { buildChatReviewHref, chatLangFromPageLanguage } from '../../../utils/reviewLink.js';
import { MOST_USED_EVALS_LIMIT } from '../../../config/workflows.js';

// Most-used evaluations for the partner dashboard: the expert evaluations
// eval-informed answering injected into the most answers in the period.
// Data: metrics.mostUsedEvals (api/metrics/metrics-eval-reuse.js), already
// ranked and capped server-side.
//
// Accessibility (same contract as EvalCoverageCard):
// - Captioned table; column headers scope="col"; the chat ID link is each
//   row's header (scope="row").
// - One chat can hold two evaluated questions, so each link carries a
//   sr-only ", question N" to keep link text unique (WCAG 2.4.4) — same
//   pattern as ContentIssueChatsCard.
// - Links open review mode in a new tab, in the chat's own language;
//   GcdsLink announces the new tab.
// - Scrolls in a focusable region named by the caption.
// - Missing values: em dash visually, spoken text for screen readers.
// - On the French dashboard a service with no French name is tagged lang="en".

const MostUsedEvalsCard = ({ evals = [], lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const captionId = useId();
  if (evals.length === 0) return null;

  const fmtN = (n) => formatNumber(n, lang);
  const fmtDate = (d) => formatLocaleDate(d, lang, null, { year: 'numeric', month: 'short', day: 'numeric' });
  const k = (key) => t(`partnerDashboard.mostUsedEvals.${key}`);
  const title = k('title');

  const missing = (label) => (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </>
  );

  const serviceName = (e) => {
    if (!e.program) return t('partnerDashboard.evalCoverage.unclassified');
    if (lang !== 'fr') return e.program;
    return e.programFr || <span lang="en">{e.program}</span>;
  };

  return (
    <CollapsibleCard
      heading={title}
      subtext={k('subtitle').replace('{n}', () => fmtN(MOST_USED_EVALS_LIMIT))}
      triggerLabel={k('trigger')}
      collapsible={evals.length >= 3}
    >
      <div className="dashboard-table-scroll" role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className="dashboard-data-table">
          <caption id={captionId} className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{t('reviewPanels.chatId')}</th>
              <th scope="col" className="dashboard-data-table__num" aria-label={t('admin.evalDashboard.columns.questionNumberAriaLabel')}>
                {t('admin.evalDashboard.columns.questionNumber')}
              </th>
              <th scope="col">{t('admin.common.columns.program')}</th>
              <th scope="col" className="dashboard-data-table__num">{t('reviewPanels.expertScore')}</th>
              <th scope="col" className="dashboard-data-table__num">{k('colUses')}</th>
              <th scope="col">{k('colEvaluated')}</th>
            </tr>
          </thead>
          <tbody>
            {evals.map((e) => {
              // Route to the evaluated chat's own language; the admin's
              // language rides along for the review page's chrome.
              const href = buildChatReviewHref(e.chatId, chatLangFromPageLanguage(e.pageLanguage), e.interactionId, lang);
              const evaluated = fmtDate(e.evaluatedAt);
              return (
                <tr key={e.interactionId}>
                  <th scope="row" className="dashboard-data-table__id">
                    <GcdsLink href={href} target="_blank" lang={lang}>
                      {e.chatId}
                      <span className="sr-only">
                        {t('account.assignedChats.chatIdQuestion').replace('{number}', () => String(e.questionNumber))}
                      </span>
                    </GcdsLink>
                  </th>
                  <td className="dashboard-data-table__num">{e.questionNumber}</td>
                  <td>{serviceName(e)}</td>
                  <td className="dashboard-data-table__num">
                    {e.totalScore === null ? missing(t('partnerDashboard.evalCoverage.notApplicable')) : fmtN(e.totalScore)}
                  </td>
                  <td className="dashboard-data-table__num">{fmtN(e.uses)}</td>
                  <td>{evaluated || missing(t('partnerDashboard.evalCoverage.notApplicable'))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
};

export default MostUsedEvalsCard;
