import React, { useState } from 'react';
import { useTranslations } from '../../hooks/useTranslations.js';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import DataStoreService from '../../services/DataStoreService.js';

const DeleteChatSection = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleInputChange = (event) => {
    const value = event?.target?.value || '';
    setChatId(value);
  };

  const handleInitialDelete = (e) => {
    e.preventDefault();
    if (!chatId.trim()) return;
    setShowConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!chatId.trim()) return;

    setLoading(true);
    try {
      await DataStoreService.deleteChat(chatId);
      alert(t('admin.deleteChat.success'));
      setChatId('');
      setShowConfirm(false);
    } catch (error) {
      console.error('Error deleting chat:', error);
      alert(t('admin.deleteChat.error') + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h2 className="mt-400 mb-400">{t('admin.deleteChat.title')}</h2>
      <div className="flex gap-400">
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
        {!showConfirm ? (
          <GcdsButton 
            onClick={handleInitialDelete}
            variant="danger"
            disabled={loading || !chatId.trim()}
            className="me-400 hydrated mrgn-tp-1r"
          >
            {loading 
              ? t('admin.deleteChat.loading')
              : t('admin.deleteChat.button')}
          </GcdsButton>
        ) : (
          <div className="flex gap-400">
            <GcdsButton 
              onClick={handleConfirmDelete}
              variant="danger"
              disabled={loading}
              className="me-400 hydrated mrgn-tp-1r"
            >
              {loading 
                ? t('admin.deleteChat.loading')
                : t('admin.deleteChat.confirm')}
            </GcdsButton>
            <GcdsButton 
              onClick={handleCancel}
              variant="secondary"
              disabled={loading}
              className="hydrated mrgn-tp-1r"
            >
              {t('admin.deleteChat.cancel')}
            </GcdsButton>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeleteChatSection;