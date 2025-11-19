import React, { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import EvaluationService from '../services/EvaluationService.js';

const DeleteExpertEval = ({ lang = 'en' }) => {
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

  const [resultMsg, setResultMsg] = useState(null);

  const handleConfirmDelete = async () => {
    if (!chatId.trim()) return;
    setLoading(true);
    setResultMsg(null);
    try {
      const data = await EvaluationService.deleteExpertEval(chatId);
      setResultMsg({ type: 'success', message: data.message });
      setChatId('');
      setShowConfirm(false);
    } catch (err) {
      setResultMsg({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h2 className="mt-400 mb-400">{t('admin.deleteExpertEval.title')}</h2>
      <div className="flex gap-400">
        <input
          type="text"
          id="expertEvalChatId"
          className="form-control"
          value={chatId}
          onChange={handleInputChange}
          placeholder={t('admin.deleteExpertEval.idLabel')}
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
            {loading ? t('admin.deleteExpertEval.loading') : t('admin.deleteExpertEval.button')}
          </GcdsButton>
        ) : (
          <div className="flex gap-400">
            <GcdsButton
              onClick={handleConfirmDelete}
              variant="danger"
              disabled={loading}
              className="me-400 hydrated mrgn-tp-1r"
            >
              {loading ? t('admin.deleteExpertEval.loading') : t('admin.deleteExpertEval.confirm')}
            </GcdsButton>
            <GcdsButton
              onClick={handleCancel}
              variant="secondary"
              disabled={loading}
              className="hydrated mrgn-tp-1r"
            >
              {t('admin.deleteExpertEval.cancel')}
            </GcdsButton>
          </div>
        )}
      </div>
      {resultMsg && (
        <div className={`mt-200 ${resultMsg.type === 'error' ? 'text-red-700' : 'text-green-700'}`}>{resultMsg.message}</div>
      )}
    </div>
  );
};

export default DeleteExpertEval;
