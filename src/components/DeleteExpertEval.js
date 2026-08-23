import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import EvaluationService from '../services/EvaluationService.js';
import DeleteByChatIdSection from './admin/DeleteByChatIdSection.js';

const DeleteExpertEval = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);

  const handleDelete = async (chatId) => {
    try {
      const data = await EvaluationService.deleteExpertEval(chatId);
      if (data.deletedCount > 0) {
        // data.message is server-built, untranslated English text — use the
        // translated key instead. deletedCount/chatId are a number and a
        // UUID-validated string, so plain replace is safe here (no `$` risk
        // like raw exception text below).
        const text = t('admin.deleteExpertEval.success')
          .replace('{count}', data.deletedCount)
          .replace('{chatId}', chatId);
        return { isError: false, text };
      }
      // The API returns 200 with deletedCount: 0 when the chat exists but
      // had nothing to delete (no interactions, or none with expert
      // feedback) — not a network/server failure, but from the admin's
      // point of view it's the same as "failed to delete an expert
      // evaluation" (there wasn't one). "Not evaluated" is a known,
      // translated reason (not raw exception text), so — unlike the catch
      // block below — it doesn't need a lang="en" wrapper.
      const [prefix, suffix] = t('admin.deleteExpertEval.error').split('{message}');
      return { isError: true, prefix, detail: t('admin.deleteExpertEval.notEvaluated'), suffix };
    } catch (err) {
      // err.message is raw, untranslated exception text — never run it
      // through the {message} template as a plain string substitution (a FR
      // admin would otherwise hear it announced as French). Split the
      // translated template around the placeholder instead, so the detail
      // can be wrapped in its own lang="en" span (mirrors DeleteChatSection.js).
      const [prefix, suffix] = t('admin.deleteExpertEval.error').split('{message}');
      return { isError: true, prefix, detail: <span lang="en">{err.message || String(err)}</span>, suffix };
    }
  };

  return (
    <DeleteByChatIdSection
      lang={lang}
      titleKey="admin.deleteExpertEval.title"
      idLabelKey="admin.deleteExpertEval.idLabel"
      buttonLabelKey="admin.deleteExpertEval.button"
      loadingLabelKey="admin.deleteExpertEval.loading"
      fieldId="expertEvalChatId"
      onDelete={handleDelete}
    />
  );
};

export default DeleteExpertEval;
