---
name: issue
description: File one well-formed agent issue and wire its dependencies — drafts a single tracer-bullet issue, then detects bidirectional blocked-by/blocking edges against the open issue graph and creates them natively via gh. Use when the user wants to add a single issue, file a ticket, "create an issue", or invokes /issue. For breaking a whole plan into many issues, use to-issues instead.
---

# Issue

Create ONE dependency-aware issue and slot it into the existing queue. For batch breakdown of a plan or PRD, use `to-issues` instead — but note `to-issues` calls **this skill's open-graph routine** (section 2) to reconcile its new batch against pre-existing open issues, so keep that routine authoritative.

## Preconditions

- A git repo with a GitHub `origin`; `gh` authenticated; **`gh` ≥ 2.94.0** (needs the `--add-blocked-by` / `--add-blocking` flags and `blockedBy` JSON).
- Capture `<owner>/<repo>` (`gh repo view --json nameWithOwner`).

## 1. Draft the issue

- One **tracer-bullet vertical slice** — a narrow but complete path through all layers, independently mergeable. Use the project's domain glossary and respect ADRs.
- Fill the repo's issue template (`.github/ISSUE_TEMPLATE/task.md`): Goal, Acceptance criteria, Files likely touched, Dependencies, Definition of done.
- It will be labelled `ready` (refined AFK work) **even if it has blockers** — the ready *query* gates on edges + `completed` state, not the label, so no bot is needed to flip it later.

## 2. Open-graph edge detection — the shared routine (`to-issues` calls this too)

Determine the candidate issue's **true logical dependencies** against the current open set, in **both** directions:

1. Fetch the open graph:
   ```bash
   gh issue list --state open --json number,title,body,labels --limit 100
   ```
2. Decide edges for the candidate:
   - **blocked-by (upward)** — open issues that must be `completed` first because this issue needs their code/output to exist.
   - **blocking (downward)** — open issues that now logically need *this* issue first (e.g. it extracts a shared helper or introduces a type they assume). **Always evaluate this direction** — a new foundational issue often blocks existing ones, and a missing downward edge is the silent, dangerous failure.
3. **Logical dependencies only.** Ignore mere file overlap — that is *contention*, handled at the merge gate by rebase, and must never become an edge.
4. **Conservative bias.** When genuinely unsure a real dependency exists, propose the edge. A false edge costs a little parallelism (recoverable); a missing edge sends an agent to build on code that isn't there (expensive).

Output: a proposed edge list, e.g. `blocked-by: #12, #14` and `blocking: #9`.

## 3. Confirm (the one human checkpoint)

Show the drafted issue **and** the proposed edges, both directions. The human approves once. After creation, agents consume the issue with no further human beat.

## 4. Create + wire

1. Write the body to a temp file in `$TMPDIR` and create the issue:
   ```bash
   gh issue create --title "<title>" --body-file "$TMPDIR/issue-body.md" --label ready
   ```
2. Author the native edges from the new issue number `<n>`:
   ```bash
   gh issue edit <n> --add-blocked-by <A> [--add-blocked-by <B> ...]   # this needs A, B
   gh issue edit <n> --add-blocking  <C> [--add-blocking  <D> ...]      # C, D now need this
   ```
3. Delete the temp body file.

## 5. Report

State the new issue number, its edges, and whether it's **immediately grabbable** (no open blockers) or **waiting** (has open blockers). If the queue now has ready work, suggest `/next-issue`.

## Notes

- **`gh` ≥ 2.94.0** required for the dependency flags — fail loudly on older versions.
- Never model file contention as an edge.
- Creating the same idea twice makes a duplicate issue — scan the open set first if unsure.
