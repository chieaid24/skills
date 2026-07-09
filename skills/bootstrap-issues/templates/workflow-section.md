## Parallel agent workflow

Work is a **dependency-aware GitHub Issues queue** (on `origin`), not a `/tasks` folder — issues give atomic claim semantics and state visible across parallel worktrees. Runs locally on **Claude Code or Codex CLI interchangeably**. Requires `gh` ≥ 2.94.0 (for `blockedBy`/`stateReason` JSON).

**Authoring the queue**
- Author the queue with `/spec`: it grills the idea, then routes by scope — a PRD with child slices for large features, or one or a few issues directly for small changes — one issue = one tracer-bullet vertical slice.
- **Dependencies are native GitHub `blocked-by` edges**, and **only model true logical dependencies** ("B needs A's code to exist"), never file contention. When unsure whether B depends on A, *add* the edge — a false edge just costs parallelism; a missing edge sends an agent to build on absent code.
- The human approves the dependency DAG once, up front; after that agents run with no per-issue human beat.

**The ready set** (pure mechanical read — no LLM, recompute freely)
- An issue is **ready** iff: labelled `ready`, labelled `afk` (**not** `hitl`), **unassigned**, and every blocker is closed as `completed`.
- A blocker closed as `not_planned` does **not** unblock — it escalates its dependents to a human.

**Labels**
- **Lifecycle** (claim = assignee): `ready` → `in-progress` → `review` → `blocked`.
- **Autonomy**, exactly one per work issue: `afk` — an agent implements, tests, and merges it unattended (preferred). `hitl` — needs a human in the loop (architectural decision, design review, external dependency).

**`hitl` issues never enter the ready set.** `/start-next-issue` walks past them however unblocked they are, so an autonomous chain never stalls waiting on someone who is away. They wait for a human, who either works the issue directly or relabels it `afk` once the decision it needed is made. `/catch-up` lists them under **Awaiting human** so they don't rot in the queue. Prefer `afk`: reach for `hitl` only when a human's judgement is genuinely on the critical path, not because a slice looks hard.

**File contention is NOT a dependency.** Two issues touching the same file run in parallel; the second PR to land rebases on `<default-branch>` and re-runs CI. Don't serialize on predicted file overlap.

**`/start-next-issue` — the worker loop** (point each agent at this; it self-loops until stopped)
1. Read the ready set (`afk` only); pick the **most-blocking** issue (unblocks the most dependents; tiebreak lowest #).
2. **Claim atomically**: agents share one `gh` account, so the assignee alone can't distinguish two claimers — gate with an atomic local lock (`mkdir "$(git rev-parse --git-common-dir)/claim-locks/<issue#>"`). Winner re-reads inside the lock, assigns self, sets `in-progress`, releases; a loser drops it and takes the next.
3. Branch from fresh `<default-branch>` → `<issue#>-<slug>`. One issue → one worktree → one PR with `Closes #<issue>`.
4. Code it, open the PR, then **babysit CI**: watch the `test` check; on a reproducible failure, fix on the branch, push, re-check. **Max 3 attempts** (flaky re-runs are free). Still red → write the failure into the issue, label `blocked`, and **stop the loop** (don't grab anything else).
5. On green it auto-merges (`gh pr merge <pr> --auto --squash --delete-branch`); prune the worktree, then loop to the next.
- **Empty ready set**: open `afk` issues remain (blocked or claimed) → poll with backoff; queue fully drained, or every open issue is `hitl` → exit and name the waiting `hitl` issues (polling can never clear them).
- **Stopped by usage limits**: leaves a paused `in-progress` claim (out of the ready set, so siblings ignore it) — resume that lane when limits reset.

**Merge gate**: `<default-branch>` is branch-protected — the GitHub Actions `test` check is **required** with no required reviews, so an agent merges its own PR.
