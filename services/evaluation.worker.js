import mongoose from 'mongoose';
import { Interaction } from '../models/interaction.js';
import { Eval } from '../models/eval.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import { Embedding } from '../models/embedding.js';
import { SentenceEmbedding } from '../models/sentenceEmbedding.js';
import ServerLoggingService from './ServerLoggingService.js';
import dbConnect from '../api/db/db-connect.js';
import config from '../config/eval.js';
import { VectorService } from '../services/VectorServiceFactory.js';

// Fallback: create evaluation using QA match only if any of the top N matches has expert feedback score > 90
async function tryQAMatchHighScoreFallback(interaction, chatId, similarEmbeddings, failedSentenceTraces = []) {
    try {
        const topQAMatches = similarEmbeddings.slice(0, config.searchLimits.topQAMatchesForHighScoreFallback);
        // Find all QA matches with expert feedback score > 90
        const highScoreMatches = [];
        const chatIdMap = new Map();
        for (const match of topQAMatches) {
            const expertFeedback = match.embedding.interactionId.expertFeedback;
            if (expertFeedback && typeof expertFeedback.totalScore === 'number' && expertFeedback.totalScore >= 90) {
                highScoreMatches.push(match);
                // Find the chatId for the fallback source interaction
                const Chat = mongoose.model('Chat');
                const chatDoc = await Chat.findOne({ interactions: match.embedding.interactionId._id }, { chatId: 1 });
                if (chatDoc) {
                    chatIdMap.set(match.embedding.interactionId._id.toString(), chatDoc.chatId);
                }
            }
        }
        if (highScoreMatches.length > 0) {
            // Find best citation match among all high score QA matches
            const bestCitationMatch = await findBestCitationMatch(
                interaction,
                highScoreMatches
            );
            // Only proceed if an exact match was found (similarity === 1 and url is not empty)
            if (!bestCitationMatch.url || bestCitationMatch.similarity !== 1) {
                ServerLoggingService.info('No exact citation match found in QA high score fallback (worker)', chatId, {
                    sourceUrl: interaction.answer?.citation?.providedCitationUrl,
                    attemptedMatchUrl: bestCitationMatch.url
                });
                return false;
            }
            // Find the high score match that produced the citation
            let matchedHighScoreMatch = null;
            for (const match of highScoreMatches) {
                const matchInteraction = await Interaction.findById(match.embedding.interactionId._id).populate({
                    path: 'answer',
                    populate: { path: 'citation', model: 'Citation' }
                });
                const matchUrl = matchInteraction?.answer?.citation?.providedCitationUrl;
                if (matchUrl && matchUrl.toLowerCase() === bestCitationMatch.url.toLowerCase()) {
                    matchedHighScoreMatch = match;
                    break;
                }
            }
            if (!matchedHighScoreMatch) {
                ServerLoggingService.info('Exact citation match found, but no matching high score QA match (worker)', chatId, {
                    sourceUrl: interaction.answer?.citation?.providedCitationUrl,
                    attemptedMatchUrl: bestCitationMatch.url
                });
                return false;
            }
            // Use matchedExpertFeedback for clarity
            const matchedExpertFeedback = matchedHighScoreMatch.embedding.interactionId.expertFeedback;
            // Minimal evaluation: only QA match info
            const newExpertFeedback = new ExpertFeedback({
                totalScore: null, // will be recalculated below
                type: 'ai',
                citationScore: bestCitationMatch.score,
                citationExplanation: bestCitationMatch.explanation,
                answerImprovement: '',
                expertCitationUrl: matchedExpertFeedback?.expertCitationUrl ?? '',
                feedback: 'qa-high-score-fallback'
            });
            // Copy up to 4 sentence scores/explanations/harmful flags
            for (let i = 1; i <= 4; i++) {
                newExpertFeedback[`sentence${i}Score`] = matchedExpertFeedback?.[`sentence${i}Score`] ?? 100;
                newExpertFeedback[`sentence${i}Explanation`] = matchedExpertFeedback?.[`sentence${i}Explanation`] ?? '';
                newExpertFeedback[`sentence${i}Harmful`] = matchedExpertFeedback?.[`sentence${i}Harmful`] ?? false;
            }
            // Recalculate totalScore using computeTotalScore
            const recalculatedScore = computeTotalScore(newExpertFeedback, 4);
            newExpertFeedback.totalScore = recalculatedScore;
            // Update feedback field based on recalculated score
            if (newExpertFeedback.totalScore === 100) {
                newExpertFeedback.feedback = "positive";
            } else if (newExpertFeedback.totalScore < 100) {
                newExpertFeedback.feedback = "negative";
            }
            const savedFeedback = await newExpertFeedback.save();
            ServerLoggingService.info('AI feedback saved using QA high score fallback (worker)', chatId, {
                feedbackId: savedFeedback._id,
                totalScore: savedFeedback.totalScore,
                citationScore: bestCitationMatch.score
            });
            const fallbackSourceChatId = chatIdMap.get(matchedHighScoreMatch.embedding.interactionId._id.toString()) || null;
            const newEval = new Eval({
                expertFeedback: savedFeedback._id,
                processed: true,
                hasMatches: true,
                similarityScores: {
                    sentences: [],
                    citation: bestCitationMatch.similarity || 0
                },
                sentenceMatchTrace: failedSentenceTraces,
                fallbackType: 'qa-high-score',
                fallbackSourceChatId: fallbackSourceChatId,
                matchedCitationInteractionId: bestCitationMatch.matchedCitationInteractionId || '',
                matchedCitationChatId: bestCitationMatch.matchedCitationChatId || ''
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
                traceCount: Array.isArray(failedSentenceTraces) ? failedSentenceTraces.length : 0
            });
            return true;
        }
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
        
        similarEmbeddings.push({
            embedding: {
                ...embedding,
                interactionId: {
                    _id: neighbor.interactionId,
                    expertFeedback: expertFeedback,
                    createdAt: neighborInteraction.createdAt
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


async function findBestSentenceMatches(sourceEmbedding, topMatches) {
    // Get the set of allowed interaction IDs from topMatches
    const allowedInteractionIds = new Set(topMatches.map(m => m.embedding.interactionId._id.toString()));
    let bestSentenceMatches = [];

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
    // Only keep neighbors whose interaction is among top matches (threshold already applied)
    const filtered = sentenceNeighbors.filter(n => allowedInteractionIds.has(n.interactionId.toString()));
        filtered.sort((a, b) => b.similarity - a.similarity);
        if (filtered.length > 0) {
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
            bestCitationMatch.score = expertFeedback?.citationScore;
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

async function createEvaluation(interaction, sentenceMatches, chatId, bestCitationMatch) {
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
            matchExplanation: match.matchExplanation
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
        matchedCitationChatId
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

export default async function ({ interactionId, chatId }) {
    await dbConnect();
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
        // Use the top 20 QA matches directly for sentence matching
        const bestSentenceMatches = await findBestSentenceMatches(
            sourceEmbedding,
            similarEmbeddings // Pass the top 20 QA matches
        );
        // All sentences must have a real match (matchStatus === 'matched')
        const allSentencesMatched = bestSentenceMatches.length === sourceEmbedding.sentenceEmbeddings.length &&
            bestSentenceMatches.every(m => m.matchStatus === 'matched');
        if (!allSentencesMatched) {
            // Fallback: try QA high score method, pass failed sentence traces
            const fallbackSuccess = await tryQAMatchHighScoreFallback(interaction, chatId, similarEmbeddings, bestSentenceMatches);
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
            bestCitationMatch
        );
        return true;
    } catch (error) {
         ServerLoggingService.error('Error during interaction evaluation (worker)', chatId, error);
        throw error; // Rethrow the error to be handled by the worker
    }
}
