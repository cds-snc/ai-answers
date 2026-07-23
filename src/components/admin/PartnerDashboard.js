import React, { useMemo, useRef, useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { useDashboardMetrics } from '../../hooks/admin/useDashboardMetrics.js';
import { buildQualityBarData, buildFeedbackSplitData, buildFeedbackReasonsData } from '../../utils/dashboard/feedbackBreakdown.js';
import FilterPanel from './FilterPanel.js';
import StatCard from './dashboard/StatCard.js';
import DonutCard from './dashboard/DonutCard.js';
import HBarCard from './dashboard/HBarCard.js';
import DivergingBarCard from './dashboard/DivergingBarCard.js';
import ReferralUrlsCard from './dashboard/ReferralUrlsCard.js';
import CitationPagesCard from './dashboard/CitationPagesCard.js';
import EvalAnalysisSection from './dashboard/EvalAnalysisSection.js';
import NoDataCard from './dashboard/NoDataCard.js';
import { COLOURS } from '../../constants/dashboardColours.js';
import { buildBlockedBarData } from '../../utils/dashboard/blockedQueryBars.js';
import { formatNumber, formatPercent, formatDecimal } from '../../utils/numberFormat.js';

// Bars shown in the "question volume by program" chart. Capped client-side so
// the API's larger MAX_PROGRAMS response stays available to other views.
const TOP_PROGRAMS_LIMIT = 10;

const PartnerDashboard = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const fmtN = (n) => formatNumber(n, lang);
  const fmtPct = (n) => formatPercent(n, lang);
  const fmtSec = (ms) => formatDecimal((ms || 0) / 1000, lang, 1);
  const { metrics, loading, error, fetchMetrics } = useDashboardMetrics({ includeReferrals: true, includeCitations: true, includePrograms: true });
  const autoApplyFired = useRef(false);
  const [hasUserApplied, setHasUserApplied] = useState(false);
  const [appliedDepartment, setAppliedDepartment] = useState('');
  // Full filters object as last applied — the eval-analysis section runs its
  // precheck and analysis against exactly what the dashboard is showing.
  const [appliedFilters, setAppliedFilters] = useState(null);
  const handleApplyFilters = (filters) => {
    if (autoApplyFired.current) {
      // Second+ call is user-triggered: mark as applied so FilterPanel can collapse.
      setHasUserApplied(true);
    }
    autoApplyFired.current = true;
    setAppliedDepartment(filters?.department || '');
    setAppliedFilters(filters || null);
    fetchMetrics(filters);
  };
  const handleClearFilters = (filters) => {
    setAppliedDepartment(filters?.department || '');
    setAppliedFilters(filters || null);
    fetchMetrics(filters);
  };

  // --- Derived data ---

  const expertTotal = metrics.expertScored?.total?.total || 0;
  const qualityData = useMemo(
    () => buildQualityBarData(metrics.expertScored, metrics.aiScored, t),
    [metrics.expertScored, metrics.aiScored, t],
  );

  // Quality bar tooltip shows the raw count — the percentage is already on the
  // bar label, so repeating it adds nothing (mirrors the satisfaction chart).
  const QualityBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip__title">{row.name}</div>
        <div>{fmtN(row.count)}</div>
      </div>
    );
  };

  // Accuracy rate (MetricsDashboard definition): only "has answer error" counts
  // against accuracy — citation issues / needs-improvement scores do not.
  // Total accuracy combines expert + AI evals; the breakdown is by language.
  const accuracyOf = (total, hasError) => (total > 0 ? 100 - Math.round((hasError / total) * 100) : null);
  const expertHasError = metrics.expertScored?.hasError?.total || 0;
  const aiTotal = metrics.aiScored?.total?.total || 0;
  const aiHasError = metrics.aiScored?.hasError?.total || 0;
  const evalTotal = expertTotal + aiTotal;
  const hasError = expertHasError + aiHasError;
  const totalAccuracy = accuracyOf(evalTotal, hasError);
  const accuracyDonutData = evalTotal > 0 ? [
    { name: t('partnerDashboard.charts.accurate'), value: evalTotal - hasError },
    { name: t('partnerDashboard.charts.hasError'), value: hasError },
  ] : [];

  // EN/FR accuracy breakdown (expert + AI per language), shown as the donut
  // footer only when each language has more than 10 evaluations — a percentage
  // from a tiny sample is misleading, so below the threshold the footer is omitted.
  const enEvalTotal = (metrics.expertScored?.total?.en || 0) + (metrics.aiScored?.total?.en || 0);
  const frEvalTotal = (metrics.expertScored?.total?.fr || 0) + (metrics.aiScored?.total?.fr || 0);
  const enAccuracy = accuracyOf(enEvalTotal, (metrics.expertScored?.hasError?.en || 0) + (metrics.aiScored?.hasError?.en || 0));
  const frAccuracy = accuracyOf(frEvalTotal, (metrics.expertScored?.hasError?.fr || 0) + (metrics.aiScored?.hasError?.fr || 0));
  const accuracyByLangFooter = (enEvalTotal > 10 && frEvalTotal > 10)
    ? t('partnerDashboard.charts.accuracyByLang')
        .replace('{en}', fmtPct(enAccuracy))
        .replace('{fr}', fmtPct(frAccuracy))
    : undefined;

  // Harmful + content issues (expert evaluations only). Always shown, even at 0.
  const harmful = metrics.expertScored?.harmful || {};
  const contentIssue = metrics.expertScored?.hasContentIssue || {};

  // Blocked queries (safety counter). Total card + ranked bar breakdown by type.
  // Can't be department-scoped (blocks happen before the department is known),
  // so the blocked view is hidden when a department filter is applied.
  const blockedTotal = metrics.blockedQueries?.total || {};
  const blockedBarData = useMemo(() => buildBlockedBarData(metrics.blockedQueries, t), [metrics.blockedQueries, t]);

  const BlockedBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip__title">{row.name}</div>
        <div>{t('blockedQueries.colTotal')}: {fmtN(row.value)}</div>
        <div>{t('blockedQueries.colEn')}: {fmtN(row.en)} · {t('blockedQueries.colFr')}: {fmtN(row.fr)}</div>
      </div>
    );
  };

  // User feedback split into helpful / not helpful, classified by score (not
  // the raw yes/no click) so notWanted counts as helpful.
  const pfTotal = metrics.publicFeedbackTotals?.totalQuestionsWithFeedback || 0;
  const feedbackData = useMemo(
    () => buildFeedbackSplitData(metrics.publicFeedbackTotals, metrics.publicFeedbackReasons, t),
    [metrics.publicFeedbackTotals, metrics.publicFeedbackReasons, t],
  );
  const satisfactionPct = pfTotal > 0 ? Math.round(((feedbackData[0]?.value || 0) / pfTotal) * 100) : null;

  // Helpful/not-helpful donut — shared between the "donut only" (10–39 responses)
  // and "donut + breakdown bar" (40+) layouts so its props don't drift.
  const satisfactionDonut = (
    <DonutCard
      title={t('partnerDashboard.charts.feedbackSplitTitle')}
      data={feedbackData.length > 0 ? feedbackData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
      colours={feedbackData.length > 0 ? [COLOURS.satisfactionPositive, COLOURS.satisfactionNegative] : [COLOURS.empty]}
      centreValue={satisfactionPct !== null ? fmtPct(satisfactionPct) : '—'}
      centreLabel={t('partnerDashboard.charts.satisfactionCentre').replace('{total}', fmtN(pfTotal))}
      centreMultiLine
      lang={lang}
    />
  );

  const feedbackReasonsData = useMemo(() => buildFeedbackReasonsData(metrics.publicFeedbackReasons, t), [metrics.publicFeedbackReasons, t]);

  // Conversation length (sessions broken down by number of questions asked).
  const totalConversations = metrics.totalConversations || 0;
  const totalQuestions = metrics.totalQuestions || 0;
  const sq = metrics.sessionsByQuestionCount || {};
  const sessionDepthData = totalConversations > 0 ? [
    { name: t('partnerDashboard.charts.singleQuestion'), value: sq.singleQuestion?.total || 0 },
    { name: t('partnerDashboard.charts.twoQuestions'),   value: sq.twoQuestions?.total || 0 },
    { name: t('partnerDashboard.charts.threeQuestions'), value: sq.threeQuestions?.total || 0 },
  ].filter(d => d.value > 0) : [];

  // Question volume by program (per-question task classification). Values stored
  // in the DB are canonical English (dynamic content); the API also returns the
  // curated French name (programFr) when one exists, so French users see the
  // French program title and fall back to English when unmapped (emergent names,
  // or departments without a curated list yet). The 'unknown' sentinel bucket —
  // unclassified or low-confidence — is pulled out of the bars and surfaced in
  // the subtitle instead, so it doesn't dominate the axis; real programs are
  // capped at the top N so the long single-count tail drops off. The API returns
  // more (MAX_PROGRAMS) in case another view needs it.
  // Bars are the % each program is of all *classified* questions, so the
  // denominator is the classified total across every returned row — not just the
  // top N shown. The bars therefore don't sum to 100% once the tail is cut,
  // which is intended. Raw counts (and their EN/FR split) ride along on each row
  // for the tooltip, since the bar label only carries the percentage.
  const { topProgramsData, unclassifiedCount, classifiedTotals } = useMemo(() => {
    const rows = metrics.topPrograms || [];
    const unclassified = rows
      .filter((row) => row.program === 'unknown')
      .reduce((acc, row) => acc + (row.count || 0), 0);
    const classified = rows.filter((row) => row.program !== 'unknown');
    const totals = classified.reduce((acc, row) => ({
      total: acc.total + (row.count || 0),
      en: acc.en + (row.en || 0),
      fr: acc.fr + (row.fr || 0),
    }), { total: 0, en: 0, fr: 0 });
    const bars = classified
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, TOP_PROGRAMS_LIMIT)
      .map((row) => ({
        name: (lang === 'fr' && row.programFr) ? row.programFr : row.program,
        value: totals.total > 0 ? Math.round(((row.count || 0) / totals.total) * 100) : 0,
        count: row.count || 0,
        en: row.en || 0,
        fr: row.fr || 0,
      }));
    return { topProgramsData: bars, unclassifiedCount: unclassified, classifiedTotals: totals };
  }, [metrics.topPrograms, lang]);

  // Classified total (the % denominator) + its EN/FR split, with the
  // unclassified count appended when there is one.
  const programsSubtitle = [
    t('partnerDashboard.programs.subtitle')
      .replace('{total}', fmtN(classifiedTotals.total))
      .replace('{en}', fmtN(classifiedTotals.en))
      .replace('{fr}', fmtN(classifiedTotals.fr)),
    ...(unclassifiedCount > 0
      ? [t('partnerDashboard.programs.unclassifiedNote').replace('{count}', fmtN(unclassifiedCount))]
      : []),
  ].join(' · ');

  // Programs tooltip shows the raw count and its EN/FR split — the bar label
  // already carries the percentage, so repeating it adds nothing.
  const ProgramBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip__title">{row.name}</div>
        <div>{t('partnerDashboard.programs.tooltipCount').replace('{count}', fmtN(row.count))}</div>
        <div>{t('partnerDashboard.programs.tooltipLang')
          .replace('{en}', fmtN(row.en))
          .replace('{fr}', fmtN(row.fr))}</div>
      </div>
    );
  };

  // Top referring pages (distinct conversations / click-throughs per page).
  // Already normalized, merged and ranked server-side; scoped to the selected
  // department when a partner is applied, otherwise the global top pages.
  const topReferrals = metrics.topReferrals || [];

  // Top citation pages (GC pages AI Answers cited, by question) + the answer-type
  // breakdown (how many questions got a citation vs. a non-citation answer type).
  // Both come from metrics-citations; `normal` answers are the ones with a citation.
  const topCitations = metrics.topCitations || [];
  const answerTypeRows = useMemo(() => {
    const bd = metrics.answerTypeBreakdown || {};
    return [
      { key: 'normal', type: 'normal' },
      { key: 'clarifying-question', type: 'clarifyingQuestion' },
      { key: 'pt-muni', type: 'ptMuni' },
      { key: 'not-gc', type: 'notGc' },
    ].map(({ key, type }) => ({ key, label: t(`partnerDashboard.citations.types.${type}`), count: bd[key] || 0 }));
  }, [metrics.answerTypeBreakdown, t]);

  // Operations metrics. Median response time comes from the technical metrics
  // endpoint (milliseconds, shown in seconds); token totals come from usage.
  const responseTime = metrics.responseTime || {};
  const hasResponseTime = (responseTime.count || 0) > 0;

  return (
    <div>
      <div className="mb-100">
        <FilterPanel
          lang={lang}
          onApplyFilters={handleApplyFilters}
          onClearFilters={handleClearFilters}
          isVisible={true}
          autoApply={true}
          applyDisabled={loading}
          defaultUserType="all"
          defaultOpen={false}
          filterLoading={loading}
          filterError={error}
          filterResultCount={metrics.totalQuestions || 0}
          hasAppliedFilters={hasUserApplied}
          // The "More filters" section (URL, answer type, partner eval, AI
          // eval, and — since they live inside it — the AND/OR toggle and
          // Content issue checkbox) is hidden entirely: this dashboard has
          // no charts that break results down by those categories, so
          // applying one would just silently shrink every number with no
          // visible way to tell why. See the former TODO this replaced
          // (commit 32ff2262) and FilterPanel's own prop comments.
          showAdvancedSection={false}
        />
      </div>

      {loading ? (
        <div className="dashboard-loading">
          {t('common.loading')}
        </div>
      ) : (
      <>

      {error && (
        <div className="dashboard-error">
          {t('partnerDashboard.error')}
        </div>
      )}

      {hasUserApplied && metrics.totalQuestions === 0 && !error && (
        <div className="dashboard-warning">
          <span className="dashboard-warning__icon" aria-hidden="true" />
          {t('common.noDataForFilters')}
        </div>
      )}

      <h2 className="dashboard-section-title">{t('partnerDashboard.overviewTitle')}</h2>

      {/* KPI cards — 4 columns: questions, expert eval, accuracy, content issues */}
      <div className="dashboard-row">
        <StatCard
          label={t('partnerDashboard.kpi.questionsAsked')}
          value={fmtN(metrics.totalQuestions)}
          sub={t('partnerDashboard.kpi.questionsSub')
            .replace('{en}', fmtN(metrics.totalQuestionsEn))
            .replace('{fr}', fmtN(metrics.totalQuestionsFr))}
        />
        <StatCard
          label={t('partnerDashboard.kpi.evaluated')}
          value={fmtN(expertTotal)}
          sub={t('partnerDashboard.kpi.evaluatedSub')
            .replace('{pct}', fmtPct(expertTotal > 0 && metrics.totalQuestions > 0 ? Math.round((expertTotal / metrics.totalQuestions) * 100) : 0))}
        />
        <StatCard
          label={t('partnerDashboard.kpi.contentIssues')}
          value={fmtN(contentIssue.total)}
          sub={t('partnerDashboard.kpi.contentIssuesSub')
            .replace('{ni}', fmtN(contentIssue.needsImprovement))
            .replace('{error}', fmtN(contentIssue.hasError))}
        />
      </div>

      {/* Answer-accuracy donut + answer-quality bar (wide) beside it. Below 10
          evals both are replaced by placeholders rather than dropped, so the
          reason stays on the page. */}
      <div className="dashboard-row">
        {evalTotal >= 10 ? (
          <DonutCard
            title={t('partnerDashboard.charts.accuracyDonutTitle')}
            data={accuracyDonutData.length > 0 ? accuracyDonutData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
            colours={accuracyDonutData.length > 0 ? [COLOURS.correct, COLOURS.hasError] : [COLOURS.empty]}
            centreValue={totalAccuracy !== null ? fmtPct(totalAccuracy) : '—'}
            centreLabel={t('partnerDashboard.charts.accuracyCentre')}
            centreClass={totalAccuracy === null ? undefined : totalAccuracy >= 80 ? 'green' : totalAccuracy > 50 ? 'orange' : 'red'}
            footer={accuracyByLangFooter}
            lang={lang}
          />
        ) : (
          <NoDataCard
            title={t('partnerDashboard.charts.accuracyDonutTitle')}
            message={t('common.notEnoughData')}
          />
        )}
        <div className="dashboard-chart-wide">
          {evalTotal >= 10 ? (
            <HBarCard
              title={t('partnerDashboard.charts.accuracyTitle')}
              subtitle={t('partnerDashboard.charts.accuracySubtitle')
                .replace('{total}', fmtN(evalTotal))
                .replace('{expert}', fmtN(expertTotal))
                .replace('{ai}', fmtN(aiTotal))}
              data={qualityData}
              percent
              height={240}
              noDataLabel={t('partnerDashboard.charts.noData')}
              tooltipContent={QualityBarTooltip}
              lang={lang}
            />
          ) : (
            <NoDataCard
              title={t('partnerDashboard.charts.accuracyTitle')}
              message={t('common.notEnoughData')}
            />
          )}
        </div>
      </div>

      {/* Question volume by program — ranked bar of the per-question program
          classification (top N), as a % of all classified questions. Hidden when
          nothing in range has a real program (pre-feature data is all
          unclassified). The subtitle carries the classified total the
          percentages are computed from, its EN/FR split, and the unclassified
          count — which stays out of the bars so it can't dominate the axis. */}
      {topProgramsData.length > 0 && (
        <div className="dashboard-section">
          <HBarCard
            title={t('partnerDashboard.programs.title')}
            subtitle={programsSubtitle}
            data={topProgramsData}
            percent
            tooltipContent={ProgramBarTooltip}
            noDataLabel={t('partnerDashboard.charts.noData')}
            yAxisWidth={220}
            lang={lang}
          />
        </div>
      )}

      {/* Conversation length donut. Below 10 conversations, a placeholder. */}
      <div className="dashboard-row">
        <div className="dashboard-col-half">
          {totalConversations >= 10 ? (
            <DonutCard
              title={t('partnerDashboard.charts.engagementTitle')}
              subtitle={t('partnerDashboard.charts.engagementSubtitle')}
              data={sessionDepthData.length > 0 ? sessionDepthData : [{ name: t('partnerDashboard.charts.noData'), value: 1 }]}
              colours={sessionDepthData.length > 0 ? [COLOURS.no, COLOURS.brand, COLOURS.brandDark] : [COLOURS.empty]}
              centreValue={totalConversations > 0 ? fmtN(totalConversations) : '—'}
              centreLabel={t('partnerDashboard.charts.conversations')}
              footer={`${fmtN(totalQuestions)} ${t('partnerDashboard.charts.questions')} · ${fmtN(totalConversations)} ${t('partnerDashboard.charts.conversations')}`}
              lang={lang}
            />
          ) : (
            <NoDataCard
              title={t('partnerDashboard.charts.engagementTitle')}
              message={t('common.notEnoughData')}
            />
          )}
        </div>
      </div>


      {/* Satisfaction — collapsible (defaults closed; the summary carries the
          headline so the key number shows without expanding). The helpful/not
          donut shows from 10 responses, but the per-reason breakdown bar only
          renders at 40+ — its percentages read as noise on a handful of
          responses. Below 10, a placeholder in place of the whole section. */}
      {pfTotal >= 10 ? (
        <details className="dashboard-collapse dashboard-section">
          <summary className="dashboard-section-title dashboard-collapse__summary">
            {t('partnerDashboard.charts.satisfactionSummary')
              .replace('{pct}', fmtPct(satisfactionPct))
              .replace('{total}', fmtN(pfTotal))}
          </summary>
          {/* At 40+ the donut sits bare beside the wide breakdown bar; below 40
              it stands alone in a half column so it doesn't stretch full width. */}
          {pfTotal >= 40 ? (
            <div className="dashboard-row">
              {satisfactionDonut}
              <div className="dashboard-chart-wide">
                <DivergingBarCard
                  title={t('partnerDashboard.charts.feedbackReasonsTitle')}
                  subtitle={t('partnerDashboard.charts.feedbackBreakdownSubtitle')
                    .replace('{total}', fmtN(pfTotal))}
                  data={feedbackReasonsData}
                  noDataLabel={t('partnerDashboard.charts.noData')}
                  lang={lang}
                />
              </div>
            </div>
          ) : (
            <div className="dashboard-row">
              <div className="dashboard-col-half">
                {satisfactionDonut}
              </div>
            </div>
          )}
        </details>
      ) : (
        <div className="dashboard-section">
          <NoDataCard
            title={t('partnerDashboard.charts.feedbackSectionTitle')}
            message={t('common.notEnoughData')}
          />
        </div>
      )}

      {/* Top referral pages — collapsible list of the partner site pages that
          drove the most click-throughs (conversations) to AI Answers. Hidden
          when there are no referrals to show. */}
      {topReferrals.length > 0 && (
        <div className="dashboard-section">
          <ReferralUrlsCard
            title={t('partnerDashboard.referrals.title')}
            subtitle={t('partnerDashboard.referrals.subtitle')}
            data={topReferrals}
            urlColLabel={t('partnerDashboard.referrals.colUrl')}
            countColLabel={t('partnerDashboard.referrals.colCount')}
            noDataLabel={t('partnerDashboard.charts.noData')}
            lang={lang}
          />
        </div>
      )}

      {/* Top citation pages — collapsible list of the GC pages AI Answers cited
          most (by question), plus an answer-type breakdown. Hidden when there
          are no citations and no answer-type counts to show. */}
      {(topCitations.length > 0 || answerTypeRows.some((r) => r.count > 0)) && (
        <div className="dashboard-section">
          <CitationPagesCard
            title={t('partnerDashboard.citations.title')}
            subtitle={t('partnerDashboard.citations.subtitle')}
            citations={topCitations}
            urlColLabel={t('partnerDashboard.citations.colUrl')}
            countColLabel={t('partnerDashboard.citations.colCount')}
            answerTypesTitle={t('partnerDashboard.citations.answerTypesTitle')}
            answerTypeColLabel={t('partnerDashboard.citations.answerTypeColLabel')}
            answerTypeRows={answerTypeRows}
            noDataLabel={t('partnerDashboard.citations.noCitations')}
            lang={lang}
          />
        </div>
      )}

      {/* Operations metrics. Median response time is drawn from the technical
          metrics endpoint (ms, displayed in seconds); token totals come from
          the usage endpoint. */}
      <h2 className="dashboard-section-title">
        {t('partnerDashboard.ops.title')}
      </h2>
      <div className="dashboard-row">
        <StatCard
          label={t('partnerDashboard.ops.medianResponseTime')}
          value={hasResponseTime
            ? t('partnerDashboard.ops.responseTimeValue').replace('{n}', fmtSec(responseTime.median))
            : '—'}
          sub={hasResponseTime
            ? t('partnerDashboard.ops.responseTimeSub').replace('{p95}', fmtSec(responseTime.p95))
            : undefined}
        />
        <StatCard
          className="stat-card--wide"
          label={t('partnerDashboard.ops.inputTokens')}
          value={fmtN(metrics.totalInputTokens)}
          sub={t('partnerDashboard.ops.tokensSub')
            .replace('{en}', fmtN(metrics.totalInputTokensEn))
            .replace('{fr}', fmtN(metrics.totalInputTokensFr))}
        />
        <StatCard
          className="stat-card--wide"
          label={t('partnerDashboard.ops.outputTokens')}
          value={fmtN(metrics.totalOutputTokens)}
          sub={t('partnerDashboard.ops.tokensSub')
            .replace('{en}', fmtN(metrics.totalOutputTokensEn))
            .replace('{fr}', fmtN(metrics.totalOutputTokensFr))}
        />
      </div>

      {/* Safety metrics */}
      <h2 className="dashboard-section-title">
        {t('partnerDashboard.safety.title')}
      </h2>
      {/* Blocked queries — global safety counter, can't be department-scoped,
          so hidden when a department filter is applied.
          Layout: left column has blocked total + harmful stacked; chart fills the right. */}
      {appliedDepartment ? (
        <>
          <p className="font-size-text-small mb-300">
            {t('blockedQueries.deptNote')}
          </p>
          <div className="dashboard-row">
            <div className="dashboard-col-third">
              <StatCard
                label={t('partnerDashboard.kpi.harmful')}
                value={fmtN(harmful.total)}
                sub={t('partnerDashboard.kpi.harmfulSub')
                  .replace('{en}', fmtN(harmful.en))
                  .replace('{fr}', fmtN(harmful.fr))}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="dashboard-row">
          <div className="dashboard-col-third dashboard-col--equal-height">
            <StatCard
              label={t('blockedQueries.totalCardLabel')}
              value={fmtN(blockedTotal.total)}
              sub={t('blockedQueries.langSub')
                .replace('{en}', fmtN(blockedTotal.en))
                .replace('{fr}', fmtN(blockedTotal.fr))}
            />
            <StatCard
              label={t('partnerDashboard.kpi.harmful')}
              value={fmtN(harmful.total)}
              sub={t('partnerDashboard.kpi.harmfulSub')
                .replace('{en}', fmtN(harmful.en))
                .replace('{fr}', fmtN(harmful.fr))}
            />
          </div>
          <div className="dashboard-chart-wide">
            <HBarCard
              title={t('blockedQueries.byTypeTitle')}
              data={blockedBarData}
              height={Math.max(240, blockedBarData.length * 60)}
              lang={lang}
              tooltipContent={BlockedBarTooltip}
              noDataLabel={t('blockedQueries.noData')}
            />
          </div>
        </div>
      )}

      {/* Eval analysis — runs over the currently applied filters; requires an
          institution to be selected before the Run button enables. */}
      <EvalAnalysisSection
        lang={lang}
        appliedDepartment={appliedDepartment}
        appliedFilters={appliedFilters}
      />
      </>
      )}

    </div>
  );
};

export default PartnerDashboard;
