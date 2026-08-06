import React, { useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsButton } from '@gcds-core/components-react';
import DataStoreService from '../../services/DataStoreService.js';

const DeleteChatSection = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (event) => {
    const value = event?.target?.value || '';
    setChatId(value);
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!chatId.trim()) return;
    if (!window.confirm(t('common.confirmDelete'))) return;

    setLoading(true);
    try {
      await DataStoreService.deleteChat(chatId);
      alert(t('admin.deleteChat.success'));
      setChatId('');
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert(t('admin.deleteChat.error') + error.message);
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
    </div>
  );
};

export default DeleteChatSection;