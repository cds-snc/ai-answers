# Experimental Batches Implementation Plan

## Overview

Add **experimental features** for batch processing and answer comparison. All new code is isolated in `experimental/` directories with no changes to existing production code.

---

## Goals

1. **Server-Side Batch Processing** - New experimental batch runner (no client-side processing)
2. **Comparison Batches** - Compare answers between two Excel files using LLM-based semantic comparison
3. **Evaluator Batches** - Run bias detection/safety evaluation on a single Excel file

---

## Constraints

> [!IMPORTANT]
> **Experimental Isolation Rules**:
> - ❌ NO changes to existing files (except minimal AdminPage.js menu addition)
> - ✅ All new files prefixed with `experimental` or in `experimental/` directories
> - ✅ New "Experimental" admin menu section (admin-only)
> - ✅ Can be toggled off easily if issues arise

---

## Proposed Changes

### 1. Admin Menu - Experimental Section

---

#### [MODIFY] [AdminPage.js](file:///c:/Users/hymary/repos/ai-answers/src/pages/AdminPage.js)

Add new "Experimental" section inside the existing `<RoleBasedContent roles={["admin"]}>` block:

```jsx
{/* Experimental Features - Admin Only */}
<li className="mt-400">
  <strong>{t('admin.navigation.experimental', 'Experimental')}</strong>
  <ul className="list-none pl-400">
    <li>
      <GcdsLink href={`/${lang}/experimental/analysis`}>
        {t('admin.navigation.experimentalAnalysis', 'Analysis Batches')}
      </GcdsLink>
    </li>
  </ul>
</li>
```

---

### 2. Queue Service (Experimental)

---

#### [NEW] [ExperimentalQueueService.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/ExperimentalQueueService.js)

Global queue abstraction:
- Uses `p-queue` (in-memory) when `REDIS_URL` is not set
- Uses `BullMQ` (Redis) when deployed
- Methods: `createQueue()`, `enqueue()`, `registerProcessor()`

```javascript
// Auto-detects environment
const useRedis = !!process.env.REDIS_URL;
// Falls back to p-queue for local development
```

---

### 3. Experimental Batch Processing (Server-Side)

---

#### [NEW] [experimentalBatch.js](file:///c:/Users/hymary/repos/ai-answers/models/experimentalBatch.js)

New model (does not modify existing `batch.js`):

```javascript
{
  name: String,
  status: String,           // 'pending', 'processing', 'completed', 'failed'
  type: String,             // 'batch', 'comparison', 'evaluator'
  workflow: String,
  aiProvider: String,
  searchProvider: String,
  pageLanguage: String,
  // For comparison batches
  baselineFile: { filename, rowCount },
  comparisonFile: { filename, rowCount },
  // For evaluator batches
  evaluatorType: String,    // 'bias-detection', 'safety'
  // Results summary
  summary: { total, completed, failed, matches, differences }
}
```

#### [NEW] [experimentalBatchItem.js](file:///c:/Users/hymary/repos/ai-answers/models/experimentalBatchItem.js)

```javascript
{
  experimentalBatch: ObjectId,
  rowIndex: Number,
  question: String,
  // For regular batches
  answer: String,
  // For comparison batches
  baselineAnswer: String,
  comparisonAnswer: String,
  similarityScore: Number,
  match: Boolean,
  explanation: String,
  // For evaluator batches
  evaluatorOutput: Schema.Types.Mixed,  // { biasScore, safetyScore, etc. }
  error: String,
}
```

---

#### [NEW] API Endpoints

| File | Endpoint | Description |
|------|----------|-------------|
| `api/experimental/batch-create.js` | POST | Create experimental batch |
| `api/experimental/batch-list.js` | GET | List experimental batches |
| `api/experimental/batch-process.js` | POST | Trigger server-side processing |
| `api/experimental/batch-status.js` | GET | Get batch status/progress |
| `api/experimental/batch-export.js` | GET | Export results to Excel |
| `api/experimental/batch-delete.js` | DELETE | Delete batch |

---

#### [NEW] [ExperimentalBatchService.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/ExperimentalBatchService.js)

Server-side batch processing service:
- `createBatch(data)` - Create and persist batch
- `processBatch(batchId)` - Enqueue items via QueueService
- `processComparison(batchId)` - Compare two files
- `processEvaluator(batchId)` - Run evaluator on single file

---

### 4. UI Page (Unified)

---

#### [NEW] [ExperimentalAnalysisPage.js](file:///c:/Users/hymary/repos/ai-answers/src/pages/experimental/ExperimentalAnalysisPage.js)

**Single unified page** that adapts based on selected analyzer:

```jsx
// User selects analyzer from dropdown
const [selectedAnalyzer, setSelectedAnalyzer] = useState(null);
const analyzers = ExperimentalAnalyzerRegistry.getAll();

// UI adapts based on inputType
const requiresTwoFiles = selectedAnalyzer?.inputType === 'comparison';

return (
  <>
    {/* Analyzer Selection */}
    <select onChange={(e) => setSelectedAnalyzer(analyzers[e.target.value])}>
      <option>Select analyzer...</option>
      {analyzers.map(a => <option key={a.id}>{a.name}</option>)}
    </select>

    {/* Dynamic File Upload */}
    {selectedAnalyzer && (
      <>
        <FileUpload label={requiresTwoFiles ? "Baseline File" : "Input File"} />
        {requiresTwoFiles && <FileUpload label="Comparison File" />}
      </>
    )}

    {/* Process Button */}
    <button onClick={processAnalysis}>Run Analysis</button>

    {/* Results List */}
    <AnalysisBatchList />
  </>
);
```

**Features:**
- Dropdown to select analyzer (Semantic Comparison, Bias Detection, Safety, etc.)
- Dynamic file upload: 1 file for `single`, 2 files for `comparison`
- Threshold/config options per analyzer
- Results list with status, export, delete
- Side-by-side diff view for comparison results

---

### 5. Analyzer Registry (Experimental)

---

#### [NEW] [ExperimentalAnalyzerRegistry.js](file:///c:/Users/hymary/repos/ai-answers/services/experimental/ExperimentalAnalyzerRegistry.js)

```javascript
// Comparator (requires 2 inputs)
ExperimentalAnalyzerRegistry.register('semantic-comparison', {
  inputType: 'comparison',
  outputColumns: ['similarityScore', 'match', 'explanation'],
  processor: async ({ question, baselineAnswer, comparisonAnswer }) => { ... }
});

// Evaluators (single input)
ExperimentalAnalyzerRegistry.register('bias-detection', {
  inputType: 'single',
  outputColumns: ['biasScore', 'biasExplanation'],
  processor: async ({ question, answer }) => { ... }
});

ExperimentalAnalyzerRegistry.register('safety', {
  inputType: 'single',
  outputColumns: ['safetyScore', 'safetyIssues'],
  processor: async ({ question, answer }) => { ... }
});
```

---

### 6. Routing

---

#### [MODIFY] [App.js](file:///c:/Users/hymary/repos/ai-answers/src/App.js)

Add route for experimental page (minimal change):

```jsx
<Route path="/:lang/experimental/analysis" element={<ExperimentalAnalysisPage />} />
```

---

### 7. Localization

---

#### [MODIFY] [en.json](file:///c:/Users/hymary/repos/ai-answers/locales/en.json) & [fr.json](file:///c:/Users/hymary/repos/ai-answers/locales/fr.json)

Add experimental labels:

```json
{
  "admin.navigation.experimental": "Experimental",
  "admin.navigation.experimentalAnalysis": "Analysis Batches",
  "experimental.analysis.title": "Experimental Analysis",
  "experimental.analysis.selectAnalyzer": "Select an analyzer",
  "experimental.analysis.baselineFile": "Baseline File",
  "experimental.analysis.comparisonFile": "Comparison File",
  "experimental.analysis.inputFile": "Input File",
  "experimental.analysis.runAnalysis": "Run Analysis"
}
```

---

## File Structure Summary

```
services/experimental/
├── ExperimentalQueueService.js      # Queue abstraction (BullMQ/p-queue)
├── ExperimentalBatchService.js      # Server-side batch processing
├── ExperimentalAnalyzerRegistry.js  # Comparator/evaluator registry

models/
├── experimentalBatch.js             # New batch model
├── experimentalBatchItem.js         # New batch item model

api/experimental/
├── batch-create.js
├── batch-list.js
├── batch-process.js
├── batch-status.js
├── batch-export.js
├── batch-delete.js

src/pages/experimental/
├── ExperimentalAnalysisPage.js      # Unified page (adapts to analyzer type)

src/services/experimental/
├── ExperimentalBatchClientService.js  # Client-side API wrapper
```

---

## Verification Plan

### Automated Tests

#### New Test Files

```bash
# Queue service tests
npm test -- services/experimental/__tests__/ExperimentalQueueService.test.js

# Batch service tests
npm test -- services/experimental/__tests__/ExperimentalBatchService.test.js

# Analyzer registry tests
npm test -- services/experimental/__tests__/ExperimentalAnalyzerRegistry.test.js
```

### Manual Verification

1. **Admin Menu**:
   - Login as admin → See "Experimental" section in menu
   - Login as partner → Do NOT see "Experimental" section

2. **Server-Side Batch Processing**:
   - Go to `/en/experimental/batches`
   - Upload Excel file with questions
   - Click "Process" → Verify processing happens server-side (no client-side loop)
   - Check progress updates via polling

3. **Answer Comparison**:
   - Go to `/en/experimental/comparison`
   - Upload two Excel files with same questions, different answers
   - Run comparison → Verify similarity scores appear
   - Export → Verify new columns in export

4. **Evaluator**:
   - Go to `/en/experimental/evaluator`
   - Upload Excel file with questions + answers
   - Select "Bias Detection"
   - Run → Verify bias scores appear

---

## Open Questions

1. **LLM Provider**: Which AI provider for comparison/evaluation LLM calls? (configurable or hardcoded?)

2. **Excel Column Names**: Expected columns? Suggestion: `question`, `answer`

3. **Similarity Threshold**: Default 0.85 (85%) for "match"?

4. **Rate Limiting**: Limit LLM calls to avoid quota issues?

---

## Package Dependencies

```bash
npm install bullmq p-queue
```

---

## Implementation Order

1. Queue Service + tests
2. Models + API endpoints
3. Server-side batch service
4. Comparison logic + LLM prompts
5. Evaluator logic
6. UI pages
7. Admin menu + routing
8. Localization
