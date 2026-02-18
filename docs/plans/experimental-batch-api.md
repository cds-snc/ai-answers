# Experimental Batch API & Dataset Management

## Overview

This feature implements a comprehensive backend for batch processing and automated evaluation of LLM outputs. It introduces a data-centric workflow where users can upload **Datasets** (questions, QA pairs), run **Batches** of processing against them (using specific Graphs or Evaluators), and verify the results using **Evaluators** (for safety/bias) or **Comparators** (for semantic checking).

The core philosophy is **Iterative Improvement**:
1.  **Ingest**: Users upload raw data (e.g., a CSV of questions) as a reusable `ExperimentalDataset`.
2.  **Process**: A `Batch` is created to process a Dataset using a specific Graph Workflow (e.g., "Generate Answers"). The system uses a queue-based architecture to handle scale.
3.  **Evaluate**: Results are analyzed using LLM-as-a-Judge agents. **Comparators** check for semantic drift against baselines, while **Evaluators** check for safety and bias.
4.  **Promote**: High-quality results from a Batch can be promoted into a NEW `ExperimentalDataset`. This allows the output of "Run 1" to become the baseline for "Run 2", enabling regression testing and continuous improvement.

## Notes

> [!NOTE]
> **Concurrency Control**: To prevent resource starvation, operators should tune `BATCH_CONCURRENCY` env var (default: 2) alongside `EVAL_CONCURRENCY` (default: `numCPUs-1`). This effectively partitions the server's capacity between user-facing evaluations and background batch processing.

> [!NOTE]
> The current implementation of `ExperimentalBatchService` will generate a standard UUID for `chatId` (using `crypto.randomUUID()`) for each batch item. This ensures compatibility with all downstream services (`ServerLoggingService`, `ToolTrackingHandler`) that expect unique identifiers, while still avoiding the creation of `Chat` documents in MongoDB.

> [!IMPORTANT]
> **Graph Integration**: Batch processing MUST use the LangGraph pipeline directly via `getGraphApp()` and `graphRequestContext`, NOT `AnswerGenerationService`. Using `AnswerGenerationService` bypasses critical pipeline stages (PII redaction, translation, context matching, citation verification, persistence).

## Finalized Decisions (Locked for Implementation)

1. **Cancellation handling**:
   - `ExperimentalBatchItem.status` includes `cancelled`.
   - Cancelled items must persist a `cancellationReason`.
   - Cancelled rows remain in batch results for auditability.
   - If a dataset is created from a batch, cancelled rows are excluded from future processing input by default.
2. **Batch orchestration direction**:
   - Current client flow in `src/pages/BatchPage.js` is the behavior baseline.
   - Execution orchestration moves server-side; UI triggers APIs only.
3. **Migration strategy**:
   - Keep `experimental-*` endpoints active and backward-compatible with the existing legacy batch flow until explicit retirement.
4. **Authorization**:
   - All `/api/experimental/*` endpoints are admin-only.
5. **Comparator row pairing**:
   - Use deterministic `pairKey` for row matching.
   - Preferred source: user-selected shared key column (e.g., `questionId`).
   - Fallback source: normalized question hash.
   - Unmatched rows are stored with `status: 'skipped'` and reason (`missing_in_baseline` or `missing_in_candidate`).
6. **Analyzer identity and persistence**:
   - Use stable kebab-case analyzer IDs in API and DB (e.g., `semantic-comparison`, `safety`, `bias-detection`).
   - Persist analyzer output in a uniform structure under `analysisResults.<analyzerId>`.
7. **Promotion behavior**:
   - Promotion is allowed for partially completed batches.
   - API returns a warning when non-completed rows are included, with per-status counts.
8. **Dataset deletion policy**:
   - Dataset delete is hard delete (no soft delete lifecycle).
   - UI must show confirmation and a pre-delete "Download Excel backup" link.
9. **Duplicate-content behavior**:
   - Detect duplicate content by hash and return a warning payload.
   - Do not hard-block by default; admin can continue upload.
10. **SSE progress payload**:
   - Analyzer-level progress is always included when analyzers are configured.
11. **Refusal and error visibility**:
   - Refusals and processing errors must be persisted as dataset rows (not dropped).
   - Row output must include standardized outcome fields so evaluators can test expected refusal behavior.
   - Default downstream processing ignores non-completed rows unless explicitly enabled.

## Proposed Changes

### Backend Services

#### [MODIFY] [ExperimentalBatchService.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/ExperimentalBatchService.js)

**Graph Integration (Critical Fix)**:
Replace `AnswerGenerationService.generateAnswer()` with direct LangGraph invocation:

```javascript
import { getGraphApp } from '../../agents/graphs/registry.js';
import { graphRequestContext } from '../../agents/graphs/requestContext.js';
import crypto from 'crypto';

const BATCH_CONCURRENCY = parseInt(process.env.BATCH_CONCURRENCY, 10) || 2;

// In _processItem for 'batch' type:
async _processItem(batchId, itemId) {
  const item = await ExperimentalBatchItem.findById(itemId);
  const batch = await ExperimentalBatch.findById(batchId);
  
  // Check for cancellation before processing
  if (batch.status === 'cancelled') {
    item.status = 'cancelled';
    await item.save();
    return { batchId, itemId, status: 'cancelled' };
  }
  
  if (batch.type === 'batch') {
    const graphName = batch.config.workflow || 'GenericWorkflowGraph';
    const app = await getGraphApp(graphName);
    const chatId = crypto.randomUUID();

    const input = {
      chatId,
      message: item.question,
      pageLanguage: batch.config.pageLanguage || 'en',
      aiProvider: batch.config.aiProvider || 'azure',
      referringUrl: batch.config.referringUrl,
      skipPersist: true, // Don't save to MongoDB in batch mode
    };

    await graphRequestContext.run({ headers: {}, user: null }, async () => {
      const stream = await app.stream(input, { streamMode: 'updates' });
      for await (const update of stream) {
        if (update.result?.answer) {
          item.answer = update.result.answer.content;
          item.chatId = chatId; // Store for reference
        }
      }
    });
  }
  // ... analysis type handling unchanged
}
```

**Concurrency from Environment**:
```javascript
ExperimentalQueueService.registerProcessor(QUEUE_NAME, processor, { 
  concurrency: BATCH_CONCURRENCY 
});
```

**New Methods**:
- `createBatch(batchData, itemsData)` â€” Accept `datasetId` to create batch from existing dataset
- **`cancelBatch(batchId)`** â€” Mark batch as cancelled, stop processing pending items
- **`promoteToDataset(batchId, details)`** â€” Create new dataset from all batch rows, preserving completion/refusal/error outcomes for evaluator use

**Promotion with Transaction**:
```javascript
async promoteToDataset(batchId, details) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const batch = await ExperimentalBatch.findById(batchId).session(session);
    if (!['completed', 'failed', 'cancelled'].includes(batch.status)) {
      throw new Error('Cannot promote batch while it is still running');
    }
    
    // Check for duplicate dataset name
    const existing = await ExperimentalDataset.findOne({ name: details.name }).session(session);
    if (existing) {
      throw new Error(`Dataset "${details.name}" already exists`);
    }
    
    const dataset = await ExperimentalDataset.create([{
      name: details.name,
      description: details.description || `Promoted from batch: ${batch.name}`,
      type: 'batch-output',
      sourceType: 'promoted-from-batch',
      sourceBatchId: batchId,
      createdBy: details.userId,
    }], { session });
    
    const items = await ExperimentalBatchItem.find({
      experimentalBatch: batchId
    }).sort({ rowIndex: 1 }).session(session);
    
    const rows = items.map((item, idx) => ({
      experimentalDataset: dataset[0]._id,
      rowIndex: idx + 1,
      data: {
        sourceRowIndex: item.rowIndex,
        outcomeStatus: item.status, // completed | refused | failed | cancelled | skipped
        outcomeCode: item.outcomeCode || null, // standardized reason code
        outcomeText: item.outcomeText || item.error || item.cancellationReason || item.skipReason || null,
        isProcessable: item.status === 'completed',
        question: item.question,
        answer: item.answer || null,
        ...(item.similarityScore !== undefined && { similarityScore: item.similarityScore }),
        ...(item.evaluatorOutput && { evaluatorOutput: item.evaluatorOutput }),
        ...(item.analysisResults && { analysisResults: item.analysisResults }),
      }
    }));
    
    await ExperimentalDatasetRow.insertMany(rows, { session });
    
    // Update dataset row count
    dataset[0].rowCount = rows.length;
    await dataset[0].save({ session });
    
    await session.commitTransaction();
    return {
      dataset: dataset[0],
      warning: {
        code: rows.some(r => r.data.outcomeStatus !== 'completed') ? 'NON_COMPLETED_ROWS_INCLUDED' : null
      }
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
```

#### [MODIFY] [ExperimentalAnalyzerRegistry.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/ExperimentalAnalyzerRegistry.js)
- Registry acts as the central hub for both **Evaluators** (single input) and **Comparators** (dual input).
- Refactor to auto-load analyzer instances from `services/experimental/analyzers/`.
- Registry entries will have `type`: `'evaluator'` or `'comparator'`.
- **Configuration**:
    - `inputType`: `'single'` (single dataset row) or `'comparison'` (row from Dataset A + row from Dataset B).
    - Metadata is served to the frontend to drive the UI for **Dataset Selection**.

**Auto-loading from analyzers folder**:
```javascript
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ExperimentalAnalyzerRegistry {
  constructor() {
    this.analyzers = new Map();
  }

  async initialize() {
    const analyzersDir = join(__dirname, 'analyzers');
    const files = readdirSync(analyzersDir)
      .filter(f => f.endsWith('.js') && f !== 'AnalyzerBase.js');
    
    for (const file of files) {
      const mod = await import(`./analyzers/${file}`);
      const AnalyzerClass = mod.default;
      if (AnalyzerClass.id) {
        this.register(AnalyzerClass.id, {
          name: AnalyzerClass.name,
          description: AnalyzerClass.description,
          inputType: AnalyzerClass.inputType,
          outputColumns: AnalyzerClass.outputColumns,
          processor: async (input) => {
            const instance = new AnalyzerClass(input.config);
            return instance.analyze(input);
          }
        });
      }
    }
  }
  // ... rest of registry methods
}

#### Multi-Analyzer Batch Runs

- Support running multiple analyzers (evaluators and/or comparators) for each batch item.
- Batch creation API and batch config will accept an `analyzers` array with stable IDs: `[{ id: 'safety', config: {...} }, { id: 'semantic-comparison', config: {...} }]`.
- `ExperimentalAnalyzerRegistry` will expose a `getProcessor(analyzerId)` method that returns a callable processor for that analyzer (the processor should accept `{ item, batch, config }` and return the analyzer output object).
- `ExperimentalBatchService` changes:
  - After generating or retrieving an item's `answer`, call all configured analyzers for that item (in parallel where safe), collecting each analyzer's output.
  - Persist analyzer outputs in a uniform shape under `item.analysisResults.<analyzerId>`, e.g.:

```json
{
  "analysisResults": {
    "safety": {
      "status": "completed",
      "score": 0.9,
      "label": "safe",
      "details": { "issues": [] },
      "error": null
    },
    "semantic-comparison": {
      "status": "completed",
      "score": 0.85,
      "label": "match",
      "details": { "similarityScore": 0.85, "match": true, "explanation": "..." },
      "error": null
    }
  }
}
```

  - For CSV/flat export use a flattened naming scheme prefixed by analyzer id, e.g. `safety_score`, `semantic-comparison_similarityScore`.
  - Ensure per-analyzer errors are recorded separately on the item (e.g. `item.analysisErrors = { safety: { code: 'timeout', message: '...' } }`) so a failing analyzer doesn't fail the whole item.

- Comparator pairing flow:
  - Add `pairKey` to dataset rows.
  - On upload, derive `pairKey` from a selected shared key column when provided.
  - If no shared key column is provided, derive `pairKey` from normalized `question` text hash.
  - Comparator batches pair baseline/comparison rows by `pairKey`.
  - Unmatched rows are persisted as `skipped` with a deterministic reason code.

- Concurrency & throttling:
  - Analyzer invocations should respect analyzer-specific concurrency limits (configurable) and the global `BATCH_CONCURRENCY` to avoid overloading LLMs.
  - Registry entries may include an optional `concurrency` hint used by the queue/worker when scheduling analyzer runs.

- Progress & SSE updates:
  - The SSE `batch-progress` events always include analyzer-level counts when analyzers exist, e.g. `{ summary: { completed: X, failed: Y }, analyzers: { safety: { completed: a, failed: b }, semanticComparison: { completed: c, failed: d } } }`.

- Promotion & dataset rows:
  - When promoting a batch to a dataset, include analyzer outputs in the dataset rows either as a nested `analysis` object or as flattened prefixed fields depending on `promoteOptions.flattenAnalyzerOutput`.
  - Default promote behavior: keep analyzer outputs nested under `analysis.{analyzerId}` in Mongo rows and provide an export utility to flatten fields for CSV/Excel.

- API surface & UI:
  - `POST /api/experimental/batches` (new alias) and existing `POST /api/experimental/batch-create` are both supported during migration.
  - The batch-edit UI will allow selecting multiple analyzers and per-analyzer configuration.
  - The `ExperimentalAnalysisPage` UI will show per-analyzer progress and results; allow toggling which analyzer columns to display in the results table.

- Tests:
  - Add tests to verify multiple analyzers run for each item and their outputs are stored under `analysisResults`.
  - Test exporter to ensure prefixed/flattened fields match expected names.

```

#### [NEW] [services/experimental/analyzers/AnalyzerBase.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/AnalyzerBase.js)
Base class defining the analyzer interface:

```javascript
/**
 * Base class for all analyzers (Evaluators and Comparators).
 * Subclasses must implement static properties and the analyze() method.
 */
export class AnalyzerBase {
  // Required static properties - subclasses must override
  static id = '';           // e.g., 'semantic-comparison'
  static name = '';         // e.g., 'Semantic Comparison'
  static description = '';  // Human-readable description
  static inputType = '';    // 'single' | 'comparison'
  static outputColumns = []; // e.g., ['similarityScore', 'match', 'explanation']
  
  constructor(config = {}) {
    this.config = config;
  }
  
  /**
   * Analyze input and return structured results.
   * @param {Object} input - { question, answer, baselineAnswer, comparisonAnswer, config }
   * @returns {Promise<Object>} - Analysis results matching outputColumns
   */
  async analyze(input) {
    throw new Error('Subclass must implement analyze()');
  }
  
  /**
   * Validate input before processing.
   * @param {Object} input
   * @returns {{ valid: boolean, error?: string }}
   */
  validateInput(input) {
    if (this.constructor.inputType === 'comparison') {
      if (!input.baselineAnswer || !input.comparisonAnswer) {
        return { valid: false, error: 'Comparison requires baselineAnswer and comparisonAnswer' };
      }
    } else {
      if (!input.answer && !input.question) {
        return { valid: false, error: 'Single input requires answer or question' };
      }
    }
    return { valid: true };
  }
}

export default AnalyzerBase;
```

#### [NEW] [api/experimental/experimental-analyzers-list.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/experimental-analyzers-list.js)
- **GET /api/experimental/analyzers**
- Returns the list of registered analyzers with their metadata (id, name, description, inputType).
- Allows the frontend (`ExperimentalAnalysisPage`) to dynamically render upload fields (1 vs 2 files) without hardcoding.

#### [NEW] [api/experimental/batch-cancel.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/batch-cancel.js)
- **POST /api/experimental/batches/:id/cancel**
- Legacy alias during migration: **POST /api/experimental/batch-cancel/:id**
- Marks batch status as `cancelled`.
- Pending items are skipped; in-progress items complete but no new items start.

#### [NEW] [api/experimental/batch-progress.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/batch-progress.js)
- **GET /api/experimental/batches/:id/progress** (SSE endpoint)
- Legacy alias during migration: **GET /api/experimental/batch-progress/:id**
- Streams real-time progress events to the client:
```javascript
// Server-Sent Events for batch progress
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// Poll batch status and emit updates
const interval = setInterval(async () => {
  const batch = await ExperimentalBatch.findById(batchId);
  const progress = {
    status: batch.status,
    completed: batch.summary.completed,
    failed: batch.summary.failed,
    total: batch.summary.total,
    percentComplete: Math.round((batch.summary.completed / batch.summary.total) * 100)
  };
  res.write(`data: ${JSON.stringify(progress)}\n\n`);
  
  if (['completed', 'failed', 'cancelled'].includes(batch.status)) {
    clearInterval(interval);
    res.end();
  }
}, 2000);
```

#### [MODIFY] [AgentFactory.js](file:///c:/Users/hymary/repos/ai-answers/agents/AgentFactory.js)
Add LLM factory methods for judge/evaluator agents (following existing naming pattern):
- **`createJudgeLLM(provider)`** â€” Returns raw LLM for semantic comparison (no tools)
- **`createSafetyLLM(provider)`** â€” Returns raw LLM for safety/bias evaluation (no tools)

```javascript
// Follow existing pattern from createRankerAgent, createTranslationAgent
const createJudgeLLM = async (agentType = 'openai') => {
  let llm;
  switch (agentType) {
    case 'openai': {
      const cfg = getModelConfig('openai', 'gpt-4.1');
      llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: cfg.name,
        temperature: 0,
        maxTokens: cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    case 'azure': {
      const cfg = getModelConfig('azure', 'openai-gpt41');
      llm = new AzureChatOpenAI({
        azureApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-06-01',
        azureOpenAIApiDeploymentName: cfg.name,
        temperature: 0,
        maxTokens: cfg.maxTokens,
        timeout: cfg.timeoutMs,
      });
      break;
    }
    // ... other providers
  }
  return llm;
};
```

#### [NEW] [agents/prompts/judges/SemanticComparatorPrompt.js](file:///c:/Users/hymary/repos/ai-answers/agents/prompts/judges/SemanticComparatorPrompt.js)
- Define the "Judge" system prompt with JSON schema output for semantic comparison.

#### [NEW] [agents/prompts/judges/SafetyEvaluatorPrompt.js](file:///c:/Users/hymary/repos/ai-answers/agents/prompts/judges/SafetyEvaluatorPrompt.js)
- Define the system prompt for safety analysis.

#### [NEW] [agents/prompts/judges/BiasEvaluatorPrompt.js](file:///c:/Users/hymary/repos/ai-answers/agents/prompts/judges/BiasEvaluatorPrompt.js)
- Define the system prompt for bias analysis.

#### [NEW] [services/experimental/analyzers/SemanticComparator.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/SemanticComparator.js)
- **Type**: Comparator
- Extends `AnalyzerBase`.
- Uses `AgentFactory.createJudgeLLM`.
- Uses `agents/prompts/judges/SemanticComparatorPrompt.js`.

#### [NEW] [services/experimental/analyzers/SafetyEvaluator.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/SafetyEvaluator.js)
- **Type**: Evaluator
- Extends `AnalyzerBase`.
- Uses `AgentFactory.createSafetyLLM`.
- Uses `agents/prompts/judges/SafetyEvaluatorPrompt.js`.

#### [NEW] [services/experimental/analyzers/BiasEvaluator.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/BiasEvaluator.js)
- **Type**: Evaluator
- Extends `AnalyzerBase`.
- Uses `AgentFactory.createSafetyLLM`.
- Uses `agents/prompts/judges/BiasEvaluatorPrompt.js`.

### Dataset Management (New Feature)

#### [NEW] [models/experimentalDataset.js](file:///c:/Users/hymary/repos/ai-answers/models/experimentalDataset.js)
Schema for a reusable dataset with proper validation:

```javascript
const ExperimentalDatasetSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true, 
    maxLength: 255
  },
  description: { type: String, default: '', maxLength: 2000 },
  type: { 
    type: String, 
    required: true, 
    enum: ['question-only', 'qa-pair', 'evaluation-set', 'batch-output'] 
  },
  rowCount: { type: Number, default: 0 },
  columns: [{ 
    name: { type: String, required: true },
    type: { type: String, enum: ['string', 'number', 'boolean', 'json'] }
  }],
  sourceType: { 
    type: String, 
    enum: ['upload', 'promoted-from-batch'],
    default: 'upload'
  },
  sourceBatchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ExperimentalBatch' 
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  contentHash: { type: String, index: true },
}, { 
  timestamps: true,
  versionKey: false
});

// Indexes
ExperimentalDatasetSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
ExperimentalDatasetSchema.index({ createdAt: -1 });
ExperimentalDatasetSchema.index({ type: 1 });
```

#### [NEW] [models/experimentalDatasetRow.js](file:///c:/Users/hymary/repos/ai-answers/models/experimentalDatasetRow.js)
Stores the actual data for each row in a dataset:

```javascript
const ExperimentalDatasetRowSchema = new mongoose.Schema({
  experimentalDataset: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExperimentalDataset',
    required: true,
  },
  rowIndex: { type: Number, required: true },
  pairKey: { type: String, index: true }, // Deterministic row-matching key for comparators
  data: { type: mongoose.Schema.Types.Mixed, required: true },
}, {
  timestamps: true,
  versionKey: false
});

ExperimentalDatasetRowSchema.index({ experimentalDataset: 1, rowIndex: 1 });
ExperimentalDatasetRowSchema.index({ experimentalDataset: 1, pairKey: 1 });
```

#### [NEW] [services/experimental/ExperimentalDatasetService.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/ExperimentalDatasetService.js)
Service for dataset CRUD operations with validation:

```javascript
class ExperimentalDatasetService {
  /**
   * Validate uploaded file and create dataset with rows.
   * @throws {ValidationError} If file format is invalid or required columns missing
   */
  async createFromUpload(file, metadata, userId) {
    // Parse file
    const rows = await this._parseFile(file);
    
    // Validate structure
    const validation = this._validateRows(rows, metadata.type);
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }
    
    // Check for duplicate name
    const existing = await ExperimentalDataset.findOne({ name: metadata.name });
    if (existing) {
      throw new DuplicateError(`Dataset "${metadata.name}" already exists`);
    }

    // Duplicate-content warning (non-blocking by default)
    const contentHash = this._computeContentHash(rows);
    const existingByContent = await ExperimentalDataset.findOne({ contentHash });
    const duplicateContentWarning = existingByContent ? {
      existingDatasetId: existingByContent._id,
      existingName: existingByContent.name,
    } : null;
    
    // Create dataset and rows in transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const dataset = await ExperimentalDataset.create([{
        ...metadata,
        rowCount: rows.length,
        columns: this._inferColumns(rows),
        contentHash,
        createdBy: userId,
      }], { session });
      
      const datasetRows = rows.map((row, idx) => ({
        experimentalDataset: dataset[0]._id,
        rowIndex: idx + 1,
        pairKey: this._buildPairKey(row, metadata.pairKeyColumn),
        data: row,
      }));
      
      await ExperimentalDatasetRow.insertMany(datasetRows, { session });
      await session.commitTransaction();
      return { dataset: dataset[0], warning: duplicateContentWarning };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
  
  _validateRows(rows, type) {
    const errors = [];
    const requiredColumns = {
      'question-only': ['question'],
      'qa-pair': ['question', 'answer'],
      'evaluation-set': ['question', 'answer'],
    };
    
    const required = requiredColumns[type] || [];
    if (rows.length === 0) {
      errors.push('File contains no data rows');
    }
    
    // Check first row for required columns
    if (rows.length > 0) {
      const firstRow = rows[0];
      for (const col of required) {
        // Case-insensitive column check
        const hasCol = Object.keys(firstRow).some(
          k => k.toLowerCase() === col.toLowerCase()
        );
        if (!hasCol) {
          errors.push(`Missing required column: "${col}"`);
        }
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

#### [NEW] [api/experimental/dataset-upload.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/dataset-upload.js)
- **POST /api/experimental/datasets/upload**
- Endpoint to upload a CSV/Excel and create a Dataset + Rows.
- Returns validation errors with specific row/column information.

#### [NEW] [api/experimental/dataset-list.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/dataset-list.js)
- **GET /api/experimental/datasets**
- List available datasets.

#### [NEW] [api/experimental/dataset-delete.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/dataset-delete.js)
- **DELETE /api/experimental/datasets/:id**
- Hard-deletes dataset and all rows in a transaction.
- UI requires explicit confirmation and shows a "Download Excel backup" link before delete is confirmed.

#### [NEW] [api/experimental/batch-promote.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/batch-promote.js)
- **POST /api/experimental/batches/:id/promote**
- Endpoint to trigger `ExperimentalBatchService.promoteToDataset`.

#### [NEW] [src/pages/experimental/ExperimentalDatasetsPage.js](file:///c:/Users/hymary/repos/ai-answers/src/pages/experimental/ExperimentalDatasetsPage.js)
- **UI Page**: Displays a list of uploaded datasets.
- Columns: Name, Type (Question Set, QA Pair, Evaluation Set), Row Count, Created Date.
- Actions: Upload new dataset, View details (preview rows), Delete.

#### [MODIFY] [src/pages/experimental/ExperimentalAnalysisPage.js](file:///c:/Users/hymary/repos/ai-answers/src/pages/experimental/ExperimentalAnalysisPage.js)
- **Fetch analyzers from API** instead of hardcoding:
```javascript
useEffect(() => {
  const fetchAnalyzers = async () => {
    const response = await fetch('/api/experimental/analyzers');
    const data = await response.json();
    setAnalyzers(data);
  };
  fetchAnalyzers();
}, []);
```
- **Input Selection**: Replace/augment file upload with a "Select Dataset" dropdown.
- **Output Options**: Add checkbox "Save results as new Dataset" upon completion.
- **Progress Display**: Connect to SSE endpoint for real-time progress updates.

---

### Error Handling

### Security / Authorization

All experimental endpoints are admin-only and must be wrapped with auth middleware:

```javascript
import { authMiddleware, adminMiddleware, withProtection } from '../../middleware/auth.js';

export default function handler(req, res) {
  return withProtection(actualHandler, authMiddleware, adminMiddleware)(req, res);
}
```

#### Dataset Upload Validation
When uploading datasets, provide clear error messages for common issues:

```javascript
// api/experimental/dataset-upload.js
const handleUpload = async (req, res) => {
  try {
    const result = await ExperimentalDatasetService.createFromUpload(
      req.file, 
      req.body, 
      req.user._id
    );
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Dataset validation failed',
        details: err.errors, // Array of specific issues
      });
    }
    if (err instanceof DuplicateError) {
      return res.status(409).json({
        error: 'DUPLICATE_NAME',
        message: err.message,
      });
    }
    // Generic error
    return res.status(500).json({
      error: 'UPLOAD_FAILED',
      message: 'Failed to process uploaded file',
    });
  }
};
```

#### Batch Item Error Tracking
Each `ExperimentalBatchItem` tracks errors individually:

```javascript
// In _processItem catch block:
catch (err) {
  item.status = 'failed';
  item.error = err.message;
  item.errorCode = err.code || 'PROCESSING_ERROR';
  item.errorStack = process.env.NODE_ENV !== 'production' ? err.stack : undefined;
  await item.save();
}
```

#### Standardized Outcome Mapping (Required)
All batch rows must map graph outcomes to a normalized envelope so refusal/error behavior is queryable in datasets and exports.

```javascript
// Row-level outcome fields persisted on ExperimentalBatchItem
{
  status: 'completed' | 'refused' | 'failed' | 'cancelled' | 'skipped',
  outcomeCode: string | null, // e.g. SHORT_QUERY, REDACTION_BLOCK, POLICY_REFUSAL, PROCESSING_ERROR
  outcomeText: string | null, // human-readable explanation / refusal text
  error: string | null,       // raw error message where applicable
}
```

Recommended minimum mapping:
- Short query validation refusal -> `status: 'refused'`, `outcomeCode: 'SHORT_QUERY'`
- Redaction blocking refusal -> `status: 'refused'`, `outcomeCode: 'REDACTION_BLOCK'`
- Safety/policy refusal -> `status: 'refused'`, `outcomeCode: 'POLICY_REFUSAL'`
- Runtime/infra error -> `status: 'failed'`, `outcomeCode: 'PROCESSING_ERROR'`

These fields must be included in:
- batch status item payload
- batch export payload
- promoted dataset rows
- flattened CSV/Excel export (`outcomeStatus`, `outcomeCode`, `outcomeText`)

#### Outcome Code Dictionary (Canonical)
The following codes are based on current graph + prompt behavior and must be used consistently across API/DB/export/tests.

| outcomeCode | status | Source signal | Notes |
|---|---|---|---|
| `SHORT_QUERY` | `refused` | `ShortQueryValidation` thrown in validate step | Include fallback search URL in row metadata if present |
| `REDACTION_BLOCK` | `refused` | `RedactionError` with blocked redaction/manipulation/profanity/threat/private content | Include `redactedItems` summary in metadata |
| `PII_DETECTED` | `refused` | `RedactionError` from PII flow (`PII detected in user message`) | Store masked/redacted text only |
| `TRANSLATION_CONTENT_FILTER` | `refused` | translation service returns `blocked: true`, then graph throws redaction error | Normalize provider-specific content filter errors here |
| `NOT_GC_SCOPE` | `refused` | parsed answer has `answerType = 'not-gc'` | Covers out-of-scope/manipulative/not-found-on-GC responses |
| `PT_MUNI_SCOPE` | `refused` | parsed answer has `answerType = 'pt-muni'` | Provincial/territorial/municipal jurisdiction |
| `CLARIFYING_QUESTION` | `refused` | parsed answer has `answerType = 'clarifying-question'` | Incomplete user info; intentionally no citation |
| `PROCESSING_ERROR` | `failed` | uncaught/unknown runtime error in processing | fallback error bucket |
| `BATCH_CANCELLED` | `cancelled` | item cancelled by admin batch cancel action | use `cancellationReason` detail |
| `MISSING_IN_BASELINE` | `skipped` | comparator pairing mismatch | baseline row missing for pairKey |
| `MISSING_IN_CANDIDATE` | `skipped` | comparator pairing mismatch | candidate row missing for pairKey |

Mapping precedence (first match wins):
1. Cancellation/skipped statuses set by batch orchestration (`cancelled`/`skipped`)
2. Graph exception classes (`ShortQueryValidation`, `RedactionError`)
3. Parsed answer type (`not-gc`, `pt-muni`, `clarifying-question`)
4. Fallback runtime error (`PROCESSING_ERROR`)

---

### Progress Events

#### Server-Sent Events (SSE) Endpoint
Real-time progress streaming for batch operations:

```javascript
// api/experimental/batch-progress.js
export default async function handler(req, res) {
  const { id: batchId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const sendProgress = async () => {
    const batch = await ExperimentalBatch.findById(batchId);
    if (!batch) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Batch not found' })}\n\n`);
      res.end();
      return false;
    }
    
    const progress = {
      status: batch.status,
      summary: batch.summary,
      percentComplete: batch.summary.total > 0 
        ? Math.round(((batch.summary.completed + batch.summary.failed) / batch.summary.total) * 100)
        : 0,
      updatedAt: batch.updatedAt,
    };
    
    res.write(`event: progress\ndata: ${JSON.stringify(progress)}\n\n`);
    
    return !['completed', 'failed', 'cancelled'].includes(batch.status);
  };
  
  // Initial send
  const shouldContinue = await sendProgress();
  if (!shouldContinue) {
    res.end();
    return;
  }
  
  // Poll every 2 seconds
  const interval = setInterval(async () => {
    const shouldContinue = await sendProgress();
    if (!shouldContinue) {
      clearInterval(interval);
      res.end();
    }
  }, 2000);
  
  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
}
```

#### Frontend Progress Component
```javascript
// src/components/experimental/BatchProgressBar.js
export function BatchProgressBar({ batchId }) {
  const [progress, setProgress] = useState(null);
  
  useEffect(() => {
    const eventSource = new EventSource(`/api/experimental/batches/${batchId}/progress`);
    
    eventSource.addEventListener('progress', (e) => {
      setProgress(JSON.parse(e.data));
    });
    
    eventSource.addEventListener('error', () => {
      eventSource.close();
    });
    
    return () => eventSource.close();
  }, [batchId]);
  
  if (!progress) return <span>Loading...</span>;
  
  return (
    <div>
      <progress value={progress.percentComplete} max="100" />
      <span>{progress.summary.completed}/{progress.summary.total} completed</span>
      {progress.summary.failed > 0 && (
        <span className="text-red"> ({progress.summary.failed} failed)</span>
      )}
    </div>
  );
}
```

---

### Cancellation

#### Schema Requirements

`ExperimentalBatchItem` schema must include cancellation/skipped semantics:

```javascript
status: {
  type: String,
  enum: ['pending', 'processing', 'completed', 'refused', 'failed', 'cancelled', 'skipped'],
  default: 'pending'
},
outcomeCode: { type: String }, // standardized refusal/error code
outcomeText: { type: String }, // standardized refusal/error message
cancellationReason: { type: String },
skipReason: { type: String },
```

#### Batch Cancellation Flow
1. User clicks "Cancel" button on in-progress batch
2. API sets batch status to `cancelled`
3. Queue processor checks batch status before processing each item
4. Pending items are marked as `cancelled` without processing, with a persisted `cancellationReason`
5. Currently in-flight items complete normally

```javascript
// services/experimental/ExperimentalBatchService.js
async cancelBatch(batchId) {
  const batch = await ExperimentalBatch.findById(batchId);
  
  if (!batch) {
    throw new Error('Batch not found');
  }
  
  if (!['pending', 'processing'].includes(batch.status)) {
    throw new Error(`Cannot cancel batch with status: ${batch.status}`);
  }
  
  // Update batch status
  batch.status = 'cancelled';
  await batch.save();
  
  // Mark all pending items as cancelled
  await ExperimentalBatchItem.updateMany(
    { experimentalBatch: batchId, status: 'pending' },
    { status: 'cancelled', cancellationReason: 'batch_cancelled_by_admin' }
  );
  
  // Update summary
  await this._updateBatchSummary(batchId);
  
  return batch;
}

// In _processItem - check for cancellation
async _processItem(batchId, itemId) {
  const batch = await ExperimentalBatch.findById(batchId);
  
  // Early exit if batch was cancelled
  if (batch.status === 'cancelled') {
    await ExperimentalBatchItem.findByIdAndUpdate(itemId, {
      status: 'cancelled',
      cancellationReason: 'batch_cancelled_before_item_start'
    });
    return { batchId, itemId, status: 'cancelled' };
  }
  
  // ... continue processing
}
```

#### API Endpoint
```javascript
// api/experimental/batch-cancel.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { id } = req.params;
  
  try {
    const batch = await ExperimentalBatchService.cancelBatch(id);
    return res.json({ 
      message: 'Batch cancelled successfully',
      batch 
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
```

---

### Duplicate Detection

#### Dataset Name Uniqueness
Datasets are uniquely identified by name (case-insensitive):

```javascript
// models/experimentalDataset.js
ExperimentalDatasetSchema.index(
  { name: 1 }, 
  { 
    unique: true, 
    collation: { locale: 'en', strength: 2 } // Case-insensitive
  }
);
```

#### Content Hash for Deduplication (Optional)
Detect duplicate content by hashing and return warning metadata:

```javascript
// services/experimental/ExperimentalDatasetService.js
_computeContentHash(rows) {
  const content = JSON.stringify(rows.slice(0, 100)); // Hash first 100 rows
  return crypto.createHash('sha256').update(content).digest('hex');
}

async createFromUpload(file, metadata, userId) {
  const rows = await this._parseFile(file);
  const contentHash = this._computeContentHash(rows);
  
  // Check for duplicate content
  const existingByContent = await ExperimentalDataset.findOne({ contentHash });
  
  if (existingByContent) {
    warning = {
      code: 'DUPLICATE_CONTENT',
      existingDatasetId: existingByContent._id,
      existingName: existingByContent.name
    };
  }
  
  // Continue creation; API returns warning to admin caller
}
```

---

### Localization

#### Locale Files
Add translations for experimental features in both languages:

**src/locales/en.json**:
```json
{
  "experimental": {
    "analysis": {
      "title": "Experimental Analysis",
      "selectAnalyzer": "Select Analyzer",
      "choose": "-- Choose an analyzer --",
      "runAnalysis": "Run Analysis",
      "processing": "Processing...",
      "cancelBatch": "Cancel",
      "cancelConfirm": "Are you sure you want to cancel this batch?",
      "progress": "Progress",
      "completed": "Completed",
      "failed": "Failed"
    },
    "datasets": {
      "title": "Datasets",
      "upload": "Upload Dataset",
      "uploadDescription": "Upload a CSV or Excel file",
      "name": "Name",
      "type": "Type",
      "rowCount": "Rows",
      "createdAt": "Created",
      "actions": "Actions",
      "delete": "Delete",
      "deleteConfirm": "Are you sure you want to delete this dataset?",
      "preview": "Preview",
      "promote": "Save as Dataset",
      "promoteSuccess": "Dataset created successfully",
      "types": {
        "question-only": "Questions Only",
        "qa-pair": "Q&A Pairs",
        "evaluation-set": "Evaluation Set",
        "batch-output": "Batch Output"
      },
      "errors": {
        "duplicateName": "A dataset with this name already exists",
        "invalidFormat": "Invalid file format. Please upload CSV or Excel.",
        "missingColumns": "Missing required columns: {{columns}}",
        "emptyFile": "The uploaded file contains no data"
      }
    },
    "batches": {
      "title": "Batches",
      "status": {
        "pending": "Pending",
        "processing": "Processing",
        "completed": "Completed",
        "failed": "Failed",
        "cancelled": "Cancelled"
      }
    }
  }
}
```

**src/locales/fr.json**:
```json
{
  "experimental": {
    "analysis": {
      "title": "Analyse expÃ©rimentale",
      "selectAnalyzer": "SÃ©lectionner l'analyseur",
      "choose": "-- Choisir un analyseur --",
      "runAnalysis": "Lancer l'analyse",
      "processing": "En cours...",
      "cancelBatch": "Annuler",
      "cancelConfirm": "Voulez-vous vraiment annuler ce lot?",
      "progress": "Progression",
      "completed": "TerminÃ©",
      "failed": "Ã‰chouÃ©"
    },
    "datasets": {
      "title": "Ensembles de donnÃ©es",
      "upload": "TÃ©lÃ©verser un ensemble de donnÃ©es",
      "uploadDescription": "TÃ©lÃ©verser un fichier CSV ou Excel",
      "name": "Nom",
      "type": "Type",
      "rowCount": "Lignes",
      "createdAt": "CrÃ©Ã© le",
      "actions": "Actions",
      "delete": "Supprimer",
      "deleteConfirm": "Voulez-vous vraiment supprimer cet ensemble de donnÃ©es?",
      "preview": "AperÃ§u",
      "promote": "Enregistrer comme ensemble de donnÃ©es",
      "promoteSuccess": "Ensemble de donnÃ©es crÃ©Ã© avec succÃ¨s",
      "types": {
        "question-only": "Questions seulement",
        "qa-pair": "Paires Q/R",
        "evaluation-set": "Ensemble d'Ã©valuation",
        "batch-output": "Sortie de lot"
      },
      "errors": {
        "duplicateName": "Un ensemble de donnÃ©es avec ce nom existe dÃ©jÃ ",
        "invalidFormat": "Format de fichier invalide. Veuillez tÃ©lÃ©verser un fichier CSV ou Excel.",
        "missingColumns": "Colonnes requises manquantes : {{columns}}",
        "emptyFile": "Le fichier tÃ©lÃ©versÃ© ne contient aucune donnÃ©e"
      }
    },
    "batches": {
      "title": "Lots",
      "status": {
        "pending": "En attente",
        "processing": "En cours",
        "completed": "TerminÃ©",
        "failed": "Ã‰chouÃ©",
        "cancelled": "AnnulÃ©"
      }
    }
  }
}
```

---

### Cleanup

#### Automated Cleanup Job
Scheduled job to clean up old datasets and batches:

```javascript
// services/experimental/ExperimentalCleanupService.js
import cron from 'node-cron';

const RETENTION_DAYS = parseInt(process.env.EXPERIMENTAL_RETENTION_DAYS, 10) || 90;

class ExperimentalCleanupService {
  constructor() {
    // Run daily at 3 AM
    this.job = cron.schedule('0 3 * * *', () => this.runCleanup(), {
      scheduled: false
    });
  }
  
  start() {
    this.job.start();
    console.log('[ExperimentalCleanupService] Cleanup job scheduled');
  }
  
  stop() {
    this.job.stop();
  }
  
  async runCleanup() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    console.log(`[ExperimentalCleanupService] Running cleanup for items older than ${cutoffDate.toISOString()}`);
    
    try {
      // Delete old completed/failed/cancelled batches and their items
      const oldBatches = await ExperimentalBatch.find({
        status: { $in: ['completed', 'failed', 'cancelled'] },
        updatedAt: { $lt: cutoffDate }
      });
      
      for (const batch of oldBatches) {
        await ExperimentalBatchItem.deleteMany({ experimentalBatch: batch._id });
        await batch.deleteOne();
      }
      console.log(`[ExperimentalCleanupService] Removed ${oldBatches.length} old batches`);
      
    } catch (err) {
      console.error('[ExperimentalCleanupService] Cleanup failed:', err);
    }
  }
}

export default new ExperimentalCleanupService();
```

#### Environment Configuration
```bash
# .env
EXPERIMENTAL_RETENTION_DAYS=90  # Days to keep completed/failed/cancelled batches
```

#### Manual Cleanup Endpoint (Admin only)
```javascript
// api/experimental/cleanup.js
export default withAdmin(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const result = await ExperimentalCleanupService.runCleanup();
  return res.json({ message: 'Cleanup completed', ...result });
});
```

### Tests

#### Unit Tests (Required)

#### [NEW] [services/__tests__/ExperimentalBatchService.test.js](file:///c:/Users/hymary/repos/ai-answers/services/__tests__/ExperimentalBatchService.test.js)
- Creates batch from direct items and enqueues all rows.
- Creates batch from `datasetId` and preserves source ordering.
- Uses graph app (`getGraphApp` + `graphRequestContext`) and does not call `AnswerGenerationService`.
- Persists `analysisResults.<analyzerId>` and `analysisErrors.<analyzerId>` in uniform shape.
- Supports multi-analyzer execution for the same row.
- Handles comparator pairing by `pairKey`.
- Sets `skipped` with `MISSING_IN_BASELINE` and `MISSING_IN_CANDIDATE` for unmatched pairs.
- Maps refusal/error outcomes to canonical codes:
  - `SHORT_QUERY`
  - `REDACTION_BLOCK`
  - `PII_DETECTED`
  - `TRANSLATION_CONTENT_FILTER`
  - `NOT_GC_SCOPE`
  - `PT_MUNI_SCOPE`
  - `CLARIFYING_QUESTION`
  - `PROCESSING_ERROR`
- Cancellation behavior:
  - pending batch cancel -> pending rows become `cancelled` with `BATCH_CANCELLED`.
  - in-progress cancel -> in-flight rows finish; no new rows start.
- Promotion behavior:
  - promotes all rows (completed + refused + failed + cancelled + skipped).
  - sets `isProcessable` correctly (`true` only for completed).
  - includes `outcomeStatus`, `outcomeCode`, `outcomeText`.
  - returns warning when non-completed rows are included.

#### [NEW] [services/__tests__/ExperimentalDatasetService.test.js](file:///c:/Users/hymary/repos/ai-answers/services/__tests__/ExperimentalDatasetService.test.js)
- Validates required columns by dataset type.
- Rejects empty/invalid files.
- Enforces case-insensitive duplicate dataset name uniqueness.
- Computes and stores `contentHash`.
- Returns duplicate-content warning (`DUPLICATE_CONTENT`) without blocking upload.
- Generates `pairKey` from selected shared key column.
- Falls back to normalized question hash when shared key missing.
- Hard delete removes dataset and rows transactionally.
- Export returns Excel-compatible flattened output including outcome fields.

#### [NEW] [services/experimental/__tests__/ExperimentalAnalyzerRegistry.test.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/__tests__/ExperimentalAnalyzerRegistry.test.js)
- Auto-loads analyzers from folder.
- Registers stable analyzer IDs (kebab-case).
- Returns metadata used by UI/API.
- Returns callable processors by analyzer ID.
- Respects analyzer-specific concurrency hints.

#### [NEW] [services/experimental/analyzers/__tests__/SemanticComparator.test.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/__tests__/SemanticComparator.test.js)
- Validates required comparison input.
- Produces deterministic structured output.
- Handles exact match and non-match.
- Handles model failure with structured analyzer error payload.

#### [NEW] [services/experimental/analyzers/__tests__/SafetyEvaluator.test.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/__tests__/SafetyEvaluator.test.js)
- Validates single-input evaluator flow.
- Returns normalized safety output.
- Handles refusal/error classification from model output.

#### [NEW] [services/experimental/analyzers/__tests__/BiasEvaluator.test.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/__tests__/BiasEvaluator.test.js)
- Validates single-input evaluator flow.
- Returns normalized bias output.
- Handles model failure with structured analyzer error payload.

#### [NEW] [api/experimental/__tests__/experimental-auth.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/experimental-auth.test.js)
- Verifies all `/api/experimental/*` endpoints require admin auth.
- Verifies non-admin requests return forbidden.
- Verifies admin requests succeed for happy-path mocks.

#### [NEW] [api/experimental/__tests__/batch-progress.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/batch-progress.test.js)
- Establishes SSE connection.
- Streams summary and analyzer-level progress payload.
- Closes stream on terminal statuses.
- Cleans up interval on client disconnect.

#### [NEW] [api/experimental/__tests__/batch-cancel.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/batch-cancel.test.js)
- Cancels pending/processing batch.
- Rejects cancel for completed/failed/cancelled batch.
- Persists cancellation reason/code on affected rows.

#### [NEW] [api/experimental/__tests__/dataset-upload.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/dataset-upload.test.js)
- Successful CSV and Excel upload paths.
- Validation errors include actionable details.
- Duplicate-name rejection path.
- Duplicate-content warning path (non-blocking).

#### [NEW] [api/experimental/__tests__/dataset-delete.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/dataset-delete.test.js)
- Hard delete removes dataset + rows.
- Delete requires explicit confirmation flag in request contract.
- Returns conflict/error when dataset not found.

#### [NEW] [api/experimental/__tests__/batch-promote.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/batch-promote.test.js)
- Promotes terminal batches (`completed`, `failed`, `cancelled`).
- Rejects promotion for running batch.
- Includes non-completed rows with outcome fields.
- Returns warning when non-completed rows exist.

#### E2E Tests (Required)

#### [NEW] [tests/e2e/experimental-admin-auth.spec.js](file:///c:/Users/hymary/repos/ai-answers/tests/e2e/experimental-admin-auth.spec.js)
- Non-admin cannot access experimental pages/endpoints.
- Admin can access datasets and analysis pages.

#### [NEW] [tests/e2e/experimental-dataset-upload.spec.js](file:///c:/Users/hymary/repos/ai-answers/tests/e2e/experimental-dataset-upload.spec.js)
- Upload CSV/Excel dataset successfully.
- Show validation errors for malformed input.
- Show duplicate-content warning and allow continue.

#### [NEW] [tests/e2e/experimental-batch-run-and-progress.spec.js](file:///c:/Users/hymary/repos/ai-answers/tests/e2e/experimental-batch-run-and-progress.spec.js)
- Create batch from dataset.
- Process batch server-side.
- Live progress updates via SSE with analyzer-level counts.
- Status transitions are visible in UI.

#### [NEW] [tests/e2e/experimental-refusal-outcomes.spec.js](file:///c:/Users/hymary/repos/ai-answers/tests/e2e/experimental-refusal-outcomes.spec.js)
- Inject rows that trigger short query, redaction/PII block, not-gc, pt-muni, and clarifying-question.
- Verify output rows contain standardized `outcomeCode` and `outcomeText`.
- Verify rows remain in batch export and promoted dataset.

#### [NEW] [tests/e2e/experimental-cancel-batch.spec.js](file:///c:/Users/hymary/repos/ai-answers/tests/e2e/experimental-cancel-batch.spec.js)
- Cancel running batch from UI.
- Pending rows marked cancelled with reason.
- In-flight rows complete; no new rows start.

#### [NEW] [tests/e2e/experimental-promote-partial.spec.js](file:///c:/Users/hymary/repos/ai-answers/tests/e2e/experimental-promote-partial.spec.js)
- Promote mixed-outcome batch to dataset.
- Dataset includes refused/failed/cancelled/skipped rows.
- `isProcessable` false for non-completed rows.
- Promotion warning surfaced in UI.

#### [NEW] [tests/e2e/experimental-comparator-pairing.spec.js](file:///c:/Users/hymary/repos/ai-answers/tests/e2e/experimental-comparator-pairing.spec.js)
- Pairing by shared key column works.
- Fallback hash pairing works when shared key not provided.
- Unmatched rows are marked skipped with expected codes.

#### [NEW] [tests/e2e/experimental-dataset-hard-delete.spec.js](file:///c:/Users/hymary/repos/ai-answers/tests/e2e/experimental-dataset-hard-delete.spec.js)
- Delete flow shows backup download link.
- After confirmation, dataset is permanently deleted.
- Excel export before delete succeeds.

## File Structure Overview

Here is the location of the files involved in this feature.

```text
ai-answers/
â”œâ”€â”€ services/
â”‚   â”œâ”€â”€ experimental/
â”‚   â”‚   â”œâ”€â”€ ExperimentalBatchService.js       # [MODIFY] Core batch logic (graph integration, cancellation)
â”‚   â”‚   â”œâ”€â”€ ExperimentalDatasetService.js     # [NEW] Dataset CRUD + validation
â”‚   â”‚   â”œâ”€â”€ ExperimentalAnalyzerRegistry.js   # [MODIFY] Auto-loads analyzers from `analyzers/`
â”‚   â”‚   â”œâ”€â”€ ExperimentalQueueService.js       # [EXISTING] Queue management
â”‚   â”‚   â”œâ”€â”€ ExperimentalCleanupService.js     # [NEW] Scheduled cleanup job
â”‚   â”‚   â”œâ”€â”€ analyzers/                        # [NEW] Evaluators and Comparators
â”‚   â”‚   â”‚   â”œâ”€â”€ AnalyzerBase.js               # [NEW] Base class interface
â”‚   â”‚   â”‚   â”œâ”€â”€ SemanticComparator.js
â”‚   â”‚   â”‚   â”œâ”€â”€ SafetyEvaluator.js
â”‚   â”‚   â”‚   â”œâ”€â”€ BiasEvaluator.js
â”‚   â”‚   â”‚   â””â”€â”€ __tests__/
â”‚   â”‚   â”‚       â”œâ”€â”€ SemanticComparator.test.js
â”‚   â”‚   â”‚       â””â”€â”€ SafetyEvaluator.test.js
â”‚   â”‚   â””â”€â”€ __tests__/
â”‚   â”‚       â”œâ”€â”€ ExperimentalQueueService.test.js  # [EXISTING]
â”‚   â”‚       â””â”€â”€ ExperimentalAnalyzerRegistry.test.js  # [NEW]
â”‚   â””â”€â”€ __tests__/
â”‚       â”œâ”€â”€ ExperimentalBatchService.test.js  # [NEW]
â”‚       â””â”€â”€ ExperimentalDatasetService.test.js  # [NEW]
â”œâ”€â”€ agents/
â”‚   â”œâ”€â”€ AgentFactory.js                       # [MODIFY] Add createJudgeLLM, createSafetyLLM
â”‚   â””â”€â”€ prompts/
â”‚       â””â”€â”€ judges/                           # [NEW] Group judge prompts
â”‚           â”œâ”€â”€ SemanticComparatorPrompt.js
â”‚           â”œâ”€â”€ SafetyEvaluatorPrompt.js
â”‚           â””â”€â”€ BiasEvaluatorPrompt.js
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ locales/
â”‚   â”‚   â”œâ”€â”€ en.json                           # [MODIFY] Add experimental.* keys
â”‚   â”‚   â””â”€â”€ fr.json                           # [MODIFY] Add experimental.* keys
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â””â”€â”€ experimental/
â”‚   â”‚       â””â”€â”€ BatchProgressBar.js           # [NEW] SSE progress component
â”‚   â””â”€â”€ pages/
â”‚       â””â”€â”€ experimental/
â”‚           â”œâ”€â”€ ExperimentalDatasetsPage.js   # [NEW] Dataset management UI
â”‚           â””â”€â”€ ExperimentalAnalysisPage.js   # [MODIFY] Fetch analyzers, dataset selection, progress
â”œâ”€â”€ models/
â”‚   â”œâ”€â”€ experimentalBatch.js                  # [EXISTING] Batch schema
â”‚   â”œâ”€â”€ experimentalBatchItem.js              # [EXISTING] Item schema
â”‚   â”œâ”€â”€ experimentalDataset.js                # [NEW] Dataset schema with validation
â”‚   â””â”€â”€ experimentalDatasetRow.js             # [NEW] Dataset Row schema
â””â”€â”€ api/
    â””â”€â”€ experimental/
        â”œâ”€â”€ experimental-batch-create.js      # [EXISTING]
        â”œâ”€â”€ experimental-batch-delete.js      # [EXISTING]
        â”œâ”€â”€ experimental-batch-export.js      # [EXISTING]
        â”œâ”€â”€ experimental-batch-list.js        # [EXISTING]
        â”œâ”€â”€ experimental-batch-process.js     # [EXISTING]
        â”œâ”€â”€ experimental-batch-status.js      # [EXISTING]
        â”œâ”€â”€ experimental-analyzers-list.js    # [NEW] GET /analyzers
        â”œâ”€â”€ batch-cancel.js                   # [NEW] POST /batches/:id/cancel
        â”œâ”€â”€ batch-progress.js                 # [NEW] GET /batches/:id/progress (SSE)
        â”œâ”€â”€ batch-promote.js                  # [NEW] POST /batches/:id/promote
        â”œâ”€â”€ dataset-upload.js                 # [NEW] POST /datasets/upload
        â”œâ”€â”€ dataset-list.js                   # [NEW] GET /datasets
        â”œâ”€â”€ dataset-delete.js                 # [NEW] DELETE /datasets/:id
        â”œâ”€â”€ cleanup.js                        # [NEW] POST /cleanup (admin)
        â””â”€â”€ __tests__/
            â”œâ”€â”€ batch-progress.test.js        # [NEW]
            â”œâ”€â”€ batch-cancel.test.js          # [NEW]
            â””â”€â”€ dataset-upload.test.js        # [NEW]
```

## Verification Plan

### TDD Completion Criteria (Must All Pass)
1. All required unit tests pass.
2. All required E2E tests pass.
3. No skipped or quarantined tests in experimental suites.
4. CI test exit code is 0 for both unit and E2E stages.

### Automated Unit Test Commands
```bash
npm test services/__tests__/ExperimentalBatchService.test.js
npm test services/__tests__/ExperimentalDatasetService.test.js
npm test services/experimental/__tests__/ExperimentalAnalyzerRegistry.test.js
npm test services/experimental/analyzers/__tests__/SemanticComparator.test.js
npm test services/experimental/analyzers/__tests__/SafetyEvaluator.test.js
npm test services/experimental/analyzers/__tests__/BiasEvaluator.test.js
npm test api/experimental/__tests__/experimental-auth.test.js
npm test api/experimental/__tests__/batch-progress.test.js
npm test api/experimental/__tests__/batch-cancel.test.js
npm test api/experimental/__tests__/dataset-upload.test.js
npm test api/experimental/__tests__/dataset-delete.test.js
npm test api/experimental/__tests__/batch-promote.test.js
```

### Automated E2E Test Commands
```bash
npx playwright test tests/e2e/experimental-admin-auth.spec.js --reporter=list
npx playwright test tests/e2e/experimental-dataset-upload.spec.js --reporter=list
npx playwright test tests/e2e/experimental-batch-run-and-progress.spec.js --reporter=list
npx playwright test tests/e2e/experimental-refusal-outcomes.spec.js --reporter=list
npx playwright test tests/e2e/experimental-cancel-batch.spec.js --reporter=list
npx playwright test tests/e2e/experimental-promote-partial.spec.js --reporter=list
npx playwright test tests/e2e/experimental-comparator-pairing.spec.js --reporter=list
npx playwright test tests/e2e/experimental-dataset-hard-delete.spec.js --reporter=list
```

### CI Aggregate Commands
```bash
npm test -- --grep "Experimental"
npx playwright test tests/e2e/experimental-*.spec.js --reporter=list
```

### Optional Manual Smoke (Non-Blocking)
Manual walkthrough can still be run for UX confidence, but implementation is considered complete only when all automated unit and E2E suites above pass.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_CONCURRENCY` | `2` | Max concurrent batch items being processed |
| `EXPERIMENTAL_RETENTION_DAYS` | `90` | Days to retain completed/failed/cancelled batches before cleanup |
| `REDIS_URL` | (none) | Redis URL for BullMQ; if not set, uses in-memory queue |

## Future Optimizations (Post-MVP)

-   **Unified Worker Pool**: Migrate `EvaluationService` to use `ExperimentalQueueService` for a single, system-wide job queue.
-   **Prompt Management**: Move hardcoded prompts to `SettingsService` or a dedicated Prompt Registry for easier tuning without code changes.
-   **Advanced Visualization**: Add charts/graphs to the Analysis Page to visualize drift over time.
-   **Batch-mode Graph Variant**: Create a dedicated `BatchModeGraph` that skips certain nodes (like persist) to improve throughput.
-   **Webhook Notifications**: Allow users to configure webhooks for batch completion notifications.
-   **Export Formats**: Add CSV/Excel export for analysis results (in addition to existing functionality).


