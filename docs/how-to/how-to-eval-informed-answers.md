# Evaluation-informed answers — how it works and how to use it

*Audience: admin and partner users. For the engineering detail behind everything on this page, see [docs/architecture/using-evals-for-answers.md](../architecture/using-evals-for-answers.md).*

## What it does

Expert evaluations don't just feed reporting dashboards — when this feature is on, they feed the next answer.

When a subject-matter expert scores an answer sentence by sentence and rates its citation, that judgement is stored with the question. Later, when someone asks a similar question, the system finds those scored past question-and-answer pairs and shows them to the AI as worked examples before it writes the new answer:

- **High-scoring examples** show the model an approach an expert already approved — the wording, the level of detail, and the citation the expert accepted.
- **Lower-scoring examples** carry the expert's notes on what was wrong, sentence by sentence, plus the URL the expert says *should* have been cited. The model sees the mistake and the correction together, so it can avoid repeating it.

The effect is a kind of institutional memory: an error an expert corrects once stops recurring on similar questions, and answers to the same underlying task become more consistent over time.

## How it works, step by step

The pipeline gains one extra step when the feature is on. It runs **after** the question has been through guardrails, translation, search, and context derivation — and **immediately before** the answer is generated:

```
… → guardrails → translation → search → context derivation → similar questions → answer generation → …
```

The step sits at the end of that chain simply because the examples are needed at answer time. It does not currently narrow the search by institution — matching is on the wording and meaning of the question alone, plus language and freshness filters. See [What the lookup does and doesn't filter on](#what-the-lookup-does-and-doesnt-filter-on) below.

In that step, the system:

1. **Finds similar past questions.** The user's question is compared against the vector index of past questions using semantic similarity, so it matches on meaning rather than wording.
2. **Keeps only questions that have an expert evaluation.** A similar past question with no expert evaluation attached is dropped — the point is the expert judgement, not the past answer on its own.
3. **Applies a similarity floor.** A candidate must clear a minimum similarity score (currently 0.75) to be used. This is what prevents a loosely related question from being pulled in — a business number question should not be informed by an EI question.
4. **Restricts to the same language.** Examples are matched against the language the site is being used in and the language the original question was asked in, so an English question isn't informed by a French evaluation or vice versa.
5. **Applies a freshness rule.** Evaluations older than one year are dropped, so the model isn't guided by judgements made against content that has since changed. The age that counts is *when the expert did the evaluation*, not when the question was originally asked — a two-year-old question evaluated last month still counts as fresh. Individual evaluations can be marked as never going stale, for content that doesn't change.
6. **Takes up to three of the best remaining matches**, ranked by how similar they are to the new question.
7. **Rolls them into a block of reference text** added to the AI's instructions for this one answer. Each example contains the past question (and any earlier turns in that conversation), the answer, the expert's total score, the expert's sentence-level and citation comments, and the citation URL — including the corrected URL where the expert supplied one.

The instructions that accompany the block tell the model to treat perfect-score examples as a model to follow, to read the notes on lower-scoring examples and not repeat those problems, to prefer an expert's corrected URL over the one originally cited, and to use all of it as reference rather than quoting it.

**If nothing qualifies, nothing is added.** No similar question, no expert evaluation, similarity below the floor, or evaluations too old — in every one of those cases the section is left out entirely and the answer is generated exactly as it would be without the feature. The same is true if the lookup fails: the step logs a warning and the pipeline carries on. It can only add context; it can never block an answer.

### What the lookup does and doesn't filter on

| Filter | Applied? |
|---|---|
| Semantic similarity of the question, with a minimum score | Yes |
| Has an expert evaluation attached | Yes — required |
| Expert score (both perfect and imperfect examples are eligible) | Yes |
| Language — site language and the language the question was asked in | Yes |
| Evaluation age | Yes — one year, unless marked never-stale |
| **Institution / department** | **No** |
| **Topic** | **No** |

Institution is not a filter. The matched institution is known by this point in the pipeline, but it is not passed to the lookup, and neither the search nor any filter after it uses it — matching is on question meaning alone. In practice semantic similarity already keeps most examples inside the right institution, since questions about a program tend to resemble other questions about the same program. But nothing enforces it: a question matched to one institution can be informed by an evaluated question from another if the wording is close enough.

Adding institution as a filter would narrow the candidate pool and remove that cross-institution risk, at the cost of losing legitimately useful matches where the institution was mis-matched or the same task spans institutions. It has not been built or tested.

Note that most questions get nothing. The corpus of expert-evaluated questions is small relative to the range of questions people ask, so this feature helps most on high-volume top tasks — the areas where experts have concentrated their evaluations — and simply stays out of the way elsewhere.

## Turning it on

The feature is a **pipeline variant** (a "workflow"), not a checkbox. Choosing the workflow chooses whether the extra step exists.

**Site-wide** — Admin → Settings → *Default workflow*:

| Option in the dropdown | What it does |
|---|---|
| *Generic* / *Générique* | Baseline — no evaluation-informed step. |
| ***Past Q&A context ON*** / ***Contexte de Q-R antérieures ACTIVÉ*** | Evaluation-informed answers. This is the variant this page describes. |

**For a single session** — admins can override the workflow from chat options on the chat page, which is the practical way to compare a question with and without the feature.

**For a batch run** — the workflow dropdown on the batch upload page does the same thing for an entire evaluation batch, which is how the feature gets measured against the baseline before a site-wide switch.

## Seeing which evaluations were used

Any answer produced with this feature records the past chats it drew on. Open the chat in review mode and expand **Past Q&A used** under the answer:

![Past Q&A used panel, English](../images/eval-informed-past-qa-used-en.png)

![Panel « Questions et réponses antérieures utilisées », français](../images/eval-informed-past-qa-used-fr.png)

The panel lists each past chat that informed the answer, with the expert's total score out of 100. The mix is intentional — a 100 alongside an 87.5 means the model was shown both an approved example and one with flagged issues to avoid.

Each **chat ID is a link**. Opening it loads that past conversation in review mode, where you can read the original question and answer, the expert's sentence-by-sentence scores and explanations, and the citation rating — the full reasoning behind the score you see in the table.

## Removing an evaluation from the pool

If an evaluation shouldn't be shaping future answers — the content it was based on has changed, the judgement was wrong, or it was a test entry — delete it from that past chat's review view using **Delete evaluation** (for the automated evaluation) or **Delete expert feedback** (for the expert's own scoring).

Once the expert feedback is gone, that question is no longer eligible: step 2 above drops any match without an expert evaluation. The change takes effect on the next question — there is nothing to re-run or re-index.

This is the main day-to-day maintenance task for the feature. It's worth doing a pass when a program's web content changes substantially, since evaluations made against the old content may still be inside the one-year freshness window.

## Checking what the model actually saw

The **Past Q&A used** panel tells you *which* past chats were used. To see the exact text the model received, use the ChatViewer page (`/en/chat-viewer`, `/fr/visualiseur-de-clavardage`, admin and partner only): paste the chat ID and look for the `node:similarQuestions output` entry, which carries the complete block. The **Download logs (JSON)** button on that page exports the whole event stream if you want to hand a run to someone for analysis.

## Quick troubleshooting

| What you see | Most likely reason |
|---|---|
| No **Past Q&A used** panel on an answer | Nothing qualified — no evaluated similar question, or everything fell below the similarity floor or outside the one-year window. This is the normal outcome for most questions. |
| Panel missing on every answer | The site (or that session) is running the baseline workflow, not *Past Q&A context ON*. |
| An example you'd expect isn't listed | Check the evaluation's age (older than a year is dropped), and whether the past question is genuinely similar enough — the floor is deliberately strict. |
| An example is listed that shouldn't be | Open its chat ID and delete the expert feedback. It stops being eligible immediately. |

## Related

- [Using evaluations to improve answers](../../SYSTEM_CARD.md#using-evaluations-to-improve-answers) — the public-facing summary in the system card
- [docs/architecture/using-evals-for-answers.md](../architecture/using-evals-for-answers.md) — retrieval mechanics, thresholds, graph wiring, failure modes
- [Expert evaluation process, with screenshots](../pdf/ai-answers-expert-evals-integration.pdf)
