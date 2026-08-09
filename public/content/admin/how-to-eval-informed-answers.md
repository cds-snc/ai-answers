---
title: "Evaluation-informed answers"
description: "How expert evaluations shape future answers, how to see which ones were used, and how to remove one from the pool."
---

# Evaluation-informed answers

**Audience:** Admin and partner users.

**Engineering detail:** [Using evals for answers](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md)

## What it does

Expert evaluations of past answers are shown to the AI as worked examples before it writes a new answer to a similar question.

- **High-scoring examples:** an approach an expert approved, including the wording, the level of detail, and the citation.
- **Lower-scoring examples:** the expert's notes on what was wrong, plus the URL that should have been cited.
- **Nothing qualifies:** nothing is added and the answer is generated as normal. This is the usual outcome.

An error an expert corrects once stops recurring on similar questions.

## See which evaluations were used

1. Open the chat in review mode. Click a chat ID from a dashboard, or paste one into **View chat by ID** on the admin page.
2. Expand **Past evals used** under the answer.

![Past evals used panel expanded under an answer, listing each past chat ID and its total score](/content/admin/images/eval-informed-past-evals-used-en.jpg)

- Each row is a past chat that informed the answer, with the expert's score out of 100.
- A mix of high and low scores is expected. There is no minimum score.
- Chat IDs are links. Open one to read the expert's sentence-by-sentence scores and citation rating.

## Remove an evaluation

Remove one when the content it was based on has changed, the judgement was wrong, or it was a test entry.

1. Open that past chat in review mode.
2. Expand **Expert evaluation**.
3. Select **Delete expert evaluation**.

![Expanded Expert evaluation panel showing the sentence-by-sentence scores and the Delete expert evaluation button](/content/admin/images/eval-informed-delete-button-en.jpg)

- Takes effect on the next question. There is nothing to re-run or re-index.
- Worth a pass whenever a program's web content changes substantially.

## Never stale

A **Never stale** checkbox sits beside the delete button.

- Ticking it exempts that evaluation from the one-year age limit.
- Use it for evaluations based on guidance that doesn't go out of date.
- It overrides the age check only. The similarity floor and language match still apply, and deleting still removes it.

## Rules the system applies

- Matches on meaning rather than wording.
- Same language only.
- Similarity of at least 0.75, which is deliberately strict.
- Evaluated within the past year, unless marked **Never stale**. Age counts from the evaluation date, not the question date.
- No minimum expert score.
- Up to three matches are used, ranked by similarity.
- When matches are equally similar, the most recently evaluated one is preferred.

## Troubleshooting

| What you see | Most likely reason |
|---|---|
| No **Past evals used** panel on an answer | Nothing qualified. Normal for most questions. |
| Panel missing on every answer | The site or session is running the baseline workflow, not **Past evals context ON**. |
| An expected example isn't listed | Check its age, and whether the past question is similar enough. Use **View full trace for a chat** to see whether it made it. |
| An example is listed that shouldn't be | Open its chat ID and delete the expert feedback. It stops being eligible immediately. |

## Related

- [Using evaluations to improve answers](https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#using-evaluations-to-improve-answers): the public-facing summary in the system card
- [Retrieval mechanics, thresholds, failure modes](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md)
- [Expert evaluation process, with screenshots](https://github.com/cds-snc/ai-answers/blob/main/docs/pdf/ai-answers-expert-evals-integration.pdf)
