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
