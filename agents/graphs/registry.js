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
};

// Legacy GPT5* graphs were copies of DefaultGraph with a hardcoded model.
// They've been removed — old references resolve to GenericWorkflowGraph.
// The model is now injected server-side via the model.default setting.
const LEGACY_GRAPH_ALIASES = {
  GPT5MiniDefaultGraph: 'GenericWorkflowGraph',
  GPT5OneDefaultGraph: 'GenericWorkflowGraph',
  GPT5OneChatGraph: 'GenericWorkflowGraph',
};

const graphCache = new Map();

export async function getGraphApp(name) {
  const resolvedName = LEGACY_GRAPH_ALIASES[name] || name;
  const loader = graphLoaders[resolvedName];
  if (!loader) {
    return null;
  }
  if (!graphCache.has(resolvedName)) {
    const app = await loader();
    graphCache.set(resolvedName, app);
  }
  return graphCache.get(resolvedName);
}

export function listGraphs() {
  return Object.keys(graphLoaders);
}
