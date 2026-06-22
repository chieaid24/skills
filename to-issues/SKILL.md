---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Reconcile against the open graph, then quiz the user

First, run the **open-graph edge detection from the `/issue` skill** (section 2 there) across the batch: compare each drafted slice against the repo's existing OPEN issues (`gh issue list --state open --json number,title,body,labels`), in **both** directions — does a slice depend on pre-existing open work (`blocked-by`), or does a slice now block a pre-existing issue (`blocking`)? Model **true logical dependencies only**, never file overlap, and bias conservative when unsure.

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices OR existing open issues must complete first
- **Blocking**: which existing open issues now depend on this slice (if any)
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved slice, publish a new issue to the issue tracker. Use the issue body template below. These issues are AFK-ready, so label each one **`ready`** unless instructed otherwise — `ready` means "refined AFK work"; actual grabbability is computed from dependency edges, so label `ready` even when blockers exist.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers when wiring edges.

<issue-template>
## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it here and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.

### 6. Wire native dependency edges

The "Blocked by" / "Blocking" text in the body is for humans; the **authoritative** edges are native GitHub dependencies. After the issues exist, create them with `gh` (requires `gh` ≥ 2.94.0) — both within the batch and to/from pre-existing open issues found in step 4:

```bash
gh issue edit <slice> --add-blocked-by <blocker>    # this slice needs <blocker> first
gh issue edit <slice> --add-blocking  <dependent>   # <dependent> now needs this slice first
```

Then point the user at `/next-issue` to start working the queue.
