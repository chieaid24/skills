---
name: start-next-issue
description: Iteration-capped worker for the dependency-aware GitHub queue -- grabs the next ready issue, drives it to a merged PR, then hands off to a fresh-context agent for up to 3 iterations total before stopping. Optionally accepts an issue number (/start-next-issue 42) or plain-text description (/start-next-issue "fix auth bug") to target a specific issue on the first iteration. Use when the user wants an agent to work a bounded batch of issues from the queue, "work the next few issues", run a capped agent chain, or invokes /start-next-issue.
---

# Start Next Issue

Bounded worker for the dependency-aware GitHub Issues queue. Grab one ready issue, drive it to a merged PR, then hand off to a **fresh-context agent** for the next -- **up to 3 iterations total**, then stop.

Requires **`gh` >= 2.94.0** (older `gh` returns no `blockedBy`; the ready set is silently wrong -- fail loudly). Queue conventions live in the repo's CLAUDE.md "Parallel agent workflow" section; this skill executes them. Capture `<owner>/<repo>` and `<default-branch>` once at the start.

## Arguments

| Invocation | Behaviour |
|---|---|
| `/start-next-issue` | New 3-iteration chain at `1/3` -- normal most-blocking-first selection (steps 1-2) |
| `/start-next-issue 42` | New chain pinned to issue #42 for iteration `1/3` only -- skip to step 2a |
| `/start-next-issue "fix auth bug"` | New chain, fuzzy-matched to issue title for iteration `1/3` only -- skip to step 2a |
| `/start-next-issue --iteration <n>/3` | **Internal**, set by a prior agent's handoff (step 6). Not user-typed. |

Any invocation without `--iteration` starts a **fresh 3-iteration budget** at `1/3`. A pin (number or description) applies to iteration `1/3` only -- handed-off agents always use normal selection.

## Worktree isolation -- the one hard rule

Other agents share this clone and are working in it **right now**. **Never change the branch of the shared checkout** -- no `git switch`/`git checkout <branch>`/`git switch -c` in place; that yanks the working tree out from under them. Each issue gets its **own `git worktree`** under `.worktrees/<n>-<slug>`, and all its work (edits, commits, pushes, PR, CI fixes) happens inside that worktree until the PR merges and the worktree is removed. About to switch branches in the primary checkout? Stop and `git worktree add` instead. This rule is absolute everywhere below.

## The loop

### Before the loop -- normalize output style (run every iteration, first)
PRs, issue comments, and CI-fix reasoning must be plain full English, not a compressed "caveman"/brevity style some environments enable globally. Disable it for this session (exact effect of `/caveman off`):
```bash
rm -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.caveman-active"
```
No-op if absent. Run at the **start of every iteration** -- handed-off agents (step 6) are fresh sessions whose `SessionStart` hook re-creates the flag.

### 0. Resume check (run first, and after any restart)
Before grabbing new work, check whether **you** already hold some:
```bash
gh issue list --state open --assignee @me --json number,title,labels --limit 20
```
If an issue assigned to you is `in-progress` with an unmerged/missing PR, **resume it** (re-enter steps 4-5) instead of grabbing new -- the usage-limit resume path (see Stopping). Its worktree likely still exists: `git worktree list`, then `cd` back in rather than recreating. Otherwise continue to step 1 (or step 2a for a pinned `1/3`).

### 1. Compute the ready set (mechanical -- no LLM)
```bash
gh issue list --state open --json number,title,labels,assignees,blockedBy --limit 100
```
An issue is **ready** iff ALL of: has the `ready` label; has **no assignee**; every `blockedBy` issue is closed with `stateReason == completed` (verify with `gh issue view <blocker> --json state,stateReason`).

Side-effect of this read: report **ready-set width** and any **zombies** (assigned + `in-progress` + no open PR). Width below the number of running agents means the DAG is too deep -- re-slice. Leave zombies alone (usually paused lanes -- do not reclaim).

### 2. Select -- most-blocking first
Pick the ready issue that unblocks the **most** downstream issues: for each candidate `C`, count open `X` where `C ∈ X.blockedBy` (invert the data you already fetched). Highest wins; tiebreak lowest issue number.

### 2a. Pinned start (only when an argument was given)
Skip steps 1-2 and resolve the target:

- **Issue number** (`42`): `gh issue view 42 --json number,title,labels,assignees,blockedBy,state`
- **Description** (`"fix auth bug"`): fetch the open list as in step 1, score each title by similarity (exact substring first, then fuzzy), pick the best. If two tie, list both and ask the user.

**Validation (both):** issue must be open; unassigned (or assigned only to you -- resume); if any blocker is open, warn and ask whether to proceed or pick another -- never silently skip blockers. On a valid target, proceed to step 3.

### 3. Claim atomically -- local lock, then assign
Agents here share **one `gh` login**, so the assignee alone can't distinguish "I claimed it" from "another agent on this account did" -- both read `@me` and both think they won. Gate the claim with an atomic `mkdir` lock in the shared git dir so exactly one agent enters the critical section:
```bash
lockdir="$(git rev-parse --git-common-dir)/claim-locks"; mkdir -p "$lockdir"
if mkdir "$lockdir/<n>" 2>/dev/null; then
  # won the lock -- re-read GitHub state INSIDE the lock (this closes the check-to-claim gap)
  gh issue view <n> --json assignees,labels,state
  # proceed only if still open, unassigned (or only you), still labelled `ready`:
  gh issue edit <n> --add-assignee @me
  gh issue edit <n> --remove-label ready --add-label in-progress
  rmdir "$lockdir/<n>"   # release -- the in-progress label now gates other agents
else
  # lock held. If the issue is NOT actually assigned + in-progress, it's a stale lock from a crashed
  # agent: rmdir "$lockdir/<n>" and retry once. Otherwise you lost the race -- return to step 2.
fi
```
Hold the lock only across assign + label swap (a second or two). The durable cross-agent claim is the `in-progress` label + assignee, not the lock. Don't open a worktree until you hold a confirmed clean claim.

### 4. Work it -- in a dedicated worktree
One issue -> one worktree -> one branch. Cut the branch from **fresh** `<default-branch>` (does not touch the shared checkout):
```bash
git fetch origin
git worktree add -b <n>-<slug> .worktrees/<n>-<slug> origin/<default-branch>
```
If it already exists (resume, step 0), reuse it -- `git worktree list` for the path. Then `cd .worktrees/<n>-<slug>` and stay there. Implement the slice to its acceptance criteria, commit, and open the PR with `Closes #<n>`:
```bash
gh pr create --head <n>-<slug> --title "<title>" --body "Closes #<n>"
```

### 4a. Own the whole platform, not just your slice
You are an owner of the entire product, not a narrow ticket-closer. While you implement and **validate** your slice (run the app, exercise the flow end-to-end, read the code you touch and around it), watch for anything broken, regressed, or visibly wrong **anywhere** -- a crash, broken flow, wrong result, mangled/misaligned UI, dead link, failing/flaky test, a lint error you pass through. Assume nobody else will catch it.

**Fix it autonomously in this worktree and ship it in the same PR** -- don't defer, don't leave it for another agent, don't ask first. Keep the `Closes #<n>` line, then add an **`## Out-of-scope fixes`** section listing each drive-by fix (what was broken, where, what changed).

Guardrails:
- **Your assigned issue's acceptance criteria still gate the PR.** Drive-by fixes ride along; never replace or dilute the slice.
- **Keep each fix tight and obviously correct**, not an open-ended refactor. If a problem is too large to fix safely inline (needs its own design, wide blast radius, or risks the merge or the 3-attempt CI budget), **file a new `ready` queue issue** with repro + location instead. Filing is the escape hatch; fixing inline is the default.

### 5. Babysit CI -- do NOT fire-and-forget
Watch the required `test` check to completion:
```bash
gh pr checks <pr> --watch
```
- **Green** -> merge now (don't leave it open):
  ```bash
  gh pr merge <pr> --merge --delete-branch          # merge commit, not squash -- keep every commit
  gh pr view <pr> --json state --jq .state          # must read MERGED
  ```
  If not `MERGED` (branch out of date, protection rule), resolve and retry -- don't move on with an open PR. The merge's `Closes #<n>` closes the issue, but the label doesn't clear itself -- drop it explicitly:
  ```bash
  gh issue edit <n> --remove-label in-progress
  ```
  Then `cd` back to the shared checkout root and remove the worktree -- `git worktree remove .worktrees/<n>-<slug>` (`--force` if it refuses; `git branch -D <n>-<slug>` if the local branch lingers). Go to step 5a.
- **Reproducible failure** -> pull logs (`gh run view --log-failed`), fix **in the worktree**, push, re-watch. **Max 3 fix attempts.** A failure that passes on a plain re-run is flaky and doesn't count.
- **Still red after 3** -> comment the failure on the issue (what failed + what you tried), swap labels (`gh issue edit <n> --remove-label in-progress --add-label blocked`), leave it assigned, and **STOP THE CHAIN.** No handoff -- this lane waits for a human.

### 5a. Close the parent PRD if fully delivered
Only after a confirmed merge, and only if the closed issue named a parent PRD in its `## Parent` field (call it `#<P>`). Scan for siblings still open:
```bash
# P = parent PRD number from the merged issue's `## Parent`
gh issue list --state open --json number,body --limit 200 \
  --jq '[.[] | select(.body | test("#'"$P"'\\b"))] | .[].number'
```
Count only issues naming `#<P>` as their **parent** (ignore incidental mentions). If **no** open child remains, close the PRD:
```bash
gh issue close <P> --reason completed --comment "All child issues delivered; closing PRD #<P>."
```
Otherwise leave it. **Never close a PRD with an open child.**

### 6. Hand off (fresh context) or stop
Only reached once the PR is confirmed `MERGED` (step 5) and any drained PRD closed (step 5a).

- **Iteration `3/3`** -> stop. Report the issues/PRs merged across the chain, then exit. Do not grab another.
- **Iterations remain** -> launch iteration `<n+1>/3` as a **new agent with a fresh context window** (must not inherit this conversation):
  - **Claude Code:** the Agent tool with a non-fork type (e.g. `general-purpose`).
  - **Codex CLI / no built-in spawn:** exec a new non-interactive session (`codex exec`, `claude -p`), then end this session.

  Give the new agent **only**: the instruction to run `/start-next-issue --iteration <n+1>/3`, plus `<owner>/<repo>` and `<default-branch>`. Your run ends here -- don't loop back to step 0 yourself; the new agent rediscovers queue state from `gh`.

## Stopping

- **Iteration `3/3` merged** -> chain complete, stop.
- **Ready set empty but open issues remain** (all blocked/claimed) -> **poll with backoff** within the current iteration: re-read ~every 60s, resume when one becomes ready. Doesn't consume an iteration or trigger a handoff.
- **No open issues remain** -> queue drained -> exit and say so, regardless of iteration count.
- **3-strike CI failure** -> halt the whole chain (step 5). No handoff.
- **Usage limits kill the session mid-issue** -> a paused `in-progress` claim is left (out of the ready set, so siblings ignore it). Re-invoke `/start-next-issue --iteration <n>/3` (same `n`) when limits reset -- step 0 resumes it. If you don't know `n`, a bare `/start-next-issue` is safe (just a fresh budget).

## Notes
- **Crash-safe by construction:** the ready set IS the resume state -- no checkpoint file. A kill leaves at most one in-progress issue, recovered by step 0.
- **Iteration count is chain state, not repo state:** it lives only in the `--iteration` handoff arg. If a chain dies before handoff, the count is lost -- re-invoking bare just starts a new budget, harmless.
- **File contention is not a dependency:** if the next ready issue overlaps a just-opened PR's files, fine -- it rebases at its own merge gate.
- **One issue per worktree/branch/PR -- never batch.** The one exception is a drive-by out-of-scope fix (step 4a) riding along under `## Out-of-scope fixes`; you still never deliberately pull another queue issue's slice in.
- This skill only **consumes** the queue. Authoring/edges are `/spec`.
