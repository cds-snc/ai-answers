# Plan: Per-Row referringUrl & Multi-Turn chatId Support

## Problem

The current dataset/batch system treats every row independently:
- **referringUrl** is set once at the _batch config_ level and applied identically to all rows — the system ignores any `referringUrl` column in the spreadsheet.
- **Multi-turn** is impossible — every row gets a fresh `crypto.randomUUID()` chatId, so the AI has no memory between rows.

## Goal

1. If a dataset row contains a `referringUrl` field, use that row's URL instead of the batch-level default.
2. If a dataset row contains a `chatId` field, group those rows into a conversation session so the AI sees the previous turns as context (delivered via `conversationHistory`).

---

## Scope of Changes

### Layer 1 — Model Changes (Minimal)

#### `models/experimentalBatchItem.js`
- Add `referringUrl: { type: String }` field.
  - Stores the per-row URL so it is auditable after the batch completes.
- No changes needed for `chatId` — the field already exists on the schema.

#### `models/experimentalBatch.js`
- No schema changes required.
  - `config.referringUrl` continues to serve as the **fallback** when a row doesn't specify one.

#### `models/experimentalDatasetRow.js`
- No changes. The `data` field (Mixed) already stores whatever columns the spreadsheet had, including `referringUrl` and `chatId`.

### Layer 2 — Service Changes

#### `services/experimental/ExperimentalBatchService.js`

##### `createBatch()` (lines 62-71)
**Current behavior**: Maps spreadsheet columns to `question`, `answer`, `baselineAnswer`, `comparisonAnswer` only.

**Change**: Also extract `referringUrl` and `chatId` from each row's data and store them on the `ExperimentalBatchItem`.

```javascript
const items = finalItems.map((item, index) => ({
    question:          item.question || item.Question || item.REDACTEDQUESTION || item.Prompt || '',
    answer:            item.answer || item.Answer || item.Response || '',
    baselineAnswer:    item.baselineAnswer || item.baseline || item.GoldenAnswer || '',
    comparisonAnswer:  item.comparisonAnswer || item.comparison || item.NewAnswer || '',
    referringUrl:      item.referringUrl || item.ReferringUrl || item.referringurl || '',
    chatId:            item.chatId || item.ChatId || item.chatid || '',
    originalData:      item,
    experimentalBatch: batch._id,
    rowIndex:          index + 1,
    status:            'pending'
}));
```

##### `createBatch()` — Enqueue Logic (lines 73-80)
**Current behavior**: Enqueues every item independently in row order.

**Change**: Group items by `chatId` before enqueueing.
- Items **without** a `chatId` are enqueued immediately (independent, concurrent — same as today).
- Items **with** a `chatId` are grouped. For each group, only the **first item** (lowest `rowIndex`) is enqueued immediately. Subsequent items in the group are enqueued by the processor only after the previous turn completes.

```javascript
const independentItems = createdItems.filter(i => !i.chatId);
const groupedItems = new Map(); // chatId -> [items sorted by rowIndex]

for (const item of createdItems) {
    if (item.chatId) {
        if (!groupedItems.has(item.chatId)) groupedItems.set(item.chatId, []);
        groupedItems.get(item.chatId).push(item);
    }
}

// Enqueue independent items immediately
for (const item of independentItems) {
    await ExperimentalQueueService.enqueue(QUEUE_NAME, {
        batchId: batch._id.toString(),
        itemId: item._id.toString()
    });
}

// Enqueue only the first turn of each chat group
for (const [, groupItems] of groupedItems) {
    groupItems.sort((a, b) => a.rowIndex - b.rowIndex);
    await ExperimentalQueueService.enqueue(QUEUE_NAME, {
        batchId: batch._id.toString(),
        itemId: groupItems[0]._id.toString()
    });
}
```

##### `_processItem()` — referringUrl (line 131)
**Current behavior**: `referringUrl: batch.config.referringUrl`

**Change**: Prefer the item-level URL, fall back to the batch config.

```javascript
referringUrl: item.referringUrl || batch.config.referringUrl || '',
```

##### `_processItem()` — chatId + conversationHistory  (lines 125-145)
**Current behavior**: Generates a fresh `chatId` for every row and sends no history.

**Change**:
1. If the item has a `chatId` from the spreadsheet, reuse it. Otherwise, generate a fresh UUID.
2. Before calling the graph, look up all completed items in this batch that share the same `chatId` and have a lower `rowIndex`. Build a `conversationHistory` array from their `question` / `answer` pairs.
3. Pass that history into the graph input.
4. After this item completes, check if there is a **next item** in the same `chatId` group and enqueue it.

```javascript
// Determine chatId
const chatId = item.chatId || crypto.randomUUID();

// Build conversationHistory from previous turns in the same chatId group
let conversationHistory = [];
if (item.chatId) {
    const previousTurns = await ExperimentalBatchItem.find({
        experimentalBatch: batchId,
        chatId: item.chatId,
        rowIndex: { $lt: item.rowIndex },
        status: 'completed'
    }).sort({ rowIndex: 1 }).lean();

    conversationHistory = previousTurns.flatMap(t => [
        { role: 'user', content: t.question },
        { role: 'assistant', content: t.answer }
    ]);
}

const input = {
    chatId,
    message: item.question,
    conversationHistory,
    pageLanguage: batch.config.pageLanguage || 'en',
    aiProvider: batch.config.aiProvider || 'azure',
    referringUrl: item.referringUrl || batch.config.referringUrl || '',
    skipPersist: true,
};
```

##### `_processItem()` — Enqueue Next Turn (after item.save())
After the item finishes processing (completed or failed), check for the next turn and enqueue it:

```javascript
// Enqueue next turn in the same chatId group
if (item.chatId) {
    const nextItem = await ExperimentalBatchItem.findOne({
        experimentalBatch: batchId,
        chatId: item.chatId,
        rowIndex: { $gt: item.rowIndex },
        status: 'pending'
    }).sort({ rowIndex: 1 });

    if (nextItem) {
        await ExperimentalQueueService.enqueue(QUEUE_NAME, {
            batchId: batchId.toString(),
            itemId: nextItem._id.toString()
        });
    }
}
```

##### `promoteToDataset()` — Preserve new fields
When promoting batch items to dataset rows, include `referringUrl` and `chatId` in the `data` object so they are carried forward:

```javascript
// Add to the row data spread:
...(item.referringUrl && { referringUrl: item.referringUrl }),
...(item.chatId && { chatId: item.chatId }),
```

### Layer 3 — Validation Changes

#### `services/experimental/ExperimentalDatasetService.js`

##### `_validateRows()`
- No changes to required columns. `referringUrl` and `chatId` are always **optional** columns.
- Add a **warning** (not error) if `chatId` is present but rows are not contiguously ordered (i.e., chatId "A" appears at rows 1, 2, 5 with gaps — this is fine but worth flagging).

### Layer 4 — UI Changes

#### Locale files (`en.json`, `fr.json`)
Update the `typeInfo` column descriptions to mention the optional columns:
- `question-only.columns`: `"question (required), referringUrl (optional), chatId (optional)"`
- `qa-pair.columns`: `"question, answer (required), referringUrl (optional), chatId (optional)"`
- `evaluation-set.columns`: `"question, answer (required), comparisonAnswer (optional), referringUrl (optional), chatId (optional)"`

---

## Unit Tests (Vitest)

All new tests go in `services/experimental/__tests__/ExperimentalBatchService.test.js`.

### Test 1: Per-row referringUrl is stored on batch items
- Create a batch with items that include `referringUrl` in their data.
- Assert: `ExperimentalBatchItem.referringUrl` is populated for each item.

### Test 2: Item-level referringUrl takes priority over batch config
- Create a batch with `config.referringUrl = 'https://batch-level.ca'`.
- Provide items: one with `referringUrl: 'https://row-level.ca'`, one without.
- Mock the graph and capture the input.
- Assert: Item 1 sends `referringUrl: 'https://row-level.ca'`, Item 2 sends `referringUrl: 'https://batch-level.ca'`.

### Test 3: chatId is stored on batch items
- Create a batch with items that include `chatId: 'conv-001'` in their data.
- Assert: `ExperimentalBatchItem.chatId` equals `'conv-001'`.

### Test 4: Multi-turn grouping — only first turn is enqueued initially
- Create a batch with 3 items sharing `chatId: 'conv-001'`.
- Assert: `ExperimentalQueueService.enqueue` is called exactly once (for the first row).

### Test 5: Multi-turn — next turn is enqueued after previous completes
- Create a batch with 2 items sharing `chatId: 'conv-001'`.
- Run `_processItem` for the first item (mock graph).
- Assert: `ExperimentalQueueService.enqueue` is called again for the second item after the first completes.

### Test 6: Multi-turn — conversationHistory is built from previous turns
- Create a batch with `chatId: 'conv-001'` on 2 items.
- Mark item 1 as completed with `question: 'Q1'`, `answer: 'A1'`.
- Run `_processItem` for item 2.
- Assert: The graph input includes `conversationHistory: [{role:'user', content:'Q1'}, {role:'assistant', content:'A1'}]`.

### Test 7: promoteToDataset preserves referringUrl and chatId
- Create a completed batch with items that have `referringUrl` and `chatId` set.
- Promote to dataset.
- Assert: The resulting dataset rows contain `referringUrl` and `chatId` in their `data`.

### Test 8: Items without chatId still get independent UUIDs
- Create a batch with items that have no `chatId`.
- Assert: Each item gets a unique generated `chatId` (existing behavior preserved).

---

## What This Does NOT Change

- **ExperimentalDatasetRow schema** — no changes, `data` is already Mixed.
- **ExperimentalDataset schema** — no changes.
- **Analyzer logic** — analyzers receive the item after generation; they don't care about referringUrl or chatId.
- **ExperimentalQueueService** — no changes to the queue itself.
- **API endpoints** — no changes; the batch creation API already passes through `itemsData` and `batchData` as-is.
- **ExperimentalDatasetsPage UI** — only the locale column descriptions are updated (no new form fields).

## Execution Order

1. Add `referringUrl` field to `ExperimentalBatchItem` model.
2. Update `createBatch()` — field extraction + grouped enqueue logic.
3. Update `_processItem()` — per-row referringUrl, chatId reuse, conversationHistory build, next-turn enqueue.
4. Update `promoteToDataset()` — preserve fields.
5. Update locale files — column descriptions.
6. Write unit tests.
7. Run all tests to verify.
