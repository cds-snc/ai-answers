export const EXPERT_EVAL_CHATS_EXPORT = 'ExpertEvalChats';
export const ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT = 'AllButLogsAndEmbeddings';

const EXPERT_EVAL_CHATS_COLLECTIONS = [
  'chat',
  'interaction',
  'question',
  'answer',
  'citation',
  'tool',
  'expertfeedback',
  'publicfeedback',
  'eval',
  'context',
  'embedding',
  'sentenceembedding',
  'logs',
  'sessionstate',
  'user'
];

const EXCLUDED_BY_LOGS_AND_EMBEDDINGS = new Set([
  'embedding',
  'sentenceembedding'
]);

function normalizeCollectionName(name) {
  return String(name || '').toLowerCase();
}

function isLogCollection(name) {
  const n = normalizeCollectionName(name);
  return n.endsWith('log') || n.endsWith('logs');
}

export function getDatabaseExportCollections(selectedCollection, collections = []) {
  const safeCollections = Array.isArray(collections) ? collections : [];

  if (selectedCollection === EXPERT_EVAL_CHATS_EXPORT) {
    return EXPERT_EVAL_CHATS_COLLECTIONS.filter(col => safeCollections.includes(col));
  }

  if (selectedCollection === ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT) {
    return safeCollections.filter(col => {
      const normalized = normalizeCollectionName(col);
      return !isLogCollection(normalized) && !EXCLUDED_BY_LOGS_AND_EMBEDDINGS.has(normalized);
    });
  }

  if (selectedCollection && selectedCollection !== 'All' && selectedCollection !== 'AllButLogs') {
    return [selectedCollection];
  }

  if (selectedCollection === 'AllButLogs') {
    return safeCollections.filter(col => !isLogCollection(col));
  }

  return safeCollections;
}

export function getDatabaseExportFilenameTag(selectedCollection) {
  if (selectedCollection === 'AllButLogs') return 'all-but-logs-';
  if (selectedCollection === ALL_BUT_LOGS_AND_EMBEDDINGS_EXPORT) return 'all-but-logs-and-embeddings-';
  if (selectedCollection === EXPERT_EVAL_CHATS_EXPORT) return 'expert-eval-chats-';
  if (selectedCollection && selectedCollection !== 'All') return `${selectedCollection}-`;
  return '';
}
