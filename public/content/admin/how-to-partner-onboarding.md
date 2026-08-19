---
title: "Partner onboarding"
description: "What a partner institution does when it joins AI Answers: choosing questions, running an evaluation set, and fixing what the evaluations turn up."
---

# Partner onboarding

**Audience:** Partner users starting out with AI Answers.

**Draft:** This guide is a first pass, assembled from the partner evaluation deck. Send corrections to your Canadian Digital Service (CDS) contact.

## What a partner does

There are 4 things, roughly in this order:

- **Launch** — get the pilot deployed for your institution.
- **Evaluation** — judge how well AI Answers handles your users' questions.
- **Content issues** — find and fix the web content behind wrong answers.
- **Scenarios** — write and test institution-specific instructions for the AI.

Most of the work is evaluation, and the other 3 fall out of what evaluation turns up.

## Get set up

1. Sign up for an account. It has to be approved before you can use it, so do this ahead of time.
2. Always sign in before you start — expert evaluations don't record otherwise.
3. The partner menu has everything you need, in this order:
   - **Use AI Answers with evaluation options** — ask your questions and evaluate the answers as they come back.
   - **Evaluation dashboard** — your way back into chats that already exist: what's still to evaluate, and what's been done. This is where most of your evaluating starts once you have chats in the system.
   - **View chats** — every chat, including which pages AI Answers read.
   - **View performance metrics**, **Partner dashboard**, **View technical metrics**, **Public dashboard** — results and trends.
   - **Edit scenarios** — institution-specific instructions for the AI.
   - **View full trace for a chat** — the full event log for a single chat.
   - **View and manage batches** — run a set of questions at once instead of one at a time.

## Choose the questions to evaluate

Use real user questions in the user's own words, including typos and awkward grammar. Skip questions of 1 or 2 words.

Real questions come from the [page feedback viewer](https://feedback-viewer.tbs.alpha.canada.ca/pageFeedback), which is only available on the Government of Canada VPN.

### Top tasks — aim for 100 questions

1. Pick 10 of your institution's top tasks.
2. In the feedback viewer, find real user questions about those tasks. Note the question and the page it came from.
3. Pick about 5 English and 5 French questions per task that represent what users actually ask.

### Long tail — aim for 50 questions

1. Find pages on your site that get a lot of user feedback but aren't tied to a top task.
2. Pick tricky but important questions, in a mix of English and French.

Send your list to your CDS contact before you start evaluating, so we know what's being covered.

## Run an evaluation set

For each question:

1. Open **Use AI Answers with evaluation options**.
2. Under **Options**, paste the page the user gave the feedback on into **Referring Canada.ca URL**. Leave the other options alone — they matter for testing, not for evaluation.

   ![The expanded Options panel below the question box, showing Workflow and Model family both set to "Use system settings" and a Canada.ca URL filled into the Referring Canada.ca URL field](/content/admin/images/onboarding-options-referring-url-en.jpg)

3. Type the user's question using their exact wording. Ask English questions from the English page and French questions from the French page.
4. Rate the answer. See [Evaluate answers](/en/how-to/evaluate-answers) for what the ratings mean and how to fill in the form.

## Fix what the evaluations turn up

**Web content problems.** Most wrong answers trace back to government web content that is out of date or unclear. Find where the answer came from, log it in your content issues tracker, and re-test the question once the content is fixed.

**Scenario tuning.** Your institution's scenario file can give the AI specific instructions for your programs. Write the scenario in plain language and send it to your CDS contact to add. Follow the phrasing of the existing scenarios — write "the question" or "the user", not "you" (to the AI, "you" means itself). Re-test the question once it's in.

## When you're done a set

- Note any trends or issues you saw beyond what you recorded in the individual evaluations.
- Tell your CDS contact the set is complete.

Results are compared across institutions, tasks, and languages to see where errors concentrate, and the evaluations themselves feed back into future answers.

## Related

- [Evaluate answers](/en/how-to/evaluate-answers): how to score an answer once you have one
- [Evaluation-informed answers](/en/how-to/eval-informed-answers): how your evaluations shape future answers
- [Using evaluations to improve answers](https://github.com/cds-snc/ai-answers/blob/main/SYSTEM_CARD.md#using-evaluations-to-improve-answers): the public-facing summary in the system card
