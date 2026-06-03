import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';

// Import db connect (uses global mongodb-memory-server in test env)
const dbConnect = (await import('../../api/db/db-connect.js')).default;

// Import models and service under test
import EvaluationService from '../EvaluationService.js';
import { Chat } from '../../models/chat.js';
import { Interaction } from '../../models/interaction.js';
import { Eval } from '../../models/eval.js';
import { ExpertFeedback } from '../../models/expertFeedback.js';

describe('EvaluationService integration (DB)', () => {
    beforeAll(async () => {
        await dbConnect();
    });

    afterEach(async () => {
        // Clean up collections used by these tests
        await Eval.deleteMany({});
        await ExpertFeedback.deleteMany({});
        await Interaction.deleteMany({});
        await Chat.deleteMany({});
        vi.clearAllMocks();
    });

    it('deleteExpertFeedbackForChat removes expertFeedback refs and deletes documents', async () => {
        // Create expert feedback and an interaction referencing it
        const fb = await ExpertFeedback.create({ reviewer: 'tester', comments: 'ok' });
        const interaction = await Interaction.create({ interactionId: 'i-1', expertFeedback: fb._id });
        const chat = await Chat.create({ chatId: 'chat-1', interactions: [interaction._id] });

        const result = await EvaluationService.deleteExpertFeedbackForChat('chat-1');

        expect(result).toBeTruthy();
        expect(result.deletedCount).toBeGreaterThanOrEqual(1);

        const remainingFeedback = await ExpertFeedback.findById(fb._id);
        expect(remainingFeedback).toBeNull();

        const updatedInteraction = await Interaction.findById(interaction._id);
        expect(updatedInteraction.expertFeedback).toBeFalsy();
    });

    it('hasExistingEvaluation and getEvaluationForInteraction return expected shapes', async () => {
        // Create expert feedback and eval, attach to interaction
        const fb = await ExpertFeedback.create({ reviewer: 'tester2', comments: 'score' });
        const evalDoc = await Eval.create({ processed: true, expertFeedback: fb._id, sentenceCompareMeta: { model: 's1' } });
        const interaction = await Interaction.create({ interactionId: 'i-2', autoEval: evalDoc._id, referringUrl: 'https://ref.test' });

        const has = await EvaluationService.hasExistingEvaluation(interaction._id.toString());
        expect(has).toBe(true);

        const evalObj = await EvaluationService.getEvaluationForInteraction(interaction._id.toString());
        expect(evalObj).toBeTruthy();
        expect(evalObj.referringUrl).toBe('https://ref.test');
        expect(evalObj.interactionUpdatedAt).toBeTruthy();
        expect(evalObj._modelMeta).toBeTruthy();
        expect(evalObj._modelMeta.sentenceCompareModel).toBe('s1');
    });

    it('deleteEvaluations with onlyEmpty removes matching evals and returns counts', async () => {
        // Create an empty eval that matches the onlyEmpty criteria
        const emptyEval = await Eval.create({ processed: true, hasMatches: false, noMatchReasonType: 'none' });
        // Attach to an interaction
        const interaction = await Interaction.create({ interactionId: 'i-3', autoEval: emptyEval._id });

        const res = await EvaluationService.deleteEvaluations({ timeFilter: null, onlyEmpty: true });
        expect(res).toBeTruthy();
        expect(res.deleted).toBeGreaterThanOrEqual(1);
    });
});
