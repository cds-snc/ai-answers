# Plan: Test Coveo passage retrieval as an answer-agent tool

Status: Phase 1 done (see [Phase 1 findings](#phase-1-findings)). Phase 2 tool built. Phase 3
prompt block written. Trial 1 run on 2026-10-28 (see [Trial 1 results](#trial-1-results)); the
prompt and tool were changed after it. Trials 2 and 3 run on 2026-10-28 (see
[Trial 2 results](#trial-2-results) and [Trial 3 results](#trial-3-results)). Then an admin
chat option was added to force or offer the tool one question at a time, and three pairs were
compared (see [Admin chat comparisons](#admin-chat-comparisons), which ends with where to
pick up). Access to the Coveo Passage Retrieval (CPR) API comes through
the Canada.ca search API. The Canada.ca search team has confirmed the endpoint, that our
existing search credentials work with it, and how to limit passages to one page (see
[API notes](#api-notes)). Coveo's search engineer has advised on how to use it (see
[Coveo's advice](#coveos-advice)) and answered our questions (see
[Coveo's answers](#coveos-answers)).

> **Not for merging.** This branch is a time-limited trial while we have access to the Coveo
> Passage Retrieval API. Its PR stays in draft, and all testing runs in preview. It also
> changes a production prompt for the trial: the CRA scenario's blanket "use ⚠️ DOWNLOAD for
> urls in this scenario" line is removed (see [Trial 1 results](#trial-1-results)). Anything
> worth keeping goes to `main` in its own PR, with its own evaluation.

## Goal

Find out whether a `retrievePassages` tool lets the answer agent answer with fewer
`downloadWebPage` calls, cutting answer-step latency **without** lowering answer quality or
citation accuracy.

**Trial scope: CRA only.** CRA, IRCC and GAC are scraped into the passage model, but the
trial uses CRA alone to keep testing simple. The tool is offered only when the question is
matched to CRA. Page mode first accepted only CRA pages; after trial 1 it accepts any page
URL, because the passage index's scope has grown beyond CRA (see
[Trial 1 results](#trial-1-results)). Open mode uses the site-wide search context
on Coveo's advice, so it can return any canada.ca page; Phase 1 showed those non-CRA
passages are often relevant (the CERB contact numbers are on an ESDC page). IRCC and GAC can
follow if CRA works.

## Decision: a tool, not passages in search results

Earlier drafts also tested appending passages to `<searchResults>` at the search step. After
discussion with the engineer, that variant is dropped. The plan now tests one thing: a
passage tool the answer agent calls when it needs it, next to `downloadWebPage`. This matches
Coveo's advice (passages are an addition to search, called *when required*, as an agent tool).

The tool matches how the agent already works. It reads search results, then decides which
pages to download. A passage tool gives it a cheaper middle step, in two modes:

| Mode | Input | Replaces |
|---|---|---|
| **Page passages** | A question **and** a URL (e.g. a page from `<searchResults>`) | Downloading that page to find the relevant part |
| **Open passages** | A question only | Guessing which page to download; returns passages from several CRA pages at once |

Page mode is the main bet. Today the agent downloads a whole page to read one section of it.
Page mode returns just the passages from that page that match the question.

Dropping the search-step variant also removes its problems: no join by URL to our top 5, no
extra tokens in the context agent, and no doubled Coveo call on every question.

## Approach in one paragraph

Build the passage client first and exercise it from an admin test page against real
questions and URLs, until every part of the request is known to work. Then wrap that same client as a
LangChain tool, offered only in an experimental batch arm and only for CRA questions. A
short prompt block, loaded only with the tool, tells the model when a passage is enough to
skip a download. Compare against a production baseline on the same dataset.

**Where it runs:** everything, the test page and the tool, runs only in the PR's preview
deployment, never merged to production during the trial. Previews already have the Canada.ca
search key (standard search works there), and the passages endpoint is reachable from outside
the GC VPN (a request without credentials returns `401`, not a timeout).

### Why not a new workflow

- `services/experimental/ExperimentalBatchService.js` already passes batch config
  (`searchProvider`) into the graph, so a tool flag can travel the same way.
- The variant changes no graph nodes. It adds a tool to the answer agent. A copied graph
  (`DefaultWithVectorGraph.js` is ~400 lines) would drift from production and muddy the
  comparison.

### Why the prompt has to change

`agenticBase.js` Step 3 makes `downloadWebPage` **required** ("read at least 1 page before
answering"). Without a prompt change, the model can't skip the download, and it won't know
the new tool exists or when to use it. The tool must be listed under `### TOOLS`, with a line
on when to use it. Production prompts stay untouched.

### Direct API, not MCP

**Decision: no MCP, for security reasons.** All Coveo calls go directly to the REST API from
our own server code, as standard search does today. This also fits the codebase:

- Our tools are plain LangChain tools in `agents/tools/`, wired in `AgentFactory.createTools`.
  `ToolTrackingHandler` already records every call (`tool`, `duration`) as a `Tool` document,
  which gives us the batch metrics for free.
- The client reuses `canadaCaContextSearch.js`'s secret masking. It has no retries in Phase 1,
  so the test page's latency is one call; decide on retries when it becomes a tool.

We keep our own `downloadWebPage` rather than Coveo's "fetch", because it reads the **live**
page (see risk 2). We keep our own search step, because the context node depends on it.

## API notes

### Confirmed by the Canada.ca search team

- **Endpoint:** `POST https://employmentandsocialdevelopmentcanadaproduction3vn562uw.org.coveo.com/rest/search/v3/passages/retrieve`
  — the Coveo org behind standard search. Our standard search calls it through a proxy on
  `apps.canada.ca`; the passages client calls Coveo directly.
- **Auth:** our existing bearer token (`CANADA_CA_SEARCH_API_KEY`) works. No new credentials.
- **URL:** a constant in the client, not an env var. It isn't a secret, and it can't be
  built from `CANADA_CA_SEARCH_URI`: in the preview that points at a proxy on
  `apps.canada.ca`, not at Coveo. A new env var would need an SSM parameter and a line in
  `.github/scripts/create-lambda-function.sh` before previews could see it.
- **Passages for one page:** add a `filter` on `@clickableuri`. The same call can either
  return all passages from a page or search for passages only within it. Example request
  from the search team:

  ```json
  {
    "query": "how do i appeal a CRA decision?",
    "filter": "@clickableuri==\"https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/p148/p148-resolving-your-dispute-objection-appeal-rights-under-income-tax-act.html\"",
    "localization": { "locale": "en", "timezone": "America/Montreal" },
    "context": {
      "customContext": "globalSemantic",
      "searchPageUrl": "https://www.canada.ca/en/revenue-agency/search.html",
      "searchPageRelativeUrl": "/en/revenue-agency/search.html"
    },
    "pipeline": "Canada public websites - Generic - customContext",
    "searchhub": "canada-gouv-public-websites",
    "locale": "en",
    "additionalFields": ["clickableuri"],
    "maxPassages": 20
  }
  ```

  For open mode, drop `filter`. The CRA search page context already limits results to CRA
  (see [Answered by Coveo](#answered-by-coveo-department-scoping)).

- **Fields:** every indexed URL has fields such as `dateissued`, `datemodified`, `title` and
  `author`. Any of them can come back through `additionalFields`.

**`customContext: 'globalSemantic'` is required.** It turns on the Semantic Encoder, which
passage retrieval needs. Every call must send it. Start from the example body as-is and
change one thing at a time.

### Differences between the two examples we've been given

The first example (from before the URL question) and the one above differ. The test page's
raw mode should pin down which settings matter:

| | First example | URL-filter example |
|---|---|---|
| `pipeline` | not set | `Canada public websites - Generic - customContext` |
| Locale | `localization.locale: 'en-CA'` | `localization.locale: 'en'` and top-level `locale: 'en'` |
| Search page | `/en/sr/srb.html` (Canada.ca search) | `/en/revenue-agency/search.html` (CRA search) |
| Search hub key | `searchHub` | `searchhub` (lowercase) |
| `maxPassages` | 5 | 20 |

The search page matters: the CRA one scopes results to CRA, the Canada.ca one doesn't (see
[Answered by Coveo](#answered-by-coveo-department-scoping)). Questions left for the test page:
is `searchhub` vs `searchHub` just case-insensitive? Is the named pipeline required?

### From Coveo docs (not yet confirmed for our org)

- Body accepts `filter` (advanced query expression), `maxPassages` 1–20, up to 20
  `additionalFields` (`primaryid` always returned), and `pipeline`.
- Response is a list of passages sorted by relevance, each with text, score and the source
  document's fields. Response size is capped at 540 KB.
- Docs list languages other than English as **beta**. Coveo says many customers use them in
  production (see [Coveo's answers](#coveos-answers)).

Docs: [Use the Passage Retrieval API](https://docs.coveo.com/en/o86c8334/),
[Passages V3 reference](https://docs.coveo.com/en/13/api-reference/search-api#tag/Passages-V3),
[About CPR](https://docs.coveo.com/en/oaie5277/),
[CPR implementation overview](https://docs.coveo.com/en/oaoe7068/).

## Phase 1 — Passage client and admin test page

Everything in this phase runs in the PR's preview deployment, through the browser. No local
setup. The client is built first, as the module the tool will later wrap, so the test page
exercises the real code path and nothing is rewritten when it becomes a tool.

### 1a. Client: `agents/tools/canadaCaPassages.js`

- `retrievePassages({ query, url, lang, maxPassages })`. Builds the confirmed request body.
  With `url`, adds the `@clickableuri==` filter.
- **URL check.** A `url`, if given, must be an https URL; anything else returns
  `invalid_url` with no call made. Until trial 1 it also had to be a CRA page (under
  `/en/revenue-agency/`, `/fr/agence-revenu/`, `/en/services/taxes/` or
  `/fr/services/impots/`). That check was removed after the passage index's scope was
  expanded to many more pages. A page outside the index returns no passages.
- Uses the site-wide Canada.ca search page context (`/en/sr/srb.html`, `/fr/sr/srb.html`)
  for the language, on Coveo's advice: it gave better results than the CRA search page in
  testing. It doesn't scope results to CRA, so open mode can return any canada.ca page; page
  mode is unaffected because the URL filter already limits it to one page.
- Returns passages with text, score, `clickableuri`, `title` and `datemodified`, plus the
  request body sent, the HTTP status and the latency (the test page shows these).
- Explicit `AbortSignal.timeout`. On failure or timeout, returns an empty result with a
  reason. Never throws into the agent.
- Masks the bearer token in logs, as `canadaCaContextSearch.js` does.
- Tests (vitest, mocked fetch): request body for page mode and open mode, `globalSemantic`
  always present, scope check rejects non-CRA URLs, failure and timeout return an empty
  result.

### 1b. Admin endpoint: `api/experimental/experimental-passages-test.js`

- `POST`, admin only: `withProtection(handler, authMiddleware, adminMiddleware)`, as
  `util-connectivity.js` does. Registered in `server/server.js`.
- Two modes:
  - **Client mode** (`{ query, url, lang, maxPassages }`): calls `retrievePassages`. This is
    what the tool will do.
  - **Raw mode** (`{ body }`): sends an edited request body as-is, with our auth added on the
    server. This is for trying the open settings one at a time (pipeline, search page,
    locale, `searchhub` spelling, French) without a redeploy per change. Whatever works gets
    built into the client.
- The key never leaves the server. The response returns the body sent, status, latency and
  the passages (or Coveo's error body).
- Validate inputs strictly (string query, optional string URL, `maxPassages` 1–20, `body` a plain object), and fail with `400` otherwise.

### 1c. Admin page: "Passage retrieval test"

A small admin page under the experimental section (route `experimental-passages`, e.g.
`experimental/passages` in both languages — "passages" is also the French word), linked from
the admin page's experimental list. Layered as usual: service → hook → page.

1. **Single query.** A form with question, optional CRA URL, language and `maxPassages`.
   "Send" runs client mode. The result shows the request body sent, status, latency, and
   each passage: score, URL, title, `datemodified`, text length and text.
   **Edit request** copies the body into a JSON text area; "Send raw" runs raw mode. This
   is how we get each piece of the API working: the example body first, then one change at
   a time (the questions in
   [Differences](#differences-between-the-two-examples-weve-been-given), French, open mode).
2. **Probe run.** Upload a CSV in the same format as our existing batch input exports
   (e.g. `CRA-T2 EN Golden.csv`): `chatId, createdAt, referringUrl, question, citationUrl,
   answer`, UTF-8 with a BOM. The page uses `question` as the query and `citationUrl` as the
   page-mode URL, and carries `answer` through to the results so passages can be judged
   against it. There's no language column, so the language is picked on the page for the
   whole file. Leading batch numbering (`01. `) is stripped from the question before sending,
   because CPR uses the query as sent. Each row runs in both page mode and open mode.
   The browser sends one call at a time, at most 2 per second (Coveo's limit is 5 QPS,
   possibly shared with production; see risk 6), and shows progress. "Download results"
   saves JSON and CSV with every row's question, golden answer, passages, status and
   latency. Running the loop in the browser keeps each request short, well under the
   preview Lambda's 300-second timeout.

Admin page conventions still apply: EN/FR locale keys, the labelled "back to admin" `<nav>`,
`StatusMessage` for errors and progress (never a raw `err.message`), sentence case.

The page exists for the trial. Whether it stays if the tool ever ships is a later decision.

### 1d. What the probe measures

Inputs for the probe run: start with `CRA-T2 EN Golden.csv` (14 golden CRA questions, all
citing `canada.ca/en/revenue-agency` pages), then a larger chat export of ~150 recent CRA
questions in the same format. English first; ~30 French once French single queries work.
Answer rate is judged by reading the downloaded passages against each row's answer.

| Measure | Question it answers |
|---|---|
| **Page-mode answer rate**: for the golden questions, do the passages from the cited URL hold **enough** to answer without downloading the page? | Can page mode replace a download? (Coveo is clear passages are nearby text, not answers.) |
| **Open-mode answer rate**: same questions, no URL. The results flag whether any passage came from the row's `citationUrl` | Does open mode find the right page on its own? |
| **Coverage**: share of cited URLs that return ≥ 1 passage | Are the pages we cite actually in the passage model? |
| **Latency**: p50/p95 per call, both modes | Is a passage call clearly cheaper than a download? |
| **Size**: tokens per response at `maxPassages` 5, 10 and 20, vs a typical `downloadWebPage` result | Token cost, and a sensible default `maxPassages` |
| **Freshness**: `datemodified` on passage pages vs the live page | How stale can a passage be? (Feeds risk 2.) |
| **Tables and format**: spot-check pages with rate/amount tables; note Markdown vs plain text | Does chunking keep rows and headers together? |
| **French**: same scoring on French questions | Is French (beta) good enough to include in the experiment? |

**Stop here** if passages rarely contain the answer. Share the results with Coveo before
tuning; the pipeline settings (passage count, thesaurus, Semantic Encoder threshold/boost/item
count) are theirs to change.

### Phase 1 findings

Probe run on 2026-10-22: the 14 golden CRA questions, English, `maxPassages` 5, each row in
page mode and open mode. Questions were sent raw, with users' typos ("taxx", "owning",
"revenue Canada"). The agent will send a cleaned-up query, so open mode should do better as a
tool. Results were shared with Coveo.

**Coverage (page mode): 10 of 14 cited pages returned passages.** The 4 empty results were
on 3 URLs:

- `.../about-your-tax-return/change-your-return.html`: open mode returned the same content
  from the services-level copy, `/en/services/taxes/.../after-you-file/change-return.html`.
  Canada.ca has duplicate pages like this, so a URL match undercounts.
- `.../about-your-tax-return/a-copy-your-notice-assessment-reassessment.html` (2 questions)
- `.../publications/t4040.html` for the RRIF/LIF question. That page **is** indexed (the
  "what is form T4040" question got passages from it); the in-page search found nothing
  relevant on what is only a landing page. So an empty page-mode result means either "not
  indexed" or "nothing relevant here", as Phase 2 item 6 assumed.

**Open mode found the cited page for 2 of 14 questions** (RRSP at 72, T4040), or 2 of the 10
indexed pages. But it often found other relevant pages, so judge it on whether a passage
answers the question, not on the URL:

- CERB debt → the ESDC CERB page, which lists the CRA and Service Canada numbers, and
  `repay-covid-benefits/how-make-payment.html`
- RRIF/LIF beneficiary → IC78-18 (RRIFs) and the T4040 RRSP chapter, better than the cited
  landing page
- Non-resident status → 4 passages from `.../information-been-moved/determining-your-residency-...`.
  If that's a moved page, it's the same stale-ranking problem as the "ANNULÉ" French result.

**Passages are much bigger than Coveo's docs suggest.** The docs describe ~400-token chunks;
these run close to whole pages:

| | Typical passage | Largest | Total per call |
|---|---|---|---|
| Page mode | 2k–8k characters | 21k | up to ~26k characters (3 passages) |
| Open mode | 10k–15k characters | 80k | ~45k–130k characters (~12k–32k tokens) |

In the CERB example, one passage runs to the page's "Page details" footer and the next starts
at its H1. Together they're the whole page, with a section repeated. Short pages come back
whole (T4040 at 831 characters, "RRSP options when you turn 71" at 2,181). `downloadWebPage`
returns the page as Markdown up to 48k tokens, and the median page is ~1,200 tokens. So a
passage call is **not** smaller than a download, and in open mode it can be much bigger. This
looks like fixed-size chunking with heavy passage merging (still-open question 4).

**Page mode usually returns 1 passage** (8 of the 10 indexed pages), even with `maxPassages` 5.

**Scores look rank-based.** The top page-mode passage always scores 0.200 and the next ones
step down (0.183, 0.156). The model can't use them as a confidence threshold.

**Latency:** page mode p50 ~220 ms (max 282), open mode p50 ~280 ms (max 394). One direct
comparison on `rrsp-options-when-you-turn-71.html`: `downloadWebPage` took 660 ms in a chat
trace, against 278 ms for page mode and 511 ms for open mode on the test page. That's one
sample, and `downloadWebPage` has a storage cache, so a cache hit could be faster. On that
page the passage was the whole page, so the token cost was the same. Any saving is in the
call, not in what the model reads.

**What this changed in Phase 2:** `maxPassages` is 3, not 5, to keep a result near one page's
size. Open mode stays in the tool, because it finds relevant pages even when they aren't the
cited one. The experiment measures whether either mode saves time end to end.

## Phase 2 — `retrievePassages` tool

Built. To run an arm, tick **Offer the passage tool to CRA questions** on the batch analysis
page. That sets `config.passageTool` on the batch, and adds "Passage tool" to the run name.

1. **Tool.** `agents/tools/retrievePassages.js`: a LangChain tool wrapping the Phase 1 client.
   Inputs: `query` (a focused question in the user's words) and optional `url` (any page
   URL; CRA pages only until trial 1).
   - Asks for 3 passages (see [Phase 1 findings](#phase-1-findings) on size).
   - Each passage comes back as title, URL, date modified and text.
   - In page mode the language comes from the URL (`/en/` or `/fr/`). In open mode it's the
     batch's page language.
   - Retries a 429 after 1 and 2 seconds (risk 6). The client itself still never retries, so
     the test page keeps measuring single calls.
2. **Gating, two layers:**
   - **Offered only for CRA questions.** `AnswerGenerationService.invokeAgent` passes
     `passageTool: true` to `createChatAgent` → `createTools` only when the batch flag is on
     **and** the department is `CRA-ARC`. Every other question, and all production traffic,
     gets today's tools.
   - **No page check since trial 1.** The tool used to refuse non-CRA URLs. It now sends
     any https URL to Coveo, so the question stays CRA-only but the pages it reads needn't
     be.
3. **Plumbing.** The flag travels in the graph request context (`graphRequestContext`, the
   `AsyncLocalStorage` that already carries the batch user into the run), not through graph
   state. `ExperimentalBatchService._processItem` sets `passageTool` from
   `batch.config.passageTool`, and `invokeAgent` reads it. This changes no graph, no
   `sendAnswerRequest` payload and no prompt tags. Chat runs never set it (the admin chat
   option in item 8 sets a separate field).
4. **Tracking.** Wrapped with `ToolTrackingHandler` like the other tools, so calls and
   durations land in `Tool` documents.
5. **Tests.** `agents/tools/__tests__/retrievePassages.test.js` (formatting, language, empty
   results, out-of-scope, failure, 429 retries). Gating in `AnswerGenerationService.test.js`,
   tool list in `AgentFactory.test.js`, flag in `ExperimentalBatchService.test.js`.
6. **No passages for a page.** Page mode returns nothing both when the page doesn't answer
   the question and when the page isn't in the index. Phase 1 saw both. Coveo doesn't tell
   these apart, so the tool result says no passages were found and to use `downloadWebPage`.
7. **Repeated text removed (added after trial 1).** Passages from one page overlap, so the
   tool drops any paragraph an earlier passage of the same page already gave, and notes that
   it did. A passage with nothing new left is dropped. Text shared by different pages is
   kept. This cuts what the model reads but not the call time; chunk size is with Coveo
   (still-open question 4).
8. **Admin chat option (added after trial 3).** Trials kept stalling on the model's choice:
   a single-question batch downloaded on three tries running. So the admin chat's
   **Options** panel has a **Passage tool (trial)** setting, to run one question at a time
   and read the trace:
   - **Off:** today's tools.
   - **Offered:** the tool and the Phase 3 prompt block, as in a batch, but for **any**
     question, not only CRA ones.
   - **Forced first:** as Offered, but the first tool call must be `retrievePassages`.
     After any tool has run, the model chooses freely. This overrides a clarifying
     question on the first turn. GPT-5.1 (Azure) agent only; the Claude agent refuses it.

   Admins only, checked on the server (`chat-graph-run.js` sets `passageToolChatMode` in
   the request context; partners, signed-out users and batch questions are ignored). Not
   stored: a reload turns it off. The batch checkbox is unchanged and stays CRA-only.

Without the Phase 3 prompt block the model sees the tool and its description, but
`agenticBase.js` Step 3 still requires a download. So a run before Phase 3 measures
"passages **plus** downloads" (risk 4), not the saving.

Search stays on `canadaca`, so the tool is the only thing that changes.

## Phase 3 — Prompt variant (maintainers only)

Per AGENTS.md, this is a prompt change and needs a maintainer (Lisa Fast or Ryan Hyma) to
write and approve it. **Drafted, awaiting maintainer review.**

- **Plumbing (code):** `invokeAgent` passes the same `passageTool` value it gives
  `createChatAgent` into `buildAnswerSystemPrompt`, so the block loads exactly when the tool
  is offered. Tests: `agents/__tests__/systemPrompt.passageTool.test.js` and the gating
  block in `AnswerGenerationService.test.js` (CRA with the flag gets it; another department
  or no flag doesn't).
- **Prompt:** `agents/prompts/passageToolPrompt.js`, appended after `BASE_SYSTEM_PROMPT` as
  "PASSAGE TOOL — amends Step 3". No shared prompt file changes, so production prompts and
  `docs/agents-prompts/system-prompt-documentation.md` are untouched. In short:
  - try passages for a CRA candidate URL before downloading it, even when a download looks
    likely; open mode only when no URL fits
  - a passage counts as reading the page for Step 3, and a passage that states the answer
    can be cited without a download
  - download only when the passage leaves the answer open: off-topic, cut off, a rule,
    amount or deadline without its conditions or exceptions, or a yearly amount or rate
    without its year (lost-context and freshness risks)
  - scenario ⚠️DOWNLOAD URLs still get downloaded
  - at most one passage call per page, plus one open-mode call. These don't count toward
    the download limit, so a weak passage can always be checked with a download. Worst case
    is about 3 passage calls plus 3 downloads; the Phase 4 metrics show how often that
    happens.
- Step 3's "REQUIRED" wording is left alone; the block amends it. If arm results show the
  model still downloads after a good passage, strengthen the block before touching Step 3.
- After trial 1 the download rule was reworded to judge the passage, not the topic, and to
  call passages even when a download looks likely (see [Trial 1 results](#trial-1-results)).
- After admin chat pair 3, the download rule adds "it lacks the specific date, amount or
  figure the question asks for", says passages often leave out expandable sections and
  tables, and says not to answer around a missing fact (e.g. "sign in to check"). See
  [Admin chat comparisons](#admin-chat-comparisons). Pair 3's passage turned out to have
  the date, so this rule doesn't cover what went wrong there; see item 4 under "Where to
  pick up".
- After the pair 3 reruns (2026-10-29), the block says a passage also counts as
  downloaded content wherever the prompts say to verify specifics, and to give a date or
  amount the passage states. In two of three reruns the model had the date in the passage
  and still sent the user to My Account.

## Phase 4 — Metrics in batch results

Before running arms, confirm batch items expose, per item:

- the number of `downloadWebPage` and `retrievePassages` calls (from the linked `Tool`
  documents, which already record `tool` and `duration`), and page vs open mode
- answer-step duration and total duration
- whether the tool was offered (flag on and department `CRA-ARC`)
- the share of answers given with **zero** page downloads

If any of these aren't on the batch results / analysis pages, add them there, not in a
one-off script, so later runs reuse them.

## Phase 5 — Experiment

Use the same dataset for both arms: about 150 CRA questions with reference answers, English (plus French if Phase 1 shows it works). Run 2–3 trials per arm to smooth
out model nondeterminism.

| Arm | Passage tool | Prompt | What it tells us |
|---|---|---|---|
| Baseline | off | production | Reference point |
| Tool | on (CRA only) | tool variant | Does the tool cut downloads without hurting quality? |

Compare: downloads per answer, passage calls per answer (by mode), answer-step and total
latency (p50/p95), expert score (`ExpertScorerAnalyzer` against reference answers), citation
accuracy, and zero-download rate.

### Trial 1 results

**Run:** 2026-10-28. The same 14 CRA questions used in Phase 1, passage tool on, first
draft of the Phase 3 prompt block. Two questions got clarifying questions, which leaves 12
answers. A small trial to check behaviour before the full arms, not a measurement.

**Few answers used the tool.** 3 of 12 answers called `retrievePassages`; the other 9 went
straight to `downloadWebPage`.

| | Answers | Notes |
|---|---|---|
| Passages, no download | 2 | Q5 (`noa-nor.html`, page mode) and Q13 (non-resident page, two passage calls) |
| Passage call rejected, then download | 1 | Q14 passed `/en/services/benefits/calendar.html`, which isn't under the CRA paths the tool accepts. Rejected in 2 ms. |
| Download only, scenario ⚠️DOWNLOAD | 2 | Q10 and Q12, `cra-login-services.html`. The CRA scenarios mark every URL they list as ⚠️DOWNLOAD and require one before giving in-account steps. Working as intended. |
| Download only, other | 7 | Overpayments, RRSP at 71 (2), disability tax credit, T4040, RRIF beneficiary, information returns |

**Why the model skipped passages.** The first draft said to download whenever the answer
"turns on eligibility, amounts, rates or deadlines". Most CRA answers do, so the model
reasonably skipped a passage call it expected to follow with a download anyway. The rule now
judges what the passage shows (off-topic, cut off, a rule or amount without its conditions,
a yearly amount without its year), and the block says to call passages even when a download
looks likely.

**Passage calls were slow.** Both page-mode calls took about 5 seconds (4,983 ms and
4,981 ms). Phase 1 measured a p50 of about 220 ms per call. Downloads in the same trial took
103–4,257 ms, most of them 300–1,200 ms. The two near-identical times fit the 429 retry path
(three attempts plus the 1 s and 2 s waits), but the tool doesn't log retries, so this isn't
confirmed. Q5's call did return passages, not the "unavailable" message. If the cause is the
shared 5 QPS limit (risk 6), every passage call in a batch costs more time than the download
it replaces.

**Passages were no smaller than the page.** Q5 asked for 3 passages and got 2. Passage 1
was essentially all of `noa-nor.html`, about 10,000 characters. Passage 2 repeated most of
passage 1's second half, then added the rest of the page. The model read the page and a
large duplicate, which is more than a download returns. This matches the Phase 1 findings on
passage size. The page's processing-times content is an interactive widget, so the passage
said to check processing times but gave no timeframe.

**Expandable sections are missing from passages.** After the CRA-only check was removed,
the test page showed `calendar.html` is in the passage index, so Q14's rejection was our
check, not Coveo's scope. But the passage has none of the payment dates. The page keeps each
year's dates in an expandable section, and the passage has only the section labels
("Canada child benefit 2026", "Canada child benefit 2025") with nothing under them.
`downloadWebPage` returned every date. For Q14 ("see my Canada child benefit payment
dates") the passage couldn't answer, and it could mislead: a list of years with no dates
reads like a page with no dates. The prompt's "cut off" condition should trigger a download
here; trial 2 will show whether it does. Any page that puts its answer in expandable sections
(common on canada.ca) has the same problem. See still-open question 11.

**Changes made after trial 1:**
- Prompt: the download rule reworded as above (Phase 3).
- Tool: repeated text from the same page removed (Phase 2, item 7).
- Coveo is investigating chunk size (still-open question 4).
- Tool and test page: the CRA-only page check removed. The passage index's scope has been
  expanded to many more pages, and Q14's rejection couldn't show whether
  `calendar.html` was in it. A page outside the index now returns no passages instead.
- CRA scenario: removed the opening line that marked every URL in the file ⚠️DOWNLOAD. Step 3
  of `agenticBase.js` already requires a download, and the blanket line forced downloads of
  scenario URLs such as `cra-login-services.html` that passages might cover. The line
  requiring a ⚠️DOWNLOAD before giving in-account steps stays. This is a production prompt
  file, which is one reason the branch isn't for merging.
- Tool: each passage attempt is logged against the chat ("retrievePassages attempt", with
  attempt number, page or open mode, URL, HTTP status, failure reason, Coveo latency and
  passage count). A slow call now shows whether it was 429 retries or one slow response.

### Trial 2 results

**Run:** 2026-10-28, after the [changes made after trial 1](#trial-1-results). The same 14 CRA
questions, two trials, which gave 20 answers. Like trial 1, a check on behaviour, not a
measurement.

**Use didn't change.** 3 of 20 answers called `retrievePassages`, against 3 of 12 in trial 1.
At this size the two can't be told apart. The choice also wasn't stable: each question that
used passages in one trial downloaded the same page in the other.

| Question | Trial A first call | Trial B first call |
|---|---|---|
| CERB debt (`contact-canada-revenue-agency-about-your-debt.html`) | download | passages |
| RRSP at 72 (`rrsp-options-when-you-turn-71.html`) | passages | download |
| Non-resident (`non-residents-canada.html`) | passages | download |

All three calls were page mode, with a URL. None used open mode.

**Answers that used passages didn't need a download.** Almost every answer made one tool
call. Only 4 made a second, all downloads that followed a first download. None of the three
passage answers downloaded afterwards. Their accuracy hasn't been checked yet.

**Removing the CRA-only page check made no difference here.** Every URL the model called was
a CRA page.

**Passage calls were still slow:** 5,142, 4,898 and 5,026 ms, against 300–1,700 ms for most
downloads. That's the same ~5 seconds as trial 1. The "retrievePassages attempt" logs should
show whether these were 429 retries. Two trials running in parallel would add to the load on
the shared 5 QPS limit (risk 6). Until this is fixed, a passage-only answer is slower than a
one-download answer.

**Why the model mostly skips passages (likely).** The passage block is appended to the
prompt and amends Step 3. Step 3 of `agenticBase.js` says the opposite, more strongly:
"DOWNLOAD RELEVANT WEBPAGES → use downloadWebPage tool", "downloadWebPage TOOL CALL —
REQUIRED", "Call downloadWebPage tool NOW". None of the downloaded URLs carry a ⚠️DOWNLOAD
marker in the CRA scenario, so the scenario isn't the cause.

**Open next steps (not decided):**
- Check the attempt logs for 429s before any further trial.
- Read the three passage answers for accuracy.
- Consider separating the two questions. "Does the model choose passages?" and "are passages
  good enough when used?" need different arms. At 15–25% use, a choice-based arm won't give
  enough passage answers to judge quality. A forced passage-first arm would.
- If choice is still being tested, the passage instructions probably need to replace Step 3's
  wording when the tool is offered, not add to it. That's a base prompt change for the
  maintainers.

### Trial 3 results

**Run:** 2026-10-28, same setup as trial 2 but one trial instead of two, to test whether
the shared 5 QPS limit was the problem.

**Use:** 5 of 12 answers called `retrievePassages`. With 3 of 12 in trial 1 and 3 of 20 in
trial 2, that's still within chance. The rate limit also couldn't change it: the model picks
the tool before any request reaches Coveo.

**Passage calls still took over 5 seconds each.**

**The rate limit wasn't the cause, at least for the call we traced.** The trace of the CERB
debt chat (admin "Trace a chat") shows one "retrievePassages attempt" entry: `attempt: 1`,
`status: 200`, `latencyMs: 5539`, 2 passages. There was no 429 and no retry. `latencyMs`
times only the HTTP request to Coveo, so the 5.5 seconds wasn't spent in our code.

**A cache-hit download in the same chat also took about 5 seconds** (`duration: 5042`). A
cache hit reads our own cache and never calls canada.ca. In trial 2, cache hits took 38–40
ms. So in this run, a read from our own storage and a Coveo request both took about 5
seconds. That points to the server or its network at the time, not to Coveo alone. A fixed
~5 seconds on separate network calls fits a DNS lookup where the first resolver times out
(the default is 5 seconds) before a second answers. This is a hypothesis, not confirmed.

Trace timestamps are when each log entry was saved, not when the event happened
(`ServerLoggingService` sets `createdAt` at write time). Two entries logged at the same
moment ("Web page cache lookup" and "Tool execution completed") were saved 5 seconds apart,
so log writes were slow too. Don't read the gaps as tool timings.

The model also downloaded the page first, then called passages on the same page. Passages
added time and nothing new.

**Next:**
- Run a few questions on the passage test page on the same deployment, once idle and once
  during a batch. About 220 ms idle and 5 seconds during the batch means load on our side. About
  5 seconds both times means something changed since Phase 1, in Coveo or the network path
  to it.
- Check `duration` on other cache-hit downloads in this run. If they're all about 5
  seconds, the delay is in the environment.

### Admin chat comparisons

Run 2026-10-28 with the admin chat's passage tool option ([Phase 2, item 8](#phase-2--retrievepassages-tool)),
one question at a time on staging, with no batch running.

**The 5-second passage calls were a batch artifact.** Outside a batch, a page-mode call took
384 ms at Coveo (387 ms for the tool), close to Phase 1's 220–280 ms. A single-question
batch also gave a 44 ms cache hit, against 5,042 ms for a cache hit during a multi-item
batch. Judge passage latency here or on the test page, not from multi-item batch timings.

**Forcing works.** GPT-5.1 on Azure accepted the forced first tool call.

**Pair 1: CERB debt** ("Looking to talk to agents about my CERB owning amount"). Both runs
answered from one tool call. The forced run sent the query "CERB owing amount talk to an
agent phone number" with the page URL, and got 2 passages. It didn't download afterwards.

| | Off (download) | Forced first (passages) |
|---|---|---|
| Tool | 2,244 ms, `origin` | 387 ms |
| Generation (answer step minus tool) | 5,215 ms | ~5,620 ms |
| Answer step | 7,459 ms | 6,008 ms |
| Answer step started at | 2,884 ms | 4,141 ms |
| User-perceived total | 10,430 ms | 10,257 ms |

- **Passages saved about 1.45 seconds in the answer step.** The totals were nearly equal only
  because the steps before the answer were slower in the passage run (redact 270 ms against
  29, translate 1,151 against 464). Compare the answer step, not the total.
- **Generation dominates either way**, at about 5–5.6 seconds. The tool choice changes about
  2 seconds at most.
- **The download missed the cache.** The cached copy had expired (`lookupStatus: expired`),
  so it went to canada.ca. A cache hit (~40 ms) would have made the download run's answer
  step about 5.3 seconds, faster than the passage run. How much passages save in production
  depends on how often the agent's downloads miss the cache, which we haven't measured.
- **Generation was about 400 ms slower with passages.** That's within one-sample noise, but
  passage text plus the prompt block may be more for the model to read. More pairs will
  tell.
- **Answer quality not compared yet.**

**Pair 2: spousal RRSP at 72** ("I am 72 years old and my spouse is 69 year old, can I
deposit to spousal rrsp"). Off: chat `0a4a4bbd-d6ef-4f89-a433-b4591cf48cb0`. Forced first:
chat `5972f71c-6174-4abd-9d0d-3e281397dbdb`. **Both answers were correct.**

| | Off (download) | Forced first (passages) |
|---|---|---|
| Tool calls | 3 downloads, all `origin` (cache expired) | 2 passage calls, no download |
| Tool time | 5,187 ms (795 + 460 + 3,932) | 684 ms (327 + 357) |
| Generation (answer step minus tools) | 10,936 ms | ~7,258 ms |
| Answer step | 16,123 ms | 7,942 ms |
| User-perceived total | 19,232 ms | 10,173 ms |

- **Passages roughly halved the answer step and cut the total by 9 seconds.** Here the
  steps before the answer were similar in both runs (the answer step started at 3,020 ms and
  2,129 ms), so the totals reflect the tool choice.
- **Most of the saving was generation, not tool time.** Tools saved about 4.5 seconds and
  generation about 3.7. The download run made three tool rounds and read three whole pages.
  The passage run made two rounds and read 4 passages (1 from
  `registered-retirement-savings-plan-rrsp.html`, 3 from the T4040 page). Fewer rounds means
  fewer model calls, and less text means shorter ones.
- **After the forced first call, the model chose passages again.** Only the first call is
  forced. The second call (to the T4040 page, which the download run fetched in 3,932 ms) was
  the model's own choice. So once it has used passages, it may keep using them.
- **Even with every download a cache hit, passages would likely still win here.** Removing
  the 5,187 ms of download time leaves the download run's answer step at about 11 seconds,
  against 7.9 for passages, because of the extra generation.

**Pair 3: child benefit payment date** ("When will I get my next child benefit payment?").
Off: chat `641bc14a-b7bd-43c0-b4a6-be09f61689c9`. Forced first: chat
`fd50d027-5e37-42fe-9e3a-06e8b8d2754e`. **The passage answer was wrong: it gave no date and
told the user to sign in first.** The download answer gave the date.

| | Off (download) | Forced first (passages) |
|---|---|---|
| Tool calls | 1 download, `origin` (cache miss) | 1 passage call (1 passage), no download |
| Page | `child-family-benefits/benefit-payment-dates.html` | same |
| Tool time | 641 ms | 250 ms |
| Generation (answer step minus tool) | 3,791 ms | ~5,676 ms |
| Answer step | 4,432 ms | 5,926 ms |
| User-perceived total | 8,772 ms | 8,123 ms |

- **The passage had the dates, but the model didn't use them.** *Corrected 2026-10-29: an
  earlier version of this note said the passage had no dates. It did.* The passage from
  `benefit-payment-dates.html` listed every payment date. The model left them out and told
  the user to sign in instead. This is the risk with passages: a wrong answer that doesn't
  look wrong.
- **Likely cause: the base prompts only trust downloaded content for specifics.**
  `scenarios-all.js` says "CRITICAL: Verify any specific details (numbers, dates, codes,
  dollar amounts...) in downloaded content", and `agenticBase.js` says every claim must
  trace to "content you downloaded". The model may not count a passage as downloaded, so
  it won't state a date that appears only in a passage. It didn't download either. The
  Phase 3 block doesn't say a passage counts as verified content.
- **The download rule added after this pair doesn't address that.** It names a missing date,
  amount or figure as a reason to download (see
  [Phase 3](#phase-3--prompt-variant-maintainers-only)). Here the date wasn't missing, so
  the rule wouldn't fire.
- **Passages weren't faster here either.** The answer step was 1.5 seconds slower, all of it
  generation, despite less text to read. The download was a fast cache miss (641 ms).
- **Single-page date and amount questions are where passages are weakest**: the saving is
  small and the risk of a missing fact is high.
- **Update (2026-10-29): the rerun's passage had the dates, as the first run's did.** A
  Forced first rerun under the new download rule got the same passage, with every payment
  date under "All payment dates", and didn't download. This time the answer gave the date
  and cited `benefit-payment-dates.html`, though it still opened with "sign in". Later
  reruns didn't (see the table below). This page has no expandable sections, so it says nothing about the `calendar.html` problem (open question 11). The
  rerun can't test the new rule; it needs a page whose passage leaves out the fact.

  Forced first reruns of pair 3 under the new download rule (2026-10-29). Every passage
  had the dates.

  | Rerun | Chat | Date in answer | Opened with "sign in" | Downloaded after passage |
  |---|---|---|---|---|
  | 1 | `97684a7d-b357-4158-b7b5-edfcd6c80227` | yes, cited `benefit-payment-dates.html` | yes | no |
  | 2 | `78cbca8b-603f-4d69-9fbf-3036df823ff3` | no: said the date is in My Account and linked the payment dates page | yes | no |
  | 3 | `61f59bc4-f392-4543-8bac-68d8f3ebefec` | no: said the date is in My Account and to use the schedule | yes | no |

  One of three reruns gave the date. Every rerun called passages for
  `benefit-payment-dates.html` and never downloaded. Rerun 3's call was page mode with
  the question as the query, returned 1 passage and took 313 ms.
  So the model usually won't state a date it has only from a passage. This supports the
  "verify in downloaded content" explanation, and a prompt change is likely needed (item 4
  under "Where to pick up").

**Pair 4: CPP application delay** ("I applied for CPP online and haven't heard back yet -
it's been 2 months. Why might there be a delay like this?"). Off: chat
`c5806c55-021a-4165-bfab-ff026c972706`. Forced first: chat
`d549d628-c9e2-4006-b445-d28c4f6b0841`. **The download answer was correct. The passage
answer was poor: it left out the details the correct answer took from an expandable
section on `after-apply.html`, a page the passage run never read.**

| | Off (download) | Forced first (passages) |
|---|---|---|
| Tool calls | 2 downloads, both `origin` (cache miss) | 1 passage call (1 passage), no download |
| Pages | `publicpensions/cpp/apply.html`, then `cpp/after-apply.html` | `publicpensions/cpp/apply.html` only |
| Tool time | 1,239 ms (776 + 463) | 396 ms |
| Generation (answer step minus tools) | 11,366 ms | ~8,727 ms |
| Answer step | 12,605 ms | 9,123 ms |
| User-perceived total | 17,176 ms | 12,388 ms |

- **Both runs started on the same page. Only the download run went on to the page with
  the answer.** Both chose `apply.html` first (the passage query was "CPP retirement
  pension online application processing time and reasons for delays"). After reading it,
  the download run fetched `after-apply.html`. The passage run stopped. Its passage gave a
  processing time ("within 120 days") but no reasons for a delay, and the model answered
  from that.
- **The download showed the model where to go next, and the passage didn't.** The
  download of `apply.html` starts with the CPP series navigation: Overview, Do you
  qualify, When to start, How much, Apply, **After you apply**, Receive your benefits,
  each linked to its page. That link is how the download run found `after-apply.html`. The passage starts at the
  page's own heading ("# Apply", "## What to know before you start") with no series
  navigation, so the model had no sign that a better page existed. This is the main
  difference between the runs, more than anything in the prompt.
- **This time the passage did include the expandable section, and it wasn't a chunk.** The
  one passage returned was the whole body of `apply.html`, including the content of its
  expand/collapse sections, but not the series navigation above it. So passages don't always drop `<details>` content (see open
  question 11), and page mode can return a whole page as one passage (see open
  question 8).
- **The new download rule didn't fire, and it wouldn't have helped.** The passage held a
  fact that looked like an answer (the 120 days), so the model saw no missing fact.
  Downloading `apply.html` wouldn't have helped either: the passage already held the
  whole page. What was missing was a second page. The rule covers a weak passage, not
  stopping too early. The block may also discourage further retrieval, but with no link
  to follow, the model had little to go on either way.
- **Passages were faster: 3.5 seconds off the answer step, 4.8 off the total.** Most of
  the saving was generation, as in pair 2. Both downloads missed the cache.

**Pattern so far (four pairs, one run each):**
- **Multi-page questions** (pair 2): passages saved a lot of time, mostly in generation, and
  the answer was still correct.
- **Single-page fact lookups** such as a date or amount (pairs 1 and 3): little or no
  saving, and one wrong answer. That wrong answer came from a passage that had the fact
  (pair 3), which points to the "verify in downloaded content" wording, not to the
  passage.
- **Passages lose the links between pages** (pair 4): from the same first page, the
  download run followed the series navigation to the page with the answer. The passage
  had no navigation, so the passage run stopped. This hits multi-page series (CPP, OAS,
  EI and similar), where the answer is often on a sibling page.
- **Cache hits narrow the gap.** Every download in these pairs missed the cache. A hit
  (~40 ms) beats a passage call (250–390 ms) on tool time.

**Where to pick up:**
1. Test the new download rule on a page whose passage leaves out the fact the question
   asks for. Pair 3's page doesn't work for this: its passage includes the dates (see the
   update under pair 3). `calendar.html`, whose dates sit in expandable sections, may. It
   passes if the model calls passages, then downloads the page and gives the fact.
2. Run more pairs, mixing single-page and multi-page questions. Run Off first, then Forced
   first, and note each download's `cacheStatus`. Compare the answer step, not the total.
3. Open questions: whether to force passages only for some questions, how often production
   downloads miss the cache, and whether the passage block should replace Step 3's
   download wording instead of amending it (a base prompt change; see
   [Trial 2 results](#trial-2-results)).
4. Decide how the prompts should treat passages as a source. The base prompts tell the
   model to verify dates, amounts and other specifics "in downloaded content" (see
   pair 3). Either the Phase 3 block says a passage counts as verified content, or the
   base wording changes to cover passages. Both are prompt changes for the maintainers.
   Reruns of pair 3 gave the date only one time in three, so a change looks needed.
   *Done 2026-10-29:* the Phase 3 block now says a passage counts as downloaded content
   (see [Phase 3](#phase-3--prompt-variant-maintainers-only)). Rerun pair 3's question a
   few times to check it.

The ChatViewer timeline shows a "downloads" row under the answer step but no row for passage
calls, so a passage run's tool time has to be read from the trace. Adding a "passages" row
would make pairs quicker to read.

### Success criteria (agree before running)

The tool arm passes if, compared with the baseline:

- median `downloadWebPage` calls per answer drop by ≥ 1
- p50 total latency drops by ≥ _N_ seconds (set _N_ after Phase 1). Passage-call time counts
  against the savings.
- expert score and citation accuracy do not drop
- no rise in confident-but-incomplete answers (see risk 3); review a sample by hand

## Risks

1. **Narrow scope.** The trial covers CRA only, so a win here says nothing yet about other
   content. IRCC and GAC are already in the passage model and are the natural next step;
   beyond them, Coveo would need to scrape more sites.
2. **Freshness.** `downloadWebPage` exists to verify the **live** page. A passage is two steps
   behind it: the page must be re-crawled, **and then** the passage model must be rebuilt
   (daily at best, per Coveo). Skipping downloads is only safe if that's acceptable for
   fast-changing content (rates, deadlines, closures). Showing `datemodified` helps the model
   judge this, but `datemodified` comes from the index and may be newer than the passage text.
3. **Lost context.** A passage can state a rule without the exception two paragraphs later.
   Structure-aware chunking and passage merging should reduce this, but only if our model
   uses them (fixed-size is the default for models created before October 2025). Watch for
   confident but incomplete answers, not just lower scores.
4. **Extra round trips.** The agent may call the passage tool *and* still download, adding
   latency instead of saving it. The Phase 4 metrics will show this.
5. **Pipeline settings aren't ours.** Passage count, thesaurus use and Semantic Encoder
   thresholds live in Coveo's query pipeline. Changes on their side could shift results
   between runs. Record the settings with each batch.
6. **Rate limit.** Coveo allows 5 queries per second, and our key may share that with
   production canada.ca search traffic. The tool adds one call per use. Keep
   `BATCH_CONCURRENCY` at its default (2), run arms one after another, and throttle the
   test page's probe run. Watch for 429 responses in batch logs.
   **Confirmed in Phase 1:** at 2 calls/second the probe got 429s on 5 of its 14
   open-mode calls, so the limit is shared with other traffic. The probe now makes at most 1
   call/second and retries a 429 after 2, 5 and 10 seconds, recording the retry count. The
   Phase 2 tool retries a 429 after 1 and 2 seconds, then tells the model to download
   instead. Retries count against any time saved.
7. **French.** Coveo supports French in beta. Phase 1 testing showed French works in both
   modes, but see the next risk.
8. **Pages missing from the index.** In Phase 1 testing, page mode returned 0 passages for a
   live French CRA page
   (`/fr/agence-revenu/services/impot/particuliers/sujets/compte-epargne-libre-impot/cotiser.html`)
   while another French page worked with the same question. The open search didn't return that
   page either, and its top result was a cancelled ("ANNULÉ") TFSA guide. So the page is most
   likely not in the passage index. The English probe found 2 more likely-missing pages
   (see [Phase 1 findings](#phase-1-findings)).
9. **Passage size.** Passages run close to whole pages (see
   [Phase 1 findings](#phase-1-findings)), so a passage call doesn't cut what the model reads,
   and open mode can add up to ~30k tokens. If the agent calls passages and then downloads
   anyway, it reads the same text twice. Watch input tokens per answer in the arm, not just
   tool time. Coveo's chunking settings may fix this (still-open question 4). Trial 1
   confirmed it in the tool (see [Trial 1 results](#trial-1-results)); the tool now removes
   text repeated between passages of the same page, which helps but doesn't shrink the
   first passage.

## Coveo's advice

Coveo's search engineer:

- **Passages are an addition to search, not a replacement.** Use the Passage Retrieval API
  alongside the Search API, *when required*.
- **Give the agent tools.** An orchestrating agent can use Coveo "search", "passages" and
  "fetch" as separate tools, and decide when to call each. This plan takes that approach for
  "passages" only.
- **MCP is an option.** Declined, for security reasons.
- **Passage retrieval is its own two-stage retrieval:** a **Semantic Encoder** (vector search
  added to lexical search) finds candidate pages, then the **Passage Retrieval model** picks
  the most relevant passages, with score fusion and passage merging. In page mode the
  `filter` narrows this to one page.
- **Chunking** is structure-aware by default and handles tables well.
- **Tuning lives in the Coveo query pipeline**, not in our request: number of passages,
  thesaurus terms, Semantic Encoder threshold, boost and item count.

Further reading:
[Associate a CPR model with a query pipeline — advanced configuration](https://docs.coveo.com/en/oaie6403/leverage-machine-learning/associate-a-passage-retrieval-cpr-model-with-a-query-pipeline#cpr-model-association-advanced-configuration),
[Chunking strategy — structure-aware chunking](https://docs.coveo.com/en/p9ub0044/leverage-machine-learning/chunking-strategy#structure-aware-chunking).

### What Coveo's docs add

- The pipeline must have **both** a CPR model and a Semantic Encoder model associated.
- **Stop-word rules are never applied** to the CPR query. **Thesaurus rules are off by
  default**; with them off, CPR uses the query **as sent**. So the query text the agent writes
  matters, which is why the tool asks for a focused question in the user's words.
- **Structure-aware chunking is the default only for CPR models created after October 2025.**
  Older models default to fixed-size (250 words, no passage merging). The active strategy is
  in the model JSON (`extraConfig.chunkerConfig.strategy`).
- Structure-aware chunks average **400 tokens** (200–500), follow headings and keep tables,
  lists and sections together where possible.
- Chunks are built from a **Markdown** version of pages when one exists. Pages indexed before
  Markdown streams existed don't have one until their source is rebuilt.
- Each page is embedded up to **1,000 chunks**. Text past that can't be retrieved.

## Coveo's answers

| Question | Answer | What it means for the plan |
|---|---|---|
| Is CPR English-only? | Other languages are "beta", but many customers run them in production. | Phase 1 tests French. |
| Full Canada.ca index or a subset? | Either. For this trial, CRA, IRCC and GAC are scraped. | Tool scope is CRA only, to keep testing simple. |
| How often is the passage model refreshed? | It can be updated daily. | Passages can be about a day behind the crawl (risk 2). |
| Latency and rate limits? | Similar to the Search API. **5 queries per second**. | Throttle the probe run; keep batch concurrency low (risk 6). |
| Can we get passages for one URL? | Yes, with a `filter` on `@clickableuri`: all passages from a page, or a search within it. | This is page mode, the main mode of the tool. |
| Which `additionalFields`? | Any document field. | Settled. |
| How much merging is needed? | The Passages API does passage merging itself. | Nothing for us to build. |
| Are passages answers? | No. They're nearby text and still need a generative model to form an answer. | The question is whether a passage holds **enough** to skip a download. Phase 1 measures this. |

### Answered by Coveo: department scoping

- **`searchPageUrl` sets the scope.** Conditions in our Coveo query pipeline match on the
  search page URL and limit results to a department. To search CRA, send a CRA search page;
  to search all of Canada.ca, send the general one (`/en/sr/srb.html`). We control these
  rules and can change them.
- **CRA** is scoped by a `legalname` metadata field, not by URL pattern, so services-level
  pages such as `canada.ca/en/services/taxes/income-tax.html` are included.
- **French CRA context** (from Coveo's example): `searchPageUrl`
  `https://www.canada.ca/fr/agence-revenu/`, `searchPageRelativeUrl`
  `/fr/agence-revenu/search.html`, `locale: 'fr'` in both places. No longer used: Coveo
  later advised the site-wide context instead (see Phase 1a).
- **For later (IRCC, GAC):**
  - IRCC: a `searchPageUrl` containing `/en/services/immigration-citizenship/helpcentre/`
    limits to `cic.gc.ca/english/helpcentre` and `ircc.canada.ca/english/`. French:
    `/fr/services/immigration-citoyennete/centre-aide/` limits to
    `cic.gc.ca/francais/centre-aide` and `ircc.canada.ca/francais/`.
  - GAC: `/en/services/travel/` searches many domains, including parts of
    `international.canada.ca`, `travel.gc.ca`, CBSA and public health. It would need its own
    scoping decision.

### Still open

1. Is the `Canada public websites - Generic - customContext` pipeline required, and what are
   its settings (thesaurus, SE threshold, boost, item count, `numberOfDocumentsToConsider`)?
2. Are our SE and CPR models configured for French?
3. How often is our passage model actually rebuilt?
4. Which chunking strategy does our CPR model use, and do the sources have Markdown streams?
   **Most important now:** passages run 2k–80k characters, not ~400 tokens, and passages from
   the same page overlap (see [Phase 1 findings](#phase-1-findings)). Asked Coveo on
   2026-10-22; Coveo is investigating as of 2026-10-28. Trial 1 saw the same overlap in the
   tool.
5. The 5 QPS limit looks shared with production canada.ca search (we got 429s at 2 calls
   per second). Can our key get its own limit, or a higher one, for the trial?
6. Why is `.../compte-epargne-libre-impot/cotiser.html` missing from the passage index when
   it's live, and is French coverage thinner than English? Why do cancelled pages
   ("ANNULÉ") rank first, and can the pipeline filter them out?
7. Are `change-your-return.html` and `a-copy-your-notice-assessment-reassessment.html` in
   the passage index? To check on the test page: a page filter with a broad query, or the
   "all passages from a page" call the search team described.
8. Why does page mode usually return 1 passage when `maxPassages` is 5? What decides the
   count?
9. Are the `relevanceScore` values rank-based? The top page-mode passage always scores 0.200.
10. Pages under `.../information-been-moved/` rank first for the non-resident question. Are
    they moved or archived, and should the pipeline rank them lower?
11. Why is content inside expandable sections (`<details>`) missing from passages? On
    `calendar.html` every payment date is inside one, and the passage keeps only the section
    labels. Is this the crawler, the Markdown conversion or the chunker, and can it be
    included?
    Not every page loses them: pair 4's passage for `cpp/apply.html` included its
    expand/collapse content. What differs between that page and `calendar.html`?
12. Passages leave out a page's series navigation (the "steps" links at the top of
    multi-page content such as the CPP retirement pension pages). Downloads keep it, and
    it's how the model finds sibling pages (see pair 4). Can the passage keep it, or
    could the API return a page's links alongside its passages?

## Out of scope

- Passages in `<searchResults>` at the search step (dropped; see
  [Decision](#decision-a-tool-not-passages-in-search-results)).
- MCP integration with Coveo.
- Departments other than CRA, including IRCC and GAC (already scraped; a possible next step).
- Changing production tools, prompts or the default search provider.
- Replacing `downloadWebPage` with Coveo's "fetch", or changing its limits.
- Comparing Coveo semantic search against our standard search for the search step itself.
