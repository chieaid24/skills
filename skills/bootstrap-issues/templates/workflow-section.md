## Parallel agent workflow

Work is a **dependency-aware GitHub Issues queue** (on `origin`), not a `/tasks` folder — one shared queue whose state is visible across parallel worktrees, clones, and hosts. Issues themselves offer **no** atomic claim (labels and assignees are non-atomic adds); claims are arbitrated by a compare-and-swap ref push, see step 2 below. Runs locally on **Claude Code or Codex CLI interchangeably**. Requires `gh` ≥ 2.94.0 (for `blockedBy`/`stateReason` JSON) and `git` ≥ 2.13 (for `--force-with-lease` with an empty expect).

**Authoring the queue**
- Author the queue with `/spec`: it grills the idea, then routes by scope — a PRD with child slices for large features, or one or a few issues directly for small changes — one issue = one tracer-bullet vertical slice.
- **Dependencies are native GitHub `blocked-by` edges**, and **only model true logical dependencies** ("B needs A's code to exist"), never file contention. When unsure whether B depends on A, *add* the edge — a false edge just costs parallelism; a missing edge sends an agent to build on absent code.
- The human approves the dependency DAG once, up front; after that agents run with no per-issue human beat.

**The ready set** (pure mechanical read — no LLM, recompute freely)
- An issue is **ready** iff: labelled `ready`, labelled `afk` (**not** `hitl`), **unassigned**, **unclaimed** (no `refs/claims/issue-<n>` on `origin`), and every blocker is closed as `completed`.
- A blocker closed as `not_planned` does **not** unblock — it escalates its dependents to a human.
- The ready set is a *filter*, not a claim. Two agents may compute the same one; the claim CAS below decides.

**Labels**
- **Lifecycle** (labels *report* the claim; `refs/claims/issue-<n>` *is* the claim): `ready` → `in-progress` → `review` → `blocked`.
- **Autonomy**, exactly one per work issue: `afk` — an agent implements, tests, and merges it unattended (**prefer this**). `hitl` — a human's judgement genuinely gates it (architectural decision, design review, external dependency), not merely a hard-looking slice.

**`hitl` never enters the ready set.** `/start-next-issue` walks past it however unblocked it looks, so an unattended chain never stalls on an absent human. A human works it, or relabels it `afk` once the decision is settled; `/catch-up` lists them under **Awaiting human** so they don't rot.

**File contention is NOT a dependency.** Two issues touching the same file run in parallel; the second PR to land rebases on `<default-branch>` and re-runs CI. Don't serialize on predicted file overlap.

**`/start-next-issue` — the worker loop** (point each agent at this; it self-loops until stopped)
1. Read the ready set (`afk` only); pick the **most-blocking** issue (unblocks the most dependents; tiebreak lowest #).
2. **Claim atomically, on the server.** Agents share one `gh` account, so `@me` names them all; `--add-assignee` is additive with no conditional flag, so both claimers succeed; and a filesystem lock spans neither clones nor hosts. So the claim is a **compare-and-swap ref push** — build a unique parentless commit carrying the agent's `chain` id, then `git push --force-with-lease=refs/claims/issue-<n>: origin <obj>:refs/claims/issue-<n>`. The empty expect means "must not already exist" and is enforced by the remote, so exactly one agent wins; the loser re-reads the ready set and takes the next. Winner re-checks the issue, assigns self, sets `in-progress`. A claim is yours iff its `chain` matches yours — **never delete a claim ref you don't own**, and never infer that someone else's lane died (pids and timestamps can't prove it; only a human can, via `/start-next-issue --reclaim <n>`).
3. Branch from fresh `<default-branch>` → `<issue#>-<slug>`. One issue → one worktree → one PR with `Closes #<issue>`.
4. Code it, open the PR, then **babysit CI**: watch the `test` check; on a reproducible failure, fix on the branch, push, re-check. **Max 3 attempts** (flaky re-runs are free). Still red → write the failure into the issue, label `blocked`, release the claim ref, and **stop the loop** (don't grab anything else).
5. On green, merge explicitly — `gh pr merge <pr> --squash --delete-branch` — and confirm the PR reads `MERGED`. Never `--auto`: queuing auto-merge and walking away is how a lane silently never lands. Then drop `in-progress`, release the claim (`git push origin :refs/claims/issue-<n>`), prune the worktree, and loop to the next.
- **Empty ready set**: open `afk` issues remain (blocked or claimed) → poll with backoff; queue fully drained, or every open issue is `hitl` → exit and name the waiting `hitl` issues (polling can never clear them).
- **Stopped by usage limits**: leaves a paused claim ref (its issue is `in-progress`, so it's out of the ready set and siblings ignore it) — resume that lane when limits reset, passing the same `--chain <id>`. Only the owning chain may resume it; a lost chain id needs a human `--reclaim`.

**Merge gate**: `<default-branch>` is branch-protected — the GitHub Actions `test` check is **required** with no required reviews, so an agent merges its own PR.
