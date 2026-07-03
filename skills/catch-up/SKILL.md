---
name: catch-up
description: "Daily reviewer for the dependency-aware GitHub Issues queue. Reconstructs the actual product changes shipped in each merged PR, what's still in progress, and what's blocked since the last run; inspects stalled lanes, starts the primary repository's dev server on an available port, and gives UI review hints. Use on a daily cron or on demand: catch me up, what happened yesterday, review progress, daily catch-up, or /catch-up."
---

# Catch Up

A reviewer for the parallel-agent GitHub Issues queue. It reconstructs the work done since it last ran, diagnoses lanes that stalled (usually killed mid-flight by usage limits), starts the primary repository's dev server for review, records everything in `progress/progress.md`, and prints a tight summary so you can review and decide what to resume.

It is the **reporting counterpart** to `/start-next-issue`: that skill *consumes* the queue and owns the resume path; this skill only *observes*. It never reclaims, relabels, comments on, or otherwise mutates GitHub or any lane's git state. The only runtime side effect is starting the requested dev server. All judgment calls are surfaced as recommendations, never actions.

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
  --json number,title,body,mergedAt,closingIssuesReferences --limit 100

# Active + escalated: open lanes
gh issue list --state open --label in-progress --json number,title,assignees,updatedAt --limit 100
gh issue list --state open --label blocked     --json number,title --limit 100
```

For every PR in the exact window, inspect its commits and changed files with `gh pr view <n> --json body,commits,files`. Derive what users or operators can now do from the diff, tests, PR body, and commit messages. Do not treat the PR title or linked issue title as sufficient evidence. Group closely related edits into one concise, concrete bullet per PR. Mention multiple shipped behaviors within that bullet when necessary, but omit issue and PR numbers from the shipped-content list.

Tie merged PRs back to issues via `closingIssuesReferences` (the `Closes #n` linkage). An `in-progress` open issue with no open/merged PR is a **stalled lane** - the focus of step 3.

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

## 4. Resolve and start the primary dev server

Resolve the command in order and cache it in the progress header:
1. **Agent workflow doc** — grep `AGENTS.md` or `CLAUDE.md` (bootstrap symlinks them together) for a declared run command. Authoritative if present.
2. **Project manifest** — infer from `package.json` scripts (`dev`, else `start`), or the obvious equivalent for the stack.
3. **Cached** value in `progress/progress.md`.
4. None of the above: state "dev command unknown - declare it in AGENTS.md/CLAUDE.md" rather than guess.

Unless the user specifies another worktree or target, start the server from the primary repository root returned by `git rev-parse --show-toplevel`, not from a stalled lane. Select an unused localhost port by probing the OS immediately before launch. Adapt the resolved command using the stack's documented port mechanism (for example, a CLI `--port` argument or its supported environment variable); do not assume one universal flag.

Launch it as a durable background process with stdout and stderr redirected to a log under `progress/`, and record its PID. Avoid starting a duplicate if a healthy server for the same root is already running; reuse it and report its URL. Verify startup from real output and, when it serves HTTP, make an HTTP request to the reported URL. If startup fails, inspect the log, try another free port when the failure is a port race, and otherwise report the concrete error. Do not claim the server is running without verification. Leave a successfully started server running after the catch-up completes.

Inspect the merged PRs' changed UI routes, components, labels, and user flows. Provide a short "Where to look" list with exact pages, navigation paths, controls, or visible states that changed. Omit this section when no UI changed; never invent UI impact from backend-only changes.

## 5. Update `progress/progress.md`

Local derived log — **gitignored**, never committed (every fact is reconstructable from GitHub; committing it churns and conflicts across parallel agents). Ensure `progress/` is in `.gitignore`; add it if missing.

**Prepend** a dated section (newest on top); never rewrite history. Keep a machine-readable header so the next run can anchor:

```markdown
# Progress Log
last-run: <now ISO-8601>
dev-cmd: <resolved command>
dev-url: <verified URL or n/a>
dev-pid: <PID or n/a>

## Active lanes (current)
- #42 stalled 3d — PR #43 open, CI red — first seen 2026-06-23
- #51 stalled 1d — 4 files dirty, no commits/PR — first seen 2026-06-25

---
## <now-date> (window: <window-start> → <now>)
### Shipped
- Added bulk selection to the orders table and preserved selections while filtering.
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

**Shipped (N PRs)**
- Added bulk selection to the orders table and preserved selections while filtering.

**In progress (N)**
- #51 <title> — stalled 1d, 4 files dirty, no PR → resumable via /start-next-issue
- #42 <title> — stalled 3d ⚠ PR #43 open, CI red → recommend: manual look, likely re-slice

**Blocked (N) — needs you**
- #38 <title> — abandoned blocker #30

**Dev server**
- Running at `<verified-url>` from `<primary-repo-root>` (PID `<pid>`, log `<log-path>`)

**Where to look**
- Orders -> All orders: use the new selection checkboxes, then filter the table and confirm the selection remains.

Progress log → progress/progress.md
```

Point resumable lanes at `/start-next-issue`; flag escalation candidates (multi-run stalls, CI-dead) for a human decision.

## Running on a cron

This skill is just the body — wire scheduling separately so it stays runnable on demand. One-time setup: register a daily job that, in the target repo, invokes `/catch-up` (Claude Code's scheduler, Codex's equivalent, or system `cron` running the agent non-interactively). Because the window is "since last run," a missed day is automatically absorbed into the next run rather than lost.

## Notes
- **Read-only queue review:** never mutate GitHub or any lane's git state. Local writes are limited to `progress/progress.md`, its dev-server log, and a `.gitignore` line. The dev server is the only process side effect.
- **Provider-agnostic by construction:** lanes are found via `git worktree list` + branch-prefix match, and the dev command via `AGENTS.md`/`CLAUDE.md`, so Claude- and Codex-created lanes are handled identically. Never hardcode a worktree directory.
- Lanes worked on another host have no local worktree — report from GitHub and say so; don't treat absence as "never started."
- **`gh` ≥ 2.94.0** — older `gh` can't return the dependency/state fields; fail loudly.
- Complements `/start-next-issue` (consumes the queue) and `to-issues`/`to-issue` (fill it). This skill only observes.
