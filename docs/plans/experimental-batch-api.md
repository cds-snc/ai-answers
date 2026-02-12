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
- `createBatch(batchData, itemsData)` — Accept `datasetId` to create batch from existing dataset
- **`cancelBatch(batchId)`** — Mark batch as cancelled, stop processing pending items
- **`promoteToDataset(batchId, details)`** — Create new dataset from completed batch results (with MongoDB transaction)

**Promotion with Transaction**:
```javascript
async promoteToDataset(batchId, details) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const batch = await ExperimentalBatch.findById(batchId).session(session);
    if (batch.status !== 'completed') {
      throw new Error('Cannot promote incomplete batch');
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
      experimentalBatch: batchId,
      status: 'completed'
    }).session(session);
    
    const rows = items.map((item, idx) => ({
      experimentalDataset: dataset[0]._id,
      rowIndex: idx + 1,
      data: {
        question: item.question,
        answer: item.answer,
        ...(item.similarityScore !== undefined && { similarityScore: item.similarityScore }),
        ...(item.evaluatorOutput && { evaluatorOutput: item.evaluatorOutput }),
      }
    }));
    
    await ExperimentalDatasetRow.insertMany(rows, { session });
    
    // Update dataset row count
    dataset[0].rowCount = rows.length;
    await dataset[0].save({ session });
    
    await session.commitTransaction();
    return dataset[0];
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
- Marks batch status as `cancelled`.
- Pending items are skipped; in-progress items complete but no new items start.

#### [NEW] [api/experimental/batch-progress.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/batch-progress.js)
- **GET /api/experimental/batches/:id/progress** (SSE endpoint)
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
- **`createJudgeLLM(provider)`** — Returns raw LLM for semantic comparison (no tools)
- **`createSafetyLLM(provider)`** — Returns raw LLM for safety/bias evaluation (no tools)

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
    maxLength: 255,
    index: { unique: true } // Prevents duplicate names
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
  // Soft delete support
  deletedAt: { type: Date, default: null },
}, { 
  timestamps: true,
  versionKey: false
});

// Indexes
ExperimentalDatasetSchema.index({ createdAt: -1 });
ExperimentalDatasetSchema.index({ type: 1 });
ExperimentalDatasetSchema.index({ deletedAt: 1 }); // For cleanup queries
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
  data: { type: mongoose.Schema.Types.Mixed, required: true },
}, {
  timestamps: true,
  versionKey: false
});

ExperimentalDatasetRowSchema.index({ experimentalDataset: 1, rowIndex: 1 });
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
    const existing = await ExperimentalDataset.findOne({ 
      name: metadata.name, 
      deletedAt: null 
    });
    if (existing) {
      throw new DuplicateError(`Dataset "${metadata.name}" already exists`);
    }
    
    // Create dataset and rows in transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const dataset = await ExperimentalDataset.create([{
        ...metadata,
        rowCount: rows.length,
        columns: this._inferColumns(rows),
        createdBy: userId,
      }], { session });
      
      const datasetRows = rows.map((row, idx) => ({
        experimentalDataset: dataset[0]._id,
        rowIndex: idx + 1,
        data: row,
      }));
      
      await ExperimentalDatasetRow.insertMany(datasetRows, { session });
      await session.commitTransaction();
      return dataset[0];
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
- List available datasets (excludes soft-deleted).

#### [NEW] [api/experimental/dataset-delete.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/dataset-delete.js)
- **DELETE /api/experimental/datasets/:id**
- Soft-deletes dataset by setting `deletedAt` timestamp.

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

#### Batch Cancellation Flow
1. User clicks "Cancel" button on in-progress batch
2. API sets batch status to `cancelled`
3. Queue processor checks batch status before processing each item
4. Pending items are marked as `cancelled` without processing
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
    { status: 'cancelled' }
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
    await ExperimentalBatchItem.findByIdAndUpdate(itemId, { status: 'cancelled' });
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
    collation: { locale: 'en', strength: 2 }, // Case-insensitive
    partialFilterExpression: { deletedAt: null } // Only for non-deleted
  }
);
```

#### Content Hash for Deduplication (Optional)
Optionally detect duplicate content by hashing:

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
  const existingByContent = await ExperimentalDataset.findOne({ 
    contentHash, 
    deletedAt: null 
  });
  
  if (existingByContent) {
    throw new DuplicateError(
      `A dataset with identical content already exists: "${existingByContent.name}"`
    );
  }
  
  // ... continue with creation
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
      "title": "Analyse expérimentale",
      "selectAnalyzer": "Sélectionner l'analyseur",
      "choose": "-- Choisir un analyseur --",
      "runAnalysis": "Lancer l'analyse",
      "processing": "En cours...",
      "cancelBatch": "Annuler",
      "cancelConfirm": "Voulez-vous vraiment annuler ce lot?",
      "progress": "Progression",
      "completed": "Terminé",
      "failed": "Échoué"
    },
    "datasets": {
      "title": "Ensembles de données",
      "upload": "Téléverser un ensemble de données",
      "uploadDescription": "Téléverser un fichier CSV ou Excel",
      "name": "Nom",
      "type": "Type",
      "rowCount": "Lignes",
      "createdAt": "Créé le",
      "actions": "Actions",
      "delete": "Supprimer",
      "deleteConfirm": "Voulez-vous vraiment supprimer cet ensemble de données?",
      "preview": "Aperçu",
      "promote": "Enregistrer comme ensemble de données",
      "promoteSuccess": "Ensemble de données créé avec succès",
      "types": {
        "question-only": "Questions seulement",
        "qa-pair": "Paires Q/R",
        "evaluation-set": "Ensemble d'évaluation",
        "batch-output": "Sortie de lot"
      },
      "errors": {
        "duplicateName": "Un ensemble de données avec ce nom existe déjà",
        "invalidFormat": "Format de fichier invalide. Veuillez téléverser un fichier CSV ou Excel.",
        "missingColumns": "Colonnes requises manquantes : {{columns}}",
        "emptyFile": "Le fichier téléversé ne contient aucune donnée"
      }
    },
    "batches": {
      "title": "Lots",
      "status": {
        "pending": "En attente",
        "processing": "En cours",
        "completed": "Terminé",
        "failed": "Échoué",
        "cancelled": "Annulé"
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
      // 1. Delete soft-deleted datasets and their rows
      const deletedDatasets = await ExperimentalDataset.find({
        deletedAt: { $ne: null, $lt: cutoffDate }
      });
      
      for (const dataset of deletedDatasets) {
        await ExperimentalDatasetRow.deleteMany({ experimentalDataset: dataset._id });
        await dataset.deleteOne();
      }
      console.log(`[ExperimentalCleanupService] Removed ${deletedDatasets.length} soft-deleted datasets`);
      
      // 2. Delete old completed/failed batches and their items
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
EXPERIMENTAL_RETENTION_DAYS=90  # Days to keep completed batches/deleted datasets
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

#### [NEW] [services/__tests__/ExperimentalBatchService.test.js](file:///c:/Users/hymary/repos/ai-answers/services/__tests__/ExperimentalBatchService.test.js)
- Batch creation, processing, and status updates.
- Mock graph execution (not `AnswerGenerationService`).
- **Test Dataset Flow**:
    1.  Mock `ExperimentalDataset` creation.
    2.  Create Batch from Dataset ID.
    3.  Process Batch (mock Graph execution via `getGraphApp`).
    4.  **Promote to Dataset**: Verify that `promoteToDataset` creates a new Dataset with the correct rows derived from the batch results.
- **Cancellation Tests**:
    - Cancel pending batch → all pending items marked cancelled
    - Cancel in-progress batch → in-flight items complete, pending items cancelled

#### [NEW] [services/__tests__/ExperimentalDatasetService.test.js](file:///c:/Users/hymary/repos/ai-answers/services/__tests__/ExperimentalDatasetService.test.js)
- Dataset upload validation (missing columns, empty file, invalid format).
- Duplicate name detection.
- Soft delete functionality.

#### [NEW] [services/experimental/__tests__/ExperimentalAnalyzerRegistry.test.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/__tests__/ExperimentalAnalyzerRegistry.test.js)
- Registry initialization from analyzers folder.
- Analyzer retrieval by ID.
- Processor invocation.

#### [NEW] [services/experimental/analyzers/__tests__/SemanticComparator.test.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/__tests__/SemanticComparator.test.js)
- Mock LLM responses.
- Test exact match detection.
- Test semantic similarity scoring.
- Test error handling for missing inputs.

#### [NEW] [services/experimental/analyzers/__tests__/SafetyEvaluator.test.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/__tests__/SafetyEvaluator.test.js)
- Safety score calculation.
- Issue detection.

#### [NEW] [api/experimental/__tests__/batch-progress.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/batch-progress.test.js)
- SSE connection establishment.
- Progress event streaming.
- Connection cleanup on batch completion.

#### [NEW] [api/experimental/__tests__/batch-cancel.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/batch-cancel.test.js)
- Cancel pending batch.
- Error on already completed batch.

#### [NEW] [api/experimental/__tests__/dataset-upload.test.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/__tests__/dataset-upload.test.js)
- Successful upload.
- Validation error responses.
- Duplicate name handling.

## File Structure Overview

Here is the location of the files involved in this feature.

```text
ai-answers/
├── services/
│   ├── experimental/
│   │   ├── ExperimentalBatchService.js       # [MODIFY] Core batch logic (graph integration, cancellation)
│   │   ├── ExperimentalDatasetService.js     # [NEW] Dataset CRUD + validation
│   │   ├── ExperimentalAnalyzerRegistry.js   # [MODIFY] Auto-loads analyzers from `analyzers/`
│   │   ├── ExperimentalQueueService.js       # [EXISTING] Queue management
│   │   ├── ExperimentalCleanupService.js     # [NEW] Scheduled cleanup job
│   │   ├── analyzers/                        # [NEW] Evaluators and Comparators
│   │   │   ├── AnalyzerBase.js               # [NEW] Base class interface
│   │   │   ├── SemanticComparator.js
│   │   │   ├── SafetyEvaluator.js
│   │   │   ├── BiasEvaluator.js
│   │   │   └── __tests__/
│   │   │       ├── SemanticComparator.test.js
│   │   │       └── SafetyEvaluator.test.js
│   │   └── __tests__/
│   │       ├── ExperimentalQueueService.test.js  # [EXISTING]
│   │       └── ExperimentalAnalyzerRegistry.test.js  # [NEW]
│   └── __tests__/
│       ├── ExperimentalBatchService.test.js  # [NEW]
│       └── ExperimentalDatasetService.test.js  # [NEW]
├── agents/
│   ├── AgentFactory.js                       # [MODIFY] Add createJudgeLLM, createSafetyLLM
│   └── prompts/
│       └── judges/                           # [NEW] Group judge prompts
│           ├── SemanticComparatorPrompt.js
│           ├── SafetyEvaluatorPrompt.js
│           └── BiasEvaluatorPrompt.js
├── src/
│   ├── locales/
│   │   ├── en.json                           # [MODIFY] Add experimental.* keys
│   │   └── fr.json                           # [MODIFY] Add experimental.* keys
│   ├── components/
│   │   └── experimental/
│   │       └── BatchProgressBar.js           # [NEW] SSE progress component
│   └── pages/
│       └── experimental/
│           ├── ExperimentalDatasetsPage.js   # [NEW] Dataset management UI
│           └── ExperimentalAnalysisPage.js   # [MODIFY] Fetch analyzers, dataset selection, progress
├── models/
│   ├── experimentalBatch.js                  # [EXISTING] Batch schema
│   ├── experimentalBatchItem.js              # [EXISTING] Item schema
│   ├── experimentalDataset.js                # [NEW] Dataset schema with validation
│   └── experimentalDatasetRow.js             # [NEW] Dataset Row schema
└── api/
    └── experimental/
        ├── experimental-batch-create.js      # [EXISTING]
        ├── experimental-batch-delete.js      # [EXISTING]
        ├── experimental-batch-export.js      # [EXISTING]
        ├── experimental-batch-list.js        # [EXISTING]
        ├── experimental-batch-process.js     # [EXISTING]
        ├── experimental-batch-status.js      # [EXISTING]
        ├── experimental-analyzers-list.js    # [NEW] GET /analyzers
        ├── batch-cancel.js                   # [NEW] POST /batches/:id/cancel
        ├── batch-progress.js                 # [NEW] GET /batches/:id/progress (SSE)
        ├── batch-promote.js                  # [NEW] POST /batches/:id/promote
        ├── dataset-upload.js                 # [NEW] POST /datasets/upload
        ├── dataset-list.js                   # [NEW] GET /datasets
        ├── dataset-delete.js                 # [NEW] DELETE /datasets/:id
        ├── cleanup.js                        # [NEW] POST /cleanup (admin)
        └── __tests__/
            ├── batch-progress.test.js        # [NEW]
            ├── batch-cancel.test.js          # [NEW]
            └── dataset-upload.test.js        # [NEW]
```

## Verification Plan

### Automated Tests
Run all experimental service tests:
```bash
npm test -- --grep "Experimental"
```

Individual test suites:
```bash
npm test services/__tests__/ExperimentalBatchService.test.js
npm test services/__tests__/ExperimentalDatasetService.test.js
npm test services/experimental/__tests__/ExperimentalAnalyzerRegistry.test.js
npm test services/experimental/analyzers/__tests__/SemanticComparator.test.js
npm test api/experimental/__tests__/batch-progress.test.js
npm test api/experimental/__tests__/dataset-upload.test.js
```

### Manual Verification

#### 1. Dataset Upload Flow
1. Go to Datasets Page (`/experimental/datasets`)
2. Click "Upload Dataset"
3. Upload a CSV `questions.csv` with columns: `question`, `answer`
4. Verify it appears in the list with correct row count
5. **Error Case**: Upload a file with missing `question` column → expect validation error

#### 2. Duplicate Detection
1. Upload a dataset named "Test Dataset"
2. Try to upload another dataset with the same name → expect "already exists" error

#### 3. Run Experiment with Progress
1. Go to Analysis Page (`/experimental/analysis`)
2. Verify analyzers are fetched from API (not hardcoded)
3. Select the uploaded dataset
4. Run a "Safety Evaluation" batch
5. **Verify Progress**: Watch real-time progress bar update via SSE
6. Check status changes: `pending` → `processing` → `completed`

#### 4. Cancellation
1. Start a large batch (100+ items)
2. While processing, click "Cancel"
3. Verify batch status changes to `cancelled`
4. Verify pending items are marked `cancelled`
5. Verify in-progress items complete normally

#### 5. Promote to Dataset
1. Wait for a batch to complete
2. Click "Save as Dataset"
3. Enter name "Run 1 Results"
4. Verify new dataset appears in Datasets list
5. **Duplicate Check**: Try to promote again with same name → expect error

#### 6. Iterative Testing
1. Create a new "Semantic Comparator" batch
2. Select "Run 1 Results" as the *Baseline* dataset
3. Upload/select a new comparison dataset
4. Run comparison and verify results

#### 7. Cleanup Verification
1. Create a test batch and complete it
2. Soft-delete a dataset
3. Wait for retention period (or manually trigger cleanup via admin endpoint)
4. Verify old items are removed from database

#### 8. Localization
1. Switch language to French (`/fr/experimental/datasets`)
2. Verify all UI text is translated
3. Verify error messages appear in French

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_CONCURRENCY` | `2` | Max concurrent batch items being processed |
| `EXPERIMENTAL_RETENTION_DAYS` | `90` | Days to retain completed batches before cleanup |
| `REDIS_URL` | (none) | Redis URL for BullMQ; if not set, uses in-memory queue |

## Future Optimizations (Post-MVP)

-   **Unified Worker Pool**: Migrate `EvaluationService` to use `ExperimentalQueueService` for a single, system-wide job queue.
-   **Prompt Management**: Move hardcoded prompts to `SettingsService` or a dedicated Prompt Registry for easier tuning without code changes.
-   **Advanced Visualization**: Add charts/graphs to the Analysis Page to visualize drift over time.
-   **Batch-mode Graph Variant**: Create a dedicated `BatchModeGraph` that skips certain nodes (like persist) to improve throughput.
-   **Webhook Notifications**: Allow users to configure webhooks for batch completion notifications.
-   **Export Formats**: Add CSV/Excel export for analysis results (in addition to existing functionality).
