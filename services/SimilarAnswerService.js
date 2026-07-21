import ServerLoggingService from './ServerLoggingService.js';
import { VectorService, initVectorService } from './VectorServiceFactory.js';
import dbConnect from '../api/db/db-connect.js';
import mongoose from 'mongoose';
import { AgentOrchestratorService } from '../agents/AgentOrchestratorService.js';
import { translationStrategy } from '../agents/strategies/translationStrategy.js';
import { createTranslationAgent } from '../agents/AgentFactory.js';
import ConversationIntegrityService from './ConversationIntegrityService.js';

// Comparator abstraction for question flow comparison
// Toggle between LLM and local cross-encoder by changing the import:
// import { LLMRankerComparator } from './comparators/LLMRankerComparator.js';
import { QuoraCrossEncoderComparator } from './comparators/QuoraCrossEncoderComparator.js';
import { LLMRankerComparator } from './comparators/LLMRankerComparator.js';

const localComparator = new QuoraCrossEncoderComparator();
const llmComparator = new LLMRankerComparator();
const DEFAULT_RECENCY_DAYS = 365;
const MAX_RERANK_CANDIDATES = 10;
const VECTOR_SIMILARITY_THRESHOLD = 0.7;

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

async function retrieveMatches(questionsArr, selectedAI, requestedRating, kCandidates = 10, languageParam = null, interactionLanguage = null, recencyDays = null) {
    if (!VectorService) await initVectorService();
    const safeQuestions = Array.isArray(questionsArr) && questionsArr.length ? questionsArr : [''];
    const matchesArr = await VectorService.matchQuestions(safeQuestions, {
        provider: selectedAI,
        k: kCandidates,
        threshold: VECTOR_SIMILARITY_THRESHOLD,
        expertFeedbackRating: requestedRating,
        language: languageParam,
        interactionLanguage,
        recencyDays,
        useDenormalizedPreFilter: true,
    });
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
        recencyDays = DEFAULT_RECENCY_DAYS,
        requestedRating,
        pageLanguage,
        detectedLanguage
    }) {
        // Use pageLanguage for vector matching (matches should be in the page language)
        const matches = await retrieveMatches(
            questions,
            selectedAI,
            requestedRating,
            MAX_RERANK_CANDIDATES,
            pageLanguage,
            detectedLanguage || null,
            recencyDays
        );
        if (!matches || matches.length === 0) {
            ServerLoggingService.info('No similar chat matches found', 'chat-similar-answer');
            return {
                debugPayload: {
                    shortCircuit: false,
                    reason: 'no-vector-match',
                    vectorMatches: [],
                    nlpCandidates: [],
                    llmSelection: null,
                },
            };
        }

        const { interactionById } = await loadInteractions(matches);
        const finalCandidates = matches
            .map(match => ({
                match,
                interaction: interactionById[match.interactionId?.toString?.() || match.interactionId],
            }))
            .filter(candidate => candidate.interaction?.answer)
            .slice(0, MAX_RERANK_CANDIDATES);
        if (!finalCandidates.length) {
            ServerLoggingService.info('No candidate interactions after vector eligibility filters', 'chat-similar-answer');
            return {
                debugPayload: {
                    shortCircuit: false,
                    reason: 'no-eligible-interaction',
                    vectorMatches: matches,
                    nlpCandidates: [],
                    llmSelection: null,
                },
            };
        }

        const { candidateQuestions, orderedEntries } = await buildQuestionFlows(finalCandidates);
        if (!candidateQuestions || candidateQuestions.length === 0) {
            ServerLoggingService.info('No candidate questions available after building chat flows', 'chat-similar-answer');
            return {
                debugPayload: {
                    shortCircuit: false,
                    reason: 'no-candidate-question-flow',
                    vectorMatches: matches,
                    nlpCandidates: [],
                    llmSelection: null,
                },
            };
        }

        // Clean up trailing whitespace/newline characters from question strings
        const sanitizedCandidateQuestions = sanitizeQuestionArray(candidateQuestions);
        const sanitizedUserQuestions = sanitizeQuestionArray(questions);
        const vectorMatches = matches.map(match => {
            const interactionId = match.interactionId?.toString?.() || match.interactionId || null;
            const interaction = interactionById[interactionId] || null;
            const entry = orderedEntries.find(candidate => String(candidate.candidate?.interaction?._id) === String(interactionId));
            const answer = interaction?.answer?.englishAnswer
                || interaction?.answer?.paragraphs?.join('\n\n')
                || interaction?.answer?.content
                || null;
            return {
                interactionId,
                chatId: entry?.chatId || null,
                question: interaction?.question?.englishQuestion || interaction?.question?.content || null,
                answer,
                similarity: match.similarity ?? null,
                expertFeedbackScore: match.expertFeedbackRating ?? match.score ?? null,
            };
        });
        ServerLoggingService.info(`Invoking local comparator with ${sanitizedCandidateQuestions.length} candidates`, chatId, {
            userQuestions: sanitizedUserQuestions,
            candidateQuestions: sanitizedCandidateQuestions,
            comparator: localComparator.getName()
        });

        const comparisonResult = await localComparator.compare(
            sanitizedUserQuestions,
            sanitizedCandidateQuestions,
            { chatId, selectedAI }
        );

        ServerLoggingService.info(`Local comparator returned ${comparisonResult.results.length} results`, chatId, {
            method: comparisonResult.method,
            latencyMs: comparisonResult.metadata?.latencyMs
        });

        const nlpCandidates = comparisonResult.results.map(localResult => {
            const entry = orderedEntries[localResult.index];
            const interaction = entry?.candidate?.interaction;
            return {
                index: localResult.index,
                chatId: entry?.chatId || null,
                interactionId: interaction?._id?.toString?.() || null,
                question: interaction?.question?.englishQuestion || interaction?.question?.content || null,
                answer: interaction?.answer?.englishAnswer || interaction?.answer?.paragraphs?.join('\n\n') || interaction?.answer?.content || null,
                questionFlow: entry?.questionFlow || null,
                similarity: entry?.candidate?.match?.similarity ?? null,
                localScore: localResult.score ?? null,
                localRecommendation: localResult.recommendation ?? 'reject',
            };
        });

        // The local model filters candidates. Send every threshold-passing
        // candidate, in Quora rank order, to the LLM for final ranking.
        const acceptedLocalResults = comparisonResult.results
            .filter(result => result.recommendation === 'accept')
            .slice(0, MAX_RERANK_CANDIDATES);

        if (!acceptedLocalResults.length) {
            ServerLoggingService.info('Local comparator produced no accepted match; continuing normal flow', 'chat-similar-answer');
            return {
                debugPayload: {
                    shortCircuit: false,
                    reason: 'local-model-rejected',
                    vectorMatches,
                    nlpCandidates,
                    llmSelection: null,
                },
            };
        }

        const llmCandidateQuestions = acceptedLocalResults.map(
            result => sanitizedCandidateQuestions[result.index]
        );

        // The local model is deliberately only a candidate filter. Re-rank all
        // accepted candidates and reuse an answer only when the LLM's selected
        // candidate passes every safety/semantic check.
        const llmResult = await llmComparator.compare(
            sanitizedUserQuestions,
            llmCandidateQuestions,
            { chatId, selectedAI }
        );
        const llmConfirmation = llmResult.results.find(result =>
            result.recommendation === 'accept' &&
            Number.isInteger(result.index) &&
            acceptedLocalResults[result.index]
        );
        if (!llmConfirmation) {
            ServerLoggingService.info('LLM confirmation rejected local match; continuing normal flow', chatId, {
                localScores: acceptedLocalResults.map(result => result.score),
                llmError: llmResult.metadata?.error || null,
            });
            return {
                debugPayload: {
                    shortCircuit: false,
                    reason: 'llm-rejected',
                    vectorMatches,
                    nlpCandidates,
                    llmSelection: {
                        accepted: false,
                        results: llmResult.results || [],
                        metadata: llmResult.metadata || {},
                    },
                },
            };
        }
        const topResult = acceptedLocalResults[llmConfirmation.index];
        const topIndex = topResult.index;
        const confirmedChecks = llmConfirmation.checks;

        ServerLoggingService.info(`Comparator selected index ${topIndex} as top candidate`, chatId, {
            score: topResult?.score,
            topChecks: confirmedChecks,
            method: `${comparisonResult.method}+${llmResult.method}`
        });
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

        const selectedCandidate = nlpCandidates.find(candidate => candidate.index === topIndex) || null;

        return {
            answer: formatted.text,
            englishAnswer: formatted.englishAnswer || null,
            interactionId: formatted.interactionId || null,
            chatId: formatted.chatId || null,
            reRanked: true,
            similarity: chosen.match?.similarity ?? null,
            citation: formatted.citation || null,
            rankerTop: { index: topIndex, checks: confirmedChecks },
            vectorMatches,
            nlpCandidates,
            llmSelection: {
                ...selectedCandidate,
                accepted: true,
                checks: confirmedChecks,
                results: llmResult.results || [],
                metadata: llmResult.metadata || {},
            },
            historySignature
        };
    }
};
