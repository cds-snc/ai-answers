import { useState } from 'react';
import { useTranslations } from '../useTranslations.js';
import DataStoreService from '../../services/DataStoreService.js';
import { useInlineFormError } from '../useInlineFormError.js';
import { isValidChatIdFormat } from '../../utils/admin/chatIdFormat.js';

// Shared "validate + confirm this chat ID exists" logic behind
// DeleteByChatIdSection.js (delete flows) and ViewChatByIdSection.js (a
// non-destructive navigation) — everything up to and including the
// existence check is identical between them; what happens *after* isn't
// (one shows a native confirm() before an async delete, the other just
// navigates), so that part stays in each caller rather than being forced
// through one component's delete-shaped contract.
//
// validateChat/invalidChatMessageKey: the chat existing isn't always the
// real precondition (e.g. DeleteExpertEval.js's is "has expert feedback",
// which a plain existence check can't express) — see DeleteByChatIdSection.js's
// own comment for the full reasoning. Checked against the same already-fetched
// chat data, no second request.
export function useChatIdLookup({
  lang = 'en',
  validateChat = () => true,
  invalidChatMessageKey = 'admin.common.chatNotFound',
} = {}) {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  // "Empty" and "invalid format" are pre-submit, client-side field
  // validation (this inline slot); "not found"/"invalid target"/"lookup
  // failed" are genuine server-lookup outcomes, so those stay StatusMessages.
  const [inlineErrorMessage, setInlineErrorMessage] = useState('');
  const { hasError, errorCount, errorRef, triggerError, clearError } = useInlineFormError();

  const handleInputChange = (event) => {
    const value = event?.target?.value || '';
    setChatId(value);
    clearError();
    // A stale result message describes an action the admin is no longer
    // taking, once they've started typing a new chat ID — same reasoning as
    // SettingsPage.js's stageChange clearing a section's stale save-outcome
    // message on edit.
    setStatus(null);
  };

  // Closing the row means "I'm done here" — reset it fully (typed ID
  // included, not just the status message) so reopening it later starts
  // clean rather than picking up wherever it was left. Native <details>
  // fires `toggle` for both directions; clearing on open too is a harmless
  // no-op (already empty from the close that necessarily preceded it).
  const handleToggle = () => {
    setChatId('');
    clearError();
    setStatus(null);
  };

  // Validates and existence-checks rawValue. Returns the fetched chat object
  // on success — caller proceeds with its own next step, and still owns
  // setLoading(false) for that step. Returns null on any failure, having
  // already set inline/status state and setLoading(false) itself — caller
  // should just `return` when this returns null.
  // TODO: this always fetches db-chat.js's fully-populated chat just to test
  // truthiness; DeleteChatSection.js/ViewChatByIdSection.js discard it and
  // ViewChatByIdSection.js's caller (HomePage.js) re-fetches the same chat
  // right after. Only DeleteExpertEval.js's validateChat actually needs the
  // populated data. Low priority — admin/partner-only, low-volume — but a
  // lightweight existence check (unpopulated findOne) would cut the waste
  // for the other two callers.
  const checkChatExists = async (rawValue) => {
    const trimmed = (rawValue || '').trim();
    if (!trimmed) {
      setInlineErrorMessage(t('admin.common.chatIdRequired'));
      triggerError();
      return null;
    }
    // Format check next, no round trip needed: a value that isn't even
    // shaped like a chat ID is a real input error, distinct from a
    // well-formed ID that just doesn't match anything (the "not found"
    // StatusMessage below) — without this, a malformed ID fell through to
    // the existence check and came back indistinguishable from a real
    // "not found" result.
    if (!isValidChatIdFormat(trimmed)) {
      setInlineErrorMessage(t('admin.viewChat.invalidFormat'));
      triggerError();
      return null;
    }

    setLoading(true);
    setStatus(null);
    try {
      const data = await DataStoreService.getChat(trimmed);
      // getChat() distinguishes a real 404 (returns { chat: null }) from
      // any other failure (still throws, caught below) — see its own
      // comment — so a genuinely nonexistent chat ID reads as "not found"
      // and an outage gets its own distinct message instead of both
      // reading as "this data doesn't exist."
      if (!data?.chat) {
        setStatus({ variant: 'info', text: t('admin.common.chatNotFound') });
        setLoading(false);
        return null;
      }
      if (!validateChat(data.chat)) {
        setStatus({ variant: 'info', text: t(invalidChatMessageKey) });
        setLoading(false);
        return null;
      }
      return data.chat;
    } catch (err) {
      setStatus({ variant: 'error', text: t('admin.common.fetchFailed') });
      setLoading(false);
      return null;
    }
  };

  return {
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
  };
}

export default useChatIdLookup;
