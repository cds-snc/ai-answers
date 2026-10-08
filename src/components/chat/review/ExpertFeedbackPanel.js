import React, { useState, useCallback, useId, useRef } from 'react';
import { GcdsButton, GcdsLink } from '@gcds-core/components-react';
import FeedbackService from '../../../services/FeedbackService.js';
import ClientLoggingService from '../../../services/ClientLoggingService.js';
import { useAnswerNumberLabel } from '../../../hooks/useAnswerNumberLabel.js';
import { formatNumber } from '../../../utils/numberFormat.js';
import { formatLocaleDate } from '../../../utils/formatLocaleDate.js';
import { resolveDisplayContent, toLangAttr, getAnswerLanguage } from '../../../utils/answerLanguage.js';
import OriginalLanguagePill from './OriginalLanguagePill.js';
import StatusMessage from '../../admin/StatusMessage.js';
import ExpertFeedbackComponent from '../ExpertFeedbackComponent.js';
import { useFocusOnChange } from '../../../hooks/useFocusOnChange.js';
import { useReturnFocusOnClose } from '../../../hooks/useReturnFocusOnClose.js';

const ExpertFeedbackPanel = ({ message, extractSentences, t, lang = 'en', answerNumber, citationUrl, department, onDeleted, onUpdated }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [deleting, setDeleting] = useState(false);
    // Ignores a second toggle while one is in flight. Not `disabled`, which
    // would drop keyboard focus from the checkbox to <body>.
    const updatingNeverStaleRef = useRef(false);
    // null, 'on', 'off' or 'failed' - the message under the checkbox.
    const [neverStaleStatus, setNeverStaleStatus] = useState(null);
    const [editing, setEditing] = useState(false);
    const [savedCount, setSavedCount] = useState(0);
    // null, 'conflict' (someone else edited it meanwhile) or 'failed'.
    const [saveFailure, setSaveFailure] = useState(null);
    const [saving, setSaving] = useState(false);
    // Set synchronously, so a second Save press before the re-render is ignored.
    const savingRef = useRef(false);
    const editTitleRef = useFocusOnChange(editing);
    const editButtonRef = useRef(null);
    const interactionId = (message?.interaction && (message.interaction._id || message.interaction.id)) || message?.id;

    // Back to Edit when the form closes (Save, Cancel editing or the X). Edit
    // is drawn fresh at that point - the hook waits for it to render.
    useReturnFocusOnClose(editing, editButtonRef);
    // Namespaces the "never stale" checkbox id so multiple panel instances
    // (one per message) can render on one page without id collisions.
    const uid = useId();

    const { withAnswerNumber } = useAnswerNumberLabel(t, answerNumber);

    const handleToggle = useCallback(async () => {
        try {
            // If we already have data, make sure it matches the message's interaction.expertFeedback
            const currentEfId = message.interaction && message.interaction.expertFeedback ? String(message.interaction.expertFeedback) : null;
            const cachedEfId = data && data.expertFeedback ? (data.expertFeedback._id || data.expertFeedback.id || null) : null;

            // Debug
            try { console.debug('[ExpertFeedbackPanel] handleToggle called, interactionId:', interactionId, 'currentEfId:', currentEfId, 'cachedEfId:', cachedEfId); } catch (e) { void e; }


            setLoading(true);
            setError(null);
            const result = await FeedbackService.getExpertFeedback({ interactionId });
            setData(result);

        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    }, [data, message, interactionId]);

    const handleDelete = useCallback(async () => {
        // Note: window.confirm()'s OK/Cancel buttons render in the browser/OS
        // language, not the app's selected locale — only the message text above
        // is translated. Matches existing precedent (VectorPage.js, UsersPage.js
        // also use window.confirm() for destructive actions). Flagged as a known
        // limitation, out of scope for this PR.
        if (!window.confirm(t('common.confirmDelete'))) {
            return;
        }
        try {
            setDeleting(true);
            setError(null);
            await FeedbackService.deleteExpertFeedback({ interactionId });
            // Clear local expert feedback references so UI updates
            setData(null);
            // If message has expertFeedback attached, clear it
            if (message.interaction) {
                message.interaction.expertFeedback = undefined;
            } else {
                message.expertFeedback = undefined;
            }
            await ClientLoggingService.info(interactionId, 'Expert feedback deleted', {});
            // The mutation above only updates this shared `message` object in
            // place - it doesn't tell React anything changed, so
            // ChatInterface.js's own `!message.interaction.expertFeedback`
            // check (deciding whether to show the eval form again) would keep
            // evaluating against its last render until something else forced
            // a re-render. This tells the actual owner of `messages` state
            // (ChatAppContainer.js) so the eval form reappears immediately,
            // no page refresh needed.
            onDeleted?.();
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setDeleting(false);
        }
    }, [message, interactionId, t, onDeleted]);

    const handleEditSubmit = useCallback(async (expertFeedback) => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setSaveFailure(null);
        const loaded = (data && data.expertFeedback) || {};
        let result;
        try {
            result = await FeedbackService.updateExpertFeedback({
                interactionId,
                expertFeedbackId: loaded._id || loaded.id,
                expectedLastEditedAt: loaded.lastEditedAt || null,
                expertFeedback,
            });
        } catch (err) {
            // Detail to the console only - the person gets a translated message.
            console.error('Expert feedback edit failed:', err);
            setSaveFailure(err?.code === 'EXPERT_FEEDBACK_CONFLICT' ? 'conflict' : 'failed');
            return;
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
        // Saved. The table reads the returned document - an empty `sentences`
        // makes its rows fall back to the evaluation's own fields - so there's
        // no second request that could fail after the save worked.
        setData((prev) => ({ ...prev, expertFeedback: result.expertFeedback, sentences: [] }));
        setEditing(false);
        setSavedCount((n) => n + 1);
        // Same reason as onDeleted above: the summary's score pill and the
        // table's rows read message.interaction.expertFeedback, owned by
        // ChatAppContainer.js.
        onUpdated?.(result.expertFeedback);
        try {
            await ClientLoggingService.info(interactionId, 'Expert feedback edited', {});
        } catch (logErr) {
            // Logging only - the save already succeeded.
        }
    }, [interactionId, data, onUpdated]);

    const handleNeverStaleToggle = useCallback(async () => {
        if (updatingNeverStaleRef.current) return;
        updatingNeverStaleRef.current = true;
        setNeverStaleStatus(null);
        const currentEf = (data && data.expertFeedback) || (message.interaction && message.interaction.expertFeedback) || message.expertFeedback || {};
        const currentVal = typeof currentEf.neverStale !== 'undefined' && currentEf.neverStale !== null ? currentEf.neverStale : false;
        const newVal = !currentVal;
        // Optimistic: the tick shows straight away; reverted below if the save fails.
        const setLocalNeverStale = (value) => {
            if (data && data.expertFeedback) {
                setData({ ...data, expertFeedback: { ...data.expertFeedback, neverStale: value } });
            } else if (message.interaction && message.interaction.expertFeedback) {
                message.interaction.expertFeedback.neverStale = value;
            } else if (message.expertFeedback) {
                message.expertFeedback.neverStale = value;
            }
        };
        setLocalNeverStale(newVal);
        try {
            await FeedbackService.setExpertNeverStale({ interactionId, neverStale: newVal });
        } catch (err) {
            // Detail to the console only - the person gets a translated message.
            console.error('Never stale update failed:', err);
            setLocalNeverStale(currentVal);
            setNeverStaleStatus('failed');
            return;
        } finally {
            updatingNeverStaleRef.current = false;
        }
        setNeverStaleStatus(newVal ? 'on' : 'off');
        try {
            await ClientLoggingService.info(interactionId, 'Expert feedback neverStale toggled', { neverStale: newVal });
        } catch (logErr) {
            // Logging only - the save already succeeded.
        }
    }, [data, message, interactionId]);

    if (!message) return null;

    const interaction = message.interaction || {};
    const answer = interaction.answer || {};

    // Build sentences array
    let sentences = [];
    if (Array.isArray(answer.paragraphs) && answer.paragraphs.length > 0) {
        sentences = answer.paragraphs.flatMap(p => extractSentences(p));
    } else if (Array.isArray(answer.sentences) && answer.sentences.length > 0) {
        sentences = answer.sentences;
    }

    // Build english sentences array (falling back to several common locations)
    let englishSentences = [];
    if (typeof answer.englishAnswer === 'string' && answer.englishAnswer.trim().length > 0) {
        // englishAnswer is a single string containing <s-1>..</s-1> tags
        englishSentences = extractSentences(answer.englishAnswer);
    } else if (Array.isArray(answer.paragraphsEnglish) && answer.paragraphsEnglish.length > 0) {
        englishSentences = answer.paragraphsEnglish.flatMap(p => extractSentences(p));
    } else if (Array.isArray(answer.sentencesEnglish) && answer.sentencesEnglish.length > 0) {
        englishSentences = answer.sentencesEnglish;
    } else if (Array.isArray(answer.sentences) && answer.sentences.length > 0 && data && Array.isArray(data.sentences)) {
        // try to pull english text from data.sentences when present
        englishSentences = data.sentences.map(s => {
            const raw = s && (s.english || s.englishAnswer || s.englishText || null);
            if (typeof raw === 'string') return raw;
            if (raw && typeof raw === 'object') return raw.english || raw.text || raw.redactedQuestion || '';
            return null;
        });
    } else if (data && Array.isArray(data.sentences)) {
        englishSentences = data.sentences.map(s => {
            const raw = s && (s.english || s.englishAnswer || s.englishText || null);
            if (typeof raw === 'string') return raw;
            if (raw && typeof raw === 'object') return raw.english || raw.text || raw.redactedQuestion || '';
            return null;
        });
    }

    // Expert feedback may be attached in a few places
    const expert = interaction.expertFeedback || message.expertFeedback || {};

    // Try to locate an English question (various possible fields) and normalize to string
    const rawQuestion = interaction.questionEnglish || interaction.englishQuestion || interaction.question || answer.englishQuestion || answer.question || message.question || '';
    let englishQuestion = '';
    if (typeof rawQuestion === 'string') {
        englishQuestion = rawQuestion;
    } else if (rawQuestion && typeof rawQuestion === 'object') {
        englishQuestion = rawQuestion.englishQuestion || rawQuestion.english || rawQuestion.redactedQuestion || rawQuestion.text || rawQuestion.question || '';
    } else {
        englishQuestion = '';
    }

    // The original-language question text, for the same EN/FR-official-
    // languages display rule resolveDisplayContent applies below - the real
    // original-language text only exists when interaction.question arrived
    // here as the actual populated Question document (models/question.js),
    // not just an id string. When it isn't populated, fall back to
    // englishQuestion (which has its own broader fallback chain above,
    // independent of interaction.question) rather than '' - matches what
    // this panel showed unconditionally before the original-language
    // display work (englishQuestion, no language distinction) instead of
    // silently hiding the whole Question block. Only wrong in the narrow
    // case of a genuinely French question arriving unpopulated (shows the
    // English text tagged lang="fr"), which is exactly as imprecise as - not
    // worse than - that prior behaviour.
    const originalQuestion = (interaction.question && typeof interaction.question === 'object')
        ? (interaction.question.redactedQuestion || '') : (englishQuestion || '');
    // Question.language (models/question.js) - the AI answers in whatever
    // language was detected here (agents/prompts/agenticBase.js), so this
    // same value also drives the answer-sentence table below, not just the
    // question header. getAnswerLanguage (answerLanguage.js) also checks
    // interaction.answer.questionLanguage, which - unlike
    // interaction.question.language - is always available once an answer
    // exists, regardless of whether interaction.question got populated.
    // Without this broader fallback, an unpopulated interaction.question
    // resolved questionLanguage to '' here, which resolveDisplayContent
    // treats as "already EN/FR, show original as-is" - silently hiding the
    // whole Question block (originalQuestion was also '' in that case) and,
    // worse, showing the untranslated original-language answer sentences
    // below instead of falling back to their English text.
    const questionLanguage = getAnswerLanguage(interaction);
    const questionDisplay = resolveDisplayContent({
        language: questionLanguage,
        original: originalQuestion,
        english: englishQuestion,
    });

    const getExpertScore = (idx) => {
        // expert schema stores sentence scores as sentence1Score, sentence2Score...
        const key = `sentence${idx + 1}Score`;
        return (expert && typeof expert[key] !== 'undefined' && expert[key] !== null) ? expert[key] : t('reviewPanels.notAvailable');
    };

    if (sentences.length === 0) return null;

    // No checkmark here \u2014 this panel never renders without expert feedback
    // (see the hasExpert guard below), so a "has expert feedback" glyph
    // would be redundant with the panel's own presence. The score itself
    // (when set) does add information, shown as a pill \u2014 same treatment as
    // DownloadPanel.js's Pass/Failed summary pill.
    const baseTitle = t('reviewPanels.expertFeedbackTitle') || t('homepage.expertRating.title');
    const hasExpert = expert && (expert._id || expert.id || expert.totalScore !== undefined);
    const hasScore = hasExpert && typeof expert.totalScore !== 'undefined' && expert.totalScore !== null;
    const expertTitle = withAnswerNumber(baseTitle);

    if (!hasExpert) return null;

    return (
        <details className="review-details" lang={lang} onToggle={(e) => {
            // e.target is the native <details> element; check its open property
            try {
                // call load when panel is being opened
                if (e && e.target && e.target.open) {
                    handleToggle(e);
                }
            } catch (err) {
                // fallback: call handler anyway
                handleToggle(e);
            }
        }}>
            <summary>
                {expertTitle}
                {hasScore && (
                    <span className="label label--summary-status normal">
                        {t('reviewPanels.scoreSuffix').replace('{score}', () => formatNumber(expert.totalScore, lang))}
                    </span>
                )}
            </summary>
            <div className="review-panel expert-feedback-panel">
                {loading && <StatusMessage loading message={t('common.loading')} />}
                {error && (
                  <StatusMessage variant="error">
                    {t('common.error')} <code lang="en">{error}</code>
                  </StatusMessage>
                )}
                {editing ? (
                    <ExpertFeedbackComponent
                        onSubmit={handleEditSubmit}
                        onClose={() => { setSaveFailure(null); setEditing(false); }}
                        lang={lang}
                        sentenceCount={sentences.length}
                        sentences={sentences}
                        questionLanguage={questionLanguage}
                        sentencesEnglish={englishSentences}
                        answerNumber={answerNumber}
                        citationUrl={citationUrl}
                        department={department}
                        titleRef={editTitleRef}
                        initialFeedback={(data && data.expertFeedback) || expert}
                        submitLabel={saving ? t('reviewPanels.savingExpertFeedback') : t('reviewPanels.saveExpertFeedback')}
                        submitBusy={saving}
                        cancelLabel={t('reviewPanels.cancelExpertFeedbackEdits')}
                        submitStatus={saveFailure && (
                            <StatusMessage
                                variant="error"
                                className="mt-200"
                                message={saveFailure === 'conflict'
                                    ? t('reviewPanels.expertFeedbackEditConflict')
                                    : t('reviewPanels.expertFeedbackSaveFailed')}
                            />
                        )}
                    />
                ) : (<>
                {/* Summary: citation and total score */}
                <div className="expert-feedback-summary">
                    {(() => {
                        const efSource = (data && data.expertFeedback) || expert || {};
                        const sentenceCount = Math.min(4, sentences.length || 0);
                        const computeTotal = (ef, count) => {
                            if (!ef) return null;
                            const hasAnyRating = [ef.sentence1Score, ef.sentence2Score, ef.sentence3Score, ef.sentence4Score, ef.citationScore].some(s => typeof s !== 'undefined' && s !== null);
                            if (!hasAnyRating) return null;
                            const scores = [ef.sentence1Score, ef.sentence2Score, ef.sentence3Score, ef.sentence4Score]
                                .slice(0, count)
                                .map(s => (s === null || typeof s === 'undefined' ? 100 : s));
                            const sentenceComponent = (scores.reduce((sum, v) => sum + v, 0) / (scores.length || 1)) * 0.75;
                            const citationComponent = (typeof ef.citationScore !== 'undefined' && ef.citationScore !== null) ? ef.citationScore : 25;
                            const total = sentenceComponent + citationComponent;
                            return Math.round(total * 100) / 100;
                        };
                        const totalVal = (efSource && typeof efSource.totalScore !== 'undefined' && efSource.totalScore !== null) ? efSource.totalScore : computeTotal(efSource, sentenceCount);
                        return (
                            <div>
                                {/* Question shown above total score when available - EN/FR stay in
                                    their original language (resolveDisplayContent), only a
                                    genuinely non-EN/FR question falls back to englishQuestion, with
                                    the pill flagging that it happened. */}
                                {questionDisplay.text ? (
                                    <>
                                        {questionDisplay.isSource && (
                                            <div style={{ marginBottom: '4px' }}>
                                                <OriginalLanguagePill languageCode={toLangAttr(questionLanguage)} lang={lang} t={t} />
                                            </div>
                                        )}
                                        <div style={{ marginBottom: '6px' }}>
                                            <strong>{t('reviewPanels.question')}</strong>{' '}
                                            <span lang={questionDisplay.lang}>{questionDisplay.text}</span>
                                        </div>
                                    </>
                                ) : null}
                                <div><strong>{t('reviewPanels.totalScoreLabel')}</strong> {totalVal !== null ? totalVal : t('reviewPanels.notAvailable')}</div>
                                {/* Show expert email if available */}
                                {efSource && (efSource.expertEmail || efSource.expert_email) ? (
                                    <div><strong>{t('reviewPanels.expertEmail')}</strong> {efSource.expertEmail || efSource.expert_email}</div>
                                ) : null}
                                {efSource && efSource.lastEditedAt ? (() => {
                                    const editedAt = formatLocaleDate(efSource.lastEditedAt, lang, '', { dateStyle: 'long', timeStyle: 'short' });
                                    const author = String(efSource.expertEmail || '').trim().toLowerCase();
                                    const editor = String(efSource.lastEditedBy || '').trim().toLowerCase();
                                    // The editor's email only when it's someone other than the expert above.
                                    const value = editor && editor !== author
                                        ? t('reviewPanels.lastEditedDateBy').replace('{date}', () => editedAt).replace('{email}', () => efSource.lastEditedBy)
                                        : editedAt;
                                    return <div><strong>{t('reviewPanels.lastEdited')}</strong> {value}</div>;
                                })() : null}
                                {/* (moved) Never Stale checkbox is rendered beside the Delete button */}
                            </div>
                        );
                    })()}
                </div>
                <table className="review-table mt-200">
                    <caption className="sr-only">{t('reviewPanels.expertFeedbackTitle')}</caption>
                    <thead>
                        <tr>
                            {/* Column header names what's actually in it, not just always
                                "Sentence" - the AI answers in whatever language was detected
                                for the question (agenticBase.js), same questionDisplay signal
                                driving the question header above, so this table is either all
                                original-language or all English, never a mix. "Source text"
                                (not "Sentence in English") since the English shown here is what
                                AI Answers actually worked from, same framing as EvalPanel.js's
                                reviewPanels.sourceText column, reused rather than duplicated. */}
                            <th scope="col">{questionDisplay.isSource ? t('reviewPanels.sourceText') : t('reviewPanels.sentence')}</th>
                            <th scope="col">{t('reviewPanels.expertScore')}</th>
                            <th scope="col">{t('homepage.expertRating.options.harmful')}</th>
                            <th scope="col">{t('homepage.expertRating.options.contentIssue')}</th>
                            <th scope="col">{t('reviewPanels.explanation')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sentences.map((s, i) => {
                            const row = (data && data.sentences && data.sentences[i]) || {};
                            const scoreVal = (typeof row.score !== 'undefined' && row.score !== null) ? row.score : getExpertScore(i);
                            const explVal = (row.explanation || (expert && expert[`sentence${i + 1}Explanation`])) || t('reviewPanels.notAvailable');
                            const harmfulVal = (typeof row.harmful !== 'undefined') ? row.harmful : (expert && expert[`sentence${i + 1}Harmful`]);
                            const contentIssueVal = (typeof row.contentIssue !== 'undefined') ? row.contentIssue : (expert && expert[`sentence${i + 1}ContentIssue`]);

                            const rawEnglish = (row && (row.english || row.englishAnswer || row.englishText)) || (Array.isArray(answer.sentencesEnglish) && answer.sentencesEnglish[i]) || (englishSentences && englishSentences[i]) || null;
                            let englishVal = null;
                            if (typeof rawEnglish === 'string') {
                                englishVal = rawEnglish;
                            } else if (rawEnglish && typeof rawEnglish === 'object') {
                                englishVal = rawEnglish.english || rawEnglish.text || rawEnglish.redactedQuestion || '';
                            } else {
                                englishVal = null;
                            }
                            // The answer is generated in whatever language was detected for the
                            // question (agenticBase.js), so questionLanguage drives this same
                            // EN/FR-official-languages display rule for each answer sentence too - not a
                            // separately-tracked per-sentence language.
                            const sentenceDisplay = resolveDisplayContent({
                                language: questionLanguage,
                                original: s,
                                english: englishVal,
                            });

                            return (
                                <tr key={`s-${i}`}>
                                    <td lang={sentenceDisplay.lang}>{sentenceDisplay.text || t('reviewPanels.notAvailable')}</td>
                                    <td>{typeof scoreVal !== 'undefined' && scoreVal !== null ? scoreVal : t('reviewPanels.notAvailable')}</td>
                                    <td>{harmfulVal ? t('common.yes') : t('common.no')}</td>
                                    <td>{contentIssueVal ? t('common.yes') : t('common.no')}</td>
                                    <td>{explVal}</td>
                                </tr>
                            );
                        })}
                        {/* Citation row - map citationScore -> expert score column. The explanation
                            column holds two distinct fields that used to silently overwrite each
                            other (whichever was truthy "won"): citationExplanation (why the cited
                            URL was wrong) and expertCitationUrl (what should have been cited
                            instead). Both are shown, each labeled, so auto-eval matching and human
                            reviewers can tell them apart. */}
                        {(() => {
                            const efSource = (data && data.expertFeedback) || expert || {};
                            const citationScore = (typeof efSource.citationScore !== 'undefined' && efSource.citationScore !== null) ? efSource.citationScore : null;
                            const scoreCell = citationScore !== null ? citationScore : t('reviewPanels.notAvailable');
                            const explCell = (efSource.citationExplanation || efSource.expertCitationUrl) ? (
                                <>
                                    {efSource.citationExplanation && (
                                        <div><strong>{t('reviewPanels.explanationLabel')}</strong> {efSource.citationExplanation}</div>
                                    )}
                                    {efSource.expertCitationUrl && (
                                        <div>
                                            <strong>{t('reviewPanels.suggestedCitation')}</strong>{' '}
                                            <GcdsLink href={efSource.expertCitationUrl} target="_blank" lang={lang}>{efSource.expertCitationUrl}</GcdsLink>
                                        </div>
                                    )}
                                </>
                            ) : t('reviewPanels.notAvailable');
                            return (
                                <tr key="citation-row" className="citation-row">
                                    <td>{t('reviewPanels.citation')}</td>
                                    <td>{scoreCell}</td>
                                    <td>{t('reviewPanels.notAvailable')}</td>
                                    <td>{t('reviewPanels.notAvailable')}</td>
                                    <td>{explCell}</td>
                                </tr>
                            );
                        })()}
                    </tbody>
                </table>
                {(() => {
                    const efSource = (data && data.expertFeedback) || expert || null;
                    const hasEf = efSource && (efSource._id || efSource.id || efSource.expertFeedback);
                    if (!hasEf) return null;
                    return (
                        <div className="mt-200">
                            {/* .gc-chckbxrdio.md — same custom checkbox visual/size used by
                                ExpertFeedbackComponent's rating checkboxes, in place of the
                                plain unstyled native checkbox this had before. Needs the
                                input/label as siblings (input[type=checkbox] + label::before),
                                not label-wraps-input, for that CSS to apply. */}
                            <div className="gc-chckbxrdio md never-stale-toggle">
                                <div className="checkbox">
                                    <input
                                        type="checkbox"
                                        id={`${uid}-never-stale`}
                                        checked={!!(efSource && efSource.neverStale)}
                                        onChange={handleNeverStaleToggle}
                                    />
                                    <label htmlFor={`${uid}-never-stale`}>{t('reviewPanels.neverStale')}</label>
                                </div>
                            </div>
                            {neverStaleStatus && (
                                <StatusMessage
                                    variant={neverStaleStatus === 'failed' ? 'error' : 'success'}
                                    message={t({
                                        on: 'reviewPanels.neverStaleOn',
                                        off: 'reviewPanels.neverStaleOff',
                                        failed: 'reviewPanels.neverStaleFailed',
                                    }[neverStaleStatus])}
                                />
                            )}
                            <div className="canada-ca-button-stack mt-200">
                                {/* From the server, so it only appears once the
                                    evaluation has loaded - the form never starts
                                    from the chat's older copy. */}
                                {data?.canEdit && (
                                    <GcdsButton
                                        ref={editButtonRef}
                                        onClick={() => { setSavedCount(0); setEditing(true); }}
                                        buttonRole="secondary"
                                        disabled={deleting}
                                        aria-label={withAnswerNumber(t('reviewPanels.editExpertFeedback'))}
                                    >
                                        {t('reviewPanels.editExpertFeedback')}
                                    </GcdsButton>
                                )}
                                <GcdsButton
                                    onClick={handleDelete}
                                    buttonRole="danger"
                                    disabled={deleting}
                                    className="hydrated"
                                    aria-label={withAnswerNumber(deleting ? (t('common.deleting')) : (t('reviewPanels.deleteExpertFeedback')))}
                                >
                                    {deleting ? (t('common.deleting')) : (t('reviewPanels.deleteExpertFeedback'))}
                                </GcdsButton>
                            </div>
                            {savedCount > 0 && (
                                <StatusMessage variant="success" message={t('reviewPanels.expertFeedbackUpdated')} nonce={savedCount} />
                            )}
                        </div>
                    );
                })()}
                </>)}
            </div>
        </details>
    );
};

export default ExpertFeedbackPanel;
