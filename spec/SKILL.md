---
name: spec
description: "Full pipeline entry point for a new feature: interrogate the idea (sharpening domain language, writing ADRs as decisions crystallize), then synthesize into a [PRD] issue and suggest /to-issues to slice it into actionable work. Use when starting from a rough idea toward a dependency-linked issue queue."
---

# Spec

Pipeline: rough idea → grill → docs updated → PRD published → `/to-issues` suggested.

Runs two sequential phases. Do not skip to Phase 2 until Phase 1 is complete.

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

## Phase 2: PRD

When grilling is complete and the user is satisfied with the decisions, transition to the PRD without re-interviewing. Synthesize what was established; publish in one shot.

### Steps

1. Read the freshly updated `CONTEXT.md` and any ADRs written during Phase 1. Use the canonical terms throughout the PRD. Surface relevant ADRs under Implementation Decisions.

2. Write the PRD using the template below.

3. Publish as a GitHub issue:
   ```bash
   gh issue create --title "[PRD] <feature name>" --body-file "$TMPDIR/prd-body.md" --label prd
   ```
   Delete the temp file after creation.

4. Report the issue number and suggest next step:
   > PRD published as #<n>. Run `/to-issues <n>` to break it into dependency-linked work slices.

### PRD template

<prd-template>

## Problem Statement

The problem the user is facing, from the user's perspective.

## Solution

The solution, from the user's perspective.

## User Stories

A numbered list of user stories covering all aspects of the feature:

1. As a <actor>, I want <feature>, so that <benefit>

## Implementation Decisions

Decisions made during the grilling session. Include:

- Modules to build or modify
- Interface changes
- Architectural decisions (reference any ADRs written during Phase 1)
- Schema changes
- API contracts
- Key interactions

Do NOT include specific file paths or code snippets — they go stale.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note it came from a prototype. Trim to decision-rich parts only.

## Testing Decisions

- What makes a good test for this feature (test external behavior, not implementation details)
- Which seams to test at (prefer existing high seams; note any new ones proposed)
- Prior art in the codebase for similar tests

## Out of Scope

Things explicitly excluded from this PRD.

## Further Notes

Any remaining context, open questions, or follow-up considerations.

</prd-template>
