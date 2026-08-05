---
title: "Evaluation-informed answers — AI Answers"
description: "How expert evaluations shape future answers, how to see which ones were used, and how to remove one from the pool."
---

# Evaluation-informed answers — how it works and how to use it

*Audience: admin and partner users. For the engineering detail behind everything on this page, see [docs/architecture/using-evals-for-answers.md](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md).*

## What it does

When a subject-matter expert evaluates an answer and its citation, that judgement is stored with the question. Later, when someone asks a similar question, the system finds those expert evaluations with their past question-and-answer pairs and shows them to the AI as worked examples before it writes the new answer:

- **High-scoring examples** show the model an approach an expert already approved — the wording, the level of detail, and the citation the expert accepted.
- **Lower-scoring examples** carry the expert's score and rationale on any sentence in the answer, plus the URL the expert says *should* have been cited. The model sees the mistake and the correction together, so it can avoid repeating it.
- **If nothing qualifies, nothing is added.** When there are no similar questions with evaluations that qualify, the section is left out entirely and the answer is generated exactly as it would be without the feature. This is the normal outcome for most questions.

Evaluations by subject-matter experts propagate forward to improve consistency and quality of new answers to similar questions. The effect is a kind of institutional memory: an error an expert corrects once stops recurring on similar questions, and answers to the same underlying task become more consistent over time.

## Seeing which evaluations were used

Open the chat in review mode. Click on a chat ID to view it from a dashboard — most often the Evaluation dashboard — or paste the ID into **View chat by ID**, just under the menus on the admin page.

If any past evaluations were used, a **Past evals used** panel is displayed under the answer. Expand it:

![Past evals used panel expanded under an answer, listing each past chat ID and its total score, English](/content/admin/images/eval-informed-past-evals-used-en.jpg)

![Panneau « Évaluations antérieures utilisées » déployé sous une réponse, listant chaque ID de chat et son score total, français](/content/admin/images/eval-informed-past-evals-used-fr.jpg)

The panel lists each past chat that informed the answer, with the expert's total score out of 100. Scores vary, and a mix is expected — high-scoring examples show the model an approach an expert approved, while lower-scoring ones carry the expert's notes on what to avoid. There is no minimum score, so a low score in this list is not a sign that something went wrong.

Each **chat ID is a link**. Opening it loads that past conversation in review mode, where you can read the original question and answer, the expert's sentence-by-sentence scores and explanations, and the citation rating — the full reasoning behind the score you see in the table.

## Removing an evaluation from the pool

If an expert evaluation shouldn't be shaping future answers — the content it was based on has changed, the judgement was wrong, or it was a test entry — delete it from that past chat via the **Delete expert evaluation** button. The button is visible when you expand the Expert evaluation and its score.

![Expanded Expert evaluation panel showing the sentence-by-sentence scores and the Delete expert evaluation button, English](/content/admin/images/eval-informed-delete-button-en.jpg)

![Panneau « Évaluation d'expert » déployé montrant les notes par phrase et le bouton « Supprimer l'évaluation d'expert », français](/content/admin/images/eval-informed-delete-button-fr.jpg)

Beside the delete button is a **Never stale** checkbox. Ticking it exempts that evaluation from the one-year freshness rule, so it stays eligible indefinitely instead of dropping out on its first birthday. Use it for evaluations resting on guidance that doesn't go out of date. It only overrides the age check — the evaluation still has to clear the similarity floor and language match like any other, and deleting it still removes it from the pool.

The change takes effect on the next question — there is nothing to re-run or re-index.

This is the main day-to-day maintenance task for the feature. It's worth doing a pass when a program's web content changes substantially, since evaluations made against the old content may still be inside the one-year freshness window.

## How it works, step by step

When the feature is switched on, the system adds one step before the answer is written. In that step, it:

1. **Finds similar past questions.** The user's question is compared against the vector index of past questions using semantic similarity, so it matches on meaning rather than wording. Only questions that have an expert evaluation in the same language are kept.
2. **Applies a similarity floor and a freshness rule.** Matches must clear a similarity score of 0.75, which is deliberately strict. Evaluations older than one year are dropped, unless they're marked **Never stale**. The age that counts is *when the expert did the evaluation*, not when the question was originally asked — a two-year-old question evaluated last month still counts as fresh. There is no minimum expert score: every evaluated match that clears these two rules is eligible.
3. **Takes up to three of the most-similar remaining matches**, and rolls them into a block of reference text added to the AI's instructions for this question.

The instructions that accompany the block tell the model to treat perfect-score examples as a model to follow, to read the notes on lower-scoring examples and not repeat those problems, to prefer an expert's corrected URL over the one originally cited, and to use all of it as reference rather than quoting it.

## Quick troubleshooting

| What you see | Most likely reason |
|---|---|
| No **Past evals used** panel on an answer | Nothing qualified — no evaluated similar question, or everything fell below the similarity floor or outside the one-year window. This is the normal outcome for most questions. |
| Panel missing on every answer | The site (or that session) is running the baseline workflow, not *Past evals context ON*. |
| An example you'd expect isn't listed | Check the evaluation's age (older than a year is dropped unless it's marked **Never stale**), and whether the past question is genuinely similar enough — the floor is deliberately strict. Use **View full trace for a chat** to see whether it made it. |
| An example is listed that shouldn't be | Open its chat ID and delete the expert feedback. It stops being eligible immediately. |

## Related

- [Using evaluations to improve answers](https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#using-evaluations-to-improve-answers) — the public-facing summary in the system card
- [docs/architecture/using-evals-for-answers.md](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md) — retrieval mechanics, thresholds, graph wiring, failure modes
- [Expert evaluation process, with screenshots](https://github.com/cds-snc/ai-answers/blob/main/docs/pdf/ai-answers-expert-evals-integration.pdf)
- [French version of this page](/fr/comment-faire/reponses-informees-par-evaluations)
