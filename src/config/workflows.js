// config/workflows.js
// Single source of truth for available workflows and models.
// All UI dropdowns (Settings, ChatOptions, BatchUpload) and server-side
// validation import from here. To add a new workflow or model, update
// this file — the change propagates everywhere automatically.

export const WORKFLOWS = [
  { value: 'GenericGraph', labelKey: 'workflows.generic' },
  { value: 'DefaultWithVectorGraph', labelKey: 'workflows.defaultWithVector' },
  { value: 'DefaultWithLocalModel', labelKey: 'workflows.defaultWithLocalModel' },
  { value: 'InstantAndQAGraph', labelKey: 'workflows.instantAndQA' },
  { value: 'GenericWithQAGraph', labelKey: 'workflows.genericWithQA' },
];

export const AVAILABLE_MODELS = [
  { value: 'openai-gpt51', labelKey: 'models.gpt51' },
  { value: 'azure', labelKey: 'models.azure41' },
];

export const WORKFLOW_VALUES = WORKFLOWS.map(w => w.value);
export const MODEL_VALUES = AVAILABLE_MODELS.map(m => m.value);

// Fallback used when the 'workflow.default' setting is missing or invalid.
// Shared by the server-side resolver (api/chat/chat-graph-run.js), the Settings
// page, and the chat Options dropdown so they can't drift apart.
export const DEFAULT_WORKFLOW = 'GenericGraph';

// The workflow that runs eval-informed answering in production. The graph
// saves this name on every question it answers, and the partner dashboard's
// eval-informed rate counts only questions with it — one copy so a rename
// can't silently zero the rate.
export const EVAL_INFORMED_WORKFLOW = 'GenericWithQAGraph';

// Rows in the partner dashboard's eval-informed chats list. The server caps
// the query at this and the list's subtitle states it, so they can't drift.
export const EVAL_INFORMED_CHATS_LIMIT = 20;
