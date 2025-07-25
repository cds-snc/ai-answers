import mongoose from 'mongoose';
import { Interaction } from '../models/interaction.js';
import { Eval } from '../models/eval.js';
import { ExpertFeedback } from '../models/expertFeedback.js';
import { Embedding } from '../models/embedding.js';
import ServerLoggingService from './ServerLoggingService.js';
import dbConnect from '../api/db/db-connect.js';
import cosineSimilarity from 'compute-cosine-similarity';
import config from '../config/eval.js';

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
        sentenceEmbeddings: { $exists: true, $not: { $size: 0 } }
    });
    if (!embedding) {
        ServerLoggingService.warn('No embeddings found for interaction (worker)', interaction._id.toString());
    } else {
        ServerLoggingService.debug('Found embeddings for interaction (worker)', interaction._id.toString(), {
            hasQuestionAnswerEmbedding: !!embedding.questionsAnswerEmbedding,
            hasAnswerEmbedding: !!embedding.answerEmbedding,
            sentenceEmbeddingsCount: embedding.sentenceEmbeddings?.length || 0
        });
    }
    return embedding;
}

async function findSimilarEmbeddingsWithFeedback(sourceEmbedding, similarityThreshold = 0.85, limit = 20, timeLimit = 120) {
    ServerLoggingService.debug('Starting findSimilarEmbeddingsWithFeedback (worker)', 'system', {
        threshold: similarityThreshold,
        limit,
        timeLimit
    });
    const startTime = Date.now();
    const similarEmbeddings = [];
    let processedCount = 0;
    let skip = 0;
    const batchSize = 20;
    while ((Date.now() - startTime) / 1000 < timeLimit) {
        const expertFeedbackBatch = await ExpertFeedback.find({ type: 'expert' }) // <-- Only expert
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(batchSize)
            .lean();
        if (expertFeedbackBatch.length === 0) break;
        for (const feedback of expertFeedbackBatch) {
            if ((Date.now() - startTime) / 1000 >= timeLimit) break;
            try {
                const interaction = await Interaction.findOne(
                    { expertFeedback: feedback._id },
                    { _id: 1, expertFeedback: 1, createdAt: 1 }
                ).lean();
                if (!interaction) continue;
                // Skip if this is the same as the source interaction
              if (interaction._id.toString() === sourceEmbedding.interactionId.toString()) continue;
                const embedding = await Embedding.findOne({
                    interactionId: interaction._id,
                    questionsAnswerEmbedding: { $exists: true, $not: { $size: 0 } }
                }).lean();
                if (!embedding) continue;
                const similarity = cosineSimilarity(
                    sourceEmbedding.questionsAnswerEmbedding,
                embedding.questionsAnswerEmbedding
                );
                processedCount++;
                if (similarity >= similarityThreshold) {
                    similarEmbeddings.push({
                        embedding: {
                            ...embedding,
                            interactionId: {
                                _id: interaction._id,
                                expertFeedback: feedback,
                                createdAt: interaction.createdAt
                            }
                        },
                        similarity
                    });
                    if (similarEmbeddings.length > limit) {
                        similarEmbeddings.sort((a, b) => b.similarity - a.similarity);
                        similarEmbeddings.length = limit;
                    }
                    if (similarEmbeddings.length >= limit &&
                        similarEmbeddings[similarEmbeddings.length - 1].similarity >= similarityThreshold + 0.1) {
                        ServerLoggingService.debug('Found enough high-quality matches, exiting early (worker)', 'system', {
                            processedCount,
                            totalMatches: similarEmbeddings.length,
                            timeElapsed: (Date.now() - startTime) / 1000
                        });
                        return similarEmbeddings;
                    }
                }
                if (processedCount % 100 === 0) {
                    ServerLoggingService.debug('Processing progress (worker)', 'system', {
                        processed: processedCount,
                        matchesFound: similarEmbeddings.length,
                        timeElapsed: (Date.now() - startTime) / 1000
                    });
                }
            } catch (error) {
                ServerLoggingService.error('Error processing feedback (worker)', feedback._id.toString(), error);
            }
        }
        skip += batchSize;
    }
    similarEmbeddings.sort((a, b) => b.similarity - a.similarity);
    ServerLoggingService.info('Completed finding similar embeddings (worker)', 'system', {
        totalProcessed: processedCount,
        matchesFound: similarEmbeddings.length,
        timeElapsed: (Date.now() - startTime) / 1000,
        averageSimilarity: similarEmbeddings.length > 0
            ? similarEmbeddings.reduce((sum, item) => sum + item.similarity, 0) / similarEmbeddings.length
            : 0
    });
    return similarEmbeddings;
}

function findBestAnswerMatches(sourceEmbedding, similarEmbeddings, topMatches = 5) {
    const answerMatches = similarEmbeddings
        .map(match => {
            const answerSimilarity = cosineSimilarity(
                sourceEmbedding.answerEmbedding,
                match.embedding.answerEmbedding
            );
            const sentenceCountPenalty = Math.abs(
                sourceEmbedding.sentenceEmbeddings.length -
                match.embedding.sentenceEmbeddings.length
            ) * 0.15;
            const recencyBias = match.embedding.interactionId.createdAt ?
                (new Date() - new Date(match.embedding.interactionId.createdAt)) / (1000 * 60 * 60 * 24 * 365) : 0;
            const recencyWeight = 0.1;
            return {
                ...match,
                answerSimilarity: answerSimilarity - sentenceCountPenalty - (recencyBias * recencyWeight)
            };
        })
        .sort((a, b) => b.answerSimilarity - a.answerSimilarity)
        .slice(0, topMatches);
    return answerMatches;
}

function findBestSentenceMatches(sourceEmbedding, topMatches) {
    let bestSentenceMatches = [];
    let bestScores = new Array(sourceEmbedding.sentenceEmbeddings.length).fill(0);
    let bestMatchInfo = new Array(sourceEmbedding.sentenceEmbeddings.length).fill(null);
    sourceEmbedding.sentenceEmbeddings.forEach((sourceSentenceEmb, sourceIndex) => {
        topMatches.forEach(match => {
            match.embedding.sentenceEmbeddings.forEach((targetSentenceEmb, targetIndex) => {
                const similarity = cosineSimilarity(sourceSentenceEmb, targetSentenceEmb);
                if (similarity > bestScores[sourceIndex] &&
                    similarity > config.thresholds.sentenceSimilarity) {
                    bestScores[sourceIndex] = similarity;
                    bestMatchInfo[sourceIndex] = {
                        sourceIndex,
                        targetIndex,
                        similarity,
                        expertFeedback: match.embedding.interactionId.expertFeedback,
                        matchId: match.embedding.interactionId._id
                    };
                }
            });
        });
    });
    bestMatchInfo.forEach(info => {
        if (info) bestSentenceMatches.push(info);
    });
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
        similarity: 0
    };
    // Always score the search page as zero
    const searchPagePattern = /^https:\/\/www\.canada\.ca\/(en|fr)\/sr\/srb\.html$/i;
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
        const expertFeedback = match.embedding.interactionId.expertFeedback;
        const matchInteraction = await Interaction.findById(match.embedding.interactionId._id).populate({
            path: 'answer',
            populate: {
                path: 'citation',
                model: 'Citation'
            }
        });
        const matchUrl = matchInteraction?.answer?.citation?.providedCitationUrl;
        if (matchUrl && sourceUrl.toLowerCase() === matchUrl.toLowerCase()) {
            bestCitationMatch.score = expertFeedback.citationScore;
            bestCitationMatch.explanation = expertFeedback.citationExplanation;
            bestCitationMatch.url = matchUrl;
            bestCitationMatch.similarity = 1;
            break;
        }
    }
    ServerLoggingService.debug('Citation matching result (worker):', 'system', {
        sourceUrl,
        matchedUrl: bestCitationMatch.url,
        score: bestCitationMatch.score
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
        expertCitationUrl: bestCitationMatch.url,
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
            matchedChatId = chatDoc._id; // Use the MongoDB _id for reference
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
            similarity: match.similarity
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
    });    const newEval = new Eval({
        expertFeedback: savedFeedback._id,
        processed: true,
        hasMatches: true,
        similarityScores: {
            sentences: sentenceSimilarities,
            citation: bestCitationMatch.similarity || 0
        },
        sentenceMatchTrace: sentenceTrace
    });
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
    });    return savedEval;
}

// Create an evaluation record to mark that an interaction has been processed but no matches were found
async function createNoMatchEvaluation(interaction, chatId, reason) {
    const newEval = new Eval({
        processed: true,
        hasMatches: false,
        similarityScores: {
            sentences: [],
            citation: 0
        },
        sentenceMatchTrace: []
    });
    
    const savedEval = await newEval.save();
    
    await Interaction.findByIdAndUpdate(
        interaction._id,
        { autoEval: savedEval._id },
        { new: true }
    );
    
    ServerLoggingService.info(`Created no-match evaluation record (worker) - ${reason}`, chatId, {
        interactionId: interaction._id.toString(),
        evaluationId: savedEval._id
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
        }        const validationResult = await validateInteractionAndCheckExisting(interaction, chatId);
        if (validationResult !== true) return validationResult;
        const sourceEmbedding = await getEmbeddingForInteraction(interaction);
        if (!sourceEmbedding) {
            await createNoMatchEvaluation(interaction, chatId, 'no embeddings found');
            return null;
        }
        const similarEmbeddings = await findSimilarEmbeddingsWithFeedback(
            sourceEmbedding,
            config.thresholds.questionAnswerSimilarity,
            config.searchLimits.similarEmbeddings,
            config.similarEmbeddingsTimeLimit
        );
        if (!similarEmbeddings.length) {
            await createNoMatchEvaluation(interaction, chatId, 'no similar embeddings found');
            return null;
        }
        const bestAnswerMatches = findBestAnswerMatches(
            sourceEmbedding,
            similarEmbeddings,
            config.searchLimits.topAnswerMatches
        );
        if (!bestAnswerMatches.length) {
            await createNoMatchEvaluation(interaction, chatId, 'no answer matches found');
            return null;
        }
        const bestSentenceMatches = findBestSentenceMatches(
            sourceEmbedding,
            bestAnswerMatches
        );
        if (!bestSentenceMatches.length || bestSentenceMatches.length !== sourceEmbedding.sentenceEmbeddings.length) {
            await createNoMatchEvaluation(interaction, chatId, 'no sentence matches found or mismatch in sentence count');
            return null;
        }
        const bestCitationMatch = await findBestCitationMatch(
            interaction,
            bestAnswerMatches
        );
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
