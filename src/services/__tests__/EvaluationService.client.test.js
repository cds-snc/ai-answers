import { describe, it, expect } from 'vitest';
import EvaluationService from '../../services/EvaluationService.js';

describe('EvaluationService (client)', () => {
  it('getEvaluation requires interactionId', async () => {
    await expect(EvaluationService.getEvaluation({})).rejects.toThrow('Missing required fields');
  });

  it('deleteEvaluation requires interactionId', async () => {
    await expect(EvaluationService.deleteEvaluation({})).rejects.toThrow('Missing required fields');
  });

  it('reEvaluate requires interactionId', async () => {
    await expect(EvaluationService.reEvaluate({})).rejects.toThrow('Missing required fields');
  });
});

