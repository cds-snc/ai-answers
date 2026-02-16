import ServerLoggingService from './ServerLoggingService.js';
import { VectorService, initVectorService } from './VectorServiceFactory.js';
import dbConnect from '../api/db/db-connect.js';
import mongoose from 'mongoose';
import { AgentOrchestratorService } from '../agents/AgentOrchestratorService.js';
import { rankerStrategy } from '../agents/strategies/rankerStrategy.js';
import { translationStrategy } from '../agents/strategies/translationStrategy.js';
import { createRankerAgent, createTranslationAgent } from '../agents/AgentFactory.js';
import ConversationIntegrityService from './ConversationIntegrityService.js';

// Helper: remove trailing whitespace/newline chars from each string in an array and drop empty items
function sanitizeQuestionArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(q => {
        if (typeof q !== 'string') return q;
        let s = String(q);
        // Replace escaped newline sequences like "\n" with a space
        s = s.replace(/\\n+/g, ' ');
        // Replace actual newline and carriage return characters with a space
        s = s.replace(/[\r\n]+/g, ' ');
        // Collapse multiple spaces/tabs into a single space
        s = s.replace(/[ \t]+/g, ' ');
        return s.trim();
    }).filter(q => typeof q === 'string' && q.length > 0);
}

async function retrieveMatches(questionsArr, selectedAI, requestedRating, kCandidates = 10, languageParam = null) {
    if (!VectorService) await initVectorService();
    const safeQuestions = Array.isArray(questionsArr) && questionsArr.length ? questionsArr : [''];
    const matchesArr = await VectorService.matchQuestions(safeQuestions, { provider: selectedAI, k: kCandidates, threshold: null, expertFeedbackRating: requestedRating, language: languageParam });
    return Array.isArray(matchesArr) && matchesArr.length ? matchesArr[0] : [];
}

async function loadInteractions(matches) {
    await dbConnect();
    const Interaction = mongoose.model('Interaction');
    const ids = Array.from(new Set(matches.map(m => m.interactionId).filter(Boolean)));
    // Populate the answer and its nested citation and expertFeedback so callers can access citation URLs and neverStale
    const interactions = await Interaction.find({ _id: { $in: ids } })
        .populate({ path: 'answer', populate: { path: 'citation', model: 'Citation' } })
        .populate('question')
        .populate('expertFeedback')
        .lean();
    const interactionById = interactions.reduce((acc, it) => { acc[it._id.toString()] = it; return acc; }, {});
    return { interactions, interactionById };
}

function applyRecencyFilter(matches, interactionById, recencyDays) {
    const cutoff = Date.now() - (recencyDays * 24 * 60 * 60 * 1000);
    const recent = [];
    for (const m of matches) {
        const it = interactionById[m.interactionId?.toString?.() || m.interactionId];
        if (!it || !it.answer) continue;
        const created = new Date(it.createdAt || it._id?.getTimestamp?.() || Date.now()).getTime();

        // If the interaction has expertFeedback populated and neverStale is true, always treat it as recent
        const ef = it.expertFeedback;
        const hasNeverStale = ef && (ef.neverStale === true || String(ef.neverStale) === 'true');
        // Only include items that are explicitly neverStale or fall within the recency cutoff.
        if (hasNeverStale || created >= cutoff) {
            recent.push({ match: m, interaction: it });
        }
    }
    return recent.slice(0, 5);
}

async function buildQuestionFlows(finalCandidates) {
    // Sort newest-first across candidates
    const sortedByRecencyDesc = finalCandidates.slice().sort((a, b) => {
        const aCreated = new Date(a.interaction.createdAt || a.interaction._id?.getTimestamp?.() || Date.now()).getTime();
        const bCreated = new Date(b.interaction.createdAt || b.interaction._id?.getTimestamp?.() || Date.now()).getTime();
        return bCreated - aCreated;
    });

    const Chat = mongoose.model('Chat');
    const entries = await Promise.all(sortedByRecencyDesc.map(async (c) => {
        const interactionId = c.interaction._id || c.interaction._id?.toString?.() || c.interactionId;
        if (!interactionId) return { candidate: c, questionFlow: null };

        // Ensure the populated interaction answers include the nested citation documents
        const chat = await Chat.findOne({ interactions: interactionId }).populate({
            path: 'interactions',
            populate: [
                { path: 'question' },
                { path: 'answer', populate: { path: 'citation', model: 'Citation' } }
            ]
        }).lean();
        if (!chat || !Array.isArray(chat.interactions) || chat.interactions.length === 0) return { candidate: c, questionFlow: null };

        const idx = chat.interactions.findIndex(i => String(i._id) === String(interactionId));
        const endIndex = idx >= 0 ? idx : (chat.interactions.length - 1);

        // Build flow interactions from oldest up to the current/matched index
        const flowInteractions = chat.interactions.slice(0, endIndex + 1);
        const flowQuestions = flowInteractions.map(int => {
            const qi = int?.question;
            return qi?.englishQuestion || qi?.content || qi?.text || null;
        }).filter(Boolean);

        const questionFlow = flowQuestions.length ? flowQuestions.join('\n\n') : null;
        return { candidate: c, questionFlow, flowInteractions, pageLanguage: chat.pageLanguage || null, chatId: chat.chatId || null };
    }));

    const validEntries = entries.filter(e => e.questionFlow);
    const candidateQuestions = validEntries.map(e => e.questionFlow);
    const orderedEntries = validEntries;
    return { candidateQuestions, orderedEntries };
}

function createRankerAdapter() {
    return async (agentType, localChatId) => {
        const agent = await createRankerAgent(agentType, localChatId);
        return agent;
    };
}

async function callOrchestrator({ chatId, selectedAI, userQuestions, candidateQuestions, createAgentFn }) {
    const orchestratorRequest = { userQuestions, candidateQuestions };
    try {
        return await AgentOrchestratorService.invokeWithStrategy({ chatId, agentType: selectedAI, request: orchestratorRequest, createAgentFn, strategy: rankerStrategy });
    } catch (err) {
        ServerLoggingService.error('Ranker orchestrator failed', 'chat-similar-answer', err);
        return null;
    }
}

function interpretRankResult(rankResult) {
    let topIndex = -1;
    const allPass = (checks) => checks && Object.values(checks).every(v => String(v).toLowerCase() === 'pass');
    if (rankResult && Array.isArray(rankResult.results) && rankResult.results.length) {
        for (const item of rankResult.results) {
            if (item && typeof item === 'object' && typeof item.index === 'number') {
                if (allPass(item.checks)) { topIndex = item.index; break; }
                else continue; // skip failed checks
            }
            // For legacy shapes (number/string) without checks, do not consider as a match
        }
    }
    return topIndex;
}

function formatAnswerFromChosen(chosenEntry) {
    if (!chosenEntry) return null;
    const flow = chosenEntry.flowInteractions;
    let selected = null;
    // Prefer the exact interaction that produced the vector match (candidate.interaction).
    if (chosenEntry.candidate && chosenEntry.candidate.interaction) {
        selected = chosenEntry.candidate.interaction;
    } else {
        return null;
    }
    if (!selected || !selected.answer) return null;
    const ans = selected.answer;
    // Prefer englishAnswer when present; fall back to paragraphs or content
    const englishAnswer = ans?.englishAnswer || null;
    const text = englishAnswer || ((Array.isArray(ans.paragraphs) && ans.paragraphs.length) ? ans.paragraphs.join('\n\n') : (ans.content || ''));

    // Extract citation fields if populated (answer.citation may be a populated doc)
    const citationDoc = ans?.citation || null;
    const citation = citationDoc ? {
        providedCitationUrl: citationDoc.providedCitationUrl || null,
        aiCitationUrl: citationDoc.aiCitationUrl || null,
        citationHead: citationDoc.citationHead || null,
        citationHead: citationDoc.citationHead || null,
    } : null;

    // Prefer the stored `interactionId` field when available (legacy or business id),
    // otherwise fall back to the Mongo `_id` string.
    const returnedInteractionId = (selected.interactionId && String(selected.interactionId).trim()) ? selected.interactionId : (selected._id ? selected._id.toString() : null);
    return { text, englishAnswer, interactionId: returnedInteractionId, citation, chosen: chosenEntry, matchPageLanguage: chosenEntry.pageLanguage || null, chatId: chosenEntry.chatId || null };
}

// Helper: translate the final answer when requested language is not English/French
async function translateFinalAnswerIfNeeded(formatted, pageLanguageStr, detectedLanguageStr, agentType) {
    if (!formatted || !formatted.text) return;

    // Normalize helpers
    const norm = (s) => (s || '').toLowerCase().trim();
    const isFrench = (s) => /^(fr|fra|french)$/i.test(s) || (s || '').toLowerCase().includes('fr');
    const isEnglish = (s) => /^(en|eng|english)$/i.test(s) || (s || '').toLowerCase().includes('en');

    const pageLang = norm(pageLanguageStr);
    const detectedLang = norm(detectedLanguageStr);

    // Helper to reduce language to 2-letter ISO-like code for comparison (e.g. 'en-US' -> 'en', 'english' -> 'en')
    const twoChar = (s) => {
        if (!s) return '';
        const parts = String(s).split(/[-_\s]/);
        const first = parts[0] || s;
        return (first.slice(0, 2) || '').toLowerCase();
    };

    // Prefer an explicit match page language if present (added in buildQuestionFlows)
    let matchLang = norm(formatted?.matchPageLanguage) || null;
    if (!matchLang) {
        try {
            const chosen = formatted?.chosen || null;
            // Try common paths where match language might be present
            matchLang = norm((chosen?.candidate?.match?.language) || (chosen?.candidate?.match?.lang) || (chosen?.match?.language) || (chosen?.match?.lang) || (chosen?.candidate?.interaction?.question?.language) || (formatted?.englishAnswer ? 'en' : null));
        } catch (e) {
            matchLang = null;
        }
    }

    // If pageLang and detectedLang are identical (normalized to 2 chars), no translation needed
    const pageTwo = twoChar(pageLang);
    const detectedTwo = twoChar(detectedLang);
    if (pageTwo && detectedTwo && pageTwo === detectedTwo) return;

    // Determine target language according to rules:
    // - If pageLanguage is French -> translate to French
    // - Else if pageLanguage is English -> translate to detectedLanguage (if present)
    // - Else (other page languages): translate if matchLang != detectedLang
    let targetLang = null;
    if (isFrench(pageLang)) {
        targetLang = 'fr';
    } else if (isEnglish(pageLang)) {
        targetLang = detectedLang || null;
    } else {
        // If we have a detected language and it's different from the match language, target it
        if (detectedLang && matchLang && detectedLang !== matchLang) {
            targetLang = detectedLang;
        }
    }

    if (!targetLang) return; // nothing to do

    // Avoid translating when the matched content is already in the target language
    const matchTwo = twoChar(matchLang);
    const targetTwo = twoChar(targetLang);
    if (matchTwo && targetTwo && matchTwo === targetTwo) return;

    try {
        const createTransAgent = async (atype, chatId) => await createTranslationAgent(atype, chatId);
        const translationRequest = { text: formatted.text, desired_language: targetLang };
        const transResp = await AgentOrchestratorService.invokeWithStrategy({ chatId: 'translate-final-answer', agentType: agentType, request: translationRequest, createAgentFn: createTransAgent, strategy: translationStrategy });
        const translated = transResp?.result?.translated_text || transResp?.result?.text || (typeof transResp?.result === 'string' ? transResp.result : null) || (typeof transResp?.raw === 'string' ? transResp.raw : null);
        if (translated && typeof translated === 'string' && translated.trim()) {
            formatted.text = translated.trim();
        }
    } catch (err) {
        ServerLoggingService.warn('Translation of final answer failed; returning original', 'chat-similar-answer', err);
    }
}


export const SimilarAnswerService = {
    async findSimilarAnswer({
        chatId,
        questions,
        conversationHistory = [],
        selectedAI,
        recencyDays = 3650,
        requestedRating,
        pageLanguage,
        detectedLanguage
    }) {
        // Use pageLanguage for vector matching (matches should be in the page language)
        const matches = await retrieveMatches(questions, selectedAI, requestedRating, 5, pageLanguage);
        if (!matches || matches.length === 0) {
            ServerLoggingService.info('No similar chat matches found', 'chat-similar-answer');
            return null;
        }

        const { interactionById } = await loadInteractions(matches);
        const finalCandidates = applyRecencyFilter(matches, interactionById, recencyDays);
        if (!finalCandidates.length) {
            ServerLoggingService.info('No candidate interactions after recency filter', 'chat-similar-answer');
            return null;
        }

        const { candidateQuestions, orderedEntries } = await buildQuestionFlows(finalCandidates);
        if (!candidateQuestions || candidateQuestions.length === 0) {
            ServerLoggingService.info('No candidate questions available after building chat flows', 'chat-similar-answer');
            return null;
        }

        // Clean up trailing whitespace/newline characters from question strings
        const sanitizedCandidateQuestions = sanitizeQuestionArray(candidateQuestions);
        const sanitizedUserQuestions = sanitizeQuestionArray(questions);
        ServerLoggingService.info(`Invoking ranker with ${sanitizedCandidateQuestions.length} candidates`, chatId, {
            userQuestions: sanitizedUserQuestions,
            candidateQuestions: sanitizedCandidateQuestions
        });

        const createAgentFn = createRankerAdapter();
        const rankResult = await callOrchestrator({ chatId, selectedAI, userQuestions: sanitizedUserQuestions, candidateQuestions: sanitizedCandidateQuestions, createAgentFn });
        const topIndex = interpretRankResult(rankResult);

        if (topIndex === -1) {
            ServerLoggingService.info('Ranker produced no usable result; continuing normal flow', 'chat-similar-answer');
            return null;
        }
        const topRankerItem = (rankResult && Array.isArray(rankResult.results) && rankResult.results.length) ? rankResult.results[0] : null;
        const topChecks = (topRankerItem && typeof topRankerItem === 'object' && topRankerItem.checks) ? topRankerItem.checks : null;
        ServerLoggingService.info(`Ranker selected index ${topIndex} as top candidate`, chatId, { topRankerItem, topChecks });
        // Choose the top-ranked entry from the ranker results. fall back to the first ordered entry or finalCandidates[0]
        const chosen = orderedEntries[topIndex];
        const formatted = formatAnswerFromChosen(chosen);
        if (!formatted) {
            ServerLoggingService.info('No final chosen interaction', 'chat-similar-answer');
            return null;
        }

        // Translate the final answer if needed into the user's detected language
        await translateFinalAnswerIfNeeded(formatted, pageLanguage, detectedLanguage, selectedAI);

        // Return the selected answer and include the persisted `interactionId` string (if present)
        ServerLoggingService.info('Returning chat similarity result (re-ranked)', 'chat-similar-answer', { interactionId: formatted.interactionId, chatId: formatted.chatId, sourceSimilarity: chosen.match?.similarity });

        // Calculate signature for conversation integrity verification
        const historySignature = ConversationIntegrityService.calculateSignature([
            ...conversationHistory,
            { sender: 'user', text: Array.isArray(questions) ? questions[questions.length - 1] : '' },
            { sender: 'ai', text: formatted.text }
        ]);

        return {
            answer: formatted.text,
            englishAnswer: formatted.englishAnswer || null,
            interactionId: formatted.interactionId || null,
            chatId: formatted.chatId || null,
            reRanked: true,
            similarity: chosen.match?.similarity ?? null,
            citation: formatted.citation || null,
            rankerTop: { index: topIndex, checks: topChecks },
            historySignature
        };
    }
};
