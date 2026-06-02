#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_COLLECTIONS_BY_MODE = {
  'expert-eval-chats': [
    'answer',
    'chat',
    'citation',
    'context',
    'embedding',
    'eval',
    'expertfeedback',
    'interaction',
    'logs',
    'publicfeedback',
    'question',
    'sentenceembedding',
    'tool',
    'user'
  ],
  'all-but-logs': null,
  'all-but-logs-and-embeddings': null,
  all: null
};

const RELATION_CHECKS = {
  chat: [
    { field: 'interactions', target: 'interaction', many: true },
    { field: 'user', target: 'user', severity: 'warnings' }
  ],
  interaction: [
    { field: 'question', target: 'question' },
    { field: 'answer', target: 'answer' },
    { field: 'expertFeedback', target: 'expertfeedback' },
    { field: 'publicFeedback', target: 'publicfeedback' },
    { field: 'autoEval', target: 'eval' },
    { field: 'context', target: 'context' }
  ],
  answer: [
    { field: 'citation', target: 'citation' },
    { field: 'tools', target: 'tool', many: true }
  ],
  eval: [
    { field: 'expertFeedback', target: 'expertfeedback' }
  ],
  embedding: [
    { field: 'chatId', target: 'chat' },
    { field: 'interactionId', target: 'interaction' },
    { field: 'questionId', target: 'question' },
    { field: 'answerId', target: 'answer' }
  ],
  sentenceembedding: [
    { field: 'parentEmbeddingId', target: 'embedding' }
  ]
};

const ORPHAN_CHECKS = {
  interaction: [
    { parent: 'chat', field: 'interactions', many: true }
  ],
  question: [
    { parent: 'interaction', field: 'question' },
    { parent: 'embedding', field: 'questionId' }
  ],
  answer: [
    { parent: 'interaction', field: 'answer' },
    { parent: 'embedding', field: 'answerId' }
  ],
  citation: [
    { parent: 'answer', field: 'citation' }
  ],
  tool: [
    { parent: 'answer', field: 'tools', many: true }
  ],
  expertfeedback: [
    { parent: 'interaction', field: 'expertFeedback' },
    { parent: 'eval', field: 'expertFeedback' }
  ],
  publicfeedback: [
    { parent: 'interaction', field: 'publicFeedback' }
  ],
  eval: [
    { parent: 'interaction', field: 'autoEval' }
  ],
  context: [
    { parent: 'interaction', field: 'context' }
  ],
  embedding: [
    { parent: 'chat', field: '_id', childField: 'chatId' },
    { parent: 'interaction', field: '_id', childField: 'interactionId' },
    { parent: 'question', field: '_id', childField: 'questionId' },
    { parent: 'answer', field: '_id', childField: 'answerId' }
  ],
  sentenceembedding: [
    { parent: 'embedding', field: '_id', childField: 'parentEmbeddingId' }
  ],
  batchitem: [
    { parent: 'batch', field: '_id', childField: 'batch' }
  ],
  scenariooverride: [
    { parent: 'user', field: '_id', childField: 'userId' }
  ]
};

function usage() {
  console.log(`Usage: node scripts/check-database-export.js <export.jsonl> [options]

Checks a database export JSONL file from /database after reading the whole file,
so export/import order does not matter. Each line must be:
  {"collection":"chat","doc":{...}}

The script flags broken parent-child relationships in both directions:
  parent references missing child, and exported child has no exported parent.

Options:
  --expect <mode>       Expected export mode. Supported:
                        all, all-but-logs, all-but-logs-and-embeddings,
                        expert-eval-chats
  --json                Print machine-readable JSON report
  --max-samples <n>     Samples to show per issue type (default: 10)
  -h, --help            Show this help

Examples:
  node scripts/check-database-export.js database-backup-2026-06-02.jsonl
  node scripts/check-database-export.js database-backup-expert-eval-chats-2026-06-02.jsonl --expect expert-eval-chats
`);
}

function parseArgs(argv) {
  const args = { file: null, expect: null, json: false, maxSamples: 10 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--expect') args.expect = argv[++i];
    else if (arg === '--json') args.json = true;
    else if (arg === '--max-samples') args.maxSamples = Number(argv[++i]) || 10;
    else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else if (!args.file) {
      args.file = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return args;
}

function collectionName(value) {
  return String(value || '').toLowerCase();
}

function inferExpectedMode(filePath) {
  const base = path.basename(filePath || '').toLowerCase();
  if (base.includes('expert-eval-chats')) return 'expert-eval-chats';
  if (base.includes('all-but-logs-and-embeddings')) return 'all-but-logs-and-embeddings';
  if (base.includes('all-but-logs')) return 'all-but-logs';
  if (base.includes('database-backup')) return 'all';
  return 'all';
}

function knownModelCollections() {
  const modelsDir = path.resolve(__dirname, '..', 'models');
  if (!fs.existsSync(modelsDir)) return [];
  return fs.readdirSync(modelsDir)
    .filter(file => file.endsWith('.js'))
    .map(file => collectionName(path.basename(file, '.js')))
    .sort((a, b) => a.localeCompare(b));
}

function expectedCollectionsForMode(mode) {
  if (mode === 'expert-eval-chats') return [...EXPECTED_COLLECTIONS_BY_MODE['expert-eval-chats']];

  const allCollections = knownModelCollections();
  if (mode === 'all-but-logs') {
    return allCollections.filter(collection => {
      const n = collectionName(collection);
      return !(n.endsWith('log') || n.endsWith('logs'));
    });
  }
  if (mode === 'all-but-logs-and-embeddings') {
    return allCollections.filter(collection => {
      const n = collectionName(collection);
      return !(n.endsWith('log') || n.endsWith('logs') || n === 'embedding' || n === 'sentenceembedding');
    });
  }
  return allCollections;
}

function idString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.$oid) return String(value.$oid);
  return String(value);
}

function isEmptyRef(value) {
  return value == null || value === '';
}

function addIssue(report, severity, code, message, sample, maxSamples) {
  const bucket = report[severity];
  if (!bucket[code]) {
    bucket[code] = { code, message, count: 0, samples: [] };
  }
  bucket[code].count++;
  if (sample != null && bucket[code].samples.length < maxSamples) {
    bucket[code].samples.push(sample);
  }
}

function getValues(doc, field, many = false) {
  const value = doc?.[field];
  if (many) return Array.isArray(value) ? value.filter(v => !isEmptyRef(v)) : [];
  return isEmptyRef(value) ? [] : [value];
}

function trackCollection(index, collection, doc, lineNumber, report, maxSamples) {
  const id = idString(doc?._id);
  if (!id) {
    addIssue(report, 'errors', 'missing_doc_id', 'Document is missing _id.', { lineNumber, collection }, maxSamples);
    return;
  }
  if (!OBJECT_ID_RE.test(id)) {
    addIssue(report, 'warnings', 'non_objectid_id', 'Document _id is not a 24-character ObjectId string.', { lineNumber, collection, id }, maxSamples);
  }

  if (!index.idsByCollection.has(collection)) index.idsByCollection.set(collection, new Set());
  if (!index.docsByCollection.has(collection)) index.docsByCollection.set(collection, new Map());
  if (!index.counts.has(collection)) index.counts.set(collection, 0);

  const ids = index.idsByCollection.get(collection);
  const docs = index.docsByCollection.get(collection);
  if (ids.has(id)) {
    addIssue(report, 'errors', 'duplicate_doc_id', 'Duplicate _id within the same collection.', { lineNumber, collection, id }, maxSamples);
  }
  ids.add(id);
  docs.set(id, doc);
  index.counts.set(collection, index.counts.get(collection) + 1);

  if (collection === 'chat' && doc.chatId) {
    const chatId = String(doc.chatId);
    if (index.chatDocIdsByChatId.has(chatId)) {
      addIssue(report, 'errors', 'duplicate_chat_id', 'Duplicate chat.chatId value.', { lineNumber, chatId }, maxSamples);
    }
    index.chatDocIdsByChatId.set(chatId, id);
  }
}

async function loadExport(filePath, report, maxSamples) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }

  const index = {
    counts: new Map(),
    idsByCollection: new Map(),
    docsByCollection: new Map(),
    chatDocIdsByChatId: new Map(),
    totalLines: 0,
    parsedLines: 0
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(abs, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    index.totalLines++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      addIssue(report, 'errors', 'invalid_json_line', 'Line is not valid JSON.', {
        lineNumber: index.totalLines,
        error: err.message
      }, maxSamples);
      continue;
    }

    const collection = collectionName(parsed.collection);
    const doc = parsed.doc;
    if (!collection || !doc || typeof doc !== 'object' || Array.isArray(doc)) {
      addIssue(report, 'errors', 'invalid_export_line_shape', 'Line must have collection string and doc object.', {
        lineNumber: index.totalLines
      }, maxSamples);
      continue;
    }

    index.parsedLines++;
    trackCollection(index, collection, doc, index.totalLines, report, maxSamples);
  }

  if (index.parsedLines === 0) {
    addIssue(report, 'errors', 'empty_export', 'No valid export records were found.', null, maxSamples);
  }

  return { abs, index };
}

function collectionExists(index, collection) {
  return index.idsByCollection.has(collection);
}

function hasId(index, collection, id) {
  return index.idsByCollection.get(collection)?.has(idString(id));
}

function validateRelationships(index, report, maxSamples) {
  for (const [collection, checks] of Object.entries(RELATION_CHECKS)) {
    if (!collectionExists(index, collection)) continue;
    const docs = index.docsByCollection.get(collection);
    for (const [sourceId, doc] of docs) {
      for (const check of checks) {
        const targetExists = collectionExists(index, check.target);
        const values = getValues(doc, check.field, check.many);
        for (const value of values) {
          const targetId = idString(value);
          if (!targetId) continue;
          if (!targetExists) {
            addIssue(report, 'warnings', 'referenced_collection_not_exported', 'A referenced collection is not present in this export, so the reference could not be checked.', {
              collection,
              sourceId,
              field: check.field,
              target: check.target,
              targetId
            }, maxSamples);
          } else if (!hasId(index, check.target, targetId)) {
            const severity = check.severity || 'errors';
            addIssue(report, severity, 'missing_referenced_document', 'A document references another document that is missing from the export.', {
              collection,
              sourceId,
              field: check.field,
              target: check.target,
              targetId
            }, maxSamples);
          }
        }
      }
    }
  }
}

function validateCollectionCoverage(index, expectedMode, report, maxSamples) {
  const expectedCollections = expectedCollectionsForMode(expectedMode);
  if (!expectedCollections.length) {
    addIssue(report, 'warnings', 'expected_collections_unknown', 'Could not determine expected collections from the models directory.', {
      expectedMode
    }, maxSamples);
    return;
  }

  const exportedCollections = new Set(index.counts.keys());
  for (const collection of expectedCollections) {
    if (!exportedCollections.has(collection)) {
      addIssue(report, 'warnings', 'expected_collection_missing', 'An expected collection is not present in the export.', {
        expectedMode,
        collection
      }, maxSamples);
    }
  }

  const expectedSet = new Set(expectedCollections);
  for (const collection of exportedCollections) {
    if (!expectedSet.has(collection)) {
      addIssue(report, 'warnings', 'unexpected_collection_exported', 'A collection is present but is not expected for this export mode.', {
        expectedMode,
        collection
      }, maxSamples);
    }
  }
}

function collectUsedChildIds(index, childCollection, checks) {
  const used = new Set();
  const presentParentCollections = [];
  const missingParentCollections = [];

  for (const check of checks) {
    if (!collectionExists(index, check.parent)) {
      missingParentCollections.push(check.parent);
      continue;
    }
    presentParentCollections.push(check.parent);
    const parents = index.docsByCollection.get(check.parent);
    for (const parentDoc of parents.values()) {
      if (check.childField) {
        const expectedChildId = idString(parentDoc?.[check.field]);
        if (expectedChildId) used.add(expectedChildId);
      } else {
        for (const value of getValues(parentDoc, check.field, check.many)) {
          const childId = idString(value);
          if (childId) used.add(childId);
        }
      }
    }
  }

  return { used, presentParentCollections, missingParentCollections };
}

function childMatchesParentByOwnRef(childDoc, checks, index) {
  return checks.some((check) => {
    if (!check.childField || !collectionExists(index, check.parent)) return false;
    return hasId(index, check.parent, childDoc?.[check.childField]);
  });
}

function validateOrphans(index, report, maxSamples) {
  for (const [childCollection, checks] of Object.entries(ORPHAN_CHECKS)) {
    if (!collectionExists(index, childCollection)) continue;

    const childDocs = index.docsByCollection.get(childCollection);
    const { used, presentParentCollections, missingParentCollections } = collectUsedChildIds(index, childCollection, checks);

    if (presentParentCollections.length === 0) {
      for (const [childId] of childDocs) {
        addIssue(report, 'errors', 'orphan_child_collection_without_parent_collection', 'A child collection is exported but none of its parent collections are present.', {
          collection: childCollection,
          childId,
          expectedParents: missingParentCollections
        }, maxSamples);
      }
      continue;
    }

    for (const [childId, childDoc] of childDocs) {
      const isUsedByParent = used.has(childId);
      const hasOwnParentRef = childMatchesParentByOwnRef(childDoc, checks, index);
      if (!isUsedByParent && !hasOwnParentRef) {
        addIssue(report, 'errors', 'orphan_child_document', 'A child document is not attached to any exported parent document.', {
          collection: childCollection,
          childId,
          checkedParents: presentParentCollections
        }, maxSamples);
      }
    }
  }
}

function createReachabilityIndex(index) {
  const reachable = new Map();
  for (const collection of ['chat', 'batch', 'user', 'setting']) {
    if (!collectionExists(index, collection)) continue;
    reachable.set(collection, new Set(index.idsByCollection.get(collection)));
  }
  return reachable;
}

function isReachable(reachable, collection, id) {
  return reachable.get(collection)?.has(idString(id)) || false;
}

function markReachable(reachable, collection, id) {
  const targetId = idString(id);
  if (!targetId) return false;
  if (!reachable.has(collection)) reachable.set(collection, new Set());
  const ids = reachable.get(collection);
  if (ids.has(targetId)) return false;
  ids.add(targetId);
  return true;
}

function markRefsFromReachableParents(index, reachable, parentCollection, childCollection, field, many = false) {
  if (!collectionExists(index, parentCollection) || !collectionExists(index, childCollection)) return false;
  let changed = false;
  const parents = index.docsByCollection.get(parentCollection);
  for (const [parentId, parentDoc] of parents) {
    if (!isReachable(reachable, parentCollection, parentId)) continue;
    for (const childId of getValues(parentDoc, field, many)) {
      if (hasId(index, childCollection, childId)) {
        changed = markReachable(reachable, childCollection, childId) || changed;
      }
    }
  }
  return changed;
}

function markChildrenWithReachableParentRef(index, reachable, childCollection, parentCollection, childField) {
  if (!collectionExists(index, childCollection) || !collectionExists(index, parentCollection)) return false;
  let changed = false;
  const children = index.docsByCollection.get(childCollection);
  for (const [childId, childDoc] of children) {
    const parentId = childDoc?.[childField];
    if (hasId(index, parentCollection, parentId) && isReachable(reachable, parentCollection, parentId)) {
      changed = markReachable(reachable, childCollection, childId) || changed;
    }
  }
  return changed;
}

function buildReachability(index) {
  const reachable = createReachabilityIndex(index);
  let changed = true;

  while (changed) {
    changed = false;
    changed = markRefsFromReachableParents(index, reachable, 'chat', 'interaction', 'interactions', true) || changed;
    changed = markRefsFromReachableParents(index, reachable, 'interaction', 'question', 'question') || changed;
    changed = markRefsFromReachableParents(index, reachable, 'interaction', 'answer', 'answer') || changed;
    changed = markRefsFromReachableParents(index, reachable, 'interaction', 'expertfeedback', 'expertFeedback') || changed;
    changed = markRefsFromReachableParents(index, reachable, 'interaction', 'publicfeedback', 'publicFeedback') || changed;
    changed = markRefsFromReachableParents(index, reachable, 'interaction', 'eval', 'autoEval') || changed;
    changed = markRefsFromReachableParents(index, reachable, 'interaction', 'context', 'context') || changed;
    changed = markRefsFromReachableParents(index, reachable, 'answer', 'citation', 'citation') || changed;
    changed = markRefsFromReachableParents(index, reachable, 'answer', 'tool', 'tools', true) || changed;
    changed = markRefsFromReachableParents(index, reachable, 'eval', 'expertfeedback', 'expertFeedback') || changed;
    changed = markChildrenWithReachableParentRef(index, reachable, 'embedding', 'chat', 'chatId') || changed;
    changed = markChildrenWithReachableParentRef(index, reachable, 'embedding', 'interaction', 'interactionId') || changed;
    changed = markChildrenWithReachableParentRef(index, reachable, 'embedding', 'question', 'questionId') || changed;
    changed = markChildrenWithReachableParentRef(index, reachable, 'embedding', 'answer', 'answerId') || changed;
    changed = markChildrenWithReachableParentRef(index, reachable, 'sentenceembedding', 'embedding', 'parentEmbeddingId') || changed;
    changed = markChildrenWithReachableParentRef(index, reachable, 'batchitem', 'batch', 'batch') || changed;
    changed = markChildrenWithReachableParentRef(index, reachable, 'scenariooverride', 'user', 'userId') || changed;
  }

  return reachable;
}

function validateReachability(index, report, maxSamples) {
  const reachable = buildReachability(index);
  const checkedCollections = [
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
    'batchitem',
    'scenariooverride'
  ];

  for (const collection of checkedCollections) {
    if (!collectionExists(index, collection)) continue;
    for (const [id] of index.docsByCollection.get(collection)) {
      if (!isReachable(reachable, collection, id)) {
        addIssue(report, 'errors', 'unreachable_child_document', 'A child document is not ultimately connected to an exported root parent.', {
          collection,
          childId: id
        }, maxSamples);
      }
    }
  }
}

function validateLogs(index, report, maxSamples) {
  if (!collectionExists(index, 'logs') || !collectionExists(index, 'chat')) return;
  const logs = index.docsByCollection.get('logs');
  for (const [logId, log] of logs) {
    const chatId = log.chatId ? String(log.chatId) : '';
    if (!chatId || chatId === 'system') continue;
    if (!index.chatDocIdsByChatId.has(chatId)) {
      addIssue(report, 'warnings', 'log_chat_not_exported', 'A log references a chatId not present in the exported chat collection.', {
        logId,
        chatId
      }, maxSamples);
    }
  }
}

function validateSessionStates(index, report, maxSamples) {
  if (!collectionExists(index, 'sessionstate') || !collectionExists(index, 'chat')) return;
  const sessions = index.docsByCollection.get('sessionstate');
  for (const [sessionId, session] of sessions) {
    const chatIds = Array.isArray(session.chatIds) ? session.chatIds : [];
    for (const chatId of chatIds) {
      if (!index.chatDocIdsByChatId.has(String(chatId))) {
        addIssue(report, 'warnings', 'session_chat_not_exported', 'A session references a chatId not present in the exported chat collection.', {
          sessionId,
          chatId: String(chatId)
        }, maxSamples);
      }
    }
  }
}

function validateExpertEvalChats(index, report, maxSamples) {
  if (!collectionExists(index, 'chat')) {
    addIssue(report, 'errors', 'missing_chat_collection', '--expect expert-eval-chats requires the chat collection.', null, maxSamples);
    return;
  }
  if (!collectionExists(index, 'interaction')) {
    addIssue(report, 'errors', 'missing_interaction_collection', '--expect expert-eval-chats requires the interaction collection.', null, maxSamples);
    return;
  }

  const interactions = index.docsByCollection.get('interaction');
  const chats = index.docsByCollection.get('chat');
  for (const [chatDocId, chat] of chats) {
    const interactionIds = Array.isArray(chat.interactions) ? chat.interactions.map(idString) : [];
    const hasExpertFeedback = interactionIds.some((interactionId) => {
      const interaction = interactions.get(interactionId);
      return interaction && !isEmptyRef(interaction.expertFeedback);
    });
    if (!hasExpertFeedback) {
      addIssue(report, 'errors', 'chat_without_expert_feedback', 'Exported chat does not have any interaction with expert feedback.', {
        chatDocId,
        chatId: chat.chatId || ''
      }, maxSamples);
    }
  }
}

function issueCount(issues) {
  return Object.values(issues).reduce((sum, issue) => sum + issue.count, 0);
}

function sortedCounts(counts) {
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function printHumanReport(report) {
  console.log(`Checked: ${report.file}`);
  console.log(`Expected mode: ${report.expectedMode}`);
  console.log(`Lines: ${report.totalLines}`);
  console.log(`Records: ${report.parsedLines}`);
  console.log('');
  console.log('Collections:');
  for (const [collection, count] of sortedCounts(report.counts)) {
    console.log(`  ${collection}: ${count}`);
  }

  const errorCount = issueCount(report.errors);
  const warningCount = issueCount(report.warnings);
  console.log('');
  console.log(`Result: ${errorCount ? 'FAIL' : 'PASS'} (${errorCount} errors, ${warningCount} warnings)`);

  for (const severity of ['errors', 'warnings']) {
    const issues = Object.values(report[severity]);
    if (!issues.length) continue;
    console.log('');
    console.log(`${severity.toUpperCase()}:`);
    for (const issue of issues) {
      console.log(`- ${issue.code}: ${issue.message} (${issue.count})`);
      for (const sample of issue.samples) {
        console.log(`  sample: ${JSON.stringify(sample)}`);
      }
    }
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    usage();
    process.exit(1);
  }

  if (!args.file) {
    usage();
    process.exit(1);
  }
  const supportedModes = ['all', 'all-but-logs', 'all-but-logs-and-embeddings', 'expert-eval-chats'];
  if (args.expect && !supportedModes.includes(args.expect)) {
    console.error(`Unknown --expect value: ${args.expect}`);
    process.exit(1);
  }
  const expectedMode = args.expect || inferExpectedMode(args.file);

  const report = { file: '', expectedMode, totalLines: 0, parsedLines: 0, counts: new Map(), errors: {}, warnings: {} };
  const { abs, index } = await loadExport(args.file, report, args.maxSamples);
  report.file = abs;
  report.totalLines = index.totalLines;
  report.parsedLines = index.parsedLines;
  report.counts = index.counts;

  const expectedCollections = new Set(expectedCollectionsForMode(expectedMode));
  validateCollectionCoverage(index, expectedMode, report, args.maxSamples);
  validateRelationships(index, report, args.maxSamples);
  validateOrphans(index, report, args.maxSamples);
  validateReachability(index, report, args.maxSamples);
  if (expectedCollections.has('logs')) validateLogs(index, report, args.maxSamples);
  if (expectedCollections.has('sessionstate')) validateSessionStates(index, report, args.maxSamples);
  if (expectedMode === 'expert-eval-chats') {
    validateExpertEvalChats(index, report, args.maxSamples);
  }

  if (args.json) {
    const jsonReport = {
      ...report,
      counts: Object.fromEntries(sortedCounts(report.counts))
    };
    console.log(JSON.stringify(jsonReport, null, 2));
  } else {
    printHumanReport(report);
  }

  process.exit(issueCount(report.errors) ? 1 : 0);
}

main().catch((err) => {
  console.error(`Export check failed: ${err.message}`);
  process.exit(1);
});
