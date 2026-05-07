import { describe, expect, it } from 'vitest';
import { buildStepTimeline } from '../chatViewer.js';

describe('buildStepTimeline', () => {
  it('builds a timeline from node logs and excludes persist from the visible steps', () => {
    const logs = [
      { createdAt: '2026-05-07T10:00:00.000Z', message: 'Starting GenericGraph' },
      { createdAt: '2026-05-07T10:00:00.100Z', message: 'node:init input' },
      { createdAt: '2026-05-07T10:00:00.200Z', message: 'node:init output' },
      { createdAt: '2026-05-07T10:00:00.300Z', message: 'node:answer input' },
      { createdAt: '2026-05-07T10:00:00.400Z', message: 'Tool execution completed: downloadWebPage', metadata: { duration: 50 } },
      { createdAt: '2026-05-07T10:00:00.500Z', message: 'node:answer output' },
      { createdAt: '2026-05-07T10:00:00.600Z', message: 'node:verify input' },
      { createdAt: '2026-05-07T10:00:00.700Z', message: 'node:verify output' },
      { createdAt: '2026-05-07T10:00:00.800Z', message: 'node:persist input' },
      { createdAt: '2026-05-07T10:00:00.900Z', message: 'node:persist output' },
      { createdAt: '2026-05-07T10:00:00.950Z', message: 'Workflow complete', metadata: { totalResponseTime: 950 } },
    ];

    const timeline = buildStepTimeline(logs);

    expect(timeline.graphName).toBe('GenericGraph');
    expect(timeline.totalMs).toBe(950);
    expect(timeline.userPerceivedMs).toBe(850);
    expect(timeline.steps.map((step) => step.name)).toEqual(['init', 'answer', 'verify']);

    const answerStep = timeline.steps.find((step) => step.name === 'answer');
    expect(answerStep.breakdown).toEqual({
      downloadCount: 1,
      downloadDuration: 50,
      generationDuration: 150,
    });
  });

  it('scopes to the latest starting run for a chat id', () => {
    const logs = [
      { createdAt: '2026-05-07T09:00:00.000Z', message: 'Starting OldGraph' },
      { createdAt: '2026-05-07T09:00:00.100Z', message: 'node:init input' },
      { createdAt: '2026-05-07T10:00:00.000Z', message: 'Starting NewGraph' },
      { createdAt: '2026-05-07T10:00:00.100Z', message: 'node:init input' },
      { createdAt: '2026-05-07T10:00:00.200Z', message: 'node:init output' },
    ];

    const timeline = buildStepTimeline(logs);

    expect(timeline.graphName).toBe('NewGraph');
    expect(timeline.steps).toHaveLength(1);
    expect(timeline.steps[0].name).toBe('init');
    expect(timeline.steps[0].startRel).toBe(100);
  });
});
