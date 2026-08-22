import React from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import DataStoreService from '../../services/DataStoreService.js';
import DeleteByChatIdSection from './DeleteByChatIdSection.js';

const DeleteChatSection = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  const handleDelete = async (chatId) => {
    try {
      await DataStoreService.deleteChat(chatId);
      return { isError: false, text: t('admin.deleteChat.success') };
    } catch (error) {
      console.error('Error deleting chat:', error);
      // error.message is raw, untranslated exception text — never run it
      // through the {message} template as a plain string substitution (a FR
      // admin would otherwise see it announced as French). Split the
      // translated template around the placeholder instead, so the detail
      // can be wrapped in its own lang="en" span.
      // TODO (for Official Languages review): the wrapped detail below is
      // still only a pronunciation fix (WCAG 3.1.2), not a translation —
      // error.message comes straight from the network/runtime (e.g. "Failed
      // to fetch", a raw HTTP status line, a driver error) and has no fixed
      // set of values to put behind a t() key. Genuinely localizing this
      // needs DataStoreService.deleteChat (and the API route it calls) to
      // return a stable error CODE instead of a free-text message, plus new
      // admin.deleteChat.errors.* keys here to map code -> translated text.
      // Flagging for a maintainer decision on whether that's worth doing.
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
