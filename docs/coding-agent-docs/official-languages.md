# Official languages

Everything here is something an agent needs to be aware of when **creating or
reviewing** user-facing content in this app — the Official Languages Act +
WCAG lang-tag legal requirement. Read this before writing or reviewing any
new copy, label, error message, or locale key — nearly every UI change
touches at least one of these. (For general writing quality — sentence case,
plain language — and the fuller locale-key maintenance practice, see
AGENTS.md's "Content style guide" and "Locale key hygiene" instead; both are
separate, non-OL concerns kept there.)

**English users and admins and partners must be served in English. French
users and admins and partners must be served in French.** This applies to
all pages and tools — public-facing, admin, and partner.

**Never hardcode user-facing text in components or pages.** All text visible
to users must use translation keys via `t()` and have entries in both
`src/locales/en.json` and `src/locales/fr.json`. When adding any new text
(column headers, labels, buttons, messages, placeholders, error messages,
status messages, option labels, etc.), always add the corresponding key to
both locale files in the same PR.

**A `t()` call whose fallback argument you're writing or editing must not
have one — write `t('some.key')`, never `t('some.key', 'Fallback text')` or
`t('some.key') || 'Fallback text'`.** A fallback is not a harmless safety net
just because the real key exists in both locale files today — it's exactly
what fires if that key is ever mistyped, renamed, or its FR entry goes
missing in a later edit, and the app degrades to silently showing English
instead of failing loudly. That's the one outcome an Official Languages
review can't catch by grepping for missing keys. Add the real key to both
`en.json` and `fr.json` in the same PR instead.

This covers brand-new call sites *and* any existing call's fallback argument
you're actively editing (e.g. syncing its wording to a locale-key rename) —
editing the argument makes it your line, not a pre-existing one you're
leaving alone. It does not mean retroactively stripping a fallback from some
other pre-existing call in a file you're touching for an unrelated reason —
leave those and flag them as a drive-by instead of silently rewriting them.

Verify parity with `node scripts/find-dead-locale-keys.cjs` (0 parity gaps
required before merging) — see AGENTS.md's "Locale key hygiene" for the
fuller practice around adding/reusing/namespacing keys.

## Exceptions
- **Backend/console/database output**: `console.log`, `console.error`, server-side log strings, developer-facing CLI output, and dynamic content retrieved from the database are exempt.
- **`<option>` `value` attributes**: e.g. workflow names like `GenericGraph` (`src/config/workflows.js`'s `WORKFLOWS`) — the `value` attribute itself is never rendered as visible text, only the paired `labelKey` is (translated via `t()`), so it isn't in scope for this rule to begin with.
- **Formal/proper names for a specific product or service**: e.g. `VectorPage.js`'s embedding-provider dropdown (`<option value="openai">OpenAI</option>`, `<option value="azure">Azure OpenAI</option>`) — "OpenAI" and "Azure OpenAI" are brand names, not translated, the same way you wouldn't translate "GitHub" or "MailChimp." This one *is* visible text that stays untranslated on purpose — don't confuse it with the `value`-attribute case above.

## An API response's `message`/`error` field is not exempt once it reaches the screen

The "server-side log strings" exception above covers `console.log`/`console.error`
— it does not cover an API route building a `message`/`error` string that the
frontend then renders directly (`{result.message}`, `text: data.message`,
`message={row.error}`). That's user-facing text like any other, and it always
renders in English regardless of the admin's chosen language.

`lang="en"` is a pronunciation patch (WCAG 3.1.2), not a translation — it's
the fallback of last resort for cases where translation isn't the solution,
not the default fix. Before reaching for it, check whether the source is
actually bounded:
- A **fixed, small set of strings** (a status enum, a handful of known
  outcomes), or an exception with a **stable code** (MongoDB/Mongoose errors
  have one, often sitting unused next to the free-text `message`) — translate
  properly, switching on that state/code through `t()`.
- Only a **genuinely unbounded** value (raw network/driver text, no stable
  code) gets `<span lang="en">`, and even then it's a TODO for a real fix, not
  a closed issue. See `DeleteChatSection.js`/`DeleteExpertEval.js` for the
  wrapper pattern and why raw text should never hit a `{message}` template via
  plain `String.replace` (see "Interpolating dynamic text" in
  [status-and-error-messaging.md](status-and-error-messaging.md)).

Example of the bounded case going unfixed: `DatabasePage.js`'s index tools
render `f.error`/`col.error` (MongoDB exception text) with no wrapper — but
the UI already displays that error's numeric `code` right next to it, so the
mappable piece exists and just isn't used. Check what's actually on the error
object before assuming a message is free text.

## Content in a *known* language still needs its own `lang` attribute — and two different rules apply depending on what the content is

The section above is about text with no fixed language of its own (an
exception message defaults to English because that's what the runtime
produces). This is the opposite case: content whose actual language is
already known and stored, but doesn't match the page's own `lang`. Two
different UI contexts need two different rules here — conflating them
produces the wrong result in both directions.

**Rule 1 — admin/eval tooling (dashboards, review panels, rating forms):
EN/FR show their own original text; anything else shows the English
translation.** This isn't a display preference — it's two separate, unrelated
constraints that happen to produce one rule:

1. **EN/FR side — the OL requirement.** EN and FR are Canada's two official
   languages, so a question/answer that arrived in either one is displayed as
   itself, full stop. This holds regardless of what translation data happens
   to exist for it — see point 2 below, an English translation is in fact
   generated for French questions too, and display still ignores it. This
   isn't an absence-of-data coincidence; it's the same OL requirement that
   governs every other page in this app, applied here via real data
   (`Question.language`, `models/question.js`) instead of a hardcoded
   "always English," and tagged accordingly (`lang="en"`/`lang="fr"`, same
   WCAG 3.1.2 Language of Parts criterion as the `lang="en"` wrapper above).
2. **Non-EN/FR side — the tool can't output what was never produced.** The
   question-understanding translation step (`GraphWorkflowHelper.translateQuestion`,
   called from every graph workflow — `GenericGraph.js`, `DefaultWithVectorGraph.js`,
   `GenericWithQAGraph.js`, `DefaultWithLocalModel.js`, `InstantAndQAGraph.js`)
   always targets English — `translateQuestion(state.redactedText, 'en', ...)`,
   hardcoded, never the page's own language, and runs unconditionally for
   every question regardless of detected language (so even an EN or FR
   question gets an `englishQuestion` populated — translating French to
   English, or English to itself — see point 1, display ignores it either
   way). There is no translate-to-French step anywhere in this pipeline,
   though, so for a genuinely non-EN/FR question, no French version of it
   ever exists to show. English is the only translated form that data
   constraint can ever produce — not a fallback of convenience, a ceiling on
   what the tool has to work with.

`resolveDisplayContent`/`getOriginallyAskedInLabel`
(`src/utils/answerLanguage.js`) implement this rule and are applied in
`ExpertFeedbackPanel.js`, `ChatDashboardPage.js`'s Question/Answer columns
(`api/chat/chat-dashboard.js`'s pipeline carries `questionLanguage`/
`englishQuestion`/`englishAnswer` for this), `ExpertFeedbackComponent.js`, and
`FeedbackComponent.js`/`SourceViewComponent.js` (the expert "How was
this answer?" prompt gates its rating choice behind a "Review the English
source text" step whenever the answer isn't already EN/FR, since a reviewer
can't meaningfully rate what they can't read). The download logs
(`chat-export-logs.js`) are untouched by this rule and keep full
original-language fidelity regardless of what these tools show.

**This is AI Answers' own English draft/working text, never call it a
"translation" in admin-facing copy or identifiers.** The English shown by
`resolveDisplayContent`'s `isSource`/non-EN/FR fallback (and everywhere it
feeds — `SourceViewComponent.js`, `OriginalLanguagePill.js`,
`ExpertFeedbackPanel.js`'s "Source text" column) is the same English draft
the model produced before generating the non-EN/FR answer, not a
machine-translation output being offered as a convenience. Framing it as a
"translation" risks reading as though the admin app runs its own
translation service - it doesn't, and shouldn't be described as one, in
visible strings, identifiers, or comments alike.

**Rule 2 — the actual conversation transcript: show the real language, never
collapse it.** A chat genuinely conducted in Arabic answers in Arabic, not
English — `agenticBase.js` translates the English draft answer into whatever
language the question was detected in, for any language the translation step
can identify (Canadian Indigenous languages excepted — see
`UNSUPPORTED_INDIGENOUS_ISO3`, `translationGuardrail.js` — those are blocked
before an answer is generated at all). Showing an English proxy here would
misrepresent what the end user actually experienced. Both bubbles get this
right: the answer bubble via `ChatAppContainer.js`, the question bubble via
`ChatInterface.js`'s `<p>{message.text}</p>`, each tagged with
`getAnswerLanguage`/`toLangAttr` (`answerLanguage.js`) and the real detected
language — not Rule 1's collapse-to-English.

Checked the other similar admin tables (`EvalDashboardPage.js`,
`AutoEvalDashboardPage.js`) — they only show `questionNumber` in their grids,
not the actual text, so this specific gap doesn't extend to those, but don't
assume that stays true as those pages evolve. Wherever raw question/answer
text does get rendered, a screen reader currently announces it in whatever
language the admin's own UI happens to be in, regardless of what language the
content is actually in. Flagging as a known gap, not fixed here.

## Number and percentage formatting

**This is an Official Languages requirement.** French and English have different conventions for numbers and percentages (`1 000` vs `1,000`; `45 %` vs `45%`). Any component or page that displays numeric data to users must format numbers and percentages using the shared helpers in `src/utils/numberFormat.js`:

```js
import { formatNumber, formatPercent } from '../../utils/numberFormat.js';

const fmtN = (n) => formatNumber(n, lang);   // 1 000 (fr) / 1,000 (en)
const fmtPct = (n) => formatPercent(n, lang); // 45 % (fr) / 45% (en)
```

- **`formatNumber(n, lang)`** — formats integers and large numbers with the correct thousands separator (`fr-CA` uses non-breaking space, `en-CA` uses comma). Handles `null`/`undefined` → `0`.
- **`formatPercent(n, lang)`** — appends `%` with a non-breaking space before it in French (`45 %`), no space in English (`45%`). Takes an already-computed integer (0–100), not a fraction.
- **`formatDecimal(n, lang, fractionDigits = 3)`** — formats a decimal number with locale-aware separators (`,` vs `.`) and a fixed number of decimal places. Pass-through for `null`/`undefined`/empty/non-numeric values.

Rules:
- Never use `+ '%'`, `'0%'`, or `'100%'` as literal strings in data displayed to users — always go through `fmtPct`.
- Never use `n.toFixed(d)` or inline `Intl.NumberFormat` for decimal values displayed to users — always go through `formatDecimal`.
- For DataTables columns with sorting enabled, pass raw numbers in the data object and use the `render: (d, type) => type === 'display' ? fmtN(d) : d` pattern so sorting operates on the raw value.
- These helpers apply to dashboards, tables, batch lists, and any other UI that surfaces counts, totals, or percentages.

## French punctuation spacing
Per the official Government of Canada style guide (*The Canadian Style*, TERMIUM Plus §17.07), Canadian French requires a space only before the colon `:` (e.g. `"Assigné à :"`) — English does not. Unlike France French, Canadian French does **not** put a space before `;`, `!`, or `?` (e.g. `"Continuer?"`, not `"Continuer ?"`). This has slipped through review before in two forms:
- A static `fr.json` string typed without the space before `:` (e.g. `"Assigné à:"` instead of `"Assigné à :"`).
- JS that hardcodes punctuation while building a label at runtime (e.g. `` `${label}: ${value}` ``) instead of putting the full punctuated phrase in the locale string. If code needs one literal separator shared across both languages, prefer a mark that doesn't have a French spacing rule (e.g. `" - "`) rather than `":"`.

## PR review checklist — official languages
Every PR that touches UI components, pages, or locale files must be verified against these before merging.

**Must fix before merging:**
- [ ] No hardcoded user-facing strings in components or pages (no `'English text'` literals, no `t('key', 'fallback')` or `t('key') || 'fallback'` patterns on any call site you wrote or edited, no `lang === 'en' ? '...' : '...'` inline conditionals)
- [ ] All translation calls use `t()` or `safeT()` — not raw string literals (`safeT` is a wrapper around `t()` used in chat components that unwraps object results to a plain string; same locale key rules apply)
- [ ] Every new `t('key')` call has a matching entry in **both** `en.json` and `fr.json`
- [ ] `node scripts/find-dead-locale-keys.cjs` reports **0 parity gaps**
- [ ] French translations are real translations — not copied English text or placeholders
- [ ] All numbers displayed to users go through `formatNumber(n, lang)` — no raw `.toLocaleString()`, `toString()`, or unformatted numeric values
- [ ] All percentages displayed to users go through `formatPercent(n, lang)` — no `+ '%'`, `'0%'`, or `'100%'` string literals
- [ ] French text has a space before `:` only (not before `;`, `!`, `?`) — check both static `fr.json` values and any JS that concatenates punctuation onto a label at runtime

**Flag but don't block:**
- Sentence case is generally preferred for all text visible to users — note inconsistencies (e.g. mid-sentence capitals, ALL-CAPS emphasis) in review and fix opportunistically
