---
name: to-issue
description: Create one or more dependency-aware issues from a task description or plan. Auto-detects single vs batch from context. Always reconciles against the open graph (blocked-by and blocking edges in both directions), runs a quiz loop before publishing, and labels each issue HITL or AFK. Use for "add an issue", "create a ticket", "break this plan into issues", or /to-issue. For a single issue this is a lighter loop; for a plan or PRD it breaks into tracer-bullet vertical slices.
---

# To Issue

Create dependency-aware issues — one or many — and slot them into the existing queue. Always reconciles against the open graph; always quizzes before publishing.

## 0. Detect mode

Scan the conversation context:

- **Batch** — a plan, spec, or PRD is present (or an issue reference with the `prd` label is passed as an argument). Break into tracer-bullet vertical slices.
- **Single** — a specific task description is present with no decomposition needed. Create one issue.

If ambiguous, ask.

## Preconditions

- Git repo with GitHub `origin`; `gh` authenticated; **`gh` >= 2.94.0** (needs `--add-blocked-by` / `--add-blocking` and `blockedBy` JSON fields).
- Capture `<owner>/<repo>` via `gh repo view --json nameWithOwner`.
- If an issue reference is passed as an argument, fetch its full body and comments.

## 1. Explore (optional)

If the codebase is unfamiliar, explore it. Issue titles and descriptions must use the project's domain glossary and respect any ADRs.

## 2. Draft the issue(s)

### Single mode

Draft one **tracer-bullet vertical slice** — narrow but complete end-to-end, independently mergeable.

### Batch mode

Break the plan into tracer-bullet slices. Each slice must:
- Cut through ALL integration layers end-to-end (schema, API, UI, tests)
- Be demoable or verifiable on its own
- Prefer many thin slices over few thick ones

For large decompositions, consider a **parent issue** that scopes the overall work with child issues as individual slices (each child references it in `## Parent`). Small standalone tasks need no parent. If the source is a PRD issue (labelled `prd`), record its number as the parent for every child.

### Label each draft HITL or AFK

- **AFK** — fully autonomous: implement, test, and merge without human involvement. Prefer AFK.
- **HITL** — requires human interaction: architectural decision, design review, or external dependency.

### Issue body template (every issue, single or batch)

```markdown
## Parent

A reference to the parent PRD or tracking issue on the issue tracker. Omit if standalone.

## What to build

Concise end-to-end description of this slice. Describe behavior, not layer-by-layer implementation.
Avoid specific file paths — they go stale fast. Exception: if a prototype produced a snippet that
encodes a decision more precisely than prose (state machine, schema, type shape), inline it and
note it came from a prototype.

## Type

AFK / HITL

## Acceptance criteria

- [ ] Criterion 1

## Blocked by

- #<issue> description (or "None — can start immediately")

## Definition of done

- [ ] CI `test` check green
- [ ] Verified locally if runtime behavior or UI changes
- [ ] PR on branch `<issue#>-<slug>` with `Closes #<this issue>`

## Notes / context

Links to specs, ADRs, related issues.
```

## 3. Open-graph edge detection

Fetch the open issue graph:

```bash
gh issue list --state open --json number,title,body,labels --limit 100
```

For each drafted issue, determine edges in **both** directions:

- **blocked-by (upward)** — open issues whose code/output must exist first.
- **blocking (downward)** — open issues that now logically need *this* issue first (e.g. it extracts a shared helper or introduces a type they assume). **Always evaluate this direction** — a missing downward edge is the silent, dangerous failure.

**Logical dependencies only.** File overlap is contention, handled at merge via rebase; never model it as an edge.

**Conservative bias.** When genuinely unsure a real dependency exists, propose the edge. A false edge costs a little parallelism (recoverable); a missing edge sends an agent to build on code that isn't there (expensive).

For batch mode: also model edges *between* the new slices themselves.

## 4. Quiz the user

Present the proposed issue(s). For each issue, show:

- **Title**
- **Type**: AFK / HITL
- **Blocked by**: other slices or pre-existing open issues that must complete first
- **Blocking**: pre-existing open issues that now depend on this issue (if any)
- **User stories covered** (batch mode only, when source material has them)

Ask:
- Do the issue(s) feel right? (for batch: granularity — too coarse / too fine?)
- Are the dependency relationships correct?
- (Batch) Should any slices be merged or split further?
- Are HITL / AFK labels correct?

Iterate until the user approves.

## 5. Publish

Publish in **dependency order** (blockers first) so real issue numbers exist when wiring edges.

For each issue:

```bash
# Write body to a temp file, create the issue, wire edges, then clean up
gh issue create --title "<title>" --body-file "$TMPDIR/issue-body.md" --label ready
gh issue edit <n> --add-blocked-by <A> [--add-blocked-by <B> ...]   # n needs A, B
gh issue edit <n> --add-blocking  <C> [--add-blocking  <D> ...]      # C, D now need n
rm -f "$TMPDIR/issue-body.md"
```

Label every issue `ready` — including those with open blockers. Actual grabbability is computed from dependency edges + `completed` state, not the label.

Do NOT close or modify any parent or PRD issue.

## 6. Report

State each new issue number, its edges, and whether it is **immediately grabbable** (no open blockers) or **waiting** (has open blockers). If the queue now has ready work, suggest `/start-next-issue`.

## Notes

- **`gh` >= 2.94.0** required for dependency flags — fail loudly on older versions.
- Never model file contention as a dependency edge.
- Scan the open issue set for duplicates before creating.
