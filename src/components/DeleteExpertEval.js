import React from 'react';
import { useTranslations } from '../hooks/useTranslations.js';
import EvaluationService from '../services/EvaluationService.js';
import DeleteByChatIdSection from './admin/DeleteByChatIdSection.js';
import { formatNumber } from '../utils/numberFormat.js';
import { useErrorStatus } from '../hooks/useErrorStatus.js';

const DeleteExpertEval = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { buildErrorStatus, wrapErrorDetail } = useErrorStatus(t);

  const handleDelete = async (chatId) => {
    try {
      const data = await EvaluationService.deleteExpertEval(chatId);
      if (data.deletedCount > 0) {
        // data.message is server-built, untranslated English text — use the
        // translated key instead. chatId is a UUID-validated string (no `$`
        // risk like raw exception text below); the count goes through
        // formatNumber per AGENTS.md — French/English format numbers
        // differently, even a small one like this.
        const text = t('admin.deleteExpertEval.success')
          .replace('{count}', formatNumber(data.deletedCount, lang))
          .replace('{chatId}', chatId);
        return { isError: false, text };
      }
      // The API returns 200 with deletedCount: 0 when the chat exists but
      // had nothing to delete (no interactions, or none with expert
      // feedback) — not a network/server failure, but from the admin's
      // point of view it's the same as "failed to delete an expert
      // evaluation" (there wasn't one). "Not evaluated" is a known,
      // translated reason (not raw exception text), so — unlike the catch
      // block below — it doesn't need a lang="en" wrapper. Goes through
      // buildErrorStatus anyway so both branches share one prefix/suffix split.
      const notEvaluated = buildErrorStatus('admin.deleteExpertEval.error', { message: t('admin.deleteExpertEval.notEvaluated') });
      return { isError: true, prefix: notEvaluated.prefix, detail: notEvaluated.detail, suffix: notEvaluated.suffix };
    } catch (err) {
      // TODO (Official Languages): this treats every failure here as
      // unbounded free text, but the 404 race case specifically (the
      // pre-check passed, then the chat was deleted before this call
      // completed — EvaluationService.deleteExpertEval throws 'Chat not
      // found.' for that, services/EvaluationService.js:89) is actually a
      // known, bounded outcome and could be a real translated key instead
      // of a lang="en"-wrapped English string — same reasoning as
      // admin.deleteExpertEval.notEvaluated just above. Needs the backend
      // to return a stable error code (not just message text) so this catch
      // block can tell that case apart from a genuinely unbounded failure
      // (network drop, unexpected 500). Not done: touches both layers plus
      // a test rewrite, not just this file — see PR discussion.
      return wrapErrorDetail('admin.deleteExpertEval.error', err);
    }
  };

  return (
    <DeleteByChatIdSection
      lang={lang}
      titleKey="admin.deleteExpertEval.title"
      idLabelKey="admin.deleteExpertEval.idLabel"
      buttonLabelKey="admin.deleteExpertEval.button"
      loadingLabelKey="admin.deleteExpertEval.loading"
      notFoundMessageKey="admin.deleteExpertEval.notFound"
      fieldId="expertEvalChatId"
      onDelete={handleDelete}
      // The chat existing isn't this consumer's real precondition — it can
      // exist with zero expert feedback. getChat()'s response already fully
      // populates expertFeedback per interaction (db-chat.js), so this
      // checks the thing that actually matters, from data already fetched.
      validateChat={(chat) => chat.interactions?.some((i) => i.expertFeedback)}
      invalidChatMessageKey="admin.deleteExpertEval.notEvaluated"
    />
  );
};

export default DeleteExpertEval;
