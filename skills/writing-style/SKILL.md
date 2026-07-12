---
name: writing-style
description: "House writing style for the prose an agent ships to humans: PR bodies and READMEs. Use before drafting or editing either one."
---

# Writing Style

Terse, imperative, engineer-facing prose, after the Google developer documentation style. Second person, present tense, active voice.

The rules below fight the defaults a language model brings to prose. They are the whole guide; per-artifact structure lives behind the pointers in [Artifacts](#artifacts).

## The reader's next action

One test governs inclusion: does this line change what the reader does next? A line that survives is load-bearing. A line that merely proves you did the work is **filler**, and filler is the tax every reader pays on every read.

## Lead with the outcome

The first sentence carries the payload: what changed, what this is, what broke. Context, motivation, and history come after, for the reader who wants them.

A reader who stops after sentence one should still have the answer.

## Cut the throat-clearing

**Throat-clearing** is the run-up before the point: `This PR aims to...`, `In this section we will explore...`, `It is worth noting that...`, `As you can see...`. Open on the substance instead.

The same applies at the end. Once the point is made, stop. A closing paragraph that restates the body is **restatement**, and it earns nothing.

## Claims are checkable

State what you can show. `Cuts p99 from 400ms to 120ms` is a claim; `blazing fast` is **hype**.

Hype words to convert into evidence or delete: `robust`, `seamless`, `powerful`, `comprehensive`, `elegant`, `flexible`, `simply`, `easily`, `just`, `best-in-class`, `production-grade`.

When there is no evidence, the honest move is to describe the mechanism and let the reader judge.

## Name the actor

`The scheduler retries the job` beats `the job is retried`. Passive voice hides who acts, and in engineering prose the actor is usually the fact the reader needs.

## Earn every structure element

Headers, bullets, tables, and bold are for material that is genuinely parallel or genuinely scannable. Three sentences of connected reasoning are a paragraph. Bulleting them fragments an argument into a list of nouns and drops the connective tissue that made it an argument.

Bold marks a term being defined, not a phrase you want the reader to feel strongly about.

## Be specific

`improve`, `enhance`, `update`, `handle`, `support`, and `refactor` describe a category of change, not a change. Say the change: `retry on 429 instead of failing`, not `improve error handling`.

## Printable ASCII only

No em dashes, en dashes, curly quotes, ellipsis characters, arrows, or emoji. Hyphen, straight quote, three periods. A hyphen with spaces around it - like this - does the job of an em dash.

This one is mechanical, and it is the rule models break most.

## Voice

The rules above set the floor. **Voice** is the layer on top: cadence, diction, how a sentence opens, how dry the humor runs.

Check for a voice overlay at `~/.agents/writing/voice/VOICE.md`. If it exists, read it and match it. It carries samples of the author's own writing, and imitating a sample beats following an adjective. Where the overlay and this file disagree on **tone**, the overlay wins.

The overlay never overrides structure. A README keeps its shape no matter whose voice it speaks in - register travels, form does not.

If no overlay exists, the default voice is the one described at the top of this file.

## Artifacts

Two artifacts invoke this skill, and each adds structure on top of the rules above. Read the one you are about to write:

- [PR bodies](references/pr-bodies.md)
- [READMEs](references/readmes.md)
