// config/workflows.js
// Single source of truth for available workflows and models.
// All UI dropdowns (Settings, ChatOptions, BatchUpload) and server-side
// validation import from here. To add a new workflow or model, update
// this file — the change propagates everywhere automatically.

export const WORKFLOWS = [
  { value: 'GenericGraph', labelKey: 'workflows.generic' },
  { value: 'DefaultWithVectorGraph', labelKey: 'workflows.defaultWithVector' },
  { value: 'InstantAndQAGraph', labelKey: 'workflows.instantAndQA' },
];

export const AVAILABLE_MODELS = [
  { value: 'openai-gpt51', labelKey: 'models.gpt51' },
  { value: 'azure', labelKey: 'models.azure41' },
];

export const WORKFLOW_VALUES = WORKFLOWS.map(w => w.value);
export const MODEL_VALUES = AVAILABLE_MODELS.map(m => m.value);
