# PRD reference

Followed by `/spec` on the **PRD path** (a large, multi-slice feature worth a durable spec).
Synthesize what grilling already established — do NOT re-interview. Publish in one shot.

Before writing, read the current `CONTEXT.md` and any ADRs in `docs/adr/` written during Phase 1.
Use the canonical terms throughout and surface relevant ADRs under Implementation Decisions.

## Steps

1. If you haven't already, explore the repo to ground the PRD in the current state. Use the
   project's domain glossary vocabulary throughout, and respect any ADRs in the area you're
   touching.

2. Write the PRD using the template below.

3. Publish as a GitHub issue:

   ```bash
   gh issue create --title "[PRD] <feature name>" --body-file "$TMPDIR/prd-body.md" --label prd
   ```

   Delete the temp file after creation.

4. Record the new issue number, then continue to `references/create-issues.md` in **batch mode**
   with this PRD as the parent — every child issue references it in `## Parent`.

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
