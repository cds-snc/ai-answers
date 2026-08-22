import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslations } from '../../hooks/useTranslations.js';
import DataStoreService from '../../services/DataStoreService.js';
import StatusMessage from './StatusMessage.js';
import { useInlineFormError } from '../../hooks/useInlineFormError.js';
import { isValidChatIdFormat } from '../../utils/admin/chatIdFormat.js';
import ChatIdLookupField from './ChatIdLookupField.js';

// Quick chat-ID lookup, navigating to the chat viewer for the entered ID -
// requires the full, exact chat ID (a direct navigation, not a search; see
// EvalDashboardPage.js's own "View chat by ID" for the genuinely different
// partial-match search version, which opens a filtered results table
// instead of navigating anywhere).
//
// Checks the chat actually exists (DataStoreService.getChat - the same
// db-chat.js route, same exact chatId match, that the review page itself
// fetches from) before navigating. Previously this navigated on any
// non-empty input, no matter the ID's validity — a wrong or partial ID
// silently landed on an empty review page with no explanation, instead of
// telling the admin the lookup failed.
//
// One row in whichever page renders it (its own h2) - collapsed by
// default, summary text is this row's only label, no separate heading
// here - same shape as DeleteChatSection.js/DeleteExpertEval.js. Pulled
// out of AdminPage.js so it can be reused on other pages without
// duplicating the lookup form itself.
const ViewChatByIdSection = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const navigate = useNavigate();
  const [lookupChatId, setLookupChatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  // Both the "empty" and "malformed" cases are pre-submit, client-side
  // field validation — same inline-error slot as a result, just with a
  // different message depending on which one failed (see AGENTS.md's
  // "repeat identical validation failures" note: the message varies, but
  // errorCount still has to increment on every trigger for
  // FeedbackInlineError to remount/re-announce on a repeat failure).
  // "Not found" (below) is a genuine server-lookup outcome, not a form
  // validation error, so it stays a StatusMessage - matches
  // EvalDashboardPage.js's own split between searchRequired (inline) and
  // searchNotFound (StatusMessage).
  const [inlineErrorMessage, setInlineErrorMessage] = useState('');
  const { hasError, errorCount, errorRef, triggerError, clearError } = useInlineFormError();

  const handleChange = (e) => {
    setLookupChatId(e.target.value);
    clearError();
    // A stale "not found" message describes a lookup the admin is no
    // longer making, once they've started typing a new chat ID — same
    // reasoning as SettingsPage.js's stageChange clearing a section's
    // stale save-outcome message on edit.
    setStatus(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = lookupChatId.trim();
    if (!trimmed) {
      setInlineErrorMessage(t('admin.common.chatIdRequired'));
      triggerError();
      return;
    }
    // Format check next, no round trip needed: chat IDs are uuidv4() (see
    // chatIdFormat.js) - a value that isn't even shaped like one is a real
    // input error, same inline slot as the empty case above but with its
    // own message. Distinct from a well-formed ID that just doesn't match
    // anything (the "not found" StatusMessage below) - not the same
    // outcome, shouldn't read as the same message.
    if (!isValidChatIdFormat(trimmed)) {
      setInlineErrorMessage(t('admin.viewChat.invalidFormat'));
      triggerError();
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const data = await DataStoreService.getChat(trimmed);
      if (!data?.chat) {
        setStatus({ variant: 'info', text: t('admin.viewChat.notFound') });
        setLoading(false);
        return;
      }
      navigate(`/${lang}?chat=${encodeURIComponent(trimmed)}&review=1`);
      // No setLoading(false) here on success — this component is about to
      // unmount as the page navigates away.
    } catch (err) {
      // getChat's own catch collapses a genuine 404 and a network/server
      // failure into the same thrown Error (see DataStoreService.getChat) -
      // not distinguishable from here, so both read as "not found" (info)
      // rather than misreporting a real outage as an input error.
      setStatus({ variant: 'info', text: t('admin.viewChat.notFound') });
      setLoading(false);
    }
  };

  return (
    <details>
      <summary>{t('admin.common.viewChatById')}</summary>
      <div className="mt-200">
        <form onSubmit={handleSubmit}>
          <ChatIdLookupField
            fieldId="view-chat-id"
            label={t('admin.viewChat.label')}
            placeholder={t('admin.common.chatIdPlaceholder')}
            value={lookupChatId}
            onChange={handleChange}
            disabled={loading}
            hasError={hasError}
            errorMessage={inlineErrorMessage}
            errorCount={errorCount}
            errorRef={errorRef}
            buttonLabel={loading ? t('admin.viewChat.loading') : t('admin.viewChat.button')}
          />
        </form>
        {status && (
          <StatusMessage variant={status.variant} message={status.text} />
        )}
      </div>
    </details>
  );
};

export default ViewChatByIdSection;
