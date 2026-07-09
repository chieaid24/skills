---
name: start-next-issue
description: Iteration-capped orchestrator for the dependency-aware GitHub queue -- the main agent grabs the next ready `afk` issue (skipping `hitl` issues, which need a human), drives it to a merged PR, then dispatches a fresh-context worker agent per remaining iteration (up to 3 issues total), each reporting back to the orchestrator before the next starts; any failure propagates upward and stops the run. Optionally accepts an issue number (/start-next-issue 42) or plain-text description (/start-next-issue "fix auth bug") to target a specific issue on the first iteration. Use when the user wants an agent to work a bounded batch of issues from the queue, "work the next few issues", run a capped orchestrated batch, or invokes /start-next-issue.
---

# Start Next Issue

Bounded orchestrator for the dependency-aware GitHub Issues queue. The **main agent** (the orchestrator -- the session the user invoked) works the first ready issue itself, then dispatches one **fresh-context worker agent** per remaining issue and waits for each to report back before starting the next -- **up to 3 issues total**. Control always returns to the orchestrator between issues, and any failure **propagates upward** and halts the whole run.

Requires **`gh` >= 2.94.0** (older `gh` returns no `blockedBy`; the ready set is silently wrong -- fail loudly). Queue conventions live in the repo's CLAUDE.md "Parallel agent workflow" section; this skill executes them. Capture `<owner>/<repo>` and `<default-branch>` once at the start.

## Arguments

| Invocation | Behaviour |
|---|---|
| `/start-next-issue` | New 3-iteration run at `1/3` -- this agent is the **orchestrator**; normal most-blocking-first selection (steps 1-2) |
| `/start-next-issue 42` | New run pinned to issue #42 for iteration `1/3` only -- skip to step 2a |
| `/start-next-issue "fix auth bug"` | New run, fuzzy-matched to issue title for iteration `1/3` only -- skip to step 2a |
| `/start-next-issue --worker <n>/3 --chain <id>` | **Internal**, set by the orchestrator's dispatch (step 6). Work exactly one issue, end with a `RESULT:` line, dispatch nothing. Not user-typed. |
| `/start-next-issue --iteration <n>/3 --chain <id>` | Human resume of a dead run: adopt the chain's paused lane (step 0), finish it as iteration `<n>/3`, then orchestrate the remaining iterations. |
| `/start-next-issue --reclaim 42` | Human-only. Force-release the claim on #42 (a run died and its chain id is lost), then stop. |

Any invocation without `--worker`/`--iteration` starts a **fresh 3-iteration budget** at `1/3`, with this agent as the orchestrator for the whole run. A pin (number or description) applies to iteration `1/3` only -- dispatched workers always use normal selection.

`--reclaim` is the sole way to break another chain's claim, and it is **never** something an agent decides for itself. Show the claim's `chain`, `host`, and `claimed_at`, confirm with the human that the lane is truly dead, then release and re-open the issue for the queue:

```bash
git push -q origin :refs/claims/issue-42
gh issue edit 42 --remove-assignee @me --remove-label in-progress --add-label ready
```
Leave the stale worktree and branch for the human. Then stop -- do not go on to grab work.

## Chain identity -- who "you" are

Claims are attributed to a **chain id**, not to the `gh` account: agents share one login, so `@me` names every agent at once and can never answer "is this issue mine?".

Given `--chain <id>` (a step 6 dispatch, or a human resume), use it verbatim. Otherwise mint one, **once**, before step 0:

```bash
echo "chain-$(hostname)-$(date +%s%N)"   # -> e.g. chain-blade-1782604800123456789
```

Then **print it to the user and reuse that exact literal** in every later command of this run. Shell variables do not survive between commands -- each runs in its own process -- so re-running the `echo` mints a *different* chain and orphans your own claims. Treat the id as a constant you carry, not an expression you re-evaluate. It is opaque; only equality matters.

## Worktree isolation -- the one hard rule

Other agents share this clone and are working in it **right now**. **Never change the branch of the shared checkout** -- no `git switch`/`git checkout <branch>`/`git switch -c` in place; that yanks the working tree out from under them. Each issue gets its **own `git worktree`** under `.worktrees/<n>-<slug>`, and all its work (edits, commits, pushes, PR, CI fixes) happens inside that worktree until the PR merges and the worktree is removed. About to switch branches in the primary checkout? Stop and `git worktree add` instead. This rule is absolute everywhere below.

## The loop

### Before the loop -- normalize output style (run every iteration, first)
PRs, issue comments, and CI-fix reasoning must be plain full English, not a compressed "caveman"/brevity style some environments enable globally. Disable it for this session (exact effect of `/caveman off`):
```bash
rm -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.caveman-active"
```
No-op if absent. Run at the **start of every iteration** -- dispatched workers (step 6) are fresh sessions whose `SessionStart` hook re-creates the flag.

### 0. Resume check (run first, and after any restart)
Before grabbing new work, check whether **you** already hold some. **Never use `gh issue list --assignee @me` for this** -- with a shared login it returns every agent's in-progress issue, and adopting one hijacks a live sibling's lane. Ownership is proved by the **claim ref** (step 3), never by the assignee:

```bash
git fetch -q origin 'refs/claims/*:refs/claims/*' --prune
for ref in $(git for-each-ref --format='%(refname)' refs/claims/); do
  n="${ref##*/issue-}"
  echo "#$n -> $(git show "$ref:claim" | sed -n 's/^chain=//p')"   # the fields live in the blob,
done                                                               # not the commit message
```

Adopt a claim `#<n>` **only** if its `chain` equals your `chain_id`. That is the entire rule.

Every other claim is **another agent's lane**: leave the ref, the labels, the assignee, and the worktree untouched, name it in the report, and continue to step 1. Not yours to take -- however old it looks, and however loudly `@me` insists you are the assignee.

Do **not** try to infer liveness from a recorded pid. Each shell command runs in a fresh, short-lived process, so a pid captured at claim time is already dead moments later; a "reclaim if the pid is gone" rule would have every agent instantly reclaim its own live lane. Age is no better: a healthy lane can sit for an hour on slow CI. **Liveness is not observable here, so the chain id is the only sound answer**, and a genuinely abandoned claim is a human's call (`--reclaim`, below).

On adopting, re-enter steps 4-5. Its worktree likely still exists: `git worktree list`, then `cd` back in rather than recreating. Otherwise continue to step 1 (or step 2a for a pinned `1/3`).

### 1. Compute the ready set (mechanical -- no LLM)
```bash
gh issue list --state open --json number,title,labels,assignees,blockedBy --limit 100
```
An issue is **ready** iff ALL of: has the `ready` label; has the `afk` label and **not** `hitl`; has **no assignee**; has **no claim ref** (`refs/claims/issue-<n>` absent from the step 0 fetch); every `blockedBy` issue is closed with `stateReason == completed` (verify with `gh issue view <blocker> --json state,stateReason`).

The ready set is a **filter, not a claim** -- it narrows candidates cheaply, and step 3's CAS decides. Two agents computing the same ready set at the same instant is expected and harmless.

**`hitl` means a human gates the issue** -- an architectural call, a design review, an external dependency. Never grab one, however unblocked it looks: an unattended run would stall on someone who is away.

Side-effect of this read: report **ready-set width** and any **zombies** (claim ref present + `in-progress` + no open PR). Width below the number of running agents means the DAG is too deep -- re-slice. Leave zombies alone (usually paused lanes -- do not reclaim; step 0 owns the only reclaim rule). Also name any open `hitl` issue whose blockers are all `completed` -- it is **waiting on a human**.

### 2. Select -- most-blocking first
Pick the ready issue that unblocks the **most** downstream issues: for each candidate `C`, count open `X` where `C ∈ X.blockedBy` (invert the data you already fetched). Highest wins; tiebreak lowest issue number.

### 2a. Pinned start (only when an argument was given)
Skip steps 1-2 and resolve the target:

- **Issue number** (`42`): `gh issue view 42 --json number,title,labels,assignees,blockedBy,state`
- **Description** (`"fix auth bug"`): fetch the open list as in step 1, score each title by similarity (exact substring first, then fuzzy), pick the best. If two tie, list both and ask the user.

**Validation (both):** issue must be open; free of a claim ref (or holding one whose `chain` is yours -- resume); if any blocker is open, warn and ask whether to proceed or pick another -- never silently skip blockers. A claim ref belonging to **another** chain means an agent is on it right now: say so and pick another, even under an explicit pin. On a valid target, proceed to step 3.

**A pinned `hitl` issue is allowed but never silent.** A pin means the user asked for it right now, so the human the exclusion protects is present. Say it is `hitl` and what input it names, ask whether to proceed, then work it with the user in the loop -- surface each decision it flags instead of choosing alone. Dispatched workers (step 6) use normal selection, so the run returns to `afk`-only work.

### 3. Claim atomically -- push a claim ref, then assign

Neither the assignee nor the label can arbitrate a race. Agents share **one `gh` login**, so both claimers read `@me` and both think they won; and `gh issue edit --add-assignee` is *additive* (issues take many assignees) with no conditional/`If-Match` flag, so both calls succeed and neither errors. A local lock can't arbitrate either -- lanes routinely run in separate clones and on separate hosts, where any filesystem lock is a silent no-op.

Let **the git server** arbitrate. Creating a ref that already exists is rejected remotely, so exactly one agent's push survives:

```bash
# 1. Build a UNIQUE claim object. The nonce is load-bearing: two agents pushing the SAME sha
#    short-circuit to "Everything up-to-date" and BOTH exit 0 -- a double claim with no error.
#    `host` and `claimed_at` are diagnostics for a human; nothing automated may reason from them.
blob=$(printf 'issue=%s\nchain=%s\nhost=%s\nclaimed_at=%s\n' \
         "<n>" "$chain_id" "$(hostname)" "$(date -u +%FT%TZ)" | git hash-object -w --stdin)
tree=$(printf '100644 blob %s\tclaim\n' "$blob" | git mktree)
obj=$(git commit-tree "$tree" -m "claim <n> by $chain_id")   # parentless: never a fast-forward of another claim

# 2. Compare-and-swap. Empty expect (the trailing `:`) means "this ref must not already exist".
#    Enforced by the server, not the client -- a clone that never fetched the ref still loses.
if git push -q --force-with-lease=refs/claims/issue-<n>: origin "$obj":refs/claims/issue-<n> 2>/dev/null; then
  # WON. Re-read GitHub state now that the claim is held (closes the check-to-claim gap):
  gh issue view <n> --json assignees,labels,state
  # Still open, unassigned, still labelled `ready`? Then record the claim where humans can see it:
  gh issue edit <n> --add-assignee @me
  gh issue edit <n> --remove-label ready --add-label in-progress
  # Not still ready (someone closed or relabelled it)? Release and re-select:
  #   git push -q origin :refs/claims/issue-<n>   -- then return to step 1
else
  # LOST -- another agent holds the claim. NEVER delete a claim ref you do not own; that is
  # what broke the old lock. Return to STEP 1 (not step 2): your ready set is now stale.
fi
```

The claim ref is the **durable, cross-host claim** and the sole ownership record -- the `in-progress` label and assignee are human-visible *reporting*, downstream of it. Hold the ref for the whole lane and delete it at merge (step 5). Don't open a worktree until the CAS push has succeeded.

**Stale claim refs** (crashed agent whose chain id is lost) are reaped only by a human, via `--reclaim`. No agent may decide on its own that another chain's claim has gone stale.

### 4. Work it -- in a dedicated worktree
One issue -> one worktree -> one branch. Cut the branch from **fresh** `<default-branch>` (does not touch the shared checkout):
```bash
git fetch origin
git worktree add -b <n>-<slug> .worktrees/<n>-<slug> origin/<default-branch>
```
If the worktree already exists (resume, step 0), reuse it -- `git worktree list` for the path. If the *branch* exists but its worktree is gone (a crashed lane you just adopted), `git worktree add` fails with `branch already exists`; re-attach instead of forcing a new branch: `git worktree add .worktrees/<n>-<slug> <n>-<slug>`. Then `cd .worktrees/<n>-<slug>` and stay there. Implement the slice to its acceptance criteria, commit, and open the PR with `Closes #<n>`:
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
  gh pr merge <pr> --squash --delete-branch         # one commit per issue; CI fixes + drive-bys collapse
  gh pr view <pr> --json state --jq .state          # must read MERGED
  ```
  If that fails with `Squash merges are not allowed on this repository`, the repo has `allow_squash_merge=false` (bootstrap sets it, but skips on a 403 from a PAT without Administration scope). Don't leave the PR open over a settings flag: retry with `--merge`, and say in your report that the repo forbids squash so a human can enable it.
  If not `MERGED` (branch out of date, protection rule), resolve and retry -- don't move on with an open PR. The merge's `Closes #<n>` closes the issue, but neither the label nor your claim clears itself -- **release both, in this order**:
  ```bash
  gh issue edit <n> --remove-label in-progress
  git push -q origin :refs/claims/issue-<n>         # release the claim -- only ever your own
  ```
  Release the claim ref **last**: while it exists the lane is still yours, so a crash mid-cleanup leaves a claim your own step 0 will re-adopt rather than a free-for-all. Then `cd` back to the shared checkout root and remove the worktree -- `git worktree remove .worktrees/<n>-<slug>` (`--force` if it refuses; `git branch -D <n>-<slug>` if the local branch lingers). Go to step 5a.
- **Reproducible failure** -> pull logs (`gh run view --log-failed`), fix **in the worktree**, push, re-watch. **Max 3 fix attempts.** A failure that passes on a plain re-run is flaky and doesn't count.
- **Still red after 3** -> comment the failure on the issue (what failed + what you tried), swap labels (`gh issue edit <n> --remove-label in-progress --add-label blocked`), leave it assigned, release the claim (`git push -q origin :refs/claims/issue-<n>`) so a human isn't fighting a dead agent's lock, and **HALT THE RUN.** A worker ends with `RESULT: halted ...` (step 6) so the failure propagates up; the orchestrator -- whether it hit this itself on `1/3` or received `halted` from a worker -- stops without dispatching anything further. This lane waits for a human. Leave the worktree in place for them to inspect.

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

### 6. Report upward (worker) or dispatch the next iteration (orchestrator)
Only reached once the PR is confirmed `MERGED` (step 5) and any drained PRD closed (step 5a).

**Worker (`--worker`):** your job ends with this one issue -- never dispatch anything, never loop back to step 1. End your session with a report whose **last line** is exactly one `RESULT:` line (protocol below). The orchestrator reads that line; everything above it is free-form report (drive-by fixes, ready-set width, zombies, waiting `hitl` issues).

**Orchestrator:**
- **Iteration `3/3` merged** -> stop. Report every issue/PR merged across the run, then exit. Do not grab another.
- **Iterations remain** -> dispatch iteration `<n+1>/3` to a **worker with a fresh context window** and wait for it to finish:
  - **Claude Code:** the Agent tool with a non-fork type (e.g. `general-purpose`) -- a fork inherits this conversation; workers must not. Do **not** pass a `model` override, and pick a type whose definition pins no model (`general-purpose` doesn't): the worker then inherits this session's model. The tool call blocks until the worker ends, and the worker's final message (with its `RESULT:` line) comes back as the tool result.
  - **Codex CLI / no built-in spawn:** run a non-interactive session (`codex exec`, `claude -p`) in the foreground and capture its output. Pass your own model explicitly (`codex exec -m <model>`, `claude -p --model <model-id>`) -- a bare invocation uses the CLI's configured default, which may differ from the model running this run. Do **not** end your own session -- you are the orchestrator and you outlive every worker.

  **Workers always run the orchestrator's model** -- inherited on the Agent-tool path, pinned by flag on the CLI path. Never let a worker silently drop to a different model.

  Give the worker **only**: the instruction to run `/start-next-issue --worker <n+1>/3 --chain <chain_id>`, plus `<owner>/<repo>` and `<default-branch>`, and the requirement that the last line of its final message be a `RESULT:` line. Pass **your own** `chain_id` -- the run is one owner across all its iterations, so a worker can resume a lane a dead predecessor left mid-flight. The worker rediscovers queue state from `gh`; pass it no other context.

**Worker report protocol** -- the last line of the worker's final message, exactly one of:

```
RESULT: merged issue=<n> pr=<url>            # issue delivered; safe to dispatch the next
RESULT: halted issue=<n> reason=<one line>   # 3-strike CI failure or otherwise dead lane
RESULT: drained                              # no open issues remain
RESULT: hitl-only                            # only human-gated issues remain
```

**Acting on the result -- errors propagate upward, always:**
- `merged` -> record it, then loop: dispatch `<n+2>/3` or stop after `3/3`.
- `halted` -> **stop the run now.** Surface the worker's reason, the issue number, and the claim state to the user. Never dispatch past a failure.
- `drained` / `hitl-only` -> stop and report (list the waiting `hitl` issues if the worker named them).
- **Anything else** -- no `RESULT:` line, a spawn error, a worker that died mid-issue -- treat it as `halted`: stop, report your `chain_id` and what you observed, and point the human at `--iteration <n>/3 --chain <chain_id>` (resume) or `--reclaim` (break the claim). Never re-dispatch the same iteration -- the dead worker may hold a half-finished claim -- and never dispatch the next one on an ambiguous result.

## Stopping

- **Iteration `3/3` merged** -> run complete, stop.
- **Ready set empty but open `afk` issues remain** (all blocked or claimed) -> **poll with backoff** within the current iteration (whichever agent is executing it): re-read ~every 60s, resume when one becomes ready. Doesn't consume an iteration.
- **Ready set empty and every open issue is `hitl`** -> **exit, don't poll.** Only a human can make one ready. A worker reports `RESULT: hitl-only` and lists them; the orchestrator stops.
- **No open issues remain** -> queue drained -> a worker reports `RESULT: drained`; the orchestrator exits and says so, regardless of iteration count.
- **3-strike CI failure** -> the failing agent halts its iteration (step 5) and the error propagates upward: a worker via `RESULT: halted`, the orchestrator by stopping directly. Nothing further is dispatched.
- **A worker dies without a `RESULT:` line** -> the orchestrator survives, treats it as `halted`, and stops (step 6). Its claim stays paused for the resume below.
- **Usage limits kill the orchestrator mid-issue** -> a paused claim is left (its issue is `in-progress`, so it is out of the ready set and siblings ignore it). Re-invoke `/start-next-issue --iteration <n>/3 --chain <chain_id>` when limits reset -- step 0 matches the claim ref and resumes it, then orchestration continues. **The chain id is what makes the lane recoverable**, which is why step 0 prints it; lose it and the lane needs a human `--reclaim`. A bare `/start-next-issue` is always safe: it starts a fresh budget and takes new work rather than stealing the paused lane.

## Notes
- **Crash-safe by construction:** the claim refs on `origin` ARE the resume state -- no checkpoint file. A kill leaves at most one claimed issue, recovered by step 0.
- **The claim ref is the only ownership record.** `@me` cannot answer "is this mine?" under a shared login, a label cannot be set atomically, and a filesystem lock does not span clones or hosts. Anything that reasons about ownership must read `refs/claims/issue-<n>`.
- **Iteration count is orchestrator state, not repo state:** it lives in the orchestrator's own loop and the `--worker <n>/3` arg it passes down. If the orchestrator dies, the count dies with it -- re-invoke with `--iteration` to resume the old budget, or bare to start a new one, harmless.
- **Errors travel up, never sideways.** A worker never decides the run continues: it works one issue, reports, and ends. Only the orchestrator dispatches, and it stops at the first non-`merged` result.
- **File contention is not a dependency:** if the next ready issue overlaps a just-opened PR's files, fine -- it rebases at its own merge gate.
- **One issue per worktree/branch/PR -- never batch.** The one exception is a drive-by out-of-scope fix (step 4a) riding along under `## Out-of-scope fixes`; you still never deliberately pull another queue issue's slice in.
- **`hitl` is a hard skip, never a judgement call.** The label is the whole test -- don't reason from the body that one "looks autonomous enough", and never relabel it `afk` to unblock yourself. Only a human moves an issue between the two. Sole exception: an explicit pin (step 2a).
- **An unlabelled work issue is not ready.** Neither `afk` nor `hitl` means half-triaged; skip it and name it in the report rather than assuming `afk`.
- This skill only **consumes** the queue. Authoring/edges are `/spec`.
