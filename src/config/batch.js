// config/batch.js
// Single source of truth for batch limits. Imported by the upload UI
// (src/components/batch/BatchUpload.js) and the server-side persist endpoint
// (api/batch/batch-persist.js) so the client cap and its server backstop can
// never drift apart.

// Maximum number of questions allowed in a single batch. Bounds the load a batch
// can place on downstream rate limits so a partner can't accidentally (or
// deliberately) submit a huge file. The batch.upload.error.tooManyRows and
// batch.upload.instructions.step1e locale strings name this limit — update them
// if you change it.
export const MAX_BATCH_ITEMS = 200;
