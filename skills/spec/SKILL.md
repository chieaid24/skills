---
name: spec
description: "Full pipeline entry point for a new feature or change: interrogate the idea (sharpening domain language, writing ADRs as decisions crystallize), then route by scope — publish a [PRD] issue with child work slices for large features, or go straight to one or a few dependency-linked issues for small changes. Both converge on the same issue-creation flow. Use when starting from a rough idea toward a dependency-linked issue queue."
---

# Spec

Pipeline: rough idea → grill → docs updated → **route by scope** → issues published.

Runs three sequential phases. Do not skip ahead until the prior phase is complete. Phase 3 reads
bundled references — do not inline their content here, follow the files.

---

## Phase 1: Grill

Interview the user relentlessly about every aspect of the idea until reaching shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. Ask questions one at a time; provide your recommended answer with each.

If a question can be answered by exploring the codebase, explore the codebase instead.

### Domain awareness

Before grilling, explore the repo for existing documentation:

```
CONTEXT.md          ← glossary (single-context repo)
CONTEXT-MAP.md      ← lists contexts (multi-context repo)
docs/adr/           ← architectural decision records
```

Create files lazily — only when you have something to write.

### During the session

**Challenge against the glossary.** When the user uses a term that conflicts with `CONTEXT.md`, call it out: "Your glossary defines 'X' as Y, but you seem to mean Z — which is it?"

**Sharpen fuzzy language.** When the user uses vague or overloaded terms, propose a canonical term: "You're saying 'account' — do you mean Customer or User? Those are different."

**Cross-reference with code.** When the user states how something works, check whether the code agrees. Surface contradictions.

**Update `CONTEXT.md` inline.** When a term is resolved, write it immediately — don't batch. `CONTEXT.md` is a glossary only; no implementation details, no specs.

**Offer ADRs sparingly.** Only when ALL three are true:
1. Hard to reverse
2. Surprising without context
3. Result of a real trade-off with genuine alternatives

Use `docs/adr/NNNN-slug.md` format (increment from existing highest number).

---

## Phase 2: Route by scope

When grilling is complete and the user is satisfied with the decisions, classify the scope. Do NOT
re-interview — synthesize what was established. Announce the route with a one-line rationale; let
the user override.

- **PRD path** — pick when any hold: multiple user stories or actors; ADR-level decisions emerged;
  the work spans many slices; a durable spec others will reference adds value. A `[PRD]` issue is
  worth the overhead.
- **Issues-only path** — pick for small changes: one cohesive change, or a few independent small
  tasks; the decisions fit inside the issue body itself; no ADR-level choices. Skip the PRD.

State the decision, e.g.:

> Scope: large — three user stories and an ADR on the sync boundary. Taking the PRD path.

or

> Scope: small — a single self-contained change. Skipping the PRD, going straight to one issue.

---

## Phase 3: Publish

### PRD path

1. Follow `references/prd.md` to write and publish the `[PRD]` issue. Note its number.
2. Continue to `references/create-issues.md` in **batch mode**, using the PRD as the parent for
   every child slice.

### Issues-only path

Go straight to `references/create-issues.md` — **single mode** for one slice, or a **small batch**
for a few independent slices. No PRD, no parent.

Both paths converge on `references/create-issues.md`: the single shared flow for drafting
tracer-bullet slices, reconciling the open dependency graph, quizzing the user, publishing in
dependency order, and reporting grabbable vs waiting work.
