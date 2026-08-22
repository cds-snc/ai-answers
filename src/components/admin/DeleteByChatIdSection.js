import React, { useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import StatusMessage from './StatusMessage.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import ChatIdLookupField from './ChatIdLookupField.js';

// Shared "delete something by chat ID" row: one <details>/summary/form/
// status shell, reused by DeleteChatSection.js (deletes the whole chat) and
// DeleteExpertEval.js (deletes just its expert evaluation) - these two only
// ever differed in which service call runs and what the button/summary
// text says, never in layout, validation, or status-message handling.
// Hand-duplicating that shell across two files is exactly what silently
// drifts over time (one gets tweaked, the other doesn't) - one shared
// component makes that impossible instead of something to keep checking.
// Both are rows in AdminPage.js's shared "View and delete chats by ID"
// section (its own h2) - collapsed by default, summary text is this row's
// only label, no separate heading here.
//
// onDelete(chatId) contract: resolves to { isError: false, text } for a
// plain success message, or { isError: true, prefix, detail, suffix } for
// StatusMessage's split-template treatment (see AGENTS.md's
// admin.common.fetchError pattern) - `detail` is a ReactNode the *caller*
// has already decided whether to wrap in lang="en": raw exception text
// needs it, an already-translated reason (e.g. "Not evaluated") doesn't.
const DeleteByChatIdSection = ({
  lang = 'en',
  titleKey,
  idLabelKey,
  buttonLabelKey,
  loadingLabelKey,
  fieldId,
  onDelete,
}) => {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const { hasError, errorCount, errorRef, triggerError, clearError } = useInlineFormError();

  const handleInputChange = (event) => {
    const value = event?.target?.value || '';
    setChatId(value);
    clearError();
    // A stale success/error message from the last delete describes an
    // action the admin is no longer taking, once they've started typing a
    // new chat ID — same reasoning as SettingsPage.js's stageChange
    // clearing a section's stale save-outcome message on edit.
    setStatus(null);
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!chatId.trim()) { triggerError(); return; }
    // window.confirm() kept for now (native, blocking) - not part of this
    // pass's scope, see AdminPage.js redesign discussion.
    if (!window.confirm(t('common.confirmDelete'))) return;

    setLoading(true);
    setStatus(null);
    const result = await onDelete(chatId);
    setStatus(result);
    if (!result.isError) setChatId('');
    setLoading(false);
  };

  return (
    <details>
      <summary>{t(titleKey)}</summary>
      <div className="mt-200">
        <form onSubmit={handleDelete}>
          <ChatIdLookupField
            fieldId={fieldId}
            label={t(idLabelKey)}
            placeholder={t('admin.common.chatIdPlaceholder')}
            value={chatId}
            onChange={handleInputChange}
            disabled={loading}
            hasError={hasError}
            errorMessage={t('admin.common.chatIdRequired')}
            errorCount={errorCount}
            errorRef={errorRef}
            buttonRole="danger"
            buttonLabel={loading ? t(loadingLabelKey) : t(buttonLabelKey)}
          />
        </form>
        {status?.isError ? (
          // variant="error" + children (not `message`): the <span lang="en">
          // wrapper a raw exception detail needs (see onDelete's own
          // comment) can't go inside a plain message string. StatusMessage
          // adds its own icon automatically either way (see its own
          // resolveLook comment) — this doesn't need to render one itself.
          <StatusMessage variant="error">
            {status.prefix}{status.detail}{status.suffix}
          </StatusMessage>
        ) : (
          <StatusMessage variant={status?.text ? 'success' : undefined} message={status?.text} />
        )}
      </div>
    </details>
  );
};

export default DeleteByChatIdSection;
