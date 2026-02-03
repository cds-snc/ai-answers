import { QuestionFlowComparator } from './QuestionFlowComparator.js';
import { AgentOrchestratorService } from '../../agents/AgentOrchestratorService.js';
import { rankerStrategy } from '../../agents/strategies/rankerStrategy.js';
import { createRankerAgent } from '../../agents/AgentFactory.js';
import ServerLoggingService from '../ServerLoggingService.js';

/**
 * LLM-based question flow comparator.
 * Uses the existing ranker agent (GPT-4.1-mini) to compare question flows.
 */
export class LLMRankerComparator extends QuestionFlowComparator {
    /**
     * Compare user questions against candidate question flows using the LLM ranker
     * @param {string[]} userQuestions - The user's question flow
     * @param {string[]} candidateQuestions - Array of candidate question flows
     * @param {Object} options - Options including chatId and selectedAI
     * @returns {Promise<import('./QuestionFlowComparator.js').ComparisonResult>}
     */
    async compare(userQuestions, candidateQuestions, options = {}) {
        const startTime = Date.now();
        const { chatId = 'system', selectedAI = 'openai' } = options;

        const createAgentFn = async (agentType, localChatId) =>
            await createRankerAgent(agentType, localChatId);

        const request = { userQuestions, candidateQuestions };

        let rankResult = null;
        try {
            rankResult = await AgentOrchestratorService.invokeWithStrategy({
                chatId,
                agentType: selectedAI,
                request,
                createAgentFn,
                strategy: rankerStrategy
            });
        } catch (err) {
            ServerLoggingService.error('LLM ranker failed', 'LLMRankerComparator', err);
            return {
                results: [],
                method: 'llm',
                metadata: {
                    model: selectedAI,
                    latencyMs: Date.now() - startTime,
                    error: err.message
                }
            };
        }

        const results = this._transformResults(rankResult);

        return {
            results,
            method: 'llm',
            metadata: {
                model: rankResult?.model || selectedAI,
                latencyMs: Date.now() - startTime,
                inputTokens: rankResult?.inputTokens,
                outputTokens: rankResult?.outputTokens
            }
        };
    }

    /**
     * Transform LLM ranker output to standardized format
     * @private
     */
    _transformResults(rankResult) {
        if (!rankResult?.results || !Array.isArray(rankResult.results)) return [];

        return rankResult.results.map(item => {
            if (typeof item !== 'object' || item === null) {
                return {
                    index: -1,
                    score: 0,
                    recommendation: 'reject',
                    checks: {}
                };
            }

            const allPass = item.checks &&
                Object.values(item.checks).every(v => String(v).toLowerCase() === 'pass');

            return {
                index: typeof item.index === 'number' ? item.index : -1,
                score: allPass ? 1.0 : 0.0,
                recommendation: allPass ? 'accept' : 'reject',
                checks: item.checks || {}
            };
        });
    }
}

export default LLMRankerComparator;
