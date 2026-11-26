// AIA-018 follow-up: a question blocked after the redact node must leave no trace
// of its text in any log. The system card promises blocked questions are never
// stored, and every ServerLoggingService call is both written to the chat logs
// and echoed to stdout. Runs the real redact → translate → postTranslateGuard
// path through every graph — including the agent orchestrator, the translation
// and PII services and their strategies — with only the model's `invoke` stubbed,
// then scans every log call for the question text.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logCalls, record, settings, model } = vi.hoisted(() => {
  const logCalls = [];
  return {
    logCalls,
    record: (level) => vi.fn(async (...args) => { logCalls.push([level, ...args]); }),
    settings: { 'redaction.threat.en': 'bomb' },
    // Per-test model behaviour: (userContent) => reply string, or throws.
    model: { translation: null, pii: null },
  };
});

vi.mock('../../../services/ServerLoggingService.js', () => ({
  default: {
    log: record('log'),
    info: record('info'),
    debug: record('debug'),
    warn: record('warn'),
    error: record('error'),
  },
}));

vi.mock('../../../services/SettingsService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    SettingsService: {
      ...actual.SettingsService,
      loadAll: vi.fn(async () => {}),
      get: vi.fn((key) => settings[key]),
      toBoolean: actual.SettingsService.toBoolean,
    },
  };
});

// Only the model call is fake: everything between the graph and the model runs.
vi.mock('../../AgentFactory.js', async (importOriginal) => {
  const actual = await importOriginal();
  const fakeAgent = (kind) => async () => ({
    invoke: async (messages) => ({
      content: model[kind](messages[messages.length - 1].content),
      response_metadata: { finish_reason: 'stop' },
    }),
  });
  return {
    ...actual,
    createTranslationAgent: fakeAgent('translation'),
    createPIIAgent: fakeAgent('pii'),
  };
});

import { runGenericGraph } from '../GenericGraph.js';
import { runGenericWithQAGraph } from '../GenericWithQAGraph.js';
import { runInstantAndQAGraph } from '../InstantAndQAGraph.js';
import { runDefaultWithVectorGraph } from '../DefaultWithVectorGraph.js';
import { runDefaultWithLocalModel } from '../DefaultWithLocalModel.js';

const CHAT_ID = 'blocked-log-chat';
const MARKER = 'kumquat';
const QUESTION = `${MARKER} zebra marmalade question`;
const DECODED = `decoded ${MARKER} secret`;
// An earlier, answered turn: its text may be logged (it is stored with its
// interaction), but the blocked question must never join it.
const EARLIER_QUESTION = 'How do I renew my passport?';
const HISTORY = [
  { sender: 'user', text: EARLIER_QUESTION },
  { sender: 'ai', text: 'You can renew it online.' },
];
const CONTENT_FILTER = "The response was filtered due to the prompt triggering Azure OpenAI's content management policy";

const graphs = [
  ['GenericGraph', runGenericGraph],
  ['GenericWithQAGraph', runGenericWithQAGraph],
  ['InstantAndQAGraph', runInstantAndQAGraph],
  ['DefaultWithVectorGraph', runDefaultWithVectorGraph],
  ['DefaultWithLocalModel', runDefaultWithLocalModel],
];

const translatesTo = (originalLanguage, translatedText = DECODED) => () => {
  model.translation = () => JSON.stringify({
    originalLanguage, translatedLanguage: 'eng', translatedText, noTranslation: false,
  });
};
// The PII model sees the original question first (stage 2), then the translated
// text (post-translation check). Only the translated text should trip it.
const piiOnTranslated = (reply) => () => {
  translatesTo('spa')();
  model.pii = (content) => (content.includes(DECODED) ? reply() : '<pii>null</pii>');
};
const contentFilter = () => { const err = new Error(CONTENT_FILTER); err.code = 'content_filter'; throw err; };

const scenarios = [
  ['zxx encoded input', translatesTo('zxx'), 'manipulation'],
  ['und undetermined language', translatesTo('und'), 'unsupportedLanguage'],
  ['unsupported Indigenous language', translatesTo('ike'), 'unsupportedLanguage'],
  ['word list hit on translated text', translatesTo('spa', `${DECODED} bomb`), 'threat'],
  ['PII in translated text', piiOnTranslated(() => `<pii>XXX ${DECODED}</pii>`), 'piStage2'],
  ['PII check content filter', piiOnTranslated(contentFilter), 'azureGuardrail'],
  ['translation content filter', () => { model.translation = contentFilter; }, 'azureGuardrail'],
];

// JSON.stringify drops an Error's message and stack; keep them so a log of an
// error that quotes the question is still caught.
const serialize = (data) => JSON.stringify(data ?? null, (_key, value) =>
  (value instanceof Error ? { message: value.message, stack: value.stack, ...value } : value));

describe('blocked questions leave no text in the logs', () => {
  beforeEach(() => {
    logCalls.length = 0;
    model.translation = null;
    model.pii = () => '<pii>null</pii>';
  });

  describe.each(graphs)('%s', (_name, runGraph) => {
    it.each(scenarios)('%s', async (_label, arrange, blockType) => {
      arrange();

      const run = runGraph({
        chatId: CHAT_ID,
        userMessage: QUESTION,
        lang: 'en',
        selectedAI: 'openai-gpt51',
        conversationHistory: HISTORY,
      });

      // The question really was blocked after the redact node.
      await expect(run).rejects.toMatchObject({ name: 'RedactionError', blockType });
      expect(logCalls.some(([, message]) => message === 'node:redact output')).toBe(true);
      // The translation context was built and logged, so the scan below covers it.
      const translateInput = logCalls.find(([, message]) => message === 'node:translate input');
      expect(translateInput[3].translationContext).toEqual([EARLIER_QUESTION]);

      for (const [level, message, chatId, data] of logCalls) {
        expect(serialize(data), `${level} "${message}" logged the question`).not.toContain(MARKER);
        // Every log of the run is filed under the real chat, never a shared
        // 'translate' or 'system' bucket.
        expect(chatId, `${level} "${message}" chatId`).toBe(CHAT_ID);
      }
    });
  });
});
