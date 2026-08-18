---
title: "Evaluate answers"
description: "How to score an answer sentence by sentence, rate the citation, and act on what you find."
---

# Evaluate answers

**Audience:** Admin and partner users doing expert evaluations.

**Draft:** this guide is a first pass, assembled from the partner evaluation deck and the engineering docs. Send corrections to your CDS contact.

This guide starts from an answer that already exists — one you just asked, or one already in the logs. For choosing which questions to ask in the first place, see [Partner onboarding](/en/how-to/partner-onboarding).

## What an evaluation is

An evaluation is a subject-matter expert's judgement of one answer: whether each sentence is accurate and clear, and whether the citation lets the user confirm the answer or take the next step.

Evaluations do three things:

- Measure accuracy by institution, task, and language.
- Point to the underlying cause — usually web content that is out of date or unclear, sometimes a scenario that needs tuning.
- Feed back into future answers. See [Evaluation-informed answers](/en/how-to/eval-informed-answers).

## Before you start

You must be signed in as an admin or partner user. Accounts are approved before they can be used.

Then open the answer you're going to evaluate:

- **An answer you just asked for** — the rating options appear under it straight away.
- **A specific chat** — paste its ID into **View chat by ID** on the admin or partner page.
- **Answers waiting to be scored** — open **View chats** and filter on **No evaluation**.
- **Real user questions from trials** — open **Evaluate a public chat**.

## Judge the answer

Use your subject-matter knowledge. Check on the web if you aren't sure — it's worth the extra minute.

Under **How was this answer?**, select **Good** or **Needs improvement**.

![A four-sentence answer with its citation in review mode. Below it, the department FIN heads a "How was this answer?" bar offering Good and Needs improvement, followed by collapsed Downloaded pages and Automated evaluation panels and the chat ID](/content/admin/images/evaluate-how-was-this-answer-en.jpg)

**Good** records the evaluation straight away. There is nothing else to fill in.

**Needs improvement** opens the rating form, where you rate the sentences and the citation separately.

### Rate each sentence

An answer has 1 to 4 sentences, and each one gets its own **Good / Needs improvement / Incorrect** choice.

- **Good:** accurate, clear, objective, non-partisan, and in the right language.
- **Needs improvement:** not wrong, but it could be better.
- **Incorrect:** wrong, misdirects the user, or breaks the rules the service is meant to follow.

![The "Rate the answer sentences and/or citation" form, showing sentence 1 quoted above its Good, Needs improvement, and Incorrect options, a Content issue checkbox, and an explanation box](/content/admin/images/evaluate-rating-form-en.jpg)

You only have to rate the sentences you have something to say about — anything you leave alone counts as good.

An explanation is required for **Needs improvement** and **Incorrect**. Say what is wrong, so the next reader — and the AI — can tell.

Two checkboxes sit under the ratings:

- **Content issue** — the answer reflects government web content that is itself wrong, out of date, or unclear. Tick it whether or not you also rated the sentence down.
- **Harmful** — appears once you select **Incorrect**. Tick it when acting on the answer, or failing to act, could cause injury, damage, suffering, or loss: physical health, mental health, finances, material assets, legal situation, or the environment.

Kinds of error worth naming in your explanation:

| Kind | What it looks like |
|---|---|
| Incorrect | Made-up facts, out-of-date information, misdirection, or a wrong assumption about the user. |
| Incorrect and harmful | The user acts on it and is hurt — financially, legally, medically, or otherwise. |
| Biased | Derogatory or stereotyping language, or an answer that would lead to unequal treatment. Fails objectivity and non-partisanship. |
| Out of scope | Answers about matters that aren't the Government of Canada's. |
| Wrong language | Answered in the other official language. |

### Rate the citation

Open the **Citation** section and rate the URL the answer offered.

- **Good:** lets the user confirm the answer or take the next step.
- **Needs improvement:** only partly relevant to the question.
- **Incorrect:** missing, irrelevant, broken, in the wrong language, or not a Government of Canada page.

An explanation is required for **Needs improvement** and **Incorrect**. When you know the page that should have been cited, add it under **Better canada.ca or gc.ca citation URL**. That URL is passed to the AI on similar questions later, so it is worth filling in.

The ratings still apply when the answer offered no citation at all — you can rate the absence.

### Submit

When everything you want to rate is rated, select **Submit evaluation**.

## Pause and come back later

If you need to check with a subject-matter expert before scoring:

1. Note the chat ID before you close the window.
2. When you come back, go to the admin or partner page.
3. Paste the ID into **View chat by ID** and select **View chat**. The answer opens with the rating options still available.

## Act on what you find

**Web content problems.** Most wrong answers trace back to government web content that is out of date or unclear. Find where the answer came from, log it in your content issues tracker, and re-test the question once the content is fixed.

**Scenario tuning.** Your institution's scenario file can give the AI specific instructions for your programs. Write the scenario in plain language and send it to your CDS contact to add. Follow the phrasing of the existing scenarios — write "the question" or "the user", not "you" (to the AI, "you" means itself). Re-test the question once it's in.

## Fix or remove an evaluation

If you make a mistake:

- **A question you asked yourself:** delete the whole chat from the logs.
- **A question a real user asked in a trial:** delete only the evaluation, so the chat stays in the record.

To delete an evaluation:

1. Open the chat in review mode.
2. Expand **Expert evaluation**.
3. Select **Delete expert evaluation**.

Also worth removing when the content it was based on has changed, or the judgement turned out to be wrong. It takes effect on the next question — there is nothing to re-run.

### Never stale

A **Never stale** checkbox sits beside the delete button.

Evaluations stop informing future answers after a year, counted from the evaluation date. Ticking **Never stale** exempts that one from the age limit. Use it when the evaluation rests on guidance that doesn't go out of date.

It overrides the age check only. Language match and similarity still apply, and deleting still removes it.

## How the number is worked out

Your ratings are turned into a score out of 100. It's a by-product of the ratings, not something to aim at — rate what you see and the number follows.

The answer is worth 75 of it and the citation 25, because this is an answers tool rather than a search engine. Sentence scores are averaged; anything left unrated counts as good.

| Rating | Sentence | Citation |
|---|---|---|
| **Good** | 100 | 25 |
| **Needs improvement** | 80 | 20 |
| **Incorrect** | 0 | 0 |

## Related

- [Partner onboarding](/en/how-to/partner-onboarding): choosing which questions to evaluate, and the rest of the partner role
- [Evaluation-informed answers](/en/how-to/eval-informed-answers): how your evaluations shape future answers
- [Using evaluations to improve answers](https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#using-evaluations-to-improve-answers): the public-facing summary in the system card
- [Retrieval mechanics, thresholds, failure modes](https://github.com/cds-snc/ai-answers/blob/main/docs/architecture/using-evals-for-answers.md)
- [Expert evaluation process, with screenshots](https://github.com/cds-snc/ai-answers/blob/main/docs/pdf/ai-answers-expert-evals-integration.pdf)
