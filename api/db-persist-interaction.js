import dbConnect from './db-connect.js';
import { Chat } from '../models/chat.js';
import { Interaction } from '../models/interaction.js';
import { Context } from '../models/context.js';
import { Question } from '../models/question.js';
import { Citation } from '../models/citation.js';
import { Answer } from '../models/answer.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();

    const interaction = req.body;
    let chatId = interaction.chatId;
    let chat = await Chat.findOne({ chatId: chatId });

    if (!chat) {
      chat = new Chat();
    }
    chat.chatId = interaction.chatId;
    chat.aiProvider = interaction.selectedAI;
    chat.searchProvider = interaction.searchProvider;
    chat.pageLanguage = interaction.pageLanguage;

    const dbInteraction = new Interaction();
    dbInteraction.interactionId = interaction.userMessageId;
    dbInteraction.responseTime = interaction.responseTime;
    dbInteraction.referringUrl = interaction.referringUrl;
    await dbInteraction.save();
    chat.interactions.push(dbInteraction._id);

    const context = new Context();
    Object.assign(context, interaction.context);
    await context.save();
    dbInteraction.context = context._id;

    const citation = new Citation();
    citation.aiCitationUrl = interaction.answer.citationUrl;
    citation.providedCitationUrl = interaction.finalCitationUrl;
    citation.confidenceRating = interaction.confidenceRating;
    citation.citationHead = interaction.answer.citationHead;
    await citation.save();

    const answer = new Answer();
    answer.citation = citation._id;
    Object.assign(answer, interaction.answer);
    answer.sentences = interaction.answer.sentences;
    await answer.save();
    dbInteraction.answer = answer._id;

    const question = new Question();
    question.redactedQuestion = interaction.question;
    question.language = interaction.answer.questionLanguage;
    question.englishQuestion = interaction.answer.englishQuestion;
    await question.save();
    dbInteraction.question = question._id;

    await dbInteraction.save();
    await chat.save();

    res.status(200).json({ message: 'Interaction logged successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to log interaction', error: error.message });
  }
}
