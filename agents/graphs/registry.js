const graphLoaders = {
  DefaultWithVectorGraph: async () => {
    const mod = await import('./DefaultWithVectorGraph.js');
    return mod.defaultWithVectorGraphApp;
  },
  InstantAndQAGraph: async () => {
    const mod = await import('./InstantAndQAGraph.js');
    return mod.instantAndQAGraphApp;
  },
  // Generic workflow graph (used by client GraphClient when requesting GenericWorkflowGraph)
  GenericWorkflowGraph: async () => {
    const mod = await import('./DefaultGraph.js');
    return mod.defaultGraphApp;
  },
  GPT5MiniDefaultGraph: async () => {
    const mod = await import('./GPT5MiniDefaultGraph.js');
    return mod.gpt5MiniDefaultGraphApp;
  },
  GPT5OneDefaultGraph: async () => {
    const mod = await import('./GPT5OneDefaultGraph.js');
    return mod.gpt5OneDefaultGraphApp;
  },
  GPT5OneChatGraph: async () => {
    const mod = await import('./GPT5OneChatGraph.js');
    return mod.gpt5OneChatGraphApp;
  },
};

const graphCache = new Map();

export async function getGraphApp(name) {
  const loader = graphLoaders[name];
  if (!loader) {
    return null;
  }
  if (!graphCache.has(name)) {
    const app = await loader();
    graphCache.set(name, app);
  }
  return graphCache.get(name);
}

export function listGraphs() {
  return Object.keys(graphLoaders);
}
