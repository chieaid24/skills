---
name: to-prd
description: Synthesize the current conversation context (typically after /spec Phase 1 or /grill-with-docs) into a PRD and publish it to the project issue tracker as a [PRD] issue. Use when user wants to create a PRD from the current context. Note: /spec runs this automatically after grilling — invoke /to-prd directly only if grilling was done separately.
---

This skill synthesizes what has already been established in conversation — typically after `/spec` Phase 1 (or a standalone `/grill-with-docs` session) has fleshed out the idea — into a structured PRD. Do NOT re-interview the user. Publish in one shot.

Before writing, read the current `CONTEXT.md` and any ADRs in `docs/adr/` — use canonical terms throughout and surface relevant ADRs under Implementation Decisions.

## Process

### 1. Explore the codebase

If you haven't already, explore the repo to understand the current state. Use the project's domain glossary vocabulary throughout, and respect any ADRs in the area you're touching.

### 2. Write and publish the PRD

Write the PRD using the template below. Then publish it as a GitHub issue:

```bash
gh issue create --title "[PRD] <feature name>" --body-file "$TMPDIR/prd-body.md" --label prd
```

Delete the temp file after creation.

### 3. Suggest next step

Report the new issue number and suggest the next step:

> PRD published as #<n>. Run `/to-issues <n>` to break it into dependency-linked work slices.

---

<prd-template>

## Problem Statement

The problem the user is facing, from the user's perspective.

## Solution

The solution, from the user's perspective.

## User Stories

A numbered list of user stories covering all aspects of the feature:

1. As a <actor>, I want <feature>, so that <benefit>

## Implementation Decisions

Decisions made during design. Include:

- Modules to build or modify
- Interface changes
- Architectural decisions
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
