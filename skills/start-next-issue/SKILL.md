---
name: start-next-issue
description: Iteration-capped orchestrator for the dependency-aware GitHub queue -- the main agent grabs the next ready `afk` issue (skipping `hitl` issues, which need a human), drives it to a merged PR, then dispatches a fresh-context worker agent per remaining iteration (up to 3 issues total), each reporting back to the orchestrator before the next starts; any failure propagates upward and stops the run. Runs inside a git repo against that repo's queue, or from a parent folder (e.g. ~/projects) against several repos at once, listed in a `.start-next-issue-repos` file. Optionally accepts an issue number (/start-next-issue 42) or plain-text description (/start-next-issue "fix auth bug") to target a specific issue on the first iteration. Use when the user wants an agent to work a bounded batch of issues from the queue, "work the next few issues", run a capped orchestrated batch, or invokes /start-next-issue.
---

# Start Next Issue

Bounded orchestrator for the dependency-aware GitHub Issues queue. The **main agent** (the orchestrator -- the session the user invoked) works the first ready issue itself, then dispatches one **fresh-context worker agent** per remaining issue and waits for each to report back before starting the next -- **up to 3 issues total**. Control always returns to the orchestrator between issues, and any failure **propagates upward** and halts the whole run.

Requires **`gh` >= 2.94.0** (older `gh` returns no `blockedBy`; the ready set is silently wrong -- fail loudly). Queue conventions live in each repo's CLAUDE.md "Parallel agent workflow" section; this skill executes them.

## Scope -- one repo, or many

Before minting a chain id or reading any queue, decide which queues you are serving:

```bash
git rev-parse --show-toplevel 2>/dev/null
```

- **Succeeds -> single-repo mode.** The cwd's repo is the only queue. Any `.start-next-issue-repos` file is ignored. `<repo>` below is always that one repo, and the repo-scoped command forms collapse to the plain ones.
- **Fails (not a git repo) -> multi-repo mode.** The cwd is a parent folder holding several clones (e.g. `~/projects`). Read `.start-next-issue-repos` from the cwd for the repos to serve.

### The repo list (multi-repo mode)

`./.start-next-issue-repos`, one local clone per line. Blank lines and `#` comments ignored. Line order is the tiebreak order used in step 2.

```
# repos this queue runner serves; paths relative to this file, or absolute
./ledger
./skills
./dashboard
```

- **File missing or empty -> stop.** Print the template above, say which folder you looked in, and ask the user which repos to serve. Never guess by scanning subdirectories.
- **A listed path is not an existing git repo with a GitHub remote -> stop** and name it. This skill never clones; a wrong path is a typo the user must see, not a repo to fetch.
- **A listed repo has no queue labels** (no `ready`/`afk` in `gh -R <owner>/<repo> label list`) -> **skip it, don't fail.** It isn't bootstrapped yet. Name it in the report; `/bootstrap-issues` is the fix.

For each surviving repo, capture `<owner>/<repo>` and `<default-branch>` once, up front, and carry them.

### Addressing -- the rule that makes the rest mode-agnostic

Everything below is written for both modes at once, on one convention: **an issue's identity is (repo, number), and every command and every report carries both halves.**

- **Commands** name their repo with `git -C <repo>` / `gh -R <owner>/<repo>`, never the ambient cwd. In single-repo mode that is redundant but harmless; in multi-repo mode it is the only thing keeping a claim, a push, or a merge in the right repo, since the cwd there is a folder that is not a git repo at all. The two exceptions are stated where they apply: inside a worktree (steps 4-5), where cwd already *is* the repo, and `Closes #<n>` in a PR body, which must stay bare and repo-local to close the issue.
- **Reports** name issues as `<owner>/<repo>#<n>` -- in `RESULT:` lines, in what you tell the user, everywhere. A bare `#42` is ambiguous the moment three repos each have one.

## Arguments

| Invocation | Behaviour |
|---|---|
| `/start-next-issue` | New 3-iteration run at `1/3` -- this agent is the **orchestrator**; normal most-blocking-first selection (steps 1-2), across every served repo |
| `/start-next-issue 42` | New run pinned to an issue for iteration `1/3` only -- skip to step 2a |
| `/start-next-issue ledger#42` | Same, repo-qualified. `<dir>#<n>` or `<owner>/<repo>#<n>` -- **the form to use in multi-repo mode** |
| `/start-next-issue "fix auth bug"` | New run, fuzzy-matched to issue title (across every served repo) for iteration `1/3` only -- skip to step 2a |
| `/start-next-issue --worker <n>/3 --chain <id>` | **Internal**, set by the orchestrator's dispatch (step 6). Work exactly one issue, end with a `RESULT:` line, dispatch nothing. Not user-typed. |
| `/start-next-issue --iteration <n>/3 --chain <id>` | Human resume of a dead run: adopt the chain's paused lane (step 0), finish it as iteration `<n>/3`, then orchestrate the remaining iterations. |
| `/start-next-issue --reclaim ledger#42` | Human-only. Force-release the claim on that issue (a run died and its chain id is lost), then stop. |

Any invocation without `--worker`/`--iteration` starts a **fresh 3-iteration budget** at `1/3`, with this agent as the orchestrator for the whole run. The budget is **3 issues total, drawn from any served repo** -- multi-repo mode widens where work comes from, it does not multiply the run. A pin applies to iteration `1/3` only -- dispatched workers always use normal selection.

`--reclaim` is the sole way to break another chain's claim, and it is **never** something an agent decides for itself. In multi-repo mode it **must** name the repo (`--reclaim ledger#42`); a bare number is ambiguous, so resolve it as step 2a does and ask if it hits more than one repo. Show the claim's `chain`, `host`, and `claimed_at`, confirm with the human that the lane is truly dead, then release and re-open the issue for the queue -- both commands scoped to the owning repo:

```bash
git -C <repo> push -q origin :refs/claims/issue-42
gh -R <owner>/<repo> issue edit 42 --remove-assignee @me --remove-label in-progress --add-label ready
```
Leave the stale worktree and branch for the human. Then stop -- do not go on to grab work.

## Chain identity -- who "you" are

Claims are attributed to a **chain id**, not to the `gh` account: agents share one login, so `@me` names every agent at once and can never answer "is this issue mine?".

Given `--chain <id>` (a step 6 dispatch, or a human resume), use it verbatim. Otherwise mint one, **once**, before step 0:

```bash
echo "chain-$(hostname)-$(date +%s%N)"   # -> e.g. chain-blade-1782604800123456789
```

Then **print it to the user and reuse that exact literal** in every later command of this run. Shell variables do not survive between commands -- each runs in its own process -- so re-running the `echo` mints a *different* chain and orphans your own claims. Treat the id as a constant you carry, not an expression you re-evaluate. It is opaque; only equality matters.

**One chain spans every served repo, and holds at most one claim at a time.** The id names the *run*, not a repo: orchestrator and workers all carry the same one, and a lane is driven to merge -- which releases its claim (step 5) -- before the next issue is claimed. A healthy chain therefore has zero or one live claim across the whole repo list, which is what lets step 0's "adopt what is mine" sweep five repos and still be unambiguous. A chain also never races itself.

## Worktree isolation -- the one hard rule

Other agents share these clones and are working in them **right now**. **Never change the branch of a shared checkout** -- no `git switch`/`git checkout <branch>`/`git switch -c` in place; that yanks the working tree out from under them. Each issue gets its **own `git worktree`**, at `<repo>/.worktrees/<n>-<slug>` -- under the repo whose issue it serves, addressed like everything else -- and all its work (edits, commits, pushes, PR, CI fixes) happens inside that worktree until the PR merges and the worktree is removed. About to switch branches in a primary checkout? Stop and `git worktree add` instead. This rule is absolute everywhere below.

## The loop

### Before the loop -- normalize output style (run every iteration, first)
PRs, issue comments, and CI-fix reasoning must be plain full English, not a compressed "caveman"/brevity style some environments enable globally. Disable it for this session (exact effect of `/caveman off`):
```bash
rm -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.caveman-active"
```
No-op if absent. Run at the **start of every iteration** -- dispatched workers (step 6) are fresh sessions whose `SessionStart` hook re-creates the flag.

### 0. Resume check (run first, and after any restart)
Before grabbing new work, check whether **you** already hold some. **Never use `gh issue list --assignee @me` for this** -- with a shared login it returns every agent's in-progress issue, and adopting one hijacks a live sibling's lane. Ownership is proved by the **claim ref** (step 3), never by the assignee.

Claim refs are **per repo**: `refs/claims/issue-<n>` on that repo's own `origin`. So sweep **every served repo** (in single-repo mode, that is the one repo):

```bash
for repo in <repos>; do
  git -C "$repo" fetch -q origin 'refs/claims/*:refs/claims/*' --prune
  for ref in $(git -C "$repo" for-each-ref --format='%(refname)' refs/claims/); do
    n="${ref##*/issue-}"
    echo "$repo #$n -> $(git -C "$repo" show "$ref:claim" | sed -n 's/^chain=//p')"   # the fields live
  done                                                                                # in the blob, not
done                                                                                  # the commit message
```

Adopt a claim **only** if its `chain` equals your `chain_id`. That is the entire rule.

Every other claim is **another agent's lane**: leave the ref, the labels, the assignee, and the worktree untouched, name it in the report, and continue to step 1. Not yours to take -- however old it looks, and however loudly `@me` insists you are the assignee.

Do **not** try to infer liveness from a recorded pid. Each shell command runs in a fresh, short-lived process, so a pid captured at claim time is already dead moments later; a "reclaim if the pid is gone" rule would have every agent instantly reclaim its own live lane. Age is no better: a healthy lane can sit for an hour on slow CI. **Liveness is not observable here, so the chain id is the only sound answer**, and a genuinely abandoned claim is a human's call (`--reclaim`, below).

On adopting, re-enter steps 4-5 **in that claim's repo**. Its worktree likely still exists: `git -C <repo> worktree list`, then `cd` back in rather than recreating. Otherwise continue to step 1 (or step 2a for a pinned `1/3`).

**If the sweep finds more than one claim carrying your chain id**, a predecessor died between claiming and merging in a way the invariant above forbids. Don't guess and don't drop one. Report all of them, then finish them **one at a time** -- repo-list order, each driven to merge (steps 4-5) and its claim released before the next is touched. Each one consumes an iteration.

### 1. Compute the ready set (mechanical -- no LLM)
Run this **per served repo** and union the results, tagging every candidate with the repo it came from:
```bash
gh -R <owner>/<repo> issue list --state open --json number,title,labels,assignees,blockedBy --limit 100
```
An issue is **ready** iff ALL of: has the `ready` label; has the `afk` label and **not** `hitl`; has **no assignee**; has **no claim ref** (`refs/claims/issue-<n>` absent from that repo's step 0 fetch -- claims are per repo, so check the claim list of the issue's *own* repo); every `blockedBy` issue is closed with `stateReason == completed` (verify with `gh -R <owner>/<repo> issue view <blocker> --json state,stateReason`).

**Dependency edges never cross repos.** `blockedBy` is a GitHub relation within one repo, so each repo's DAG is evaluated on its own. A repo whose queue is entirely blocked simply contributes nothing to the union.

The ready set is a **filter, not a claim** -- it narrows candidates cheaply, and step 3's CAS decides. Two agents computing the same ready set at the same instant is expected and harmless.

**`hitl` means a human gates the issue** -- an architectural call, a design review, an external dependency. Never grab one, however unblocked it looks: an unattended run would stall on someone who is away.

Side-effect of this read: report **ready-set width per repo** and any **zombies** (claim ref present + `in-progress` + no open PR). Width below the number of running agents means the DAG is too deep -- re-slice. Leave zombies alone (usually paused lanes -- do not reclaim; step 0 owns the only reclaim rule). Also name any open `hitl` issue whose blockers are all `completed` -- it is **waiting on a human** -- and any listed repo you skipped for want of queue labels.

### 2. Select -- most-blocking first
Pick the ready issue that unblocks the **most** downstream issues: for each candidate `C`, count open `X` **in `C`'s own repo** where `C in X.blockedBy` (invert the data you already fetched). Highest wins; tiebreak by repo-list order, then lowest issue number.

The count is comparable across repos because it measures the same thing everywhere -- how much work this issue frees -- so one ranking spans the union. A repo earns iterations by having the most-blocking issue, not by its turn coming round.

### 2a. Pinned start (only when an argument was given)
Skip steps 1-2 and resolve the target:

- **Repo-qualified number** (`ledger#42`, `acme/ledger#42`): resolve `<dir>` or `<owner>/<repo>` against the repo list, then `gh -R <owner>/<repo> issue view 42 --json number,title,labels,assignees,blockedBy,state`.
- **Bare number** (`42`): unambiguous in single-repo mode. In multi-repo mode, look it up in **every** served repo -- if exactly one has an open issue `#42`, take it; if several do, **list the matches and ask the user** which they meant. Never silently pick one.
- **Description** (`"fix auth bug"`): fetch the open list of every served repo as in step 1, score each title by similarity (exact substring first, then fuzzy), pick the best across the union. If two tie, list both (repo-qualified) and ask the user.

**Validation (all forms):** issue must be open; free of a claim ref in its own repo (or holding one whose `chain` is yours -- resume); if any blocker is open, warn and ask whether to proceed or pick another -- never silently skip blockers. A claim ref belonging to **another** chain means an agent is on it right now: say so and pick another, even under an explicit pin. On a valid target, proceed to step 3.

**A pinned `hitl` issue is allowed but never silent.** A pin means the user asked for it right now, so the human the exclusion protects is present. Say it is `hitl` and what input it names, ask whether to proceed, then work it with the user in the loop -- surface each decision it flags instead of choosing alone. Dispatched workers (step 6) use normal selection, so the run returns to `afk`-only work.

### 3. Claim atomically -- push a claim ref, then assign

Neither the assignee nor the label can arbitrate a race. Agents share **one `gh` login**, so both claimers read `@me` and both think they won; and `gh issue edit --add-assignee` is *additive* (issues take many assignees) with no conditional/`If-Match` flag, so both calls succeed and neither errors. A local lock can't arbitrate either -- lanes routinely run in separate clones and on separate hosts, where any filesystem lock is a silent no-op.

Let **the git server** arbitrate. Creating a ref that already exists is rejected remotely, so exactly one agent's push survives:

```bash
# 1. Build a UNIQUE claim object, in the issue's own repo. The nonce is load-bearing: two agents
#    pushing the SAME sha short-circuit to "Everything up-to-date" and BOTH exit 0 -- a double
#    claim with no error. `repo`, `host` and `claimed_at` are diagnostics for a human; nothing
#    automated may reason from them (`chain` is the only field with authority).
blob=$(printf 'issue=%s\nrepo=%s\nchain=%s\nhost=%s\nclaimed_at=%s\n' \
         "<n>" "<owner>/<repo>" "$chain_id" "$(hostname)" "$(date -u +%FT%TZ)" \
       | git -C <repo> hash-object -w --stdin)
tree=$(printf '100644 blob %s\tclaim\n' "$blob" | git -C <repo> mktree)
obj=$(git -C <repo> commit-tree "$tree" -m "claim <n> by $chain_id")  # parentless: never a fast-forward
                                                                      # of another claim
# 2. Compare-and-swap against THAT repo's origin. Empty expect (the trailing `:`) means "this ref
#    must not already exist". Enforced by the server, not the client -- a clone that never fetched
#    the ref still loses.
if git -C <repo> push -q --force-with-lease=refs/claims/issue-<n>: origin "$obj":refs/claims/issue-<n> 2>/dev/null; then
  # WON. Re-read GitHub state now that the claim is held (closes the check-to-claim gap):
  gh -R <owner>/<repo> issue view <n> --json assignees,labels,state
  # Still open, unassigned, still labelled `ready`? Then record the claim where humans can see it:
  gh -R <owner>/<repo> issue edit <n> --add-assignee @me
  gh -R <owner>/<repo> issue edit <n> --remove-label ready --add-label in-progress
  # Not still ready (someone closed or relabelled it)? Release and re-select:
  #   git -C <repo> push -q origin :refs/claims/issue-<n>   -- then return to step 1
else
  # LOST -- another agent holds the claim. NEVER delete a claim ref you do not own; that is
  # what broke the old lock. Return to STEP 1 (not step 2): your ready set is now stale --
  # and in multi-repo mode recompute it across ALL served repos, not just this one. The winner
  # may have taken the only ready issue here while a better candidate appeared elsewhere.
fi
```

The claim ref is the **durable, cross-host claim** and the sole ownership record -- the `in-progress` label and assignee are human-visible *reporting*, downstream of it. Hold the ref for the whole lane and delete it at merge (step 5). Don't open a worktree until the CAS push has succeeded.

**Why this holds with many agents across many repos.** Each repo's `origin` arbitrates its own `refs/claims/*` namespace, and that namespace is the whole mutex:

- **Per-repo namespace, so numbers cannot collide.** `refs/claims/issue-42` in `acme/ledger` and in `acme/dashboard` are different refs on different servers. Two agents claiming "42" in different repos both win, correctly -- they are different issues.
- **Same repo, same issue, many agents -> still exactly one winner**, whether they run in one clone, separate clones, separate hosts, or from different multi-repo roots with different repo lists. None of that is visible to the CAS: the server compares the ref, and the loser's push is rejected. Widening the candidate pool changes which issues get raced for, not who wins a race.
- **The `-C`/`-R` flags are the load-bearing part**: they carry the repo half of the claim's identity. A bare `git push` here trusts the cwd, and in multi-repo mode the cwd is not a repo at all.

**Stale claim refs** (crashed agent whose chain id is lost) are reaped only by a human, via `--reclaim`. No agent may decide on its own that another chain's claim has gone stale.

### 4. Work it -- in a dedicated worktree
One issue -> one worktree -> one branch, **inside the issue's own repo**. Cut the branch from that repo's **fresh** `<default-branch>` (does not touch its shared checkout):
```bash
git -C <repo> fetch origin
git -C <repo> worktree add -b <n>-<slug> .worktrees/<n>-<slug> origin/<default-branch>
```
If the worktree already exists (resume, step 0), reuse it -- `git -C <repo> worktree list` for the path. If the *branch* exists but its worktree is gone (a crashed lane you just adopted), `git worktree add` fails with `branch already exists`; re-attach instead of forcing a new branch: `git -C <repo> worktree add .worktrees/<n>-<slug> <n>-<slug>`. Then `cd <repo>/.worktrees/<n>-<slug>` and stay there for the rest of steps 4-5. Inside the worktree the cwd is the address, so plain `git` and `gh` are correct again.

Implement the slice to its acceptance criteria, then **verify it the way that repo prescribes** -- follow the verification rules in **that repo's** `CLAUDE.md`/`AGENTS.md`. Each served repo is its own ground truth for how work is proven there: which flows to drive, which suites to run, what evidence to capture. If the repo names no verification method, fall back to driving the affected flow end-to-end yourself. Only once it is verified: commit, and open the PR:
```bash
gh pr create --head <n>-<slug> --title "<title>" --body "Closes #<n>"
```

### 4a. Own the whole platform, not just your slice
You are an owner of the entire product, not a narrow ticket-closer. While you implement and **validate** your slice (per that repo's `CLAUDE.md`/`AGENTS.md` verification rules -- run the app, exercise the flow end-to-end, read the code you touch and around it), watch for anything broken, regressed, or visibly wrong **anywhere** -- a crash, broken flow, wrong result, mangled/misaligned UI, dead link, failing/flaky test, a lint error you pass through. Assume nobody else will catch it.

**Fix it autonomously in this worktree and ship it in the same PR** -- don't defer, don't leave it for another agent, don't ask first. Keep the `Closes #<n>` line, then add an **`## Out-of-scope fixes`** section listing each drive-by fix (what was broken, where, what changed).

Guardrails:
- **Your assigned issue's acceptance criteria still gate the PR.** Drive-by fixes ride along; never replace or dilute the slice.
- **Keep each fix tight and obviously correct**, not an open-ended refactor. If a problem is too large to fix safely inline (needs its own design, wide blast radius, or risks the merge or the 3-attempt CI budget), **file a new `ready` queue issue** with repro + location instead. Filing is the escape hatch; fixing inline is the default.
- **A drive-by stays inside the repo you are working.** One iteration delivers one PR in one repo. Spot something broken in a *different* served repo and the move is to **file an issue there** (`gh -R <owner>/<other> issue create`) and carry on with your slice.

### 5. Babysit CI -- do NOT fire-and-forget
You are inside the worktree, so `gh` and `git` resolve to the right repo without flags. Watch the required `test` check to completion:
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
  Release the claim ref **last**: while it exists the lane is still yours, so a crash mid-cleanup leaves a claim your own step 0 will re-adopt rather than a free-for-all. Then leave the worktree and remove it from the **owning repo** -- `git -C <repo> worktree remove .worktrees/<n>-<slug>` (`--force` if it refuses; `git -C <repo> branch -D <n>-<slug>` if the local branch lingers). In multi-repo mode, `cd` back to the parent folder, not into the repo. Go to step 5a.
- **Reproducible failure** -> pull logs (`gh run view --log-failed`), fix **in the worktree**, push, re-watch. **Max 3 fix attempts.** A failure that passes on a plain re-run is flaky and doesn't count.
- **Still red after 3** -> comment the failure on the issue (what failed + what you tried), swap labels (`gh issue edit <n> --remove-label in-progress --add-label blocked`), leave it assigned, release the claim (`git push -q origin :refs/claims/issue-<n>`) so a human isn't fighting a dead agent's lock, and **HALT THE RUN.** A worker ends with `RESULT: halted ...` (step 6) so the failure propagates up; the orchestrator -- whether it hit this itself on `1/3` or received `halted` from a worker -- stops without dispatching anything further. This lane waits for a human. Leave the worktree in place for them to inspect. **One repo's dead lane halts the whole run**, other repos included: an unexplained failure is a reason to stop and show a human, not to go shopping for easier work elsewhere.

### 5a. Close the parent PRD if fully delivered
Only after a confirmed merge, and only if the closed issue named a parent PRD in its `## Parent` field (call it `#<P>`). A PRD and its children always live in **one repo** -- the merged issue's own -- so this whole step stays inside it. Scan for siblings still open:
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

  Give the worker **only**: the instruction to run `/start-next-issue --worker <n+1>/3 --chain <chain_id>`, the **absolute path of the folder to run in** (the multi-repo parent, or the repo -- it re-runs the step-0 mode check there and re-reads the repo list itself), and the requirement that the last line of its final message be a `RESULT:` line. Pass **your own** `chain_id` -- the run is one owner across all its iterations, so a worker can resume a lane a dead predecessor left mid-flight. Do **not** pass a repo, an owner, or a default branch: which repo the next issue lives in is the worker's own step-1/2 decision, and pre-naming one would quietly pin it. The worker rediscovers everything else from `gh`; pass it no other context.

**Worker report protocol** -- the last line of the worker's final message, exactly one of:

```
RESULT: merged issue=<owner>/<repo>#<n> pr=<url>            # issue delivered; safe to dispatch the next
RESULT: halted issue=<owner>/<repo>#<n> reason=<one line>   # 3-strike CI failure or otherwise dead lane
RESULT: drained                                             # no open issues remain, in ANY served repo
RESULT: hitl-only                                           # only human-gated issues remain, across all repos
```

One grammar in both modes: `issue=` is always addressed (`acme/ledger#42`). `drained` and `hitl-only` describe the **union** of every served repo -- one quiet repo is not a drained queue.

**Acting on the result -- errors propagate upward, always:**
- `merged` -> record it, then loop: dispatch `<n+2>/3` or stop after `3/3`.
- `halted` -> **stop the run now.** Surface the worker's reason, the issue number, and the claim state to the user. Never dispatch past a failure.
- `drained` / `hitl-only` -> stop and report (list the waiting `hitl` issues if the worker named them).
- **Anything else** -- no `RESULT:` line, a spawn error, a worker that died mid-issue -- treat it as `halted`: stop, report your `chain_id` and what you observed, and point the human at `--iteration <n>/3 --chain <chain_id>` (resume) or `--reclaim` (break the claim). Never re-dispatch the same iteration -- the dead worker may hold a half-finished claim -- and never dispatch the next one on an ambiguous result.

## Stopping

Every condition below is evaluated over the **union of all served repos**. In multi-repo mode you are not done because one repo went quiet -- you are done when the *whole list* is.

- **Iteration `3/3` merged** -> run complete, stop. (3 issues total, from any mix of repos.)
- **Ready set empty but open `afk` issues remain anywhere** (all blocked or claimed) -> **poll with backoff** within the current iteration (whichever agent is executing it): re-read **every served repo** ~every 60s, resume when one becomes ready. Doesn't consume an iteration.
- **Ready set empty and every open issue in every repo is `hitl`** -> **exit, don't poll.** Only a human can make one ready. A worker reports `RESULT: hitl-only` and lists them, repo-qualified; the orchestrator stops.
- **No open issues remain in any served repo** -> queue drained -> a worker reports `RESULT: drained`; the orchestrator exits and says so, regardless of iteration count.
- **3-strike CI failure** -> the failing agent halts its iteration (step 5) and the error propagates upward: a worker via `RESULT: halted`, the orchestrator by stopping directly. Nothing further is dispatched.
- **A worker dies without a `RESULT:` line** -> the orchestrator survives, treats it as `halted`, and stops (step 6). Its claim stays paused for the resume below.
- **Usage limits kill the orchestrator mid-issue** -> a paused claim is left (its issue is `in-progress`, so it is out of the ready set and siblings ignore it). Re-invoke `/start-next-issue --iteration <n>/3 --chain <chain_id>` when limits reset -- step 0 matches the claim ref and resumes it, then orchestration continues. **The chain id is what makes the lane recoverable**, which is why step 0 prints it; lose it and the lane needs a human `--reclaim`. A bare `/start-next-issue` is always safe: it starts a fresh budget and takes new work rather than stealing the paused lane.

## Notes
- **The claim ref is the only ownership record, and the only resume state.** `@me` cannot answer "is this mine?" under a shared login, a label cannot be set atomically, and a filesystem lock does not span clones or hosts -- so anything reasoning about ownership reads `refs/claims/issue-<n>` **on the issue's own repo**. Because those refs live on each `origin` there is no checkpoint file, and multi-repo needs none either: the repo list says where to look, and a kill leaves at most one claimed issue anywhere, recovered by step 0.
- **Iteration count is orchestrator state, not repo state:** it lives in the orchestrator's own loop and the `--worker <n>/3` arg it passes down. If the orchestrator dies, the count dies with it -- re-invoke with `--iteration` to resume the old budget, or bare to start a new one, harmless. Nothing about it is per-repo.
- **The repo list is a lens, not a lock.** Two runs with different or overlapping lists are fine, on one host or many: they may race for the same issue, and step 3's CAS settles it. Adding a repo to a list needs no coordination with a running agent.
- **File contention is not a dependency:** if the next ready issue overlaps a just-opened PR's files, fine -- it rebases at its own merge gate. Across repos there is no contention to have.
- **One issue per worktree/branch/PR -- never batch.** The one exception is a drive-by out-of-scope fix (step 4a) riding along under `## Out-of-scope fixes`; you still never deliberately pull another queue issue's slice in.
- **`hitl` is a hard skip, never a judgement call.** The label is the whole test -- don't reason from the body that one "looks autonomous enough", and never relabel it `afk` to unblock yourself. Only a human moves an issue between the two. Sole exception: an explicit pin (step 2a).
- **An unlabelled work issue is not ready.** Neither `afk` nor `hitl` means half-triaged; skip it and name it in the report rather than assuming `afk`.
- This skill only **consumes** the queue. Authoring/edges are `/spec`.
