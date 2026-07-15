import mongoose from 'mongoose';
import AgentOrchestratorService from '../agents/AgentOrchestratorService.js';
import { createProgramActionAgent } from '../agents/AgentFactory.js';
import programActionClassifyStrategy from '../agents/strategies/programActionClassifyStrategy.js';
import { PROGRAM_SEEDS_BY_DEPARTMENT, ACTION_SEEDS } from '../api/data/programActionSeeds.js';
import { NON_CLASSIFIABLE_ANSWER_TYPES } from '../api/util/answerTypes.js';
import ServerLoggingService from './ServerLoggingService.js';

// 'unknown' = the classifier ran but was not confident — distinct from '' (never
// classified). See docs/plans/program-action-classification.md.
export const UNKNOWN_VALUE = 'unknown';

// Non-normal answer types (not-gc / pt-muni / clarifying-question) carry no GC
// program, so classification skips them and leaves the fields unclassified ('').
// The set is shared with the program-volume metric — see api/util/answerTypes.js.

// Guard against a runaway model response ending up as a dashboard category.
const MAX_PROGRAM_LENGTH = 80;

const VALID_ACTIONS = new Set(ACTION_SEEDS.map((a) => a.action));

const normalizeProgram = (value) => {
    if (typeof value !== 'string') return UNKNOWN_VALUE;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_PROGRAM_LENGTH) return UNKNOWN_VALUE;
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

class ProgramActionClassificationServiceClass {
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
        referringUrl = '',
        answerType = ''
    }) {
        if (!contextId) throw new Error('contextId is required');
        if (!question) {
            ServerLoggingService.warn('Program/action classification skipped: no question text', chatId);
            return null;
        }
        if (NON_CLASSIFIABLE_ANSWER_TYPES.has(answerType)) {
            ServerLoggingService.info('Program/action classification skipped: non-normal answer type', chatId, { answerType });
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
                seedPrograms: PROGRAM_SEEDS_BY_DEPARTMENT[department] || [],
                actions: ACTION_SEEDS
            },
            createAgentFn: (agentType, cid) => createProgramActionAgent(agentType, cid),
            strategy: programActionClassifyStrategy
        });

        const program = normalizeProgram(result?.program);
        const action = normalizeAction(result?.action);

        const Context = mongoose.model('Context');
        await Context.updateOne({ _id: contextId }, { $set: { program, action } });
        ServerLoggingService.info('Program/action classification saved', chatId, { program, action });
        return { program, action };
    }

    // Fire-and-forget wrapper for the persistence path: never throws, never
    // blocks. A failure just leaves the Context fields at '' (never classified).
    classifyInteractionInBackground(args) {
        this.classifyInteraction(args).catch((err) => {
            ServerLoggingService.error(
                'Program/action classification failed - leaving fields unclassified',
                args?.chatId || 'system',
                err
            );
        });
    }
}

const ProgramActionClassificationService = new ProgramActionClassificationServiceClass();
export default ProgramActionClassificationService;
