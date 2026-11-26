---
name: check-urls
description: Check every URL in the agents/prompts/scenarios folder and report any that are broken, redirect, or fail to load. Use when asked to check links, audit URLs, find dead links, or run the URL check.
---

# Check URLs

Run from the repo root (takes a few minutes; ~1,300 unique URLs):

`node .claude/skills/check-urls/scripts/check-urls.mjs agents/prompts/scenarios --output url-report.md`

Only `agents/prompts/scenarios` is checked; the rest of the repo is out of scope.

Any redirect counts as a failure, because listed URLs should only be currently
available web pages. The report has two sections: **Broken** (4xx/5xx,
timeouts, SSL/DNS errors) and **Redirects** (any 3xx, with the destination).
A redirect to an error page (e.g. Canada.ca's 302 to `/errors/404.html`) is
reported as **Broken**, not as a redirect.
The script exits with code 1 if anything fails, 0 if everything passes.

Any URL that doesn't pass is retried twice (after 3s, then 10s) and only reported
if every attempt fails, because some servers give inconsistent answers under load.

A **language switch** is a redirect to the page the URL itself names (e.g.
`set-lang?from=/accueil` → `/accueil`) or to the same URL with only a language
parameter removed. That one hop is not counted as a redirect, but the
destination is checked, and if it's broken or redirects again the URL is
reported. URLs that just carry a `lang=` parameter are checked like any other.

URLs matching a pattern in `.urlcheck-ignore` (repo root, one pattern per line,
`#` for comments, `*` as a wildcard; every pattern matches anywhere in the URL) are skipped
by the script and counted as "Ignored" in the report.

Optional flags: `--concurrency <n>` (default 8), `--timeout <ms>` (default 20000),
`--ignore <file>`.

After running:
1. Summarize: URLs checked, number ignored, number broken, number redirecting.
2. For redirects, suggest the redirect target as the replacement.
3. For broken links, list file:line and the error. Don't guess replacements.
4. Note that a 403 or timeout can be a site blocking automated requests rather
   than a dead page; say so rather than calling it dead.

The same script runs weekly in `.github/workflows/scenario-url-check.yml`, which
keeps the latest report in a GitHub issue titled "Scenario URL check report".

Do not edit files unless asked; this skill only reports. Files under
`agents/prompts/` are owned by the prompt maintainers (see AGENTS.md), so even
when asked to fix URLs, confirm the request is from a maintainer.
