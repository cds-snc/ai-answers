import { describe, it, expect } from 'vitest';
import { GraphState } from '../graphState.js';
import { getGraphApp, listGraphs } from '../registry.js';

// LangGraph silently drops any input or node output key that isn't a state
// channel: no error, the field is just gone. Every graph must use the one
// shared state so a field added for one graph reaches all of them.
// Every field the runners send needs a channel too. That is checked against
// the real input in the chat-graph-run, ExperimentalBatchService and
// GraphClient tests.
describe('shared graph state', () => {
  const sharedChannels = Object.keys(GraphState.spec).sort();

  // `builder.channels` is LangGraph internals (checked on @langchain/langgraph
  // 1.3.2). If an upgrade moves it, this test throws: it can't pass silently.
  it.each(listGraphs())('%s uses exactly the shared state channels', async (name) => {
    const app = await getGraphApp(name);
    expect(Object.keys(app.builder.channels).sort()).toEqual(sharedChannels);
  });
});
