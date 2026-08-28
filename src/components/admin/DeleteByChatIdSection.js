import React from 'react';
import StatusMessage from './StatusMessage.js';
import ChatIdLookupField from './ChatIdLookupField.js';
import { useChatIdLookup } from '../../hooks/admin/useChatIdLookup.js';

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
// The validate/existence-check logic itself (format check, getChat,
// validateChat) lives in useChatIdLookup.js, shared with ViewChatByIdSection.js
// too — that one doesn't go through this component because viewing isn't
// destructive and shouldn't get a delete-style confirm() dialog; only the
// pre-confirm checks are actually identical between the two.
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
  // The chat existing is DeleteChatSection.js's whole precondition, but not
  // every consumer's — DeleteExpertEval.js's real precondition is "does this
  // chat have expert feedback", which a plain existence check can't express
  // (a chat can exist with none). Let a consumer supply a more specific
  // check against the same already-fetched chat data instead of adding a
  // second round trip; defaults preserve the old any-chat-is-valid behavior.
  validateChat,
  invalidChatMessageKey,
  // Action-specific "not found" wording — see useChatIdLookup's own note.
  notFoundMessageKey,
}) => {
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
    hasError,
    errorCount,
    errorRef,
    inlineErrorMessage,
    checkChatExists,
  } = useChatIdLookup({ lang, validateChat, invalidChatMessageKey, notFoundMessageKey });

  const handleDelete = async (e) => {
    e.preventDefault();
    const chat = await checkChatExists(chatId);
    if (!chat) return;

    // window.confirm() kept for now (native, blocking) - not part of this
    // pass's scope, see AdminPage.js redesign discussion.
    if (!window.confirm(t('common.confirmDelete'))) {
      setLoading(false);
      return;
    }

    // onDelete's two current callers (DeleteChatSection.js/DeleteExpertEval.js)
    // already catch everything internally and always resolve to a
    // { isError, text } result rather than reject — but that's a convention,
    // not something this shared component can enforce on a future caller.
    // Guard it here too, so a consumer that doesn't follow it fails as a
    // visible status message instead of leaving the row stuck in loading.
    try {
      const result = await onDelete(chatId.trim());
      setStatus(result);
      if (!result.isError) setChatId('');
    } catch (err) {
      setStatus({ variant: 'error', text: t('admin.common.fetchFailed') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <details onToggle={handleToggle}>
      <summary id={`${fieldId}-summary`}>{t(titleKey)}</summary>
      <div className="mt-200 mb-200">
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
          <StatusMessage variant="info" message={status.text} />
        ) : status?.variant === 'error' ? (
          // A plain, fully-translated failure message (the lookup/onDelete
          // call itself failed) — no raw exception text to wrap, so this
          // uses `message` directly rather than the prefix/detail/suffix
          // children shape the isError branch below needs.
          <StatusMessage variant="error" message={status.text} />
        ) : status?.isError ? (
          // variant="error" + children (not `message`): the <code lang="en">
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
