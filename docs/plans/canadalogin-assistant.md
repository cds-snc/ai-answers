# Plan: CanadaLogin Assistant mode

## Problem

CanadaLogin is replacing the GC's legacy sign-in services (Sign in Canada, GCKey, Interac
Sign-In Partners, GCCF Consolidator, MFAaaS). The first eight SIC portals are moving now,
SIC is shut down in fall 2026, and GCKey is retired in 2028. Every user of every
participating portal has to either register or migrate. Some of those users will get stuck
part way through.

AI Answers already gets sign-in questions. But it is built for one-off Q&A: 3 turns per
conversation, one cited answer per turn. It can't walk someone through a 10-step setup.

Source: [CDS blog, 2026-09-28](https://digital.canada.ca/2026/09/28/simplifying-access-to-government-programs-and-services-with-canadalogin/).
CanadaLogin call centre: 1-833-712-2311.

## Goal

A **CanadaLogin Assistant mode** of AI Answers that guides a user through registering or
migrating, step by step. The user has it open in a separate tab or a side-by-side window
next to the CanadaLogin flow. For security it is never embedded in the sign-in page.

### Success criteria

- A user who arrives from a portal's "Get step-by-step help" link sees an assistant that
  already knows which portal they're setting up. It offers the right journey and leads
  them through it one step at a time, confirming each step before moving on.
- It never asks for, accepts or repeats passwords, one-time codes or recovery codes.
- It only sends users to `login.canada.ca` and the portal's own known domains. It never
  links to a look-alike URL.
- Regular AI Answers is unchanged: same 3-turn cap, same graph, same prompts.
- EN and FR at parity from day one.

## Decisions made (2026-11-01)

| Question | Decision |
|---|---|
| Entry point | A link on each portal's CanadaLogin help page opens AI Answers in a new tab and passes the **referring URL**. That URL tells us *which portal* the user is registering for or migrating. |
| Behaviour | **Proactive step-by-step.** The assistant drives: it gives one step, asks the user to confirm, then moves on. It helps when the user is stuck. |
| v1 journeys | New registration, migrating from Sign in Canada, migrating from GCKey or Interac Sign-In Partner. (Recovery and lost authenticators come later.) |
| Content source | **Live pages first.** The CanadaLogin help pages are the source of truth, read at answer time. The scenario stays thin: how to guide, safety rules, and the portal's help-page URLs. It doesn't copy their steps. |
| Turn limit | **Higher, still bounded, cap in assistant mode only** (starting point: 10). Regular mode stays at 3. |
| Input | **Keep the 260-character cap.** The assistant warns up front never to share passwords or codes. PII redaction stays on. |
| Layout | **Normal chat page.** The existing responsive layout already works at narrow widths. No new layout. |
| Ownership | **Joint.** The CanadaLogin team owns the help pages (the content). The AI Answers team owns the assistant scenario and evals. No separate content sign-off: the steps aren't copied into our prompts. |

## What exists today (relevant code)

- **Referring URL intake**: `?ref=` is parsed in `src/hooks/usePageParam.js`
  (`usePageContext`). It seeds `referringUrl` in `ChatAppContainer.js:147`, and is
  injected as `<referring-url>` by both the context agent and
  `GraphWorkflowHelper.sendAnswerRequest`, via `api/util/prompt-tags.js`.
- **Turn cap, in two places that must stay in sync**:
  - client: `MAX_CONVERSATION_TURNS = 3` in `src/components/chat/ChatAppContainer.js:59`
  - server: `maxTurns = 3` in `GraphWorkflowHelper.js:353`, which emits `<final-turn>`
  - copy: `limitReached` / `limitReachedHeading` in `en.json`/`fr.json` hard-code "3".
- **Workflow selection**: `api/chat/chat-graph-run.js` uses the `workflow.default` setting
  (production is `GenericWithQAGraph`). Only admins can override it.
- **Existing sign-in content**: `scenarios-all.js` §"Frequent sign-in Qs" (GCKey,
  Interac, changing sign-in methods) and `context-cds-snc/cds-snc-scenarios.js` (a
  CanadaLogin link to the digital-credentials page).

## Proposed design

### 1. Launch link and portal registry

The link on each portal's help page:

```
<EN host>/en?mode=canadalogin&ref=<encoded help-page URL>
<FR host>/fr?mode=canadalogin&ref=<encoded help-page URL>
```

The EN host is `ai-answers` and the FR host is `reponses-ia`.

Add a **server-side portal registry** (`config/canadalogin-portals.js`; the server owns it,
and the client only needs the mode flag). It maps referring-URL patterns to:

- portal name (EN/FR), owning department `abbrKey` (must exist in `departments_EN.js`)
- journeys available for that portal (registration, SIC migration, GCKey/SIP migration)
- per-portal notes (e.g. "ATIP AORS: after CanadaLogin, you land on …")
- allowed link domains for that portal

**The server decides whether a chat is in assistant mode, not the client.** It turns
assistant mode on only when `mode=canadalogin` is present **and** the referring URL matches
the registry. Without that check, anyone could add `?mode=canadalogin` to get a 10-turn
chat for any topic. If the referring URL is missing or unknown, the chat falls back to
normal mode.

Decided: if `mode=canadalogin` is present but the referring URL is unknown, the chat
**falls back to normal mode**. For testing before portals add the link, we use demo pages
hosted on the right domains, so their URLs match the registry.

Store `mode` and `portal` on the `Chat` document (`models/chat.js`) so dashboards and
evals can filter assistant chats apart from regular ones.

### 2. Pipeline: same graph, mode-aware nodes (no new graph for v1)

Recommendation: **don't add a new LangGraph workflow.** The safety-critical steps
(redact, PII guardrail, translate, verify, persist) are exactly what this mode needs.
Forking a graph means two copies of that code to keep in sync. Instead, the existing nodes
read `mode` from the graph input:

| Node | Change in assistant mode |
|---|---|
| `contextNode` | The department comes from the portal registry (no guessing). Search still runs, scoped to CanadaLogin and the portal's help pages. |
| `similarQuestions` | **Off in assistant mode for v1.** Past expert-rated answers come from 3-turn Q&A and would push the model toward one-shot answers. Turn it back on once there are expert-rated assistant chats. |
| `answerNode` | Loads the CanadaLogin assistant scenario and receives the new tags (below). Uses the mode's turn cap for `<final-turn>`. |
| `verifyNode` | Restricts citation and link URLs to the portal's allowed domains plus `login.canada.ca` and `canada.ca`. |

**New prompt tags**, built in `api/util/prompt-tags.js` and covered by tests asserting
they appear in the outgoing message (see AGENTS.md, "Never drop a prompt tag"):

- `<assistant-mode>canadalogin</assistant-mode>`
- `<portal>…name, journeys, per-portal notes…</portal>`

**Turn cap**: replace the two hard-coded `3`s with one value that depends on the mode. The
server sends the cap in the chat-init response, the client uses it, and
`sendAnswerRequest` takes it from the graph input. Locale strings need a variable instead
of a literal "3", with an assistant-mode variant that points to the call centre.

**Check before building:** confirm the server actually rejects turns past the cap, not just
the client. Also measure token growth over 10 turns. `conversationHistory` is sent in full,
so the context and answer costs on turn 10 may need history trimming.

### 3. Prompt and scenario content (prompt-maintainer work)

This part is **prompt tuning** and is gated by the maintainers (Lisa Fast, Ryan Hyma) per
AGENTS.md. It is a separate PR from the plumbing.

- New `agents/prompts/scenarios/canadalogin-assistant/` scenario, loaded **only** in
  assistant mode, so it adds no tokens to regular chats. Contents:
  - the role: a guide beside the user's sign-in tab who can't see their screen and relies
    on what they report
  - interaction pattern: one step per turn → ask for confirmation → handle "stuck" →
    next step
  - which help page covers each journey, so the assistant reads the steps from the live
    page and doesn't rely on its memory or a copy
  - only what the live pages leave out: known sticking points, escalation. Keep this
    short. Anything that also belongs on the help pages should go back to the CanadaLogin
    team as a content suggestion.
  - a hard rule: never ask for passwords, codes or recovery codes, and tell the user
    up front not to paste them
  - escalation: call centre 1-833-712-2311, or the portal's own support line
- Live content: the `downloadWebPage` tool reads the current help pages each time.
  Because the design depends on live pages, **the tool being able to read them is a
  Phase 0 blocker.** On 2026-11-01 every `login.canada.ca` path (`/en`, `/en/partners/`,
  `/en/users/get-started/`, `/fr/utilisateurs/`) returned the site's own "Page not found –
  CanadaLogin" page (HTTP 404) to a plain request from outside the GC network. The 404
  page itself links to `/en/users/get-started/` as "CanadaLogin user help". So either
  the site filters by network or client, or it isn't publicly launched yet.

  **Confirmed from AI Answers itself on 2026-11-01:** in a live chat, `downloadWebPage`
  failed with `Page not found (404): https://login.canada.ca/en/users/what-is-canadalogin/`.
  The model then fell back to canada.ca pages (the GCKey page and PrairiesCan's
  `…/prairies-economic-development/services/funding/cyber-authentication.html`), which it
  could read. Lisa is raising this with the CDS CanadaLogin team. The ask: allowlist AI
  Answers' production egress (IPs and/or `USER_AGENT`), or say when the user help pages
  will be public.

  How the block affects each part of the pipeline:
  - `downloadWebPage`: can't read the steps. **This is the blocker.**
  - The model's `checkUrl` tool also gets a 404 (`agents/tools/checkURL.js`), so the
    model may decide `login.canada.ca` links are dead and stop citing or linking them,
    even when they work fine in the user's browser.
  - The citation check in `verifyNode` is unaffected.
    `UrlValidationService.validateUrlFormatting` only checks formatting and makes no
    request, so `login.canada.ca` citations pass through.
  - Search: check whether `login.canada.ca` pages are in the search index at all.

  **Interim options for a demo build while waiting:**
  1. *(Recommended)* A temporary **snapshot of the CanadaLogin help pages as markdown
     files in the repo**, which the model downloads on demand. See "Interim: help-page
     snapshots" below.
  2. Rely on portals' canada.ca pages (like the PrairiesCan cyber-authentication page),
     which are readable. They don't have the step-by-step detail, so a proper
     walkthrough isn't possible this way.
  3. Wait. Nothing to demo until CDS fixes access.
#### Interim: help-page snapshots (until `login.canada.ca` is readable)

**There's already a pattern for this.** `context-sac-isc/sac-isc-scenarios.js` points the
model at `sac-isc-contacts.md` with a `⚠️DOWNLOAD
https://raw.githubusercontent.com/cds-snc/ai-answers/main/…` line. The model fetches it
with `downloadWebPage` only when its trigger matches. Three pieces of support already
exist:
- `agenticBase.js:59`: downloads of `raw.githubusercontent.com/cds-snc/ai-answers/…` are
  scenario instruction files and **don't count toward the 3-page download limit**
- `agenticBase.js:57`: ⚠️DOWNLOAD URLs whose trigger matches are fetched first and take
  priority over what the model already knows
- `agents/__tests__/scenario-instruction-files.test.js`: fails if a referenced raw URL
  points at a file that doesn't exist, or is pinned to a branch other than `main`

The snapshots work like live pages: they're only fetched when needed and cost no tokens
otherwise. When access is fixed, the swap is mechanical: replace each raw URL with the
real `login.canada.ca` URL and delete the files.

**Folder: a new `agents/prompts/scenarios/canadalogin/`, not `context-cds-snc/`.** The
CDS scenario only loads when the context agent matches CDS. In assistant mode the
department comes from the portal registry (e.g. PrairiesCan for its portal), so CDS
files would never be pointed to. A neutral folder can be referenced from **both**:
- the assistant-mode scenario (§3), which maps each journey step and its problems to
  the right file
- `cds-snc-scenarios.js`, so regular AI Answers chats about CanadaLogin get the same
  content. This helps the existing product as well, though it's a maintainer
  prompt edit.

**One file per help page**, so the model downloads only what the current step needs, e.g.:

```
agents/prompts/scenarios/canadalogin/
  README.md                          # TEMPORARY: why these exist, how to remove
  how-to-create-en.md / -fr.md
  two-step-verification-en.md / -fr.md
  problems-creating-profile-en.md / -fr.md
  problems-email-verification-en.md / -fr.md
  problems-creating-password-en.md / -fr.md
  problems-2sv-setup-en.md / -fr.md
  problems-creating-passkey-en.md / -fr.md
  problems-sms-phone-registering-en.md / -fr.md
  problems-sms-phone-signing-in-en.md / -fr.md
  supported-international-numbers-en.md / -fr.md
  migrate-from-sic-en.md / -fr.md    # when CDS provides it
  migrate-from-gckey-sip-en.md / -fr.md
```

Each file starts with a header the model can read:

```
TEMPORARY SNAPSHOT – source: https://login.canada.ca/en/users/get-started/
Modified on source: 2026-10-22 · Captured: 2026-11-01
Cite the source URL above, never this file's URL.
```

Rules and caveats:
- **Cite the real URL, never the raw GitHub URL.** The header says so, and the scenario
  repeats it. The citation check in `verifyNode` only checks formatting, so a
  `login.canada.ca` citation passes. But the model's `checkUrl` tool gets a 404 for
  those URLs, so the scenario must say "these URLs are live for users even though your
  tools can't reach them." Otherwise the model may refuse to link them.
- **The files must be on `main` before they can be read.** Raw URLs point at `main`, so
  a feature-branch demo can't load files that only exist on that branch. Merge the
  snapshot files as their own small PR first (content only, no behaviour change), then
  build the assistant on top.
- **EN and FR both.** Each language gets its own file. The scenario picks by the output
  language.
- **Body text only.** Copy the page text without navigation, footers or the Canada.ca
  menu. Keep the "Related help guides" links as titles with their real URLs, so the
  model can follow them to the next snapshot.
- **Stale copies are a risk.** The source pages say "modified 2026-10-22" and are still
  changing. Write the capture date in each file and in the README. Ask CDS to tell us
  when pages change until access is fixed.
- The repo is public. That's fine here: these are public help pages.

- **Existing prompt conflict to flag:** `scenarios-all.js` line 50 says that for most
  accounts you "must register again to change method." Once portals move to CanadaLogin,
  that is wrong for those portals. A maintainer needs to update it, separately from this
  plan.
- Write principles, not long rule lists (see feedback memories), and keep the steps in the
  scenario, not in the always-on files.

### 3a. Worked example: "How to create a CanadaLogin"

Source: `login.canada.ca/en/users/get-started/` (modified 2026-10-22). Lisa pasted it,
because we couldn't fetch it. What it means for the design:

**10 steps against a 10-turn cap: the assistant has to group steps.** If it guides one
step per turn, the happy path alone uses every turn and leaves nothing for problems. A
natural grouping uses about 6 turns and leaves about 4 for problems:

| Turn | Page steps | Why grouped this way |
|---|---|---|
| 1 | "Before you start" checklist + step 1 | Check the user has an email address and a phone *or* a passkey device before they start. With a referring URL, step 1 is already done: they came from a service. |
| 2 | Steps 2–4 (privacy notice, terms, name) | Simple clicks; tip: one name goes in the last-name field |
| 3 | Steps 5–6 (email + language, one-time code) | Main sticking point: **an email can only be used for one CanadaLogin**. If it's already registered, the error only appears after the code is entered. Personal vs business email. |
| 4 | Step 7 (password) | Rules: 12–65 characters, no common phrases |
| 5 | Step 8 (2-step verification) | The user picks **one** method: **phone** (text message *or* phone call) **or passkey / security key**. Then follow only that branch. Help them choose if needed (see below). For a passkey, ask which device or password manager they use, because the prompts differ. |
| 6 | Steps 9–10 (recovery method, done) | Strongly encourage a second method of the *other* kind. **If you lose every method, CanadaLogin can't restore access, and you have to create a new CanadaLogin.** This is the most important thing the assistant can say in the whole journey. |

The scenario shouldn't hard-code this table. It should state the principle: group
neighbouring steps that are simple; give steps that need a choice or often fail a turn of
their own.

**Secrets come up at several steps.** Every user gets an email code (step 6) and creates a
password (step 7). At steps 8 and 9 it depends on the method they pick: a phone user gets
a 6-digit code by text or voice call; a passkey user gets no code, just their device's
fingerprint, face or screen-lock prompt. The failure that matters most is at step 7: a
user asking *"is this password strong enough?"* and pasting it. The assistant has to
decline to look at any specific password and explain the rules instead. Add this as an
eval case alongside pasted codes.

**Helping a user choose a 2-step method** (source: the "What is 2-step verification?"
page, modified 2026-10-22). These are facts the assistant can use, not a recommendation
it pushes:

- **Passkey / security key:** made with fingerprint, face or screen lock; nothing to
  remember; resistant to phishing. Stored in a password manager (works across devices) or
  on the device only.
- **Text message:** needs a mobile phone on a cellular network. It may not work outside
  the country, and it may cost money on pay-per-text plans.
- **Phone call:** needs a landline or mobile; an automated call reads a 6-digit code. Good
  for users without a mobile phone or who can't receive texts.
- The page encourages **adding several methods**, so that losing one (e.g. a phone)
  doesn't lock you out. More methods can be added later under "Manage CanadaLogin".

**"Related help guides" are where the assistant goes when a user is stuck.** Each step
links a problems page ("Problems with creating a profile", "Problems entering and
verifying your email", "Problems creating a password", "Problems setting up 2-step
verification", "Supported international phone numbers"). The 2-step page adds "Problems
with creating a passkey", "How to add a passkey to your CanadaLogin", "Problems with
registering text message / phone call verification" and "Problems with signing in with
text message / phone call verification". The pasted text doesn't include
their URLs. Collect them in Phase 0. The scenario maps step → problems page so the
assistant downloads the right one when the user reports a problem.

**Migration journeys need their own pages.** This page covers creating an account only.
Ask for the SIC and GCKey/SIP migration help pages in Phase 0.

### 4. UI (minimal)

- Normal chat page and layout.
- Assistant mode shows a short intro: "I'll guide you through setting up CanadaLogin for
  *{portal}*. Keep this tab open next to your sign-in tab. Never type your password or
  codes here." EN/FR locale keys, sentence case, plain language.
- The turn counter and limit message use the mode's cap.
- No new route: mode is a query param on the existing chat page. (If we later want a
  bookmarkable page, register a route in `ROUTE_SLUGS` with real EN/FR slugs.)

### 5. Evaluation and measurement

- **Pre-launch evals**: build scripted multi-turn datasets (registration, SIC migration,
  GCKey migration, plus "stuck on step N" variants and users who paste a code) with a
  per-row `referringUrl` and `chatId`. Use the
  [per-row referringUrl / multi-turn dataset](dataset-referringurl-multiturn.md) work. If
  that isn't done yet, it blocks this step.
- **Expert evals**: the CanadaLogin team and portal partners review assistant chats in the
  existing review UI. Their human evals are what later turn `similarQuestions` back on for
  this mode. AI auto-evals never feed answers (see AGENTS.md).
- **Metrics** (filter on `Chat.mode`): chats started per portal, turns used, where users
  drop off (the last step reached), share that hit the cap, user-reported completion,
  public feedback. We can't see whether the account was actually created. If the
  CanadaLogin team can share aggregate completion rates per portal, compare before and
  after.

### 6. Docs to keep in sync

A new mode with its own behaviour counts as a pipeline change:

- `docs/architecture/pipeline-architecture.md`: mode flag, node changes, similarQuestions
  off in this mode
- `SYSTEM_CARD.md` + `SYSTEM_CARD_FR.md`: plain-language description, the
  never-share-codes guarantee, and the domain-restricted links (a safety claim, so both
  languages must match)
- `docs/architecture/using-evals-for-answers.md`: eval-informed answering is off in
  assistant mode

## Phases

| Phase | Work | Depends on |
|---|---|---|
| 0. Discovery | **Get our servers access to `login.canada.ca`** (blocker; in the meantime, merge the help-page snapshot PR to `main`). With the CanadaLogin team: the help-page URL for each journey; per-portal differences; common sticking points from call-centre data; which pages get the link. Lisa builds demo pages on the right domains for testing. | — |
| 1. Plumbing (behind a `canadaLoginAssistant.enabled` setting, off) | Portal registry, server-validated mode, `Chat.mode/portal`, mode-dependent turn cap (client + server + locale), new prompt tags + tests, similarQuestions skipped in mode, link-domain restriction in verify | — |
| 2. Prompt | Assistant scenario, fix to the `scenarios-all.js` sign-in rule, multi-turn eval batch | Phase 0 content; multi-turn dataset support |
| 3. Pilot | Turn on for 1–2 of the 8 SIC portals (choose by volume and partner readiness); partner expert evals; dashboard filter | Phases 1–2 |
| 4. Expand | Remaining SIC portals; GCKey/SIP migration as more portals onboard; consider recovery and lost-authenticator journeys | Pilot results |

**PR breakdown for review:** Phase 1 splits into (a) mode and portal registry + Chat
fields, (b) turn cap, (c) prompt tags + node changes. (a) and (c) share the registry
contract, so build and verify them together before splitting. Phase 2 prompt work is its
own PR(s), reviewed by a maintainer.

## Risks

- **Phishing pattern.** We'd be teaching users to follow a chatbot's directions into a
  sign-in flow. This is why link domains are restricted, the assistant never asks for
  secrets, and the call centre is the fallback. Get a security review before the pilot.
- **Content drift.** The CanadaLogin flow will change while it's rolled out. Reading
  the live pages handles most of this. The thin scenario layer (page URLs, sticking points)
  can still go stale, so ask the CanadaLogin team to tell us when page URLs or flows
  change.
- **The assistant can't see the screen.** Being proactive depends on what the user reports.
  The scenario must make the assistant ask what the user sees, not assume they're on the
  step it expects.
- **Cost.** 10-turn chats with full history cost several times as much as a 3-turn chat.
  The cap and the server-validated mode limit this; measure it in the pilot.

## Open questions

1. Is 10 turns enough for the longest journey? Measure in the pilot, using the share of
   chats that hit the cap and the last step reached.
2. Should each journey end with a "did it work?" check stored as completion data, or is
   public feedback enough?
3. When can our servers read `login.canada.ca`? Confirmed blocked from production (see §3). Lisa is following up with CDS.
