import React from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import DataStoreService from '../../services/DataStoreService.js';
import DeleteByChatIdSection from './DeleteByChatIdSection.js';

const DeleteChatSection = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  const handleDelete = async (chatId) => {
    try {
      await DataStoreService.deleteChat(chatId);
      // chatId is already validated against the UUID-style format
      // (isValidChatIdFormat, upstream in DeleteByChatIdSection) before this
      // runs, so plain replace is safe — it can't contain a `$` sequence the
      // way raw exception text below can.
      return { isError: false, text: t('admin.deleteChat.success').replace('{chatId}', chatId) };
    } catch (error) {
      console.error('Error deleting chat:', error);
      // error.message is raw, untranslated exception text — never run it
      // through the {message} template as a plain string substitution (a FR
      // admin would otherwise see it announced as French). Split the
      // translated template around the placeholder instead, so the detail
      // can be wrapped in its own lang="en" span.
      // TODO (for Official Languages review): the wrapped detail below is
      // still only a pronunciation fix (WCAG 3.1.2), not a translation.
      // Most of what lands here really is unbounded (network drop, an
      // unexpected 500, "Failed to fetch") with no fixed set of values to
      // put behind a t() key — but at least one case IS bounded: the 404
      // race (pre-check passed, then the chat was deleted before this call
      // completed — api/chat/chat-delete.js throws 'Chat not found.' for
      // that) is a known, known-value outcome, same reasoning as
      // DeleteExpertEval.js's admin.deleteExpertEval.notEvaluated case.
      // Genuinely localizing this needs DataStoreService.deleteChat (and
      // the API route it calls) to return a stable error CODE instead of
      // just message text, so this catch block can route the bounded case
      // to a real t() key and leave lang="en" only for the genuinely
      // unbounded remainder. Flagging for a maintainer decision on whether
      // that's worth doing — touches both layers plus a test rewrite, not
      // just this file.
      const [prefix, suffix] = t('admin.deleteChat.error').split('{message}');
      return { isError: true, prefix, detail: <span lang="en">{error.message || String(error)}</span>, suffix };
    }
  };

  return (
    <DeleteByChatIdSection
      lang={lang}
      titleKey="admin.deleteChat.title"
      idLabelKey="admin.deleteChat.idLabel"
      buttonLabelKey="admin.deleteChat.button"
      loadingLabelKey="admin.deleteChat.loading"
      fieldId="chatId"
      onDelete={handleDelete}
    />
  );
};

export default DeleteChatSection;
