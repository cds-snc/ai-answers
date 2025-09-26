import ServerLoggingService from '../../services/ServerLoggingService.js';
import { VectorService, initVectorService } from '../../services/VectorServiceFactory.js';
import dbConnect from '../../api/db/db-connect.js';
import mongoose from 'mongoose';
import EmbeddingService from '../../services/EmbeddingService.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { rankerStrategy } from '../../agents/strategies/rankerStrategy.js';
import { translationStrategy } from '../../agents/strategies/translationStrategy.js';
import { createRankerAgent, createTranslationAgent } from '../../agents/AgentFactory.js';
import { withSession } from '../../middleware/session.js';

// --- Main handler (composed of the helpers above) ---
async function handler(req, res) {
    const validated = validateAndExtract(req);
    if (validated.error) {
        if (validated.error.headers) res.setHeader('Allow', validated.error.headers.Allow);
        return res.status(validated.error.code).end(validated.error.message);
    }

    const { chatId, questions, selectedAI, recencyDays, requestedRating, pageLanguage, detectedLanguage } = validated;

    try {

        // Use pageLanguage for vector matching (matches should be in the page language)
        const matches = await retrieveMatches(questions, selectedAI, requestedRating, 10, pageLanguage);
        if (!matches || matches.length === 0) {
            ServerLoggingService.info('No similar chat matches found', 'chat-similar-answer');
            return res.json({});
        }

        const { interactionById } = await loadInteractions(matches);
        const finalCandidates = applyRecencyFilter(matches, interactionById, recencyDays);
        if (!finalCandidates.length) {
            ServerLoggingService.info('No candidate interactions after recency filter', 'chat-similar-answer');
            return res.json({});
        }

        const { candidateQuestions, orderedEntries } = await buildQuestionFlows(finalCandidates);
        if (!candidateQuestions || candidateQuestions.length === 0) {
            ServerLoggingService.info('No candidate questions available after building chat flows', 'chat-similar-answer');
            return res.json({});
        }

        const formattedForEmbedding = EmbeddingService.formatQuestionsForEmbedding(candidateQuestions);
        const formattedUserQuestions = EmbeddingService.formatQuestionsForEmbedding(questions);
        const createAgentFn = createRankerAdapter();
        const rankResult = await callOrchestrator({ chatId, selectedAI, userQuestions: formattedUserQuestions, candidateQuestions: formattedForEmbedding, createAgentFn });
        const topIndex = interpretRankResult(rankResult);

        if (topIndex === -1) {
            ServerLoggingService.info('Ranker produced no usable result; continuing normal flow', 'chat-similar-answer');
            return res.json({});
        }
        const topRankerItem = (rankResult && Array.isArray(rankResult.results) && rankResult.results.length) ? rankResult.results[0] : null;
        const topChecks = (topRankerItem && typeof topRankerItem === 'object' && topRankerItem.checks) ? topRankerItem.checks : null;

        const targetTurnIndex = Math.max(0, (questions?.length || 1) - 1);
        // Choose the top-ranked entry from the ranker results. fall back to the first ordered entry or finalCandidates[0]
        const chosen = orderedEntries[topIndex];
        const formatted = formatAnswerFromChosen(chosen, targetTurnIndex);
        if (!formatted) {
            ServerLoggingService.info('No final chosen interaction', 'chat-similar-answer');
            return res.json({});
        }

        // Translate the final answer if needed into the user's detected language
        await translateFinalAnswerIfNeeded(formatted, pageLanguage, detectedLanguage, selectedAI);

        ServerLoggingService.info('Returning chat similarity result (re-ranked)', 'chat-similar-answer', { interactionId: formatted.interactionId, sourceSimilarity: chosen.match?.similarity });

        return res.json({
            answer: formatted.text,
            interactionId: formatted.interactionId,
            reRanked: true,
            similarity: chosen.match?.similarity ?? null,
            citation: formatted.citation || null,
            rankerTop: { index: topIndex, checks: topChecks }
        });
    } catch (err) {
        ServerLoggingService.error('Error in chat-similar-answer', 'chat-similar-answer', err);
        return res.status(500).json({ error: 'internal error' });
    }

    function validateAndExtract(req) {
        if (req.method !== 'POST') return { error: { code: 405, message: `Method ${req.method} Not Allowed`, headers: { Allow: ['POST'] } } };
        const chatId = req.body?.chatId || null;
        const questions = Array.isArray(req.body?.questions) ? req.body.questions.filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()) : [];
        if (questions.length === 0) return { error: { code: 400, message: 'Missing questions' } };
        const selectedAI = req.body?.selectedAI || 'openai';
        const recencyDays = typeof req.body?.recencyDays === 'number' ? req.body.recencyDays : 7;
        const requestedRating = typeof req.body?.expertFeedbackRating === 'number' ? req.body.expertFeedbackRating : 100;
        // Accept new shape: pageLanguage + detectedLanguage. Fall back to legacy `language` if provided.
        const pageLanguage = typeof req.body?.pageLanguage === 'string' && req.body.pageLanguage.trim() ? req.body.pageLanguage.trim() : (typeof req.body?.language === 'string' && req.body.language.trim() ? req.body.language.trim() : null);
        const detectedLanguage = typeof req.body?.detectedLanguage === 'string' && req.body.detectedLanguage.trim() ? req.body.detectedLanguage.trim() : null;
        if (!pageLanguage) return { error: { code: 400, message: 'Missing pageLanguage' } };
        return { chatId, questions, selectedAI, recencyDays, requestedRating, pageLanguage, detectedLanguage };
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
        // Populate the answer and its nested citation so callers can access citation URLs
        const interactions = await Interaction.find({ _id: { $in: ids } })
            .populate({ path: 'answer', populate: { path: 'citation', model: 'Citation' } })
            .populate('question')
            .lean();
        const interactionById = interactions.reduce((acc, it) => { acc[it._id.toString()] = it; return acc; }, {});
        return { interactions, interactionById };
    }

    function applyRecencyFilter(matches, interactionById, recencyDays) {
        const cutoff = Date.now() - (recencyDays * 24 * 60 * 60 * 1000);
        const recent = [];
        const older = [];
        for (const m of matches) {
            const it = interactionById[m.interactionId?.toString?.() || m.interactionId];
            if (!it || !it.answer) continue;
            const created = new Date(it.createdAt || it._id?.getTimestamp?.() || Date.now()).getTime();
            if (created >= cutoff) recent.push({ match: m, interaction: it }); else older.push({ match: m, interaction: it });
        }
        return [...recent, ...older].slice(0, 5);
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
            return { candidate: c, questionFlow, flowInteractions, pageLanguage: chat.pageLanguage || null };
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
    // Note: selection simplified to use topIndex directly; previous re-ranking helpers removed.

    function formatAnswerFromChosen(chosenEntry, targetTurnIndex) {
        if (!chosenEntry) return null;
        const flow = chosenEntry.flowInteractions;
        let selected = null;
        if (Array.isArray(flow) && flow.length) {
            const idx = Math.min(Math.max(0, targetTurnIndex), flow.length - 1);
            selected = flow[idx];
        }
        if (!selected) selected = chosenEntry.candidate?.interaction;
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
            confidenceRating: citationDoc.confidenceRating || null,
        } : null;

        return { text, englishAnswer, interactionId: selected._id, citation, chosen: chosenEntry, matchPageLanguage: chosenEntry.pageLanguage || null };
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

}

export default withSession(handler);
