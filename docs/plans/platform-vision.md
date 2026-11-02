# Vision: AI Answers as a federated platform for public-facing AI services

## Executive summary

AI Answers is a federated platform for delivering public-facing AI services, and it
already has many of the subagents and components needed. Institutions can use it to help
people through any AI-supported process they want to develop. The platform has
a set of agents and tools that can be combined into a harness, with the right foundation
model called for each agent.

The secure admin interface for institutions supports authentication and authorization
management, dashboards, batches, reporting, AI analysis, evaluation and access to custom
prompt files.

Current subagents in the AI Answers pipeline include blocking of personal information,
threats, manipulation and obscenity, as well as translation, search, routing to the right
department or service, injection of human expert feedback, analysis and categorization.
More can be, and are being, added. These subagents are secure, reusable, self-contained
components that can be used as a springboard for new services.

As access to sovereign AI models becomes available, personalized Protected B agents and
harnesses can be developed. These could assist with eligibility assessments, application
and appeal forms (perhaps working with GC Forms), custom regulatory logic flows, and more.
This is a separate tier with its own privacy foundations.

The initial focus for new public-facing services should be on those with real friction
and real financial or access value: immigration applications, benefit applications and
appeal processes. People will use third-party AI agents for these services anyway, so
the GC should provide a trustworthy one. Defending these services against criminal use is
basic security that every service must provide.

## How the platform is shared

**The institution owns** its content (its web pages are the source of truth), its
scenario file, API tools to its own data, additional content files, and expert review of
answers. For example, Indigenous Services Canada already has a contacts file the AI reads
only when a question needs it. A Statistics Canada data API tool could let answers give
current figures.

**The platform team owns** the safety pipeline, models, shared rules, evaluation tools
and admin interface. It reviews and tests each institution's files and tools before they
go live, so no change weakens a guarantee for anyone.

## What every service guarantees

- It never asks for, accepts or repeats passwords, codes or other secrets.
- It only links to GC domains approved for that service.
- It always offers a way to reach a person.
- It works in English and French at parity.
- Only human experts' judgements improve answers. AI evaluations never feed back into
  what the public is told.

## First service: the CanadaLogin assistant

CanadaLogin is how people sign in to the services above, and every user of a
participating portal must register or migrate. The assistant guides them step by step
([plan](canadalogin-assistant.md)). It is the platform's first guided, multi-step process
rather than one-off Q&A, so the longer conversations and multi-turn evaluation it needs
become shared capabilities for later services.

## Protected B: a separate tier

Today's services are safe partly because they hold no personal data: any question
containing it is blocked. Personalized Protected B services reverse that. Beyond a
sovereign model, they need authenticated sessions, data residency, records rules and a
privacy impact assessment. The building blocks carry over; the safety guarantees must be
redesigned, not assumed.
