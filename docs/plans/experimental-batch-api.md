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
> **Concurrency Control**: To prevent resource starvation, operators should tune `BATCH_CONCURRENCY` (default: 2) alongside `EVAL_CONCURRENCY` (default: `numCPUs-1`). This effectively partitions the server's capacity between user-facing evaluations and background batch processing.

> [!NOTE]
> The current implementation of `ExperimentalBatchService` will generate a standard UUID for `chatId` (using `crypto.randomUUID()`) for each batch item. This ensures compatibility with all downstream services (`ServerLoggingService`, `ToolTrackingHandler`) that expect unique identifiers, while still avoiding the creation of `Chat` documents in MongoDB.

## Proposed Changes

### Backend Services

#### [MODIFY] [ExperimentalBatchService.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/ExperimentalBatchService.js)
- Refine `_processItem` to execute the LangGraph workflow directly using `getGraphApp` and `graphRequestContext`, similar to `api/chat/chat-graph-run.js`.
- Use `SettingsService` to resolve the default workflow if not specified.
- Support `batch.config.workflow` override.
- Map graph events (status/result) to batch item state.
- Ensure `ExperimentalAnalyzerRegistry` calls are correctly mapped for 'analysis' type batches.
- Update `createBatch` to accept `datasetId`.
- When `datasetId` is provided, fetch `ExperimentalDatasetRow`s and create `ExperimentalBatchItem`s from them.
- **[NEW] `promoteToDataset(batchId, newDetails)`**:
    - Creates a new `ExperimentalDataset` from a completed batch.
    - Copies `ExperimentalBatchItem` results (answers/evaluations) into new `ExperimentalDatasetRow`s.
    - Enables iterative testing (e.g., using the output of Run A as the baseline for Run B).

#### [MODIFY] [ExperimentalAnalyzerRegistry.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/ExperimentalAnalyzerRegistry.js)
- Registry acts as the central hub for both **Evaluators** (single input) and **Comparators** (dual input).
- Refactor to load analyzer instances from `services/experimental/analyzers/`.
- Registry entries will have `type`: `'evaluator'` or `'comparator'`.
- **Configuration**:
    - `inputType`: `'dataset'` (single dataset row) or `'comparison'` (row from Dataset A + row from Dataset B).
    - Metadata is served to the frontend to drive the UI for **Dataset Selection**.

#### [NEW] [api/experimental/experimental-analyzers-list.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/experimental-analyzers-list.js)
- **GET /api/experimental/analyzers**
- Returns the list of registered analyzers with their metadata (id, name, description, inputType).
- Allows the frontend (`ExperimentalAnalysisPage`) to dynamically render upload fields (1 vs 2 files) without hardcoding.

#### [MODIFY] [AgentFactory.js](file:///c:/Users/hymary/repos/ai-answers/agents/AgentFactory.js)
- Add `createJudgeAgent(provider)`
- Add `createSafetyAgent(provider)`

#### [NEW] [agents/prompts/SemanticComparatorPrompt.js](file:///c:/Users/hymary/repos/ai-answers/agents/prompts/SemanticComparatorPrompt.js)
- Define the "Judge" system prompt with JSON schema output for semantic comparison.

#### [NEW] [agents/prompts/SafetyEvaluatorPrompt.js](file:///c:/Users/hymary/repos/ai-answers/agents/prompts/SafetyEvaluatorPrompt.js)
- Define the system prompt for safety analysis.

#### [NEW] [agents/prompts/BiasEvaluatorPrompt.js](file:///c:/Users/hymary/repos/ai-answers/agents/prompts/BiasEvaluatorPrompt.js)
- Define the system prompt for bias analysis.

#### [NEW] [services/experimental/analyzers/SemanticComparator.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/SemanticComparator.js)
- **Type**: Comparator
- Implements the "Judge" logic.
- Uses `AgentFactory.createJudgeAgent`.
- Uses `agents/prompts/SemanticComparatorPrompt.js`.

#### [NEW] [services/experimental/analyzers/SafetyEvaluator.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/SafetyEvaluator.js)
- **Type**: Evaluator
- Implements safety evaluation logic.
- Uses `AgentFactory.createSafetyAgent`.
- Uses `agents/prompts/SafetyEvaluatorPrompt.js`.

#### [NEW] [services/experimental/analyzers/BiasEvaluator.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/analyzers/BiasEvaluator.js)
- **Type**: Evaluator
- Implements bias detection logic.
- Uses `AgentFactory.createSafetyAgent` (or dedicated bias agent).
- Uses `agents/prompts/BiasEvaluatorPrompt.js`.

### Dataset Management (New Feature)

#### [NEW] [models/experimentalDataset.js](file:///c:/Users/hymary/repos/ai-answers/models/experimentalDataset.js)
- Schema for a reusable dataset.
- Fields: `name`, `description`, `type` (e.g., 'question-only', 'qa-pair', 'evaluation-set'), `rowCount`.

#### [NEW] [models/experimentalDatasetRow.js](file:///c:/Users/hymary/repos/ai-answers/models/experimentalDatasetRow.js)
- Stores the actual data for each row in a dataset.
- Fields: `experimentalDataset` (ref), `data` (Mixed/JSON content), `rowIndex`.

#### [NEW] [api/experimental/dataset-upload.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/dataset-upload.js)
- Endpoint to upload a CSV/Excel and create a Dataset + Rows.

#### [NEW] [api/experimental/dataset-list.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/dataset-list.js)
- List available datasets.

#### [NEW] [api/experimental/batch-promote.js](file:///c:/Users/hymary/repos/ai-answers/api/experimental/batch-promote.js)
- Endpoint to trigger `ExperimentalBatchService.promoteToDataset`.

#### [NEW] [src/pages/experimental/ExperimentalDatasetsPage.js](file:///c:/Users/hymary/repos/ai-answers/src/pages/experimental/ExperimentalDatasetsPage.js)
- **UI Page**: Displays a list of uploaded datasets.
- Columns: Name, Type (Question Set, QA Pair, Evaluation Set), Row Count, Created Date.
- Actions: Upload new dataset, View details (preview rows), Delete.

#### [MODIFY] [src/pages/experimental/ExperimentalAnalysisPage.js](file:///c:/Users/hymary/repos/ai-answers/src/pages/experimental/ExperimentalAnalysisPage.js)
- **Input Selection**: Replace/augment file upload with a "Select Dataset" dropdown.
- **Output Options**: Add checkbox "Save results as new Dataset" upon completion.

#### [NEW] [tests/ExperimentalBatchService.test.js](file:///c:/Users/hymary/repos/ai-answers/services/__tests__/ExperimentalBatchService.test.js),
- Create a new test file to verify the batch creation, processing, and status updates.
- Mock `AnswerGenerationService` and `ExperimentalAnalyzerRegistry` to test logic in isolation.
- **Test Dataset Flow**:
    1.  Mock `ExperimentalDataset` creation.
    2.  Create Batch from Dataset ID.
    3.  Process Batch (mock Graph execution).
    4.  **Promote to Dataset**: Verify that `promoteToDataset` creates a new Dataset with the correct rows derived from the batch results.

## File Structure Overview

Here is the location of the files involved in this feature.

```text
ai-answers/
├── services/
│   ├── experimental/
│   │   ├── ExperimentalBatchService.js       # [MODIFY] Core batch logic (graph integration)
│   │   ├── ExperimentalAnalyzerRegistry.js   # [MODIFY] Loads analyzers from `analyzers/`
│   │   ├── ExperimentalQueueService.js       # [EXISTING] Queue management
│   │   └── analyzers/                        # [NEW] Evaluators and Comparators
│   │       ├── SemanticComparator.js
│   │       ├── SafetyEvaluator.js
│   │       └── BiasEvaluator.js
│   └── __tests__/
│       └── ExperimentalBatchService.test.js  # [NEW] Unit tests for batch service
├── agents/
│   ├── AgentFactory.js                       # [MODIFY] Add createJudgeAgent, createSafetyAgent
│   └── prompts/
│       ├── SemanticComparatorPrompt.js       # [NEW]
│       ├── SafetyEvaluatorPrompt.js          # [NEW]
│       ├── BiasEvaluatorPrompt.js            # [NEW]
├── src/
│   └── pages/
│       └── experimental/
│           └── ExperimentalDatasetsPage.js   # [NEW] Dataset management UI
│           └── ExperimentalAnalysisPage.js   # [MODIFY] Analysis execution UI
├── models/
│   ├── experimentalBatch.js                  # [EXISTING] Batch schema
│   ├── experimentalBatchItem.js              # [EXISTING] Item schema
│   ├── experimentalDataset.js                # [NEW] Dataset schema
│   └── experimentalDatasetRow.js             # [NEW] Dataset Row schema
└── api/
    └── experimental/                         # [EXISTING] API Endpoints + [NEW] Dataset endpoints
```

## Verification Plan

### Automated Tests
- Run the new unit test:
  `npm test services/__tests__/ExperimentalBatchService.test.js`

### Manual Verification
1.  **Dataset Upload**: Go to Datasets Page, upload a CSV `questions.csv`. Verify it appears in the list.
2.  **Run Experiment**: Go to Analysis Page, select the uploaded "questions.csv" dataset. Run a "Question Answering" batch (or "Safety Evaluation").
3.  **Verify Processing**: Check status changes from `pending` -> `processing` -> `completed`.
4.  **Save Results**: Upon completion, click "Save as Dataset". Name it "Run 1 Results".
5.  **Iterate**: Create a new "Semantic Comparator" batch. Select "Run 1 Results" as the *Baseline* and a new generic run as the *Comparison*.

## Future Optimizations (Post-MVP)

-   **Unified Worker Pool**: Migrate `EvaluationService` to use `ExperimentalQueueService` for a single, system-wide job queue.
-   **Prompt Management**: Move hardcoded prompts to `SettingsService` or a dedicated Prompt Registry for easier tuning without code changes.
-   **Advanced Visualization**: Add charts/graphs to the Analysis Page to visualize drift over time.
