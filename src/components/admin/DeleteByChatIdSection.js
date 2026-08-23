import React, { useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import DataStoreService from '../../services/DataStoreService.js';
import StatusMessage from './StatusMessage.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import { isValidChatIdFormat } from '../../utils/admin/chatIdFormat.js';
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
  // Same split as ViewChatByIdSection.js: "empty" and "invalid format" are
  // pre-submit, client-side field validation (this inline slot, message
  // varies by which one failed); "not found" is a genuine server-lookup
  // outcome, so it stays a StatusMessage instead.
  const [inlineErrorMessage, setInlineErrorMessage] = useState('');
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

  // Closing this row means "I'm done here" — reset it fully (typed ID
  // included, not just the status message) so reopening it later starts
  // clean rather than picking up wherever it was left. Native <details>
  // fires `toggle` for both directions; clearing on open too is a harmless
  // no-op (already empty from the close that necessarily preceded it).
  const handleToggle = () => {
    setChatId('');
    clearError();
    setStatus(null);
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    const trimmed = chatId.trim();
    if (!trimmed) {
      setInlineErrorMessage(t('admin.common.chatIdRequired'));
      triggerError();
      return;
    }
    // Format check next, no round trip needed — same reasoning as
    // ViewChatByIdSection.js: a value that isn't even shaped like a chat ID
    // is a real input error, distinct from a well-formed ID that just
    // doesn't match anything (the "not found" StatusMessage below).
    // Without this, a malformed ID fell through to the existence check and
    // came back indistinguishable from a real "not found" result.
    if (!isValidChatIdFormat(trimmed)) {
      setInlineErrorMessage(t('admin.viewChat.invalidFormat'));
      triggerError();
      return;
    }

    setLoading(true);
    setStatus(null);
    // Confirm the chat actually exists before asking the admin to confirm a
    // delete that's about to fail anyway — same existence check
    // ViewChatByIdSection.js uses (DataStoreService.getChat, the same
    // db-chat.js route), same "not found" wording, so a chat ID that
    // doesn't exist goes straight to that message instead of a confirm
    // dialog for nothing.
    try {
      const data = await DataStoreService.getChat(trimmed);
      if (!data?.chat) {
        setStatus({ variant: 'info', text: t('admin.viewChat.notFound') });
        setLoading(false);
        return;
      }
    } catch (err) {
      // getChat's own catch collapses a genuine 404 and a network/server
      // failure into the same thrown Error (see DataStoreService.getChat) -
      // not distinguishable from here, same as ViewChatByIdSection.js: both
      // read as "not found" rather than misreporting a real outage as this.
      setStatus({ variant: 'info', text: t('admin.viewChat.notFound') });
      setLoading(false);
      return;
    }

    // window.confirm() kept for now (native, blocking) - not part of this
    // pass's scope, see AdminPage.js redesign discussion.
    if (!window.confirm(t('common.confirmDelete'))) {
      setLoading(false);
      return;
    }

    const result = await onDelete(trimmed);
    setStatus(result);
    if (!result.isError) setChatId('');
    setLoading(false);
  };

  return (
    <details onToggle={handleToggle}>
      <summary id={`${fieldId}-summary`}>{t(titleKey)}</summary>
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
            errorMessage={inlineErrorMessage}
            errorCount={errorCount}
            errorRef={errorRef}
            buttonRole="danger"
            buttonLabel={loading ? t(loadingLabelKey) : t(buttonLabelKey)}
            describedById={`${fieldId}-summary`}
          />
        </form>
        {status?.variant === 'info' ? (
          // "Not found" — a genuine server-lookup outcome, not an error.
          <StatusMessage variant="info" message={status.text} persistent />
        ) : status?.isError ? (
          // variant="error" + children (not `message`): the <span lang="en">
          // wrapper a raw exception detail needs (see onDelete's own
          // comment) can't go inside a plain message string. StatusMessage
          // adds its own icon automatically either way (see its own
          // resolveLook comment) — this doesn't need to render one itself.
          <StatusMessage variant="error" persistent>
            {status.prefix}{status.detail}{status.suffix}
          </StatusMessage>
        ) : (
          <StatusMessage variant={status?.text ? 'success' : undefined} message={status?.text} persistent />
        )}
      </div>
    </details>
  );
};

export default DeleteByChatIdSection;
