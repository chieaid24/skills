---
name: catch-up
description: Daily reviewer for the dependency-aware GitHub Issues queue. Reconstructs what shipped, what's still in progress, and what's blocked since the last run; inspects each stalled in-progress lane's worktree read-only to diagnose where it died; logs to progress/progress.md and prints a concise summary with per-lane dev-server commands. Use on a daily cron or on demand — "catch me up", "what happened yesterday", "review progress", "daily catch-up", or /catch-up.
---

# Catch Up

A **read-only reviewer** for the parallel-agent GitHub Issues queue. It reconstructs the work done since it last ran, diagnoses lanes that stalled (usually killed mid-flight by usage limits), records everything in `progress/progress.md`, and prints a tight summary so you can review and decide what to resume.

It is the **reporting counterpart** to `/start-next-issue`: that skill *consumes* the queue and owns the resume path; this skill only *observes*. It never reclaims, relabels, comments on, or otherwise mutates GitHub or any lane's git state — doing so would corrupt the ready-set and the resume path `/start-next-issue` depends on (its rule for stalled `in-progress` lanes is *"leave them, do not reclaim"*). All judgment calls are surfaced to you as recommendations, never actions.

Runs against the **current repo**, cron-invoked or by hand. Re-running the same day is safe — the window is "since last run," so a second run just reports a near-empty window.

Requires **`gh` ≥ 2.94.0** (reads `blockedBy`/`stateReason`). Provider-agnostic: works identically whether the lanes were created by Claude Code or Codex CLI — worktrees are discovered via `git worktree list`, never a hardcoded path.

## Preconditions

Stop with a clear message if any fail:
- Inside a git repo with a GitHub `origin` (`git remote get-url origin`).
- `gh` authenticated (`gh auth status`) and **`gh` ≥ 2.94.0** (`gh --version`).
- Capture `<owner>/<repo>` and the default branch:
  ```bash
  gh repo view --json nameWithOwner,defaultBranchRef --jq '{repo:.nameWithOwner, branch:.defaultBranchRef.name}'
  ```

## 1. Resolve the window

The window is **last-run → now**.
- Read `last-run:` from the top of `progress/progress.md`.
- If the file or the field is missing (first-ever run), fall back to **now − 24h**.
- Capture `now` as an ISO-8601 timestamp; this becomes the next run's `last-run`.

The window is variable — every header and the progress entry must state the **actual** range, never the word "yesterday".

## 2. Gather the work (GitHub — read only)

Three reads, all bounded by the window where the API allows it:

```bash
# Shipped: issues closed as completed in the window
gh issue list --state closed --search "closed:>=<window-date>" \
  --json number,title,closedAt,stateReason --limit 100
# (keep only stateReason == "completed" AND closedAt >= window)

# Shipped (concrete): PRs merged in the window, with the issues they closed
gh pr list --state merged --search "merged:>=<window-date>" \
  --json number,title,mergedAt,closingIssuesReferences --limit 100

# Active + escalated: open lanes
gh issue list --state open --label in-progress --json number,title,assignees,updatedAt --limit 100
gh issue list --state open --label blocked     --json number,title --limit 100
```

Tie merged PRs back to issues via `closingIssuesReferences` (the `Closes #n` linkage). An `in-progress` open issue with no open/merged PR is a **stalled lane** — the focus of step 3.

## 3. Diagnose each in-progress lane (worktree — read only, provider-agnostic)

For every open `in-progress` issue `#n`, map it to its worktree and inspect **in place**. Never `switch`, `stash`, `commit`, or `checkout` inside a lane — leave it exactly as the stalled agent left it.

**Map issue → worktree by branch, not path** (Claude and Codex put worktrees in different places):
```bash
git worktree list --porcelain        # branch lines look like: branch refs/heads/<n>-<slug>
```
Match the worktree whose branch name starts with `<n>-`. If none exists locally, the lane was worked on another host (or its worktree was pruned) — report from the PR/issue only and note "no local worktree."

When a worktree is found, read (all non-mutating):
```bash
git -C <wt> status --porcelain                                   # dirty? how many files
git -C <wt> log -1 --format='%h %s (%cr)'                        # last commit + age
git -C <wt> rev-list --left-right --count origin/<branch-base>...HEAD   # behind/ahead
gh pr list --head <branch> --state all --json number,state,isDraft,statusCheckRollup
```

Synthesize a one-line **diagnosis** — where the lane died and what a resume picks up:
| Signals | Diagnosis |
|---|---|
| dirty files, 0 commits ahead, no PR | died mid-implementation — uncommitted work |
| commits ahead, no PR | work committed, PR never opened |
| PR open, CI red | died in CI babysit — failing check |
| PR open, CI green, unmerged | awaiting merge / auto-merge pending |
| clean, 0 ahead, no PR | claimed but never started |

**Stall age** = age of the lane: oldest of (last-commit age, first time this lane appeared in `progress/progress.md`'s active block). A lane stalled across multiple runs is an **escalation candidate** — surface it.

## 4. Resolve the dev-server command

So the summary can tell you how to review the work. Resolve in order, cache the result in the progress header:
1. **Agent workflow doc** — grep `AGENTS.md` or `CLAUDE.md` (bootstrap symlinks them together) for a declared run command. Authoritative if present.
2. **Project manifest** — infer from `package.json` scripts (`dev`, else `start`), or the obvious equivalent for the stack.
3. **Cached** value in `progress/progress.md`.
4. None of the above → state "dev command unknown — declare it in AGENTS.md/CLAUDE.md" rather than guess.

Stalled lanes live in **separate worktrees**, so each gets its own review command using the real path from `git worktree list`: `cd <worktree-path> && <dev-cmd>`. Merged/completed work reviews from the repo root.

## 5. Update `progress/progress.md`

Local derived log — **gitignored**, never committed (every fact is reconstructable from GitHub; committing it churns and conflicts across parallel agents). Ensure `progress/` is in `.gitignore`; add it if missing.

**Prepend** a dated section (newest on top); never rewrite history. Keep a machine-readable header so the next run can anchor:

```markdown
# Progress Log
last-run: <now ISO-8601>
dev-cmd: <resolved command>

## Active lanes (current)
- #42 stalled 3d — PR #43 open, CI red — first seen 2026-06-23
- #51 stalled 1d — 4 files dirty, no commits/PR — first seen 2026-06-25

---
## <now-date> (window: <window-start> → <now>)
### Shipped
- #40 <title> — PR #44
### In progress
- #51 <title> — died mid-implementation, 4 files dirty
### Blocked
- #38 <title> — abandoned blocker #30
```

Carry a lane's **first-seen** date forward across runs (read it from the previous Active block) so stall age survives.

## 6. Print the summary

Concise, sectioned, empty sections collapsed to a one-liner or omitted. Recommendations appear **only** where action is warranted (step's read-only invariant — you decide):

```markdown
## Catch-up — window: <window-start> → <now>

**Shipped (N)**
- #40 <title> — PR #44 ✓

**In progress (N)**
- #51 <title> — stalled 1d, 4 files dirty, no PR → resumable via /start-next-issue
- #42 <title> — stalled 3d ⚠ PR #43 open, CI red → recommend: manual look, likely re-slice

**Blocked (N) — needs you**
- #38 <title> — abandoned blocker #30

**Review the work**
- Merged → `<dev-cmd>` (repo root)
- #51 → `cd <worktree-path> && <dev-cmd>`
- #42 → `cd <worktree-path> && <dev-cmd>`

Progress log → progress/progress.md
```

Point resumable lanes at `/start-next-issue`; flag escalation candidates (multi-run stalls, CI-dead) for a human decision.

## Running on a cron

This skill is just the body — wire scheduling separately so it stays runnable on demand. One-time setup: register a daily job that, in the target repo, invokes `/catch-up` (Claude Code's scheduler, Codex's equivalent, or system `cron` running the agent non-interactively). Because the window is "since last run," a missed day is automatically absorbed into the next run rather than lost.

## Notes
- **Pure read** against GitHub and against every lane's git state. The only writes are `progress/progress.md` and a `.gitignore` line. If you ever feel tempted to relabel a zombie, don't — surface it instead.
- **Provider-agnostic by construction:** lanes are found via `git worktree list` + branch-prefix match, and the dev command via `AGENTS.md`/`CLAUDE.md`, so Claude- and Codex-created lanes are handled identically. Never hardcode a worktree directory.
- Lanes worked on another host have no local worktree — report from GitHub and say so; don't treat absence as "never started."
- **`gh` ≥ 2.94.0** — older `gh` can't return the dependency/state fields; fail loudly.
- Complements `/start-next-issue` (consumes the queue) and `to-issues`/`to-issue` (fill it). This skill only observes.
