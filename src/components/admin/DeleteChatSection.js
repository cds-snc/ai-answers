import React, { useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsButton } from '@gcds-core/components-react';
import DataStoreService from '../../services/DataStoreService.js';
import StatusMessage from './StatusMessage.js';

const DeleteChatSection = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleInputChange = (event) => {
    const value = event?.target?.value || '';
    setChatId(value);
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!chatId.trim()) return;
    if (!window.confirm(t('common.confirmDelete'))) return;

    setLoading(true);
    setStatus(null);
    try {
      await DataStoreService.deleteChat(chatId);
      setStatus({ text: t('admin.deleteChat.success'), isError: false });
      setChatId('');
    } catch (error) {
      console.error('Error deleting chat:', error);
      // error.message is raw, untranslated exception text — never run it
      // through the {message} template as a plain string substitution (a FR
      // admin would otherwise see it announced as French). Split the
      // translated template around the placeholder instead, so the detail
      // can be wrapped in its own lang="en" span below.
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
      setStatus({
        prefix,
        suffix,
        detail: error.message || String(error),
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h2 className="mt-400 mb-400">{t('admin.deleteChat.title')}</h2>
      <div className="flex gap-400">
        <label htmlFor="chatId" className="sr-only">
          {t('admin.deleteChat.idLabel')}
        </label>
        <input
          type="text"
          id="chatId"
          className="form-control"
          value={chatId}
          onChange={handleInputChange}
          placeholder={t('admin.deleteChat.idLabel')}
          disabled={loading}
          required
        />
        <GcdsButton
          onClick={handleDelete}
          buttonRole="danger"
          disabled={loading || !chatId.trim()}
          className="me-400 hydrated mrgn-tp-1r"
        >
          {loading
            ? t('admin.deleteChat.loading')
            : t('admin.deleteChat.button')}
        </GcdsButton>
      </div>
      {/* TODO (design review): confirm this is the right StatusMessage
          variant/box treatment for this use case — not yet reviewed by
          design as part of this pass's box-system migration. */}
      {status?.isError ? (
        <StatusMessage variant="error">
          {status.prefix}<span lang="en">{status.detail}</span>{status.suffix}
        </StatusMessage>
      ) : (
        <StatusMessage variant={status?.text ? 'success' : undefined} message={status?.text} />
      )}
    </div>
  );
};

export default DeleteChatSection;