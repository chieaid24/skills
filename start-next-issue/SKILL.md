---
name: start-next-issue
description: Self-looping worker that grabs the next ready issue from the dependency-aware GitHub queue, works it to a green-CI merge, then takes the next — until stopped. Optionally accepts an issue number (/start-next-issue 42) or plain-text description (/start-next-issue "fix auth bug") to target a specific issue on the first iteration. Use when the user wants an agent to autonomously work the issue queue, "work the next issue", "start working issues", run the agent loop, or invokes /start-next-issue.
---

# Start Next Issue

A self-looping worker for the dependency-aware GitHub Issues queue. Point each parallel agent (Claude Code or Codex CLI) at this; it grabs one ready issue, drives it to a merged PR, then loops to the next, running until stopped (by you, or by usage limits).

Requires **`gh` >= 2.94.0**. The queue conventions are documented in the repo's CLAUDE.md "Parallel agent workflow" section — this skill executes them. Capture `<owner>/<repo>` and `<default-branch>` once at the start.

## Arguments (first iteration only)

| Invocation | Behaviour |
|---|---|
| `/start-next-issue` | Normal — most-blocking-first selection (steps 1-2) |
| `/start-next-issue 42` | Pin to issue #42 — skip steps 1-2, go straight to step 2a |
| `/start-next-issue "fix auth bug"` | Fuzzy-match title against open issues — skip steps 1-2, go straight to step 2a |

For pinned starts (number or description), the argument applies **only to the first iteration**. Subsequent loop iterations use normal most-blocking-first selection.

## The loop

### 0. Resume check (run first, and after any restart)
Before grabbing anything new, check whether **you** already hold work:
```bash
gh issue list --state open --assignee @me --json number,title,labels --limit 20
```
If an issue assigned to you is `in-progress` with an unmerged or missing PR, **resume it** (re-enter steps 4-5 for that issue) instead of grabbing a new one. This is the usage-limit resume path — finish the paused lane before taking more.

### 1. Compute the ready set (mechanical — no LLM)
```bash
gh issue list --state open --json number,title,labels,assignees,blockedBy --limit 100
```
An issue is **ready** iff ALL of:
- it has the `ready` label, AND
- it has **no assignee**, AND
- every issue in its `blockedBy` is closed with `stateReason == completed` (resolve blocker state with `gh issue view <blocker> --json state,stateReason`).

As a side-effect of this read, report **ready-set width** and any **zombies** (assigned + `in-progress` + no open PR). Width below the number of running agents is a refinement signal (the DAG is too deep — re-slice). Zombies are usually paused lanes — **leave them, do not reclaim**.

### 2. Select — most-blocking first
Pick the ready issue whose completion unblocks the **most** downstream issues: for each candidate `C`, count open issues `X` where `C ∈ X.blockedBy` (invert the `blockedBy` data you already fetched). Highest count wins; tiebreak lowest issue number. This keeps the other agents fed.

### 2a. Pinned start (only when an argument was given)
Skip steps 1-2 and resolve the target issue instead:

**Issue number** (`/start-next-issue 42`):
```bash
gh issue view 42 --json number,title,labels,assignees,blockedBy,state
```

**Plain-text description** (`/start-next-issue "fix auth bug"`):
```bash
gh issue list --state open --json number,title,labels,assignees,blockedBy --limit 100
```
Score each open issue by title similarity to the argument (exact substring match first, then fuzzy). Pick the best match. If the top match is ambiguous (two issues score equally), list both and ask the user to confirm before proceeding.

**Validation (both cases):**
- Issue must be open.
- Issue must be unassigned (or assigned only to you — resume path).
- If any blocker is open, warn the user and ask whether to proceed anyway or pick a different issue. Do not silently skip blockers.

On a valid pinned target, proceed to step 3 with that issue number.

### 3. Claim atomically
```bash
gh issue edit <n> --add-assignee @me
```
Re-read the issue. If you are **not the sole assignee**, you lost the race — drop it and return to step 2 for the next ready issue. On a clean claim, swap labels `ready` -> `in-progress`.

### 4. Work it
- Fetch and branch from **fresh** `<default-branch>` (`git fetch && git switch -c <n>-<slug> origin/<default-branch>`). One issue -> one worktree -> one branch.
- Implement the slice to its acceptance criteria.
- Open the PR with `Closes #<n>` in the body, then queue auto-merge:
  ```bash
  gh pr create --head <n>-<slug> --title "<title>" --body "Closes #<n>"
  gh pr merge <pr> --auto --squash --delete-branch
  ```

### 5. Babysit CI — do NOT fire-and-forget
Watch the required `test` check to completion:
```bash
gh pr checks <pr> --watch
```
- **Green** -> auto-merge fires server-side; prune the worktree; go to step 0/1 for the next issue.
- **Reproducible failure** -> pull the logs (`gh run view --log-failed`), fix on the branch, push, re-watch. **Max 3 fix attempts.** A failure that passes on a plain re-run is flaky and does **not** count against the 3.
- **Still red after 3 attempts** -> comment the failure on the issue (what failed + what you tried), label it `blocked`, leave it assigned, and **STOP THE LOOP ENTIRELY.** Do not grab another issue — this lane now waits for a human.

## Stopping

- **Ready set empty but open issues remain** (all blocked or claimed) -> **poll with backoff**: re-read every ~60s; resume when one becomes ready.
- **No open issues remain** -> the queue is drained -> **exit** and say so.
- **3-strike CI failure** -> halt (step 5).
- **Usage limits** kill the session mid-issue -> it leaves a paused `in-progress` claim (out of the ready set, so siblings ignore it). Re-invoke `/start-next-issue` when limits reset — step 0 resumes the paused lane.

## Notes
- **Crash-safe by construction:** the ready set IS the resume state — no checkpoint file. A kill leaves at most one in-progress issue, recovered by step 0.
- **File contention is not a dependency:** if the next ready issue overlaps a just-opened PR's files, that's fine — it rebases at its own merge gate.
- One issue per branch/PR — never batch.
- This skill only **consumes** the queue. Authoring/edges are `/to-issue`.
- `gh` >= 2.94.0 — older `gh` returns no `blockedBy` and the ready set is silently wrong; fail loudly.
