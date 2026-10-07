import React, { useRef, useState } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import FeedbackService from '../services/FeedbackService.js';
import ChatIdLookupField from './admin/ChatIdLookupField.js';
import StatusMessage from './admin/StatusMessage.js';
import FeedbackInlineError from './chat/FeedbackInlineError.js';
import { useChatIdLookup } from '../hooks/admin/useChatIdLookup.js';
import { useInlineFormError } from '../hooks/useInlineFormError.js';
import { useFocusOnChange } from '../hooks/useFocusOnChange.js';
import { formatNumber } from '../utils/numberFormat.js';

const FIELD_ID = 'expertEvalChatId';

// One row per evaluated answer. Each answer in a chat can be reviewed by a
// different expert and belong to a different department, so the picker
// shows both. Answer number counts every answer in the chat, evaluated or
// not, so it matches what the chat itself shows.
const toEvaluations = (chat) => (chat.interactions || [])
  .map((interaction, index) => ({
    interactionId: interaction._id,
    answerNumber: index + 1,
    department: interaction.context?.department || '',
    email: interaction.expertFeedback?.expertEmail || '',
    evaluated: !!interaction.expertFeedback,
  }))
  .filter((row) => row.evaluated);

// Lists the chat's evaluations as checkboxes, none ticked: ticking is the
// confirmation, so there's no confirm dialog. Same flow for one evaluation
// as for several. Deletes go through the per-interaction
// endpoint (same as ExpertFeedbackPanel.js's button), which also clears the
// evaluation's copy on the answer's embedding metadata.
const DeleteExpertEval = ({ lang = 'en' }) => {
  const {
    t,
    chatId,
    setChatId,
    handleInputChange,
    handleToggle,
    loading,
    setLoading,
    status,
    setStatus,
    statusNonce,
    hasError,
    errorCount,
    errorRef,
    inlineErrorMessage,
    checkChatExists,
  } = useChatIdLookup({
    lang,
    validateChat: (chat) => toEvaluations(chat).length > 0,
    invalidChatMessageKey: 'admin.deleteExpertEval.notEvaluated',
    notFoundMessageKey: 'admin.deleteExpertEval.notFound',
  });

  const [evaluations, setEvaluations] = useState(null);
  const [selected, setSelected] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const noneSelectedError = useInlineFormError();
  // The list appearing is the lookup's outcome: focus its first checkbox so
  // it's read out (legend + row).
  const [foundCount, setFoundCount] = useState(0);
  const firstCheckboxRef = useFocusOnChange(foundCount);
  // A full delete removes the list and its button, dropping focus — move it
  // to the outcome instead (status-and-error-messaging.md).
  const [deleteOutcomeCount, setDeleteOutcomeCount] = useState(0);
  const deleteOutcomeRef = useFocusOnChange(deleteOutcomeCount);

  // Bumped whenever the section closes or the chat ID changes, so a lookup or
  // delete still in flight knows its result is stale and drops it.
  const runRef = useRef(0);

  const resetPicker = () => {
    runRef.current += 1;
    setEvaluations(null);
    setSelected([]);
    noneSelectedError.clearError();
  };

  const onInputChange = (event) => {
    handleInputChange(event);
    resetPicker();
  };

  const onToggle = () => {
    handleToggle();
    resetPicker();
  };

  const rowLabel = (row) => t('admin.deleteExpertEval.rowLabel')
    .replace('{number}', formatNumber(row.answerNumber, lang))
    .replace('{department}', row.department || t('admin.deleteExpertEval.noDepartment'))
    .replace('{email}', row.email || t('admin.deleteExpertEval.unknownReviewer'));

  // Returns the interaction IDs whose evaluation is now gone. Sequential: at
  // most 3 rows per chat. A deletedCount of 0 means it was already deleted
  // elsewhere (e.g. the review panel) — gone either way, so it counts.
  const deleteInteractions = async (interactionIds) => {
    const deletedIds = [];
    for (const interactionId of interactionIds) {
      try {
        await FeedbackService.deleteExpertFeedback({ interactionId });
        deletedIds.push(interactionId);
      } catch (err) {
        // Counted as not deleted.
        console.error(`Error deleting expert feedback for interaction ${interactionId}:`, err);
      }
    }
    return deletedIds;
  };

  const successStatus = (count, extra = {}) => ({
    ...extra,
    variant: 'success',
    text: t('admin.deleteExpertEval.success')
      .replace('{count}', formatNumber(count, lang))
      .replace('{chatId}', chatId.trim()),
  });

  const handleLookup = async (e) => {
    e.preventDefault();
    resetPicker();
    const run = runRef.current;
    const chat = await checkChatExists(chatId);
    if (!chat) return;
    if (run !== runRef.current) {
      setLoading(false);
      return;
    }
    const rows = toEvaluations(chat);
    setEvaluations(rows);
    setLoading(false);
    setFoundCount((n) => n + 1);
  };

  const toggleRow = (interactionId, checked) => {
    setSelected((prev) => (checked ? [...prev, interactionId] : prev.filter((id) => id !== interactionId)));
    noneSelectedError.clearError();
  };

  const handleDeleteSelected = async (e) => {
    e.preventDefault();
    if (selected.length === 0) {
      noneSelectedError.triggerError();
      return;
    }
    setDeleting(true);
    setStatus(null);
    const run = runRef.current;
    // Rows that fail stay listed to retry.
    const deletedIds = await deleteInteractions(selected);
    if (run !== runRef.current) {
      setDeleting(false);
      return;
    }
    const total = selected.length;
    const count = deletedIds.length;
    if (count === total) {
      setStatus(successStatus(count, { fromDelete: true }));
      const remaining = evaluations.filter((row) => !deletedIds.includes(row.interactionId));
      if (remaining.length === 0) {
        resetPicker();
        setChatId('');
      } else {
        setEvaluations(remaining);
        setSelected([]);
      }
    } else {
      setStatus({
        fromDelete: true,
        variant: 'error',
        text: count === 0
          ? t('admin.deleteExpertEval.failed')
          : t('admin.deleteExpertEval.partial')
            .replace('{count}', formatNumber(count, lang))
            .replace('{total}', formatNumber(total, lang)),
      });
      setEvaluations((prev) => prev.filter((row) => !deletedIds.includes(row.interactionId)));
      setSelected((prev) => prev.filter((id) => !deletedIds.includes(id)));
    }
    setDeleting(false);
    setDeleteOutcomeCount((n) => n + 1);
  };

  const noneSelectedErrorId = `${FIELD_ID}-picker-error`;

  return (
    <details onToggle={onToggle}>
      <summary id={`${FIELD_ID}-summary`}>{t('admin.deleteExpertEval.title')}</summary>
      <div className="mt-200 mb-200">
        <form onSubmit={handleLookup}>
          <ChatIdLookupField
            fieldId={FIELD_ID}
            label={t('admin.deleteExpertEval.idLabel')}
            placeholder={t('admin.common.chatIdPlaceholder')}
            value={chatId}
            onChange={onInputChange}
            disabled={loading || deleting}
            hasError={hasError}
            errorMessage={inlineErrorMessage}
            errorCount={errorCount}
            errorRef={errorRef}
            buttonLabel={loading ? t('admin.viewChat.loading') : t('admin.deleteExpertEval.button')}
            describedById={`${FIELD_ID}-summary`}
          />
        </form>
        {evaluations && evaluations.length > 0 && (
          <form onSubmit={handleDeleteSelected} className="mt-300">
            <fieldset
              className={`gc-chckbxrdio md canada-ca-choice-fieldset${noneSelectedError.hasError ? ' has-error' : ''}`}
              aria-describedby={noneSelectedError.hasError ? noneSelectedErrorId : undefined}
              disabled={deleting}
            >
              <legend className="filter-label">{t('admin.deleteExpertEval.pickerLegend')}</legend>
              {noneSelectedError.hasError && (
                <FeedbackInlineError
                  id={noneSelectedErrorId}
                  message={t('admin.deleteExpertEval.noneSelected')}
                  errorCount={noneSelectedError.errorCount}
                  inputRef={noneSelectedError.errorRef}
                />
              )}
              {evaluations.map((row, index) => {
                const id = `${FIELD_ID}-row-${row.interactionId}`;
                return (
                  <div className="checkbox" key={row.interactionId}>
                    <input
                      type="checkbox"
                      id={id}
                      ref={index === 0 ? firstCheckboxRef : undefined}
                      checked={selected.includes(row.interactionId)}
                      onChange={(event) => toggleRow(row.interactionId, event.target.checked)}
                    />
                    <label htmlFor={id}>{rowLabel(row)}</label>
                  </div>
                );
              })}
            </fieldset>
            <GcdsButton type="submit" buttonRole="danger" disabled={deleting}>
              {deleting
                ? t('common.deleting')
                : t('admin.deleteExpertEval.deleteSelected').replace('{count}', formatNumber(selected.length, lang))}
            </GcdsButton>
          </form>
        )}
        {status?.variant === 'info' ? (
          // "Not found" / "Not evaluated" — lookup outcomes, not errors.
          <StatusMessage variant="info" message={status.text} nonce={statusNonce} />
        ) : status?.fromDelete ? (
          // Focus is moved onto it, so it doesn't announce too.
          <StatusMessage
            variant={status.variant}
            message={status.text}
            nonce={statusNonce}
            announce={false}
            announcedVia="focus"
            ref={deleteOutcomeRef}
            tabIndex={-1}
            className="focus-target"
          />
        ) : (
          // Lookup failure (admin.common.fetchFailed).
          <StatusMessage variant={status?.variant} message={status?.text} nonce={statusNonce} />
        )}
      </div>
    </details>
  );
};

export default DeleteExpertEval;
