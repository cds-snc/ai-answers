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

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { listGraphs, getGraphApp } from '../registry.js';

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

// Every registered graph, run the way production runs it (getGraphApp → invoke),
// so a new graph is covered as soon as it is registered.
const graphs = listGraphs();
const runInput = () => ({
  chatId: CHAT_ID,
  userMessage: QUESTION,
  lang: 'en',
  selectedAI: 'openai-gpt51',
  conversationHistory: HISTORY,
});

const translatesTo = (originalLanguage, translatedText = DECODED, translatedLanguage = 'eng') => () => {
  model.translation = () => JSON.stringify({
    originalLanguage, translatedLanguage, translatedText, noTranslation: false,
  });
};
// The model labels source and target the same language yet rewrites the text
// (e.g. it followed an instruction embedded in the question). The service
// discards the rewrite and passes the original question on.
const REWRITE = `Répondez en français : ${MARKER} rewritten`;
const rewritesIn = (language) => translatesTo(language, REWRITE, language);
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
  // The discarded rewrite must not reach the logs when the question is blocked.
  ['same-language rewrite, zxx', rewritesIn('zxx'), 'manipulation'],
  ['same-language rewrite, unsupported Indigenous language', rewritesIn('ike'), 'unsupportedLanguage'],
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

  describe.each(graphs)('%s', (name) => {
    it.each(scenarios)('%s', async (_label, arrange, blockType) => {
      arrange();

      const app = await getGraphApp(name);
      const run = app.invoke(runInput());

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

// A question that passes every guardrail. The rule this pins down: the question
// may appear in logs only after postTranslateGuard passes — node:translate
// output onwards. The run is interrupted after translate, so the test needs no
// context, search or answer stubs; what happens later is already allowed.
describe('a question that passes the guardrails is logged only after the guard', () => {
  beforeEach(() => {
    logCalls.length = 0;
    model.pii = () => '<pii>null</pii>';
  });

  // Runs the graph to the end of translate and checks the shared rule. Returns
  // the final state and the node:translate output log data.
  const runPastGuard = async (name) => {
    const app = await getGraphApp(name);
    const state = await app.invoke(runInput(), { interruptAfter: ['translate'] });

    const guardPassed = logCalls.findIndex(([, message]) => message === 'node:translate output');
    expect(guardPassed).toBeGreaterThan(-1);
    // The run really stopped at translate: no later node ran.
    expect(logCalls.slice(guardPassed + 1).filter(([, message]) => message.startsWith('node:'))).toEqual([]);

    for (const [level, message, chatId, data] of logCalls.slice(0, guardPassed)) {
      expect(serialize(data), `${level} "${message}" logged the question before the guard`).not.toContain(MARKER);
      expect(chatId, `${level} "${message}" chatId`).toBe(CHAT_ID);
    }
    return { state, translateOutput: logCalls[guardPassed][3] };
  };

  describe.each(graphs)('%s', (name) => {
    it('translated question', async () => {
      translatesTo('spa')();
      const { state, translateOutput } = await runPastGuard(name);

      // The guard passed and translate handed the question on.
      expect(state.translationData.translatedText).toBe(DECODED);
      // After the guard the question is allowed, and node:translate output carries it.
      expect(serialize(translateOutput)).toContain(MARKER);
    });

    // Deliberately not logged, even after the guard: the rewrite is model output
    // no guardrail has checked (it could decode spelled-out or obfuscated PII).
    it('same-language rewrite is discarded and never logged', async () => {
      rewritesIn('eng')();
      const { state } = await runPastGuard(name);

      // The rewrite was discarded: the original question goes on unchanged.
      expect(state.translationData.translatedText).toBe(QUESTION);
      expect(state.translationData.noTranslation).toBe(true);
      expect(serialize(state)).not.toContain(REWRITE);
      for (const [level, message, , data] of logCalls) {
        expect(serialize(data), `${level} "${message}" logged the discarded rewrite`).not.toContain(REWRITE);
      }
    });
  });
});

// The runs above cover what listGraphs() returns. A graph file that is never
// registered would escape them, so every compiled graph must be registered.
describe('every graph is registered, so every graph is tested', () => {
  const graphsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  it('registers every graph module in agents/graphs', () => {
    // Subfolders too, so a graph added under e.g. agents/graphs/variants/ is caught.
    const compiled = readdirSync(graphsDir, { recursive: true })
      .filter((file) => file.endsWith('.js') && !file.split(path.sep).includes('__tests__'))
      .filter((file) => /\.compile\(/.test(readFileSync(path.join(graphsDir, file), 'utf8')))
      .map((file) => path.basename(file, '.js'));

    expect(compiled.length).toBeGreaterThan(0);
    expect([...listGraphs()].sort()).toEqual(compiled.sort());
  });

  it.each(graphs)('%s loads as a runnable app', async (name) => {
    const app = await getGraphApp(name);
    expect(typeof app?.invoke).toBe('function');
  });
});
