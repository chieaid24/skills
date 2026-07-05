---
name: start-next-issue
description: Iteration-capped worker for the dependency-aware GitHub queue -- grabs the next ready issue, drives it to a merged PR, then hands off to a fresh-context agent for up to 3 iterations total before stopping. Optionally accepts an issue number (/start-next-issue 42) or plain-text description (/start-next-issue "fix auth bug") to target a specific issue on the first iteration. Use when the user wants an agent to work a bounded batch of issues from the queue, "work the next few issues", run a capped agent chain, or invokes /start-next-issue.
---

# Start Next Issue

A bounded worker for the dependency-aware GitHub Issues queue. Point an agent (Claude Code or Codex CLI) at this; it grabs one ready issue, drives it to a merged PR, then hands off to a **fresh-context agent** to take the next one -- for **up to 3 iterations total**, then the chain stops.

Requires **`gh` >= 2.94.0**. The queue conventions are documented in the repo's CLAUDE.md "Parallel agent workflow" section -- this skill executes them. Capture `<owner>/<repo>` and `<default-branch>` once at the start.

## Arguments

| Invocation | Behaviour |
|---|---|
| `/start-next-issue` | Start a new 3-iteration chain at `1/3` -- normal most-blocking-first selection (steps 1-2) |
| `/start-next-issue 42` | Start a new chain, pinned to issue #42 for iteration `1/3` only -- skip steps 1-2, go straight to step 2a |
| `/start-next-issue "fix auth bug"` | Start a new chain, fuzzy-matched to issue title for iteration `1/3` only -- skip steps 1-2, go straight to step 2a |
| `/start-next-issue --iteration <n>/3` | **Internal** -- set by a prior agent's handoff (step 6). This is iteration `<n>` of an already-running chain; not meant to be typed by a user. |

Any invocation without `--iteration` starts a **fresh 3-iteration budget** at `1/3`, whether pinned or not. A pin (issue number or description) only ever applies to iteration `1/3` -- a handed-off agent always uses normal selection (steps 1-2).

## Worktree isolation -- the one hard rule

Other agents share this clone and are working in it **right now**. You therefore **never change the
branch of the shared checkout** -- no `git switch`, no `git checkout <branch>`, no `git switch -c`
in place. Switching branches under the shared checkout yanks the working tree out from under the
other agents.

Each issue instead gets its **own `git worktree`** under `.worktrees/<n>-<slug>`. Every bit of its
work -- edits, commits, pushes, the PR, CI fixes -- happens **inside that worktree**, and it stays
there until the PR is merged into `<default-branch>` and the worktree is removed. If you ever catch
yourself about to switch branches in the primary checkout, stop and `git worktree add` instead.

## The loop

### 0. Resume check (run first, and after any restart)
Before grabbing anything new, check whether **you** already hold work:
```bash
gh issue list --state open --assignee @me --json number,title,labels --limit 20
```
If an issue assigned to you is `in-progress` with an unmerged or missing PR, **resume it** (re-enter steps 4-5 for that issue) instead of grabbing a new one -- this is the usage-limit resume path (see Stopping). Its worktree under `.worktrees/` likely still exists: `git worktree list`, then `cd` back into it rather than recreating it (do not switch the shared checkout). Otherwise continue to step 1 (or step 2a if this is a pinned iteration `1/3`).

### 1. Compute the ready set (mechanical -- no LLM)
```bash
gh issue list --state open --json number,title,labels,assignees,blockedBy --limit 100
```
An issue is **ready** iff ALL of:
- it has the `ready` label, AND
- it has **no assignee**, AND
- every issue in its `blockedBy` is closed with `stateReason == completed` (resolve blocker state with `gh issue view <blocker> --json state,stateReason`).

As a side-effect of this read, report **ready-set width** and any **zombies** (assigned + `in-progress` + no open PR). Width below the number of running agents is a refinement signal (the DAG is too deep -- re-slice). Zombies are usually paused lanes -- **leave them, do not reclaim**.

### 2. Select -- most-blocking first
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
- Issue must be unassigned (or assigned only to you -- resume path).
- If any blocker is open, warn the user and ask whether to proceed anyway or pick a different issue. Do not silently skip blockers.

On a valid pinned target, proceed to step 3 with that issue number.

### 3. Claim atomically -- serialize with a local lock, then assign
Agents on this machine share **one `gh` login**, so the assignee set alone cannot tell "I claimed
it" from "another agent on the same account claimed it" -- both would re-read a single `@me`
assignee and both conclude they won, then duplicate the work. Gate the claim with an atomic
filesystem lock in the shared git dir (visible to every agent working this clone). `mkdir` is atomic,
so exactly one agent enters the critical section per issue:
```bash
lockdir="$(git rev-parse --git-common-dir)/claim-locks"; mkdir -p "$lockdir"
if mkdir "$lockdir/<n>" 2>/dev/null; then
  # won the lock -- re-read GitHub state INSIDE the lock (this is what makes claim atomic)
  gh issue view <n> --json assignees,labels,state
  # proceed only if still open, unassigned (or only you), and still labelled `ready`:
  gh issue edit <n> --add-assignee @me
  gh issue edit <n> --remove-label ready --add-label in-progress
  rmdir "$lockdir/<n>"   # release -- the in-progress label now gates every other agent
else
  # lock is held. If the issue is NOT actually assigned + in-progress, it is a stale lock from a
  # crashed agent: rmdir "$lockdir/<n>" and retry once. Otherwise you lost the race -- drop it and
  # return to step 2 for the next ready issue.
fi
```
Re-reading the issue **inside** the lock is what closes the check-to-claim gap. Hold the lock only
across the assign + label swap (a second or two), then release it -- the durable, cross-agent
visible claim is the `in-progress` label + assignee, not the lock. Do not open a worktree or start
work (step 4) until you hold a confirmed clean claim.

### 4. Work it -- in a dedicated worktree, never in the shared checkout
See **Worktree isolation** above: the shared checkout's branch is off-limits. One issue -> one
worktree -> one branch.

- Fetch, then add a worktree on a new branch cut from **fresh** `<default-branch>` -- this does NOT
  touch the shared checkout's branch:
  ```bash
  git fetch origin
  git worktree add -b <n>-<slug> .worktrees/<n>-<slug> origin/<default-branch>
  ```
  If that branch/worktree already exists (usage-limit resume, step 0), reuse it instead of
  re-adding -- `git worktree list` to find its path.
- `cd .worktrees/<n>-<slug>` and stay inside it for the rest of this issue. Every edit, commit, and
  push happens here, never in the shared checkout.
- Implement the slice to its acceptance criteria and commit.
- Open the PR (from inside the worktree) with `Closes #<n>` in the body:
  ```bash
  gh pr create --head <n>-<slug> --title "<title>" --body "Closes #<n>"
  ```

### 5. Babysit CI -- do NOT fire-and-forget
Watch the required `test` check to completion:
```bash
gh pr checks <pr> --watch
```
- **Green** -> merge it yourself right now, do not queue and wait, do not leave it open as a PR:
  ```bash
  gh pr merge <pr> --merge --delete-branch
  ```
  Merge commit, not squash -- every commit stays visible on `<default-branch>`. Confirm it landed:
  ```bash
  gh pr view <pr> --json state --jq .state
  ```
  Must read `MERGED`. If it doesn't (branch out of date, protection rule, etc.), resolve and retry the merge -- don't move on with an open PR. Then `cd` back to the shared checkout root and remove the worktree -- `git worktree remove .worktrees/<n>-<slug>` (add `--force` if it refuses; `git branch -D <n>-<slug>` if the local branch lingers) -- and go to step 6.
- **Reproducible failure** -> pull the logs (`gh run view --log-failed`), fix **in the worktree**, push, re-watch. **Max 3 fix attempts.** A failure that passes on a plain re-run is flaky and does **not** count against the 3.
- **Still red after 3 attempts** -> comment the failure on the issue (what failed + what you tried), label it `blocked`, leave it assigned, and **STOP THE CHAIN ENTIRELY.** Do not hand off to another agent -- this lane now waits for a human.

### 5a. Close the parent PRD if it's fully delivered
Only after a confirmed merge. The merged PR's `Closes #<n>` already closed the child issue; now check whether that closed the **last** child of its PRD.

If the just-closed issue named a parent PRD in its `## Parent` field (call it `#<P>`), scan for siblings still open:
```bash
# P = parent PRD number from the merged issue's `## Parent`
gh issue list --state open --json number,body --limit 200 \
  --jq '[.[] | select(.body | test("#'"$P"'\\b"))] | .[].number'
```
Treat only issues that name `#<P>` as their **parent** as children (ignore incidental mentions). If **no** open child remains, close the PRD as delivered:
```bash
gh issue close <P> --reason completed \
  --comment "All child issues delivered; closing PRD #<P>."
```
If any child is still open, or the merged issue had no parent PRD, leave the PRD as is. **Never close a PRD that still has an open child.**

### 6. Hand off (fresh context) or stop
Only reached once the PR is confirmed `MERGED` in step 5 (and any drained PRD closed in step 5a).

- **This was iteration `3/3`** -> stop. Report the issue(s)/PR(s) merged across the chain, then exit. Do not grab another issue.
- **Iterations remain** -> launch iteration `<n+1>/3` as a **new agent with a fresh context window**. It must not inherit this conversation -- only the handful of facts below. Use whichever spawn mechanism your environment provides:
  - **Claude Code:** the Agent tool with a non-fork agent type (e.g. `general-purpose`), so it starts with zero memory of this run.
  - **Codex CLI or any environment without a built-in spawn tool:** exec a new non-interactive session of your own CLI as a subprocess (e.g. `codex exec`, `claude -p`), then end this session once it's launched.

  Give the new agent exactly this, nothing more:
  - the instruction to run `/start-next-issue --iteration <n+1>/3`
  - `<owner>/<repo>` and `<default-branch>`

  Your own run ends here -- do not loop back to step 0 yourself. The new agent's step 0/1 rediscovers current queue state from `gh` independently.

## Stopping

- **Iteration `3/3` merged** -> chain complete, stop (step 6).
- **Ready set empty but open issues remain** (all blocked or claimed) -> **poll with backoff** within the current iteration: re-read every ~60s; resume when one becomes ready. This does not consume an iteration or trigger a handoff.
- **No open issues remain** -> the queue is drained -> **exit** and say so, regardless of iteration count.
- **3-strike CI failure** -> halt the whole chain (step 5). Do not hand off.
- **Usage limits** kill the session mid-issue -> it leaves a paused `in-progress` claim (out of the ready set, so siblings ignore it). Re-invoke `/start-next-issue --iteration <n>/3` (the same `n` the killed agent was on) when limits reset -- step 0 resumes the paused lane and the remaining budget continues. If you don't know `n`, a bare `/start-next-issue` is safe too -- it just starts a fresh 3-iteration budget.

## Notes
- **Crash-safe by construction:** the ready set IS the resume state for *which issue* is in flight -- no checkpoint file. A kill leaves at most one in-progress issue, recovered by step 0.
- **Iteration count is chain state, not repo state:** it lives only in the `--iteration` handoff argument passed between agents, not in GitHub. If a chain dies before handoff fires, the count is lost -- re-invoking bare just starts a new 3-iteration budget, which is harmless.
- **File contention is not a dependency:** if the next ready issue overlaps a just-opened PR's files, that's fine -- it rebases at its own merge gate.
- One issue per worktree/branch/PR -- never batch. The shared checkout's branch is never switched (see **Worktree isolation**).
- This skill only **consumes** the queue. Authoring/edges are `/spec`.
- `gh` >= 2.94.0 -- older `gh` returns no `blockedBy` and the ready set is silently wrong; fail loudly.
