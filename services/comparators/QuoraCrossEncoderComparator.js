import { QuestionFlowComparator } from './QuestionFlowComparator.js';
import ServerLoggingService from '../ServerLoggingService.js';

/**
 * Quora Cross-Encoder Comparator for question duplicate detection.
 * Uses the cross-encoder/quora-distilroberta-base model to detect if two questions
 * are asking the same thing.
 * 
 * This runs entirely locally without API calls, making it fast and cost-free.
 */

const DEFAULT_THRESHOLD = parseFloat(process.env.LOCAL_CROSSENCODER_THRESHOLD) || 0.94;
const MODEL_NAME = 'cross-encoder/quora-distilroberta-base';

// Singleton pipeline management
let classifierPipeline = null;
let pipelineLoadingPromise = null;

/**
 * Lazily load the classification pipeline (singleton pattern).
 * The model is loaded only once and reused for all subsequent calls.
 */
async function getPipeline() {
    if (classifierPipeline) {
        return classifierPipeline;
    }

    if (pipelineLoadingPromise) {
        return pipelineLoadingPromise;
    }

    pipelineLoadingPromise = (async () => {
        ServerLoggingService.info('Loading Quora cross-encoder model...', 'QuoraCrossEncoderComparator', { model: MODEL_NAME });
        const startTime = Date.now();

        const { pipeline, env } = await import('@xenova/transformers');

        // Set local model path
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));

        if (process.env.TRANSFORMERS_CACHE) {
            // Docker: models are copied to cache dir
            env.cacheDir = process.env.TRANSFORMERS_CACHE;
        } else {
            // Local dev: models are in project's models folder
            env.localModelPath = path.resolve(__dirname, '../../models');
        }
        env.allowRemoteModels = true;
        env.allowLocalModels = true;

        // Load the text-classification pipeline
        try {
            classifierPipeline = await pipeline('text-classification', MODEL_NAME);
            ServerLoggingService.info(`Quora cross-encoder model loaded in ${Date.now() - startTime}ms`, 'QuoraCrossEncoderComparator');
        } catch (quantizedError) {
            ServerLoggingService.info('Quantized model not found, falling back to non-quantized...', 'QuoraCrossEncoderComparator');
            classifierPipeline = await pipeline('text-classification', MODEL_NAME, { quantized: false });
            ServerLoggingService.info(`Quora cross-encoder model (non-quantized) loaded in ${Date.now() - startTime}ms`, 'QuoraCrossEncoderComparator');
        }

        return classifierPipeline;
    })();

    return pipelineLoadingPromise;
}

/**
 * Quora Cross-Encoder Comparator for question duplicate detection.
 */
export class QuoraCrossEncoderComparator extends QuestionFlowComparator {
    /**
     * @param {Object} options
     * @param {number} [options.threshold=0.94] - Score threshold for accepting a match
     */
    constructor(options = {}) {
        super();
        this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    }

    getName() {
        return 'QuoraCrossEncoderComparator';
    }

    /**
     * Compare user questions against candidate question flows
     * @param {string[]} userQuestions - The user's question flow
     * @param {string[]} candidateQuestions - Array of candidate question flows
     * @param {Object} options - Options (chatId for logging)
     * @returns {Promise<import('./QuestionFlowComparator.js').ComparisonResult>}
     */
    async compare(userQuestions, candidateQuestions, options = {}) {
        const startTime = Date.now();
        const { chatId = 'system' } = options;

        let pipe;
        try {
            pipe = await getPipeline();
        } catch (err) {
            ServerLoggingService.error('Failed to load Quora cross-encoder model', 'QuoraCrossEncoderComparator', err);
            return {
                results: [],
                method: 'quora-crossencoder',
                metadata: { model: MODEL_NAME, error: err.message, latencyMs: Date.now() - startTime }
            };
        }

        // Join user questions into a single flow string
        const userFlow = Array.isArray(userQuestions)
            ? userQuestions.join('\n')
            : String(userQuestions);

        const results = [];
        const tokenizer = classifierPipeline.tokenizer;
        const model = classifierPipeline.model;

        for (let i = 0; i < candidateQuestions.length; i++) {
            const candidateFlow = String(candidateQuestions[i] || '');

            try {
                // Tokenize with text_pair for proper sentence pair encoding
                const inputs = tokenizer(userFlow, {
                    text_pair: candidateFlow,
                    padding: true,
                    truncation: true,
                });

                // Run model
                const outputs = await model(inputs);

                // Get the logit and convert to probability via sigmoid
                const logit = outputs.logits.data[0];
                const score = 1 / (1 + Math.exp(-logit));

                ServerLoggingService.debug(`[QuoraCrossEncoder] "${userFlow}" vs "${candidateFlow}" => logit: ${logit}, score: ${score.toFixed(4)}`, 'QuoraCrossEncoderComparator');

                results.push({
                    index: i,
                    score: Math.round(score * 1000) / 1000,
                    recommendation: score >= this.threshold ? 'accept' : 'reject'
                });
            } catch (err) {
                ServerLoggingService.error(`Error comparing candidate ${i}`, 'QuoraCrossEncoderComparator', err);
                results.push({
                    index: i,
                    score: 0,
                    recommendation: 'reject'
                });
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        ServerLoggingService.info('Quora cross-encoder comparison complete', chatId, {
            candidateCount: candidateQuestions.length,
            topScore: results[0]?.score ?? null,
            latencyMs: Date.now() - startTime
        });

        return {
            results,
            method: 'quora-crossencoder',
            metadata: {
                model: MODEL_NAME,
                threshold: this.threshold,
                latencyMs: Date.now() - startTime,
                candidateCount: candidateQuestions.length
            }
        };
    }
}

export const quoraCrossEncoderComparator = new QuoraCrossEncoderComparator();
export default QuoraCrossEncoderComparator;
