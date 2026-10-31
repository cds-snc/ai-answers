import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/ServerLoggingService.js', () => ({
    default: { info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const { buildAnswerSystemPrompt } = await import('../prompts/systemPrompt.js');
const { PASSAGE_TOOL_INSTRUCTIONS } = await import('../prompts/passageToolPrompt.js');
const { BASE_SYSTEM_PROMPT } = await import('../prompts/agenticBase.js');

describe('buildAnswerSystemPrompt passage tool block', () => {
    it('leaves the block out by default', async () => {
        const prompt = await buildAnswerSystemPrompt('en', { department: 'CRA-ARC' });
        expect(prompt).not.toContain('## PASSAGE TOOL');
    });

    it('adds the block after the base prompt when passageTool is on', async () => {
        const prompt = await buildAnswerSystemPrompt('en', { department: 'CRA-ARC', passageTool: true });
        expect(prompt).toContain(PASSAGE_TOOL_INSTRUCTIONS);
        expect(prompt.indexOf(PASSAGE_TOOL_INSTRUCTIONS)).toBeGreaterThan(prompt.indexOf(BASE_SYSTEM_PROMPT));
    });
});
