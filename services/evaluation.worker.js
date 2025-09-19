import mongoose from 'mongoose';
import { Interaction } from '../models/interaction.js';
import { Eval } from '../models/eval.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import { Embedding } from '../models/embedding.js';
import { SentenceEmbedding } from '../models/sentenceEmbedding.js';
import ServerLoggingService from './ServerLoggingService.js';
import { AgentOrchestratorService } from '../agents/AgentOrchestratorService.js';
import { createSentenceCompareAgent, createFallbackCompareAgent } from '../agents/AgentFactory.js';
import { sentenceCompareStrategy } from '../agents/strategies/sentenceCompareStrategy.js';
import { fallbackCompareStrategy } from '../agents/strategies/fallbackCompareStrategy.js';
import dbConnect from '../api/db/db-connect.js';
import config from '../config/eval.js';
import { VectorService, initVectorService } from '../services/VectorServiceFactory.js';

// Helper: resolve chatId for an interaction. Prefer the embedding's chatId when provided
// to avoid extra Chat lookups. Falls back to querying Chat collection.
async function getChatIdForInteraction(interactionId, embeddingChatId = null) {
    if (embeddingChatId) return embeddingChatId;
    try {
        const Chat = mongoose.model('Chat');
        const chatDoc = await Chat.findOne({ interactions: interactionId }, { chatId: 1 }).lean();
        return chatDoc ? chatDoc.chatId : null;
    } catch (err) {
        ServerLoggingService.warn('Error resolving chatId for interaction (worker)', interactionId, err);
        return null;
    }
}

function extractAnswerText(interaction) {
    if (!interaction || !interaction.answer) return '';
    const answer = interaction.answer;
    if (Array.isArray(answer.sentences) && answer.sentences.length > 0) {
        return answer.sentences
            .map((value) => (typeof value === 'string' ? value : ''))
            .join(' ')
            .trim();
    }
    const fallbackFields = ['text', 'answer', 'answerText', 'resolvedAnswer'];
    for (const field of fallbackFields) {
        const candidate = answer[field];
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    return '';
}

async function buildQuestionFlowForInteraction(interaction) {
    try {
        const interactionId = interaction?._id || interaction;
        if (!interactionId) return '';
        const Chat = mongoose.model('Chat');
        const chatDoc = await Chat.findOne({ interactions: interactionId })
            .populate({
                path: 'interactions',
                populate: { path: 'question', select: 'englishQuestion redactedQuestion' }
            });
        if (!chatDoc || !Array.isArray(chatDoc.interactions) || !chatDoc.interactions.length) {
            return '';
        }
        const targetId = interactionId.toString();
        const flowParts = [];
        let questionNumber = 1;
        for (const chatInteraction of chatDoc.interactions) {
            const qDoc = chatInteraction?.question;
            const rawQuestion = qDoc?.englishQuestion || qDoc?.redactedQuestion || '';
            const cleanedQuestion = typeof rawQuestion === 'string' ? rawQuestion.trim() : '';
            if (cleanedQuestion) {
                flowParts.push(`Question ${questionNumber}: ${cleanedQuestion}`);
                questionNumber += 1;
            }
            if (chatInteraction?._id?.toString?.() === targetId) {
                break;
            }
        }
        return flowParts.join('\n');
    } catch (err) {
        const idStr = interaction?._id?.toString?.() || String(interaction || 'unknown');
        ServerLoggingService.warn('Failed to build question flow for interaction (worker)', idStr, err);
        return '';
    }
}

function formatCompareInput(questionFlow, answerText) {
    const sections = [];
    if (questionFlow) {
        sections.push(`Question Flow:\n${questionFlow}`);
    }
    if (answerText) {
        sections.push(`Answer:\n${answerText}`);
    }
    return sections.join('\n\n');
}

async function runFallbackCompareCheck({ sourceInteraction, fallbackInteraction, sourceQuestionFlow = null, fallbackQuestionFlow = null, aiProvider = 'openai' }) {
    try {
        const sourceText = extractAnswerText(sourceInteraction);
        const candidateText = extractAnswerText(fallbackInteraction);
        const ensuredSourceFlow = typeof sourceQuestionFlow === 'string' && sourceQuestionFlow.length
            ? sourceQuestionFlow
            : await buildQuestionFlowForInteraction(sourceInteraction);
        const ensuredCandidateFlow = typeof fallbackQuestionFlow === 'string' && fallbackQuestionFlow.length
            ? fallbackQuestionFlow
            : await buildQuestionFlowForInteraction(fallbackInteraction);

        const sourcePayload = formatCompareInput(ensuredSourceFlow, sourceText);
        const candidatePayload = formatCompareInput(ensuredCandidateFlow, candidateText);
        if (!sourcePayload || !candidatePayload) {
            ServerLoggingService.info('Fallback compare skipped due to insufficient text (worker)', 'fallback-compare', {
                hasSourceText: !!sourceText,
                hasCandidateText: !!candidateText,
                hasSourceFlow: !!ensuredSourceFlow,
                hasCandidateFlow: !!ensuredCandidateFlow
            });
            return { checks: null, raw: null, meta: null, performed: false, sourceQuestionFlow: ensuredSourceFlow, fallbackQuestionFlow: ensuredCandidateFlow };
        }

        const createAgentFn = async (agentType, localChatId) => await createFallbackCompareAgent(agentType, localChatId, 5000);
        const request = { source: sourcePayload, candidate: candidatePayload };
        const started = Date.now();
        const agentResult = await AgentOrchestratorService.invokeWithStrategy({
            chatId: 'fallback-compare',
            agentType: aiProvider || 'openai',
            request,
            createAgentFn,
            strategy: fallbackCompareStrategy
        });
        const latencyMs = Date.now() - started;
        return {
            checks: agentResult?.parsed ?? null,
            raw: agentResult?.raw ?? null,
            meta: {
                provider: aiProvider || 'openai',
                model: agentResult?.model || '',
                inputTokens: agentResult?.inputTokens ?? null,
                outputTokens: agentResult?.outputTokens ?? null,
                latencyMs
            },
            performed: true,
            sourceQuestionFlow: ensuredSourceFlow,
            fallbackQuestionFlow: ensuredCandidateFlow
        };
    } catch (err) {
        ServerLoggingService.warn('Fallback compare agent invocation failed (worker)', 'fallback-compare', err);
        return { checks: { error: 'exception', message: err?.message ?? 'unknown_error' }, raw: null, meta: null, performed: false, sourceQuestionFlow: null, fallbackQuestionFlow: null };
    }
}


async function tryQAMatchHighScoreFallback(interaction, chatId, sourceEmbedding, similarEmbeddings, failedSentenceTraces = [], aiProvider = 'openai') {
    try {
        const topQAMatches = similarEmbeddings.slice(0, config.searchLimits.topQAMatchesForHighScoreFallback);
        const highScoreMatches = [];
        const chatIdMap = new Map();
        for (const match of topQAMatches) {
            const expertFeedback = match.embedding.interactionId.expertFeedback;
            if (expertFeedback && typeof expertFeedback.totalScore === 'number' && expertFeedback.totalScore >= 90) {
                highScoreMatches.push(match);
                const Chat = mongoose.model('Chat');
                const chatDoc = await Chat.findOne({ interactions: match.embedding.interactionId._id }, { chatId: 1 });
                if (chatDoc) {
                    chatIdMap.set(match.embedding.interactionId._id.toString(), chatDoc.chatId);
                }
            }
        }
        if (!highScoreMatches.length) {
            return false;
        }

        const sourceQuestionFlow = await buildQuestionFlowForInteraction(interaction);
        const fallbackFlowCache = new Map();
        const candidateQueue = [...highScoreMatches];
        while (candidateQueue.length) {
            const candidateMatch = candidateQueue.shift();

            const bestCitationMatch = await findBestCitationMatch(
                interaction,
                [candidateMatch]
            );

            if (!bestCitationMatch.url || bestCitationMatch.similarity !== 1) {
                ServerLoggingService.info('QA high score fallback candidate skipped due to citation mismatch (worker)', chatId, {
                    sourceUrl: interaction.answer?.citation?.providedCitationUrl,
                    attemptedMatchUrl: bestCitationMatch.url || '',
                });
                continue;
            }

            const matchedExpertFeedback = candidateMatch.embedding.interactionId.expertFeedback;
            const fallbackInteraction = await Interaction.findById(candidateMatch.embedding.interactionId._id)
                .populate({
                    path: 'answer',
                    populate: { path: 'sentences' }
                });
            if (!fallbackInteraction) {
                ServerLoggingService.warn('Fallback interaction not found for QA high score match (worker)', chatId, {
                    fallbackInteractionId: candidateMatch.embedding.interactionId._id.toString()
                });
                continue;
            }

            let fallbackSourceChatId = chatIdMap.get(candidateMatch.embedding.interactionId._id.toString()) || null;
            if (!fallbackSourceChatId) {
                fallbackSourceChatId = await getChatIdForInteraction(
                    candidateMatch.embedding.interactionId._id,
                    candidateMatch.embedding.chatId ?? null
                );
            }

            const candidateInteractionIdStr = candidateMatch.embedding.interactionId._id.toString();
            let fallbackQuestionFlow = fallbackFlowCache.get(candidateInteractionIdStr);
            if (fallbackQuestionFlow === undefined) {
                fallbackQuestionFlow = await buildQuestionFlowForInteraction(fallbackInteraction);
                fallbackFlowCache.set(candidateInteractionIdStr, fallbackQuestionFlow);
            }

            const fallbackCompareOutcome = await runFallbackCompareCheck({
                sourceInteraction: interaction,
                fallbackInteraction,
                sourceQuestionFlow,
                fallbackQuestionFlow,
                aiProvider
            });

            const compareUsed = !!fallbackCompareOutcome.performed;
            const fallbackCompareMeta = compareUsed ? (fallbackCompareOutcome.meta || null) : null;
            const fallbackCompareChecks = compareUsed ? (fallbackCompareOutcome.checks || null) : null;
            const fallbackCompareRaw = compareUsed ? (fallbackCompareOutcome.raw || null) : null;

            const comparePassed = compareUsed && fallbackCompareChecks && Object.values(fallbackCompareChecks).every((entry) => entry && entry.p === 'p');
            if (!comparePassed) {
                ServerLoggingService.info('Fallback compare agent rejected QA match candidate (worker)', chatId, {
                    candidateInteractionId: candidateInteractionIdStr,
                    compareUsed,
                    fallbackCompareChecks: fallbackCompareChecks || null
                });
                continue;
            }

            const newExpertFeedback = new ExpertFeedback({
                totalScore: null,
                type: 'ai',
                citationScore: bestCitationMatch.score,
                citationExplanation: bestCitationMatch.explanation,
                answerImprovement: '',
                expertCitationUrl: matchedExpertFeedback?.expertCitationUrl ?? '',
                feedback: 'qa-high-score-fallback'
            });
            for (let i = 1; i <= 4; i++) {
                newExpertFeedback[`sentence${i}Score`] = matchedExpertFeedback?.[`sentence${i}Score`] ?? 100;
                newExpertFeedback[`sentence${i}Explanation`] = matchedExpertFeedback?.[`sentence${i}Explanation`] ?? '';
                newExpertFeedback[`sentence${i}Harmful`] = matchedExpertFeedback?.[`sentence${i}Harmful`] ?? false;
            }
            const recalculatedScore = computeTotalScore(newExpertFeedback, 4);
            newExpertFeedback.totalScore = recalculatedScore;
            if (newExpertFeedback.totalScore === 100) {
                newExpertFeedback.feedback = 'positive';
            } else if (newExpertFeedback.totalScore < 100) {
                newExpertFeedback.feedback = 'negative';
            }
            const savedFeedback = await newExpertFeedback.save();
            ServerLoggingService.info('AI feedback saved using QA high score fallback (worker)', chatId, {
                feedbackId: savedFeedback._id,
                totalScore: savedFeedback.totalScore,
                citationScore: bestCitationMatch.score
            });

            const newEval = new Eval({
                expertFeedback: savedFeedback._id,
                processed: true,
                hasMatches: true,
                similarityScores: {
                    sentences: [],
                    citation: bestCitationMatch.similarity || 0
                },
                sentenceMatchTrace: Array.isArray(failedSentenceTraces) ? failedSentenceTraces : [],
                fallbackType: 'qa-high-score',
                fallbackSourceChatId: fallbackSourceChatId || '',
                // Include short fallback candidate answer and citation for traceability
                fallbackCandidateAnswerText: extractAnswerText(fallbackInteraction) || '',
                // Prefer the bestCitationMatch.url (the matched citation URL) if available;
                // otherwise fallback to any populated citation on the interaction or the matched expert feedback url.
                fallbackCandidateCitation: (
                    (bestCitationMatch && bestCitationMatch.url) ||
                    fallbackInteraction.answer?.citation?.providedCitationUrl ||
                    matchedExpertFeedback?.expertCitationUrl ||
                    ''
                ),
                matchedCitationInteractionId: bestCitationMatch.matchedCitationInteractionId || '',
                matchedCitationChatId: bestCitationMatch.matchedCitationChatId || '',
                fallbackCompareUsed: compareUsed,
                fallbackCompareMeta: fallbackCompareMeta || undefined,
                fallbackCompareChecks: fallbackCompareChecks || undefined,
                fallbackCompareRaw: fallbackCompareRaw || undefined
            });
            const savedEval = await newEval.save();
            await Interaction.findByIdAndUpdate(
                interaction._id,
                { autoEval: savedEval._id },
                { new: true }
            );
            ServerLoggingService.info('Created evaluation with QA high score fallback (worker)', chatId, {
                evaluationId: savedEval._id,
                feedbackId: savedFeedback._id,
                totalScore: savedFeedback.totalScore,
                similarityScores: newEval.similarityScores,
                traceCount: Array.isArray(failedSentenceTraces) ? failedSentenceTraces.length : 0,
                fallbackCompareMeta: fallbackCompareMeta || null
            });
            return true;
        }

        ServerLoggingService.info('QA high score fallback exhausted all candidates without passing fallback compare (worker)', chatId, {
            candidateCountTried: highScoreMatches.length
        });
        return false;
    } catch (error) {
        ServerLoggingService.error('Error in tryQAMatchHighScoreFallback', chatId, error);
        return false;
    }
}

async function validateInteractionAndCheckExisting(interaction, chatId) {
    ServerLoggingService.debug('Validating interaction (worker)', chatId, {
        hasInteraction: !!interaction,
        hasQuestion: !!interaction?.question,
        hasAnswer: !!interaction?.answer
    });
    if (!interaction || !interaction.question || !interaction.answer) {
        ServerLoggingService.warn('Invalid interaction or missing question/answer (worker)', chatId);
        return null;
    }

    // Check if the interaction already has an autoEval reference
    const existingInteraction = await Interaction.findById(interaction._id).populate('autoEval');
    if (existingInteraction?.autoEval) {
        ServerLoggingService.info('Evaluation already exists for interaction (worker)', chatId, {
            evaluationId: existingInteraction.autoEval._id
        });
        return existingInteraction.autoEval;
    }

    ServerLoggingService.debug('Interaction validation successful (worker)', chatId);
    return true;
}

async function getEmbeddingForInteraction(interaction) {
    ServerLoggingService.debug('Fetching embeddings for interaction (worker)', interaction._id.toString());
    const embedding = await Embedding.findOne({
        interactionId: interaction._id,
        questionsAnswerEmbedding: { $exists: true, $not: { $size: 0 } },
        answerEmbedding: { $exists: true, $not: { $size: 0 } },
    }).lean();

    if (!embedding) {
        ServerLoggingService.warn('No embeddings found for interaction (worker)', interaction._id.toString());
        return null;
    }

    // If sentence embeddings are not stored on the document (new model), fetch them separately
    if (!embedding.sentenceEmbeddings || embedding.sentenceEmbeddings.length === 0) {
        const sentenceEmbeddingsDocs = await SentenceEmbedding.find({ parentEmbeddingId: embedding._id }).sort({ sentenceIndex: 1 }).lean();
        if (sentenceEmbeddingsDocs.length > 0) {
            embedding.sentenceEmbeddings = sentenceEmbeddingsDocs.map(doc => doc.embedding);
        }
    }

    if (!embedding.sentenceEmbeddings || embedding.sentenceEmbeddings.length === 0) {
        ServerLoggingService.warn('No sentence embeddings found for interaction (worker)', interaction._id.toString());
        return null;
    }

    ServerLoggingService.debug('Found embeddings for interaction (worker)', interaction._id.toString(), {
        hasQuestionAnswerEmbedding: !!embedding.questionsAnswerEmbedding,
        hasAnswerEmbedding: !!embedding.answerEmbedding,
        sentenceEmbeddingsCount: embedding.sentenceEmbeddings?.length || 0
    });

    return embedding;
}

async function findSimilarEmbeddingsWithFeedback(sourceEmbedding, similarityThreshold = 0.85, limit = 20) {
    ServerLoggingService.debug('Starting findSimilarEmbeddingsWithFeedback using VectorService (worker)', 'system', {
        threshold: similarityThreshold,
        limit
    });

    const startTime = Date.now();

    // Ensure the query vector is a plain array of finite numbers
    let queryVector = sourceEmbedding.questionsAnswerEmbedding;
    if (ArrayBuffer.isView(queryVector)) queryVector = Array.from(queryVector);
    if (!Array.isArray(queryVector) || !queryVector.every(x => typeof x === 'number' && Number.isFinite(x))) {
        console.error('Invalid query vector for QA search:', queryVector, 'Type:', Object.prototype.toString.call(queryVector));
        throw new Error('Query vector for QA search must be a plain array of finite numbers');
    }
    if (!VectorService || typeof VectorService.search !== 'function') {
        ServerLoggingService.error('VectorService is not initialized or missing search() in worker', 'worker', { hasVectorService: !!VectorService });
        throw new Error('VectorService not initialized in worker. Ensure initVectorService() was called before performing searches.');
    }
    const similarNeighbors = await VectorService.search(
        queryVector,
        limit * 2, // Get more candidates to filter
        'qa',
        { threshold: similarityThreshold }
    );

    const similarEmbeddings = [];

    // Get the current interaction's createdAt timestamp
    const sourceInteractionCreatedAt = sourceEmbedding.createdAt;
    for (const neighbor of similarNeighbors) {
        if (neighbor.interactionId.toString() === sourceEmbedding.interactionId.toString()) continue;

        const embedding = await Embedding.findOne({
            interactionId: neighbor.interactionId,
            questionsAnswerEmbedding: { $exists: true, $not: { $size: 0 } },
            answerEmbedding: { $exists: true, $not: { $size: 0 } },
        }).lean();

        if (!embedding) continue;

        // If sentence embeddings are not stored on the document (new model), fetch them separately
        if (!embedding.sentenceEmbeddings || embedding.sentenceEmbeddings.length === 0) {
            const sentenceEmbeddingsDocs = await SentenceEmbedding.find({ parentEmbeddingId: embedding._id }).sort({ sentenceIndex: 1 }).lean();
            if (sentenceEmbeddingsDocs.length > 0) {
                embedding.sentenceEmbeddings = sentenceEmbeddingsDocs.map(doc => doc.embedding);
            }
        }

        if (!embedding.sentenceEmbeddings || embedding.sentenceEmbeddings.length === 0) continue;

        const expertFeedback = await ExpertFeedback.findById(neighbor.expertFeedbackId).lean();
        if (!expertFeedback) {
            ServerLoggingService.warn('ExpertFeedback not found for embedding in vector store (worker)', neighbor.interactionId.toString(), {
                expertFeedbackId: neighbor.expertFeedbackId
            });
            continue;
        }

        const neighborInteraction = await Interaction.findById(neighbor.interactionId, { createdAt: 1 }).lean();
        if (!neighborInteraction) continue;
        // Resolve chatId for neighbor using helper (prefers embedding.chatId, falls back to Chat lookup)
        const neighborChatId = await getChatIdForInteraction(neighbor.interactionId, embedding.chatId);
        similarEmbeddings.push({
            embedding: {
                ...embedding,
                interactionId: {
                    _id: neighbor.interactionId,
                    expertFeedback: expertFeedback,
                    createdAt: neighborInteraction.createdAt,
                    chatId: neighborChatId // attach chatId for filtering later
                }
            },
            similarity: neighbor.similarity
        });
        if (similarEmbeddings.length >= limit) break;
    }

    // Sort by similarity (highest first)
    similarEmbeddings.sort((a, b) => b.similarity - a.similarity);

    const timeElapsed = (Date.now() - startTime) / 1000;
    ServerLoggingService.info('Completed finding similar embeddings using VectorService (worker)', 'system', {
        candidatesFound: similarNeighbors.length,
        matchesFound: similarEmbeddings.length,
        timeElapsed,
        averageSimilarity: similarEmbeddings.length > 0
            ? similarEmbeddings.reduce((sum, item) => sum + item.similarity, 0) / similarEmbeddings.length
            : 0
    });

    return similarEmbeddings;
}


async function findBestSentenceMatches(sourceEmbedding, topMatches, aiProvider = 'openai') {
    // Get the set of allowed interaction IDs from topMatches
    const allowedInteractionIds = new Set(topMatches.map(m => m.embedding.interactionId._id.toString()));
    let bestSentenceMatches = [];

    // Determine source interaction's chatId so we can exclude matches from the same chat
    const sourceChatId = await getChatIdForInteraction(sourceEmbedding.interactionId._id || sourceEmbedding.interactionId, sourceEmbedding.chatId || null);

    for (let sourceIndex = 0; sourceIndex < sourceEmbedding.sentenceEmbeddings.length; sourceIndex++) {
        let sourceSentenceEmb = sourceEmbedding.sentenceEmbeddings[sourceIndex];
        if (ArrayBuffer.isView(sourceSentenceEmb)) sourceSentenceEmb = Array.from(sourceSentenceEmb);
        if (!Array.isArray(sourceSentenceEmb) || !sourceSentenceEmb.every(x => typeof x === 'number' && Number.isFinite(x))) {
            console.error('Invalid query vector for sentence search:', sourceSentenceEmb, 'Type:', Object.prototype.toString.call(sourceSentenceEmb));
            throw new Error('Query vector for sentence search must be a plain array of finite numbers');
        }
        // Apply sentence similarity threshold directly in vector service
        const sentenceNeighbors = await VectorService.search(
            sourceSentenceEmb,
            10,
            'sentence',
            { threshold: config.thresholds.sentenceSimilarity }
        );
        // Filter to only those whose parent interaction is in the topMatches
        // and exclude any neighbor that belongs to the same chat as the source interaction
        const filtered = sentenceNeighbors.filter(n => {
            try {
                const nInteractionIdStr = n.interactionId.toString();
                if (!allowedInteractionIds.has(nInteractionIdStr)) return false;
                if (sourceChatId) {
                    // Attempt to get chatId from topMatches embedding (we attached it earlier)
                    const match = topMatches.find(m => m.embedding.interactionId._id.toString() === nInteractionIdStr);
                    const neighborChatId = match?.embedding?.interactionId?.chatId ?? null;
                    if (neighborChatId && neighborChatId === sourceChatId) {
                        ServerLoggingService.debug('Excluding sentence neighbor from same chat (worker)', sourceChatId, { sourceInteractionId: sourceEmbedding.interactionId.toString(), neighborInteractionId: nInteractionIdStr, neighborChatId });
                        return false;
                    }
                    // If the neighbor doesn't have an attached chatId, we conservatively do not exclude it
                    // (we prefer not to false-negative by excluding candidates when chatId is unknown).
                }
                return true;
            } catch (e) {
                // Keep the neighbor if any error occurs during filtering to avoid false negatives
                ServerLoggingService.warn('Error while filtering sentence neighbors by chatId (worker)', 'system', e);
                return allowedInteractionIds.has(n.interactionId.toString());
            }
        });
        filtered.sort((a, b) => b.similarity - a.similarity);
        if (filtered.length > 0) {
            // If multiple filtered candidates exist for this source sentence, try the sentenceCompare agent
            // Build candidate texts up to 10 entries
            const candidates = [];
                      for (const f of filtered.slice(0, 10)) {
                          try {
                              // Attempt to load the target sentence text from DB for more accurate comparison
                              const emb = await Embedding.findOne({ interactionId: f.interactionId }).lean();
                              let sentenceText = null;
                              if (emb && Array.isArray(emb.sentenceEmbeddings) && emb.sentenceEmbeddings.length > 0) {
                                  // If sentence texts are not stored on embedding, we'll fetch the Interaction's answer sentences
                                  const matchInteraction = await Interaction.findById(f.interactionId).populate({ path: 'answer', populate: { path: 'sentences' } });
                                  sentenceText = matchInteraction?.answer?.sentences?.[f.sentenceIndex] || null;
                              } else {
                                  const matchInteraction = await Interaction.findById(f.interactionId).populate({ path: 'answer', populate: { path: 'sentences' } });
                                  sentenceText = matchInteraction?.answer?.sentences?.[f.sentenceIndex] || null;
                              }
                              // Resolve candidate chatId for display in UI
                              let candidateChatId = null;
                              try {
                                  const Chat = mongoose.model('Chat');
                                  const chatDoc = await Chat.findOne({ interactions: f.interactionId }, { chatId: 1 }).lean();
                                  candidateChatId = chatDoc ? chatDoc.chatId : null;
                              } catch (e) {
                                  candidateChatId = null;
                              }
                              if (sentenceText && typeof sentenceText === 'string') {
                                  candidates.push({ text: sentenceText, match: f, chatId: candidateChatId });
                              }
                          } catch (e) {
                              ServerLoggingService.warn('Error loading candidate sentence text for compare agent (worker)', 'system', e);
                          }
                      }

            if (candidates.length > 1) {
                try {
                    // Prepare request for the sentenceCompare agent: source sentence and array of candidate strings
                    const sourceInteractionDoc = await Interaction.findById(sourceEmbedding.interactionId).populate({ path: 'answer', populate: { path: 'sentences' } });
                    const sourceSentenceText = sourceInteractionDoc?.answer?.sentences?.[sourceIndex] || null;
                    const candidateStrings = candidates.map(c => c.text);
                    // Use a larger maxTokens for sentence compare agent to allow lengthy contexts
                    const createAgentFn = async (agentType, localChatId) => await createSentenceCompareAgent(agentType, localChatId, 5000);
                    const request = { source: sourceSentenceText || '', candidates: candidateStrings };
                    const t0 = Date.now();
                    const compareResult = await AgentOrchestratorService.invokeWithStrategy({ chatId: 'sentence-compare', agentType: aiProvider || 'openai', request, createAgentFn, strategy: sentenceCompareStrategy });
                    const latencyMs = Date.now() - t0;
                    // parse winner
                        const winner = compareResult?.parsed?.winner;
                        const results = Array.isArray(compareResult?.parsed?.results) ? compareResult.parsed.results : null;
                        const checksByIndex = new Map();
                        if (results) {
                            for (const item of results) {
                                if (item && typeof item.index === 'number' && item.checks) {
                                    checksByIndex.set(item.index, item.checks);
                                }
                            }
                        }
                        const winnerChecks = (!results && winner && typeof winner.index === 'number' && winner.checks) ? winner.checks : null;
                    if (winner && typeof winner.index === 'number' && winner.index >= 0 && winner.index < candidateStrings.length) {
                        const chosen = candidates[winner.index].match;
                        // Build per-sentence trace extras for persistence
                            const candidateChoices = candidates.map((c, idx) => {
                                let checks = null;
                                if (results) {
                                    checks = checksByIndex.get(idx) || null;
                                } else if (winnerChecks && winner.index === idx) {
                                    checks = winnerChecks;
                                }
                                return {
                                    text: c.text,
                                    matchedInteractionId: c.match?.interactionId ?? null,
                                    matchedChatId: c.chatId || '',
                                    matchedSentenceIndex: c.match?.sentenceIndex ?? null,
                                    similarity: typeof c.match?.similarity === 'number' ? c.match.similarity : null,
                                    checks: checks || undefined,
                                };
                            });
                        bestSentenceMatches.push({
                            sourceIndex,
                            targetIndex: chosen.sentenceIndex,
                            similarity: filtered.find(x => x.interactionId.toString() === chosen.interactionId.toString() && x.sentenceIndex === chosen.sentenceIndex)?.similarity || null,
                            expertFeedback: chosen.expertFeedbackId || null,
                            matchId: chosen.interactionId,
                            matchStatus: 'matched',
                            matchExplanation: 'selected_by_sentence_compare_agent',
                            candidateChoices,
                            agentSelectedIndex: winner.index,
                            agentSelectionExplanation: typeof winner.explanation === 'string' ? winner.explanation : ''
                        });
                        // Attach light telemetry on the object for later Eval persistence (top-level)
                        bestSentenceMatches.__agentTelemetry = {
                            provider: aiProvider || 'openai',
                            model: compareResult?.model || '',
                            inputTokens: compareResult?.inputTokens ?? null,
                            outputTokens: compareResult?.outputTokens ?? null,
                            latencyMs
                        };
                        continue;
                    }
                } catch (e) {
                    ServerLoggingService.warn('Sentence compare agent failed; falling back to top candidate (worker)', 'system', e);
                    // fall through to pick top candidate below
                }
            }

            // Default: pick the top filtered candidate
            const best = filtered[0];
            bestSentenceMatches.push({
                sourceIndex,
                targetIndex: best.sentenceIndex,
                similarity: best.similarity,
                expertFeedback: best.expertFeedbackId,
                matchId: best.interactionId,
                matchStatus: 'matched',
                matchExplanation: ''
            });
        } else {
            // No match found for this sentence, short-circuit and return immediately
            let explanation = '';
            if (!sentenceNeighbors.length) {
                explanation = 'No similar sentence neighbors found.';
            } else {
                // Check if any neighbors are in allowed interactions (but below threshold)
                const inAllowedButBelowThreshold = sentenceNeighbors.some(n => allowedInteractionIds.has(n.interactionId.toString()));
                if (inAllowedButBelowThreshold) {
                    explanation = 'Similar sentences found in top question-answer matches, but all are below the similarity threshold.';
                } else {
                    explanation = 'Similar sentences found, but none are part of the top similar question-answer matches.';
                }
            }
            bestSentenceMatches.push({
                sourceIndex,
                targetIndex: null,
                similarity: null,
                expertFeedback: null,
                matchId: null,
                matchStatus: 'not_found',
                matchExplanation: explanation
            });
            // Short-circuit: as soon as one sentence fails, return immediately
            return bestSentenceMatches;
        }
    }
    return bestSentenceMatches;
}

async function findBestCitationMatch(interaction, bestAnswerMatches) {
    await interaction.populate({
        path: 'answer',
        populate: {
            path: 'citation',
            model: 'Citation'
        }
    });
    const sourceUrl = interaction.answer?.citation?.providedCitationUrl || '';
    const bestCitationMatch = {
        score: null,
        explanation: '',
        url: '',
        similarity: 0,
        expertCitationUrl: '',
        matchedCitationInteractionId: '', // Add field for interactionId string
        matchedCitationChatId: '' // Add field for chatId string
    };
    // Always score the search page as zero
    const searchPagePattern = /^https:\/\/www\.canada\.ca\/(en|fr)\/sr\/srb\.html(\?.*)?$/i;
    if (searchPagePattern.test(sourceUrl)) {
        bestCitationMatch.score = 0;
        bestCitationMatch.explanation = 'Search page citations are always scored zero.';
        bestCitationMatch.url = sourceUrl;
        bestCitationMatch.similarity = 1;
        ServerLoggingService.debug('Citation matching result (worker):', 'system', {
            sourceUrl,
            matchedUrl: bestCitationMatch.url,
            score: bestCitationMatch.score
        });
        return bestCitationMatch;
    }
    for (const match of bestAnswerMatches) {
        // match is now { embedding, similarity }
        const expertFeedback = match.embedding.interactionId.expertFeedback;
        const matchInteraction = await Interaction.findById(match.embedding.interactionId._id).populate({
            path: 'answer',
            populate: {
                path: 'citation',
                model: 'Citation'
            }
        });
        const matchUrl = matchInteraction?.answer?.citation?.providedCitationUrl;
        if (
            matchUrl &&
            sourceUrl.toLowerCase() === matchUrl.toLowerCase()
        ) {
            bestCitationMatch.score = (expertFeedback?.citationScore !== null && expertFeedback?.citationScore !== undefined) ? expertFeedback.citationScore : 25;
            bestCitationMatch.explanation = expertFeedback?.citationExplanation;
            bestCitationMatch.url = matchUrl;
            bestCitationMatch.similarity = 1;
            bestCitationMatch.expertCitationUrl = expertFeedback?.expertCitationUrl;
            bestCitationMatch.matchedCitationInteractionId = matchInteraction.interactionId || '';
            // Find chatId for matched interaction
            const Chat = mongoose.model('Chat');
            const chatDoc = await Chat.findOne({ interactions: matchInteraction._id }, { chatId: 1 });
            bestCitationMatch.matchedCitationChatId = chatDoc ? chatDoc.chatId : '';
            break;
        }

    }
    ServerLoggingService.debug('Citation matching result (worker):', 'system', {
        sourceUrl,
        matchedUrl: bestCitationMatch.url,
        score: bestCitationMatch.score,
        matchedCitationInteractionId: bestCitationMatch.matchedCitationInteractionId,
        matchedCitationChatId: bestCitationMatch.matchedCitationChatId
    });
    return bestCitationMatch;
}

function computeTotalScore(feedback, sentenceCount) {
    const hasAnyRating = [
        feedback.sentence1Score,
        feedback.sentence2Score,
        feedback.sentence3Score,
        feedback.sentence4Score,
        feedback.citationScore,
    ].some((score) => score !== null);
    if (!hasAnyRating) return null;
    const sentenceScores = [
        feedback.sentence1Score,
        feedback.sentence2Score,
        feedback.sentence3Score,
        feedback.sentence4Score,
    ]
        .slice(0, sentenceCount)
        .map((score) => (score === null ? 100 : score));
    const sentenceComponent =
        (sentenceScores.reduce((sum, score) => sum + score, 0) / sentenceScores.length) * 0.75;
    const citationComponent = feedback.citationScore !== null ? feedback.citationScore : 25;
    const totalScore = sentenceComponent + citationComponent;
    return Math.round(totalScore * 100) / 100;
}

async function createEvaluation(interaction, sentenceMatches, chatId, bestCitationMatch, sentenceCompareTelemetry = null) {
    const sourceInteraction = await Interaction.findById(interaction._id)
        .populate({
            path: 'answer',
            populate: { path: 'sentences' }
        });
    const newExpertFeedback = new ExpertFeedback({
        totalScore: null,
        type: 'ai', // <-- Set type to "ai" for auto evaluation
        citationScore: bestCitationMatch.score,
        citationExplanation: bestCitationMatch.explanation,
        answerImprovement: '',
        expertCitationUrl: bestCitationMatch.expertCitationUrl,
        feedback: ''
    });
    const sentenceTrace = [];
    const sentenceSimilarities = [];
    for (const match of sentenceMatches) {
        const feedbackIdx = match.targetIndex + 1;
        const newIdx = sentenceTrace.length + 1;
        const sourceSentenceText = sourceInteraction?.answer?.sentences[match.sourceIndex];
        const matchedInteraction = await Interaction.findById(match.matchId)
            .populate({
                path: 'answer',
                populate: { path: 'sentences' }
            });
        const matchedSentenceText = matchedInteraction?.answer?.sentences[match.targetIndex];
        // Fetch chatId from Chat collection by finding the chat that contains this interaction
        let matchedChatId = null;
        const Chat = mongoose.model('Chat');
        const chatDoc = await Chat.findOne({ interactions: matchedInteraction._id }, { chatId: 1 });
        if (chatDoc) {
            matchedChatId = chatDoc.chatId; // Use the chatId string for reference
        }
        if (match.expertFeedback && feedbackIdx >= 1 && feedbackIdx <= 4) {
            const score = match.expertFeedback[`sentence${feedbackIdx}Score`] ?? 100;
            newExpertFeedback[`sentence${newIdx}Score`] = score;
            newExpertFeedback[`sentence${newIdx}Explanation`] = match.expertFeedback[`sentence${feedbackIdx}Explanation`];
            newExpertFeedback[`sentence${newIdx}Harmful`] = match.expertFeedback[`sentence${feedbackIdx}Harmful`] || false;
        }
        sentenceTrace.push({
            sourceIndex: match.sourceIndex,
            sourceSentenceText: sourceSentenceText,
            matchedInteractionId: match.matchId,
            matchedChatId: matchedChatId,
            matchedSentenceIndex: match.targetIndex,
            matchedSentenceText: matchedSentenceText,
            matchedExpertFeedbackSentenceScore: match.expertFeedback?.[`sentence${feedbackIdx}Score`] ?? 100,
            matchedExpertFeedbackSentenceExplanation: match.expertFeedback?.[`sentence${feedbackIdx}Explanation`],
            similarity: match.similarity,
            matchStatus: match.matchStatus,
            matchExplanation: match.matchExplanation,
            candidateChoices: Array.isArray(match.candidateChoices) ? match.candidateChoices : undefined,
            agentSelectedIndex: typeof match.agentSelectedIndex === 'number' ? match.agentSelectedIndex : undefined,
            agentSelectionExplanation: match.agentSelectionExplanation || undefined
        });
        sentenceSimilarities.push(match.similarity);
    }
    const recalculatedScore = computeTotalScore(newExpertFeedback, sentenceMatches.length);
    newExpertFeedback.totalScore = recalculatedScore;
    if (newExpertFeedback.totalScore === 100) {
        newExpertFeedback.feedback = "positive";
    } else if (newExpertFeedback.totalScore < 100) {
        newExpertFeedback.feedback = "negative";
    }
    const savedFeedback = await newExpertFeedback.save();
    ServerLoggingService.info('AI feedback saved successfully (worker)', chatId, {
        feedbackId: savedFeedback._id,
        totalScore: recalculatedScore,
        citationScore: bestCitationMatch.score
    });
    // Find matched citation interactionId and chatId for traceability
    const matchedCitationInteractionId = bestCitationMatch.matchedCitationInteractionId || '';
    const matchedCitationChatId = bestCitationMatch.matchedCitationChatId || '';

    const newEval = new Eval({
        expertFeedback: savedFeedback._id,
        processed: true,
        hasMatches: true,
        similarityScores: {
            sentences: sentenceSimilarities,
            citation: bestCitationMatch.similarity || 0
        },
        sentenceMatchTrace: sentenceTrace,
        matchedCitationInteractionId,
        matchedCitationChatId,
        sentenceCompareUsed: !!sentenceCompareTelemetry,
        sentenceCompareMeta: sentenceCompareTelemetry ? {
            provider: sentenceCompareTelemetry.provider || '',
            model: sentenceCompareTelemetry.model || '',
            inputTokens: sentenceCompareTelemetry.inputTokens ?? null,
            outputTokens: sentenceCompareTelemetry.outputTokens ?? null,
            latencyMs: sentenceCompareTelemetry.latencyMs ?? null
        } : undefined
    });
    // Save the evaluation and assign to savedEval
    const savedEval = await newEval.save();
    await Interaction.findByIdAndUpdate(
        interaction._id,
        { autoEval: savedEval._id },
        { new: true }
    );
    ServerLoggingService.info('Created evaluation with matched sentence feedback (worker)', chatId, {
        evaluationId: savedEval._id,
        feedbackId: savedFeedback._id,
        totalScore: recalculatedScore,
        similarityScores: newEval.similarityScores,
        traceCount: sentenceTrace.length
    });
    return savedEval;
}

// Create an evaluation record to mark that an interaction has been processed but no matches were found
async function createNoMatchEvaluation(interaction, chatId, reason) {
    // Accept reasonType and reason
    let noMatchReasonType = 'unknown';
    let noMatchReasonMsg = '';
    let perSentenceReasons = null;
    if (typeof reason === 'object' && reason !== null) {
        noMatchReasonType = reason.type || 'unknown';
        noMatchReasonMsg = reason.msg || '';
        if (Array.isArray(reason.perSentenceReasons)) {
            perSentenceReasons = reason.perSentenceReasons;
        }
    } else {
        noMatchReasonMsg = reason;
    }
    // Attempt to get the source sentences for traceability
    let sourceSentences = [];
    try {
        const populated = await Interaction.findById(interaction._id)
            .populate({ path: 'answer', populate: { path: 'sentences' } });
        sourceSentences = populated?.answer?.sentences || [];
    } catch (e) {
        ServerLoggingService.warn('Could not populate source sentences for no-match trace', chatId, { error: e });
    }

    // Only include trace entries for sentences that were actually evaluated (i.e., as many as perSentenceReasons, if present)
    let sentenceMatchTrace = [];
    if (Array.isArray(perSentenceReasons)) {
        sentenceMatchTrace = perSentenceReasons.map((reason, idx) => {
            let sentence = sourceSentences[idx];
            let defaultExplanation = `No match found for this sentence during auto-eval. ReasonType: ${noMatchReasonType}. Reason: ${noMatchReasonMsg}`;
            let matchStatus = 'not_found';
            let matchExplanation = defaultExplanation;
            let matchedInteractionId = null;
            let matchedChatId = '';
            let matchedSentenceIndex = null;
            let matchedSentenceText = '';
            let matchedExpertFeedbackSentenceScore = null;
            let matchedExpertFeedbackSentenceExplanation = '';
            let similarity = null;

            if (reason) {
                if (typeof reason === 'object') {
                    matchStatus = reason.matchStatus || matchStatus;
                    if (matchStatus === 'matched') {
                        matchExplanation = reason.matchExplanation || '';
                        matchedInteractionId = reason.matchId ?? null;
                        matchedChatId = reason.matchedChatId ?? '';
                        matchedSentenceIndex = reason.targetIndex ?? null;
                        matchedSentenceText = reason.matchedSentenceText ?? '';
                        matchedExpertFeedbackSentenceScore = reason.expertFeedback?.[`sentence${(reason.targetIndex ?? 0) + 1}Score`] ?? null;
                        matchedExpertFeedbackSentenceExplanation = reason.expertFeedback?.[`sentence${(reason.targetIndex ?? 0) + 1}Explanation`] ?? '';
                        similarity = reason.similarity ?? null;
                    } else {
                        matchExplanation = reason.matchExplanation || defaultExplanation;
                    }
                } else if (typeof reason === 'string') {
                    matchExplanation = reason;
                }
            }
            return {
                sourceIndex: idx,
                sourceSentenceText: typeof sentence === 'string' ? sentence : (sentence?.text || ''),
                matchedInteractionId,
                matchedChatId,
                matchedSentenceIndex,
                matchedSentenceText,
                matchedExpertFeedbackSentenceScore,
                matchedExpertFeedbackSentenceExplanation,
                similarity,
                matchStatus,
                matchExplanation
            };
        });
    }

    const newEval = new Eval({
        processed: true,
        hasMatches: false,
        similarityScores: {
            sentences: [],
            citation: 0
        },
        sentenceMatchTrace,
        noMatchReasonType,
        noMatchReasonMsg
    });

    const savedEval = await newEval.save();

    await Interaction.findByIdAndUpdate(
        interaction._id,
        { autoEval: savedEval._id },
        { new: true }
    );

    ServerLoggingService.info(`Created no-match evaluation record (worker) - ${noMatchReasonType}: ${noMatchReasonMsg}`, chatId, {
        interactionId: interaction._id.toString(),
        evaluationId: savedEval._id,
        traceCount: sentenceMatchTrace.length,
        noMatchReasonType,
        noMatchReasonMsg
    });

    return savedEval;
}


export { runFallbackCompareCheck };
export default async function ({ interactionId, chatId, aiProvider = 'openai', forceFallbackEval = false }) {
    await dbConnect();
    // Ensure each worker process/thread has a ready VectorService instance.
    // `initVectorService` is idempotent and will create + initialize the correct
    // implementation (DocDB or IM) for this worker if it hasn't been set yet.
    try {
        if (!VectorService) {
            ServerLoggingService.info('VectorService not found in worker, initializing...', chatId);
            await initVectorService();
            ServerLoggingService.info('VectorService initialized in worker', chatId);
        }
    } catch (err) {
        ServerLoggingService.error('Failed to initialize VectorService in worker', chatId, err);
        throw err;
    }
    try {
        const interaction = await Interaction.findById(interactionId)
            .populate('question')
            .populate({
                path: 'answer',
                populate: [
                    { path: 'sentences' },
                    { path: 'citation', model: 'Citation' }
                ]
            });
        if (!interaction) {
            ServerLoggingService.warn('Interaction not found (worker)', chatId, { interactionId });
            return null;
        }
        const validationResult = await validateInteractionAndCheckExisting(interaction, chatId);
        if (validationResult !== true) return validationResult;
        const sourceEmbedding = await getEmbeddingForInteraction(interaction);
        if (!sourceEmbedding) {
            await createNoMatchEvaluation(interaction, chatId, { type: 'no_embeddings', msg: 'no embeddings found' });
            return null;
        }
        const similarEmbeddings = await findSimilarEmbeddingsWithFeedback(
            sourceEmbedding,
            config.thresholds.questionAnswerSimilarity,
            config.searchLimits.similarEmbeddings
        );
        if (!similarEmbeddings.length) {
            await createNoMatchEvaluation(interaction, chatId, { type: 'no_qa_match', msg: 'no similar embeddings found' });
            return null;
        }

        if (forceFallbackEval) {
            ServerLoggingService.info('Force fallback evaluation enabled; skipping sentence matching (worker)', chatId, { interactionId: interaction._id.toString() });
            const forcedFallbackSuccess = await tryQAMatchHighScoreFallback(interaction, chatId, sourceEmbedding, similarEmbeddings, [], aiProvider);
            if (forcedFallbackSuccess) {
                return true;
            }
            await createNoMatchEvaluation(interaction, chatId, { type: 'forced_fallback_no_match', msg: 'forced fallback did not find a passing candidate' });
            return null;
        }
        // Use the top 20 QA matches directly for sentence matching
        const bestSentenceMatches = await findBestSentenceMatches(
            sourceEmbedding,
            similarEmbeddings,
            aiProvider
        );
        // All sentences must have a real match (matchStatus === 'matched')
        const allSentencesMatched = bestSentenceMatches.length === sourceEmbedding.sentenceEmbeddings.length &&
            bestSentenceMatches.every(m => m.matchStatus === 'matched');
        if (!allSentencesMatched) {
            // Fallback: try QA high score method, pass failed sentence traces
            const fallbackSuccess = await tryQAMatchHighScoreFallback(interaction, chatId, sourceEmbedding, similarEmbeddings, bestSentenceMatches, aiProvider);
            if (fallbackSuccess) {
                return true;
            } else {
                // Pass bestSentenceMatches as the reason object for per-sentence explanations
                await createNoMatchEvaluation(interaction, chatId, { type: 'no_sentence_match', msg: 'not all sentences matched', perSentenceReasons: bestSentenceMatches });
                return null;
            }
        }
        const bestCitationMatch = await findBestCitationMatch(
            interaction,
            similarEmbeddings // pass the same as bestAnswerMatches
        );
        if (!bestCitationMatch.url || bestCitationMatch.similarity !== 1) {
            await createNoMatchEvaluation(interaction, chatId, { type: 'no_citation_match', msg: 'no matching citation found' });

            return null;
        }
        await createEvaluation(
            interaction,
            bestSentenceMatches,
            chatId,
            bestCitationMatch,
            bestSentenceMatches.__agentTelemetry || null
        );
        return true;
    } catch (error) {
        ServerLoggingService.error('Error during interaction evaluation (worker)', chatId, error);
        throw error; // Rethrow the error to be handled by the worker
    }
}
