# Remove unused `contextSearchTool` exports

## Overview

Delete the `contextSearchTool` LangChain tool wrapper from both search tools. It
is exported from `canadaCaContextSearch.js` and `googleContextSearch.js` and
imported by nothing. The Canada.ca one is also broken.

Split out of the `retry-for-download-tool` branch (PR: search retry rework) to
keep that diff retry-only. Nothing here depends on that branch landing first.

---

## Why

Every real consumer imports the plain `contextSearch` **function**, never the
tool wrapper:

- `services/SearchContextService.js:1-2`
- `agents/tools/contextAgentTool.js:4-5`

The wrappers themselves are unreferenced. Verified with:

```bash
grep -rn "contextSearchTool" . --include="*.js" --exclude-dir=node_modules
# only the 2 definitions + 2 export statements
```

The Canada.ca wrapper is additionally **broken**, and has been for a while.
`contextSearch` returns `{ results: "<formatted string>", provider }`, then
`canadaCaContextSearch.js:151` calls `extractSearchResults` on that object a
second time. Inside, `results.results` is a string, so `.slice(0, 3)` yields a
3-character string and `.forEach` throws `TypeError` — caught by the wrapper's
own `catch`, so it always returns
`"An error occurred while processing the search query"`. It could never have
worked if it had been wired up.

The Google wrapper (`googleContextSearch.js:128`) is dead but *correct* — it
just calls `contextSearch` and returns the result. Removing it is housekeeping,
not a bug fix.

---

## Safety check (already done)

No string reference to either tool name anywhere in the repo, so nothing
resolves them dynamically through a registry or a prompt:

```bash
grep -rn '"canadaCASearch"\|canadaCASearch\|'"'"'contextSearch'"'"'\|"contextSearch"' . \
  --include="*.js" --include="*.json" --include="*.md" --exclude-dir=node_modules
# 0 hits outside the two files themselves
```

---

## Changes

### `agents/tools/canadaCaContextSearch.js` (179 lines)

1. Delete lines **137–178** — from the `/** canadaCASearch tool to perform a
   search using Coveo. */` JSDoc through the closing `);`
2. Line **179**: `export { contextSearchTool, contextSearch };`
   → `export { contextSearch };`
3. Line **1**: delete `import { tool } from "@langchain/core/tools";` — no other
   use in the file once the wrapper is gone

Keep `extractSearchResults` — `contextSearch` still calls it at line 130. The
broken double-call at line 151 disappears along with the wrapper.

### `agents/tools/googleContextSearch.js` (152 lines)

1. Delete lines **128–151**
2. Line **152**: same export edit
3. Delete the `tool` import — same reason

Keep `extractSearchResults` — used at line 106.

---

## Watch out for: line endings

> [!IMPORTANT]
> Both files are **CRLF** on `main`. Whatever edits them must preserve that.

Tooling that rewrites a whole file (a Python `open().write()`, some formatters)
silently converts CRLF → LF and turns ~15 real changed lines into a ~300-line
phantom diff that makes the actual change unreviewable. This already happened
once on the retry branch. Check with `file` **before** committing, not after.

---

## Verification

```bash
# 1. nothing left referring to it
grep -rn "contextSearchTool\|canadaCASearch" . --include="*.js" --exclude-dir=node_modules

# 2. line endings preserved — both must still say CRLF
file agents/tools/canadaCaContextSearch.js agents/tools/googleContextSearch.js

# 3. the real check: existing suites all import `contextSearch` directly,
#    so a botched export breaks them loudly
npx vitest run agents/tools/__tests__/ services/__tests__/SearchContextService.test.js

# 4. diff shape: ~42 and ~24 deletions, 2 modified export lines, no additions
git diff --stat
```

Note `npx vitest run` exits 0 even when tests fail in this repo — read the
`Test Files` summary line, not the exit code.

No new tests needed: this removes code, and the code being removed has no
coverage and no callers.

---

## Explicitly out of scope

- **`agents/tools/contextAgentTool.js`** — also unreferenced, but deliberately
  kept per the note at `AgentFactory.js:38` ("generateContext tool removed from
  answer agent … Tool code kept in agents/tools/contextAgentTool.js for future
  use"). **Leave it.** It imports the plain `contextSearch` function, so it is
  unaffected by this deletion.
- The `tool()` wrappers in `downloadWebPage.js`, `checkUrlStatus.js`,
  `searchOpenData.js` — these *are* wired into `AgentFactory`'s tools array and
  must stay.
- The Canada.ca / Google failure-contract asymmetry (Coveo throws and fails the
  turn, Google degrades gracefully). Documented in the `contextSearch` JSDoc in
  `canadaCaContextSearch.js`, deferred to the direct-API work.

---

## Commit

```
chore: remove unused contextSearchTool exports
```
