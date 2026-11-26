---
title: "Evaluation-informed answers"
description: "How expert evaluations shape future answers, how to see which ones were used, and how to remove one from the pool."
---

# Evaluation-informed answers

**Audience:** Admin and partner users.

**Engineering detail:** [Using evals for answers](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md)

## What it does

Expert evaluations of past answers are shown to the AI as evaluated examples before it writes a new answer to a similar question.

- **High-scoring examples:** an approach an expert approved, including the wording, the level of detail, and the citation.
- **Lower-scoring examples:** the expert's notes on what was wrong, plus the URL that should have been cited.
- **Nothing qualifies:** nothing is added and the answer is generated as normal. This is the usual outcome.

An error an expert corrects once should stop recurring on similar questions.

## See which evaluations were used

1. Open the chat in review mode. Select a chat ID from a dashboard, or paste one into **View chat by ID** on the admin page.
2. Expand **Past evals used** under the answer. This panel only appears when the system found qualifying evaluations for that question. Most questions have none, so on many answers there is nothing to expand.

![Past evals used panel expanded under an answer, listing each past chat ID and its total score](/content/admin/images/eval-informed-past-evals-used-en.jpg)

- Each row is a past chat that informed the answer, with the expert's score out of 100.
- A mix of high and low scores is expected. There is no minimum score.
- Chat IDs are links. Open one to read the expert's sentence-by-sentence scores and citation rating.

### Remove an evaluation

Remove one when the content it was based on has changed, the judgement was wrong, or it was a test entry.

1. Open that past chat in review mode.
2. Expand **Expert evaluation**.
3. Select **Delete expert evaluation**.

![Expanded Expert evaluation panel showing the sentence-by-sentence scores and the Delete expert evaluation button](/content/admin/images/eval-informed-delete-button-en.jpg)

- Takes effect on the next question. There is nothing to re-run or re-index.
- Worth a pass whenever a program's web content changes substantially.

## See how often it is used

The **Partner dashboard** shows an **Eval-informed answers** card in its own section, beside a list of the most recent examples.

- The percentage is the share of questions where past evaluations were used.
- It counts only questions answered since evaluation-informed answering went live. Older questions are left out.
- It follows the dashboard's filters.

Open a chat ID in the list to see the past evaluations it used.

## See where evaluations are missing

Below that card, **Evaluation coverage by service** lists the 10 services with the most questions. Use it to decide where to evaluate next.

- Open it with **Top services by evaluation coverage**.
- **Expert evaluations** counts the evaluations the AI can use as examples: those from the past year, plus any marked **Never stale**. It ignores the date range. The table lists the busiest services first, so services near the top with few evaluations are the ones to evaluate next.
- **Answers using evaluations** shows whether the evaluations you did match what people ask.
- **Expiring soon** counts evaluations that will stop being used within 60 days. Evaluate new questions for that service to replace them. It also ignores the date range.
- **Actions asked about** lists up to three things people asked to do, most common first. Actions asked only once are left out.
- The other columns follow the dashboard's filters.

**Most-used evaluations** lists the evaluations given to the AI most often in the period. Open a chat ID to check that an evaluation is still right. A wrong evaluation that is used often affects many answers.

## Rules the system applies

- Matches on meaning rather than wording.
- Same language only.
- Similarity of at least 0.75, which is deliberately strict.
- Evaluated within the past year, unless the evaluator marked it **Never stale**. Age counts from the evaluation date, not the question date.
- No minimum expert score.
- Up to 3 matches are used, ranked by similarity.
- When matches are equally similar, the most recently evaluated one is preferred.

## Troubleshooting

| What you see | Most likely reason |
|---|---|
| No **Past evals used** panel on an answer | Nothing qualified. Normal for most questions. |
| Panel missing on every answer | The site or session is running the baseline workflow, not **Past evals context ON**. |
| An expected example isn't listed | Check its age, and whether the past question is similar enough. Use **View full trace for a chat** to see whether it made it. |
| An example is listed that shouldn't be | The evaluation is often sound but a poor match for this question. Delete the expert evaluation only when the evaluation itself is wrong or out of date. A poor match on a sound evaluation is a matching problem — report it rather than deleting good feedback. |

## Related

- [Using evaluations to improve answers](/en/system-card#using-evaluations-to-improve-answers): the public-facing summary in the system card
- [Retrieval mechanics, thresholds, failure modes](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md)
- [Expert evaluation process, with screenshots](https://github.com/cds-snc/ai-answers/blob/main/docs/pdf/ai-answers-expert-evals-integration.pdf)
