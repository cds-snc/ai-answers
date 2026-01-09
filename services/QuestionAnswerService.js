import dbConnect from '../api/db/db-connect.js';
import { initVectorService } from './VectorServiceFactory.js';
import ServerLoggingService from './ServerLoggingService.js';
import { Interaction } from '../models/interaction.js';
import { Answer } from '../models/answer.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import { Question } from '../models/question.js';
import { Chat } from '../models/chat.js';

function truncate(text = '', max = 400) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function formatSentenceFeedback(ef) {
  const parts = [];
  const sentences = [1, 2, 3, 4];
  for (const idx of sentences) {
    const score = ef[`sentence${idx}Score`];
    const expl = ef[`sentence${idx}Explanation`];
    const harmful = ef[`sentence${idx}Harmful`];
    const contentIssue = ef[`sentence${idx}ContentIssue`];
    const hasAny = score !== null && score !== undefined;
    const hasExpl = expl && expl.trim().length;
    const hasFlag = harmful || contentIssue;
    if (hasAny || hasExpl || hasFlag) {
      const bits = [];
      if (hasAny) bits.push(`score=${score}`);
      if (hasFlag) bits.push(`flags=${[harmful ? 'harmful' : '', contentIssue ? 'content-issue' : ''].filter(Boolean).join('/')}`);
      if (hasExpl) bits.push(`note=${expl.trim()}`);
      parts.push(`S${idx}: ${bits.join('; ')}`);
    }
  }
  if (parts.length === 0 && ef.answerImprovement) {
    parts.push(`Improvement: ${ef.answerImprovement}`);
  }
  return parts.join(' | ');
}

function formatCitation(citation) {
  if (!citation) return null;
  const urls = [citation.providedCitationUrl, citation.aiCitationUrl].filter(Boolean);
  if (!urls.length && !citation.citationHead) return null;
  const head = citation.citationHead ? `head=${citation.citationHead}` : null;
  const pieces = [...urls, head].filter(Boolean);
  return pieces.join(' | ');
}

class QuestionAnswerService {
  async buildQuestionFlow(interactionId) {
    try {
      const chat = await Chat.findOne({ interactions: interactionId })
        .populate({
          path: 'interactions',
          populate: { path: 'question', select: 'englishQuestion redactedQuestion' },
        })
        .lean();
      if (!chat || !Array.isArray(chat.interactions) || !chat.interactions.length) return '';
      const targetId = interactionId.toString();
      const flow = [];
      let n = 1;
      for (const inter of chat.interactions) {
        const q = inter?.question;
        const text = q?.redactedQuestion || q?.englishQuestion || '';
        if (text) flow.push(`Question ${n}: ${text}`);
        n += 1;
        if (inter?._id?.toString?.() === targetId) break;
      }
      return flow.join('\n');
    } catch (err) {
      ServerLoggingService.warn('buildQuestionFlow failed', '', err);
      return '';
    }
  }

  async getSimilarQuestionsContext(question, opts = {}) {
    const { k = 3, threshold = 0.8, expertFeedbackRating = null, expertFeedbackComparison = 'lt', language = null, maxAnswerChars = 400, includeQuestionFlow = true, provider = null } = opts;
    if (!question || typeof question !== 'string') return '';

    try {
      await dbConnect();
      const vectorService = await initVectorService();
      const matches = await vectorService.matchQuestions([question], { provider, k, threshold, expertFeedbackRating, expertFeedbackComparison, language });
      const hits = Array.isArray(matches?.[0]) ? matches[0] : [];

      const filtered = hits.filter((h) => h && h.interactionId && h.expertFeedbackId);
      if (!filtered.length) return '';

      const interactionIds = [...new Set(filtered.map((h) => h.interactionId))];
      const interactions = await Interaction.find({ _id: { $in: interactionIds } })
        .select('question answer expertFeedback')
        .populate({ path: 'question', model: Question })
        .populate({ path: 'answer', model: Answer, populate: { path: 'citation', model: 'Citation' } })
        .populate({ path: 'expertFeedback', model: ExpertFeedback })
        .lean();

      const interById = new Map(interactions.map((i) => [i._id.toString(), i]));

      const lines = [];
      for (const hit of filtered.slice(0, k)) {
        const inter = interById.get(hit.interactionId.toString());
        if (!inter || !inter.answer || !inter.expertFeedback) continue;

        const questionText = inter.question?.redactedQuestion || inter.question?.englishQuestion || '';
        const answerText = inter.answer.content || inter.answer.englishAnswer || '';
        const feedbackText = formatSentenceFeedback(inter.expertFeedback);
        const totalScore = typeof inter.expertFeedback.totalScore === 'number' ? inter.expertFeedback.totalScore : null;
        const citationText = formatCitation(inter.answer.citation);
        const flowText = includeQuestionFlow ? await this.buildQuestionFlow(inter._id) : '';

        if (!questionText || !answerText) continue;

        const blockParts = [];
        blockParts.push(`Q: ${questionText}`);
        if (flowText) blockParts.push(`Flow: ${flowText}`);
        blockParts.push(`A: ${truncate(answerText, maxAnswerChars)}`);
        if (totalScore !== null) blockParts.push(`Score: ${totalScore}/100 (expert feedback)`);
        if (feedbackText) blockParts.push(`Feedback: ${feedbackText}`);
        if (citationText) blockParts.push(`Citation: ${citationText}`);

        lines.push(blockParts.join('\n'));
      }

      return lines.length ? lines.join('\n\n') : '';
    } catch (err) {
      ServerLoggingService.error('QuestionAnswerService.getSimilarQuestionsContext error', '', err);
      return '';
    }
  }
}

export default new QuestionAnswerService();
