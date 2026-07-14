import mongoose from 'mongoose';
import AgentOrchestratorService from '../agents/AgentOrchestratorService.js';
import { createServiceActionAgent } from '../agents/AgentFactory.js';
import serviceActionClassifyStrategy from '../agents/strategies/serviceActionClassifyStrategy.js';
import { SERVICE_SEEDS_BY_DEPARTMENT, ACTION_SEEDS } from '../api/data/serviceActionSeeds.js';
import ServerLoggingService from './ServerLoggingService.js';

// 'unknown' = the classifier ran but was not confident — distinct from '' (never
// classified). See docs/plans/service-action-classification.md.
export const UNKNOWN_VALUE = 'unknown';

// Guard against a runaway model response ending up as a dashboard category.
const MAX_SERVICE_LENGTH = 80;

const VALID_ACTIONS = new Set(ACTION_SEEDS.map((a) => a.action));

const normalizeService = (value) => {
    if (typeof value !== 'string') return UNKNOWN_VALUE;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_SERVICE_LENGTH) return UNKNOWN_VALUE;
    return trimmed;
};

// Actions are a controlled vocabulary: anything outside the seed list
// (case-insensitive) collapses to 'unknown' so the breakdown stays consistent.
const actionByLower = new Map(ACTION_SEEDS.map((a) => [a.action.toLowerCase(), a.action]));
const normalizeAction = (value) => {
    if (typeof value !== 'string') return UNKNOWN_VALUE;
    const trimmed = value.trim();
    if (VALID_ACTIONS.has(trimmed)) return trimmed;
    return actionByLower.get(trimmed.toLowerCase()) || UNKNOWN_VALUE;
};

class ServiceActionClassificationServiceClass {
    // Classifies one persisted interaction and writes the result onto its
    // Context doc. Inputs are the English question/answer plus the matched
    // department and citation/referring URLs — users mix programs up, so the
    // answer and citation are evidence of the true program by design.
    async classifyInteraction({
        contextId,
        chatId = 'system',
        question = '',
        answer = '',
        department = '',
        citationUrl = '',
        referringUrl = ''
    }) {
        if (!contextId) throw new Error('contextId is required');
        if (!question) {
            ServerLoggingService.warn('Service/action classification skipped: no question text', chatId);
            return null;
        }

        const result = await AgentOrchestratorService.invokeWithStrategy({
            chatId,
            request: {
                question,
                answer,
                department,
                citationUrl,
                referringUrl,
                seedServices: SERVICE_SEEDS_BY_DEPARTMENT[department] || [],
                actions: ACTION_SEEDS
            },
            createAgentFn: (agentType, cid) => createServiceActionAgent(agentType, cid),
            strategy: serviceActionClassifyStrategy
        });

        const service = normalizeService(result?.service);
        const action = normalizeAction(result?.action);

        const Context = mongoose.model('Context');
        await Context.updateOne({ _id: contextId }, { $set: { service, action } });
        ServerLoggingService.info('Service/action classification saved', chatId, { service, action });
        return { service, action };
    }

    // Fire-and-forget wrapper for the persistence path: never throws, never
    // blocks. A failure just leaves the Context fields at '' (never classified).
    classifyInteractionInBackground(args) {
        this.classifyInteraction(args).catch((err) => {
            ServerLoggingService.error(
                'Service/action classification failed - leaving fields unclassified',
                args?.chatId || 'system',
                err
            );
        });
    }
}

const ServiceActionClassificationService = new ServiceActionClassificationServiceClass();
export default ServiceActionClassificationService;
