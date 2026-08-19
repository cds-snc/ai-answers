import React, { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import { GcdsButton } from '@gcds-core/components-react';
import EvaluationService from '../services/EvaluationService.js';
import StatusMessage from './admin/StatusMessage.js';

const DeleteExpertEval = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const [chatId, setChatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState(null);

  const handleInputChange = (event) => {
    const value = event?.target?.value || '';
    setChatId(value);
    // A stale success/error message from the last delete describes an
    // action the admin is no longer taking, once they've started typing a
    // new chat ID — same reasoning as SettingsPage.js's stageChange
    // clearing a section's stale save-outcome message on edit.
    setResultMsg(null);
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!chatId.trim()) return;
    if (!window.confirm(t('common.confirmDelete'))) return;

    setLoading(true);
    setResultMsg(null);
    try {
      const data = await EvaluationService.deleteExpertEval(chatId);
      if (data.deletedCount > 0) {
        setResultMsg({ type: 'success', message: data.message });
      } else {
        // The API returns 200 with deletedCount: 0 when the chat exists but
        // had nothing to delete (no interactions, or none with expert
        // feedback) — not a network/server failure, but from the admin's
        // point of view it's the same as "failed to delete an expert
        // evaluation" (there wasn't one), so it's announced the same way as
        // the catch block below, same as DeleteChatSection.js's pattern.
        // "Not evaluated" is a known, translated reason (not raw exception
        // text), so — unlike the catch block — it doesn't need a lang="en"
        // wrapper.
        const [prefix, suffix] = t('admin.deleteExpertEval.error').split('{message}');
        setResultMsg({ type: 'error', prefix, suffix, detail: t('admin.deleteExpertEval.notEvaluated') });
      }
      setChatId('');
    } catch (err) {
      // err.message is raw, untranslated exception text — never run it
      // through the {message} template as a plain string substitution (a FR
      // admin would otherwise hear it announced as French). Split the
      // translated template around the placeholder instead, so the detail
      // can be wrapped in its own lang="en" span below (mirrors
      // DeleteChatSection.js).
      const [prefix, suffix] = t('admin.deleteExpertEval.error').split('{message}');
      setResultMsg({ type: 'error', prefix, suffix, detail: <span lang="en">{err.message || String(err)}</span> });
    } finally {
      setLoading(false);
    }
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
        <GcdsButton
          onClick={handleDelete}
          buttonRole="danger"
          disabled={loading || !chatId.trim()}
          className="me-400 hydrated mrgn-tp-1r"
        >
          {loading ? t('admin.deleteExpertEval.loading') : t('admin.deleteExpertEval.button')}
        </GcdsButton>
      </div>
      {resultMsg?.type === 'error' ? (
        <StatusMessage variant="error">
          {resultMsg.prefix}{resultMsg.detail}{resultMsg.suffix}
        </StatusMessage>
      ) : (
        <StatusMessage variant={resultMsg?.type} message={resultMsg?.message} />
      )}
    </div>
  );
};

export default DeleteExpertEval;
