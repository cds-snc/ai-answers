# Plan: Test Coveo passage retrieval as an answer-agent tool

Status: Phase 1 done (see [Phase 1 findings](#phase-1-findings)). Phase 2 tool built. Phase 3
prompt block written. Trial 1 run on 2026-10-28 (see [Trial 1 results](#trial-1-results)); the
prompt and tool were changed after it, and trial 2 is next. Access to the Coveo Passage Retrieval (CPR) API comes through
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
   `sendAnswerRequest` payload and no prompt tags. Chat runs never set it.
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

## Out of scope

- Passages in `<searchResults>` at the search step (dropped; see
  [Decision](#decision-a-tool-not-passages-in-search-results)).
- MCP integration with Coveo.
- Departments other than CRA, including IRCC and GAC (already scraped; a possible next step).
- Changing production tools, prompts or the default search provider.
- Replacing `downloadWebPage` with Coveo's "fetch", or changing its limits.
- Comparing Coveo semantic search against our standard search for the search step itself.
