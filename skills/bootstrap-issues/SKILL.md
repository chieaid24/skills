---
name: bootstrap-issues
description: Bootstrap a repo for parallel autonomous agents coordinated via a dependency-aware GitHub Issues queue — creates work-queue labels (lifecycle plus afk/hitl autonomy), a CI test gate, branch protection with self-merge, an agent issue template, a committed DESIGN.md design system for frontend repos, and the AGENTS.md/CLAUDE.md workflow docs. Use when the user wants to set up the parallel-agent / GitHub Issues flow in a repo, "bootstrap issues", port the agent workflow to a new repo, or invokes /bootstrap-issues.
---

# Bootstrap Issues

Bootstraps the parallel-agent + GitHub Issues workflow in the current repo so several agents (Claude Code or Codex CLI, interchangeably) can each grab an issue, work in an isolated worktree, and self-merge through a CI gate. Work is ordered by native GitHub `blocked-by` dependencies; agents consume the queue with `/start-next-issue` and add to it with `/spec`.

This skill makes **outward-facing changes to a GitHub repo** (creates labels, sets branch protection, enables auto-merge). Always present the plan and get explicit confirmation before applying them — see step 3.

## Preconditions

Check these first; stop with a clear message if any fail:
- Inside a git repo with a GitHub `origin` (`git remote get-url origin`).
- `gh` is authenticated (`gh auth status`).
- **`gh` ≥ 2.94.0** — the dependency-aware queue reads `blockedBy`/`stateReason` JSON fields that older `gh` cannot return, so `/start-next-issue` would silently compute the wrong ready set. Check `gh --version` and tell the user to upgrade if older.
- **`git` ≥ 2.13** — the claim CAS uses `--force-with-lease=<ref>:` with an empty expect ("ref must not exist"). Older `git` ignores the empty form, and two agents can claim the same issue. Check `git --version`.
- Capture `<owner>/<repo>` and the default branch:
  ```bash
  gh repo view --json nameWithOwner,defaultBranchRef --jq '{repo: .nameWithOwner, branch: .defaultBranchRef.name}'
  ```

## 1. Detect the stack

Choose the CI template from what's at the repo root (or the obvious project subdir):

| Marker file | Template | Test command |
|---|---|---|
| `package.json` | `templates/ci-node.yml` | `npm test` |
| `pyproject.toml` / `requirements.txt` | `templates/ci-python.yml` | `pytest` |
| `Cargo.toml` | `templates/ci-rust.yml` | `cargo test` |
| `go.mod` | `templates/ci-go.yml` | `go test ./...` |

If the test command or project dir is ambiguous (monorepo, tests in a subdir like `backend/`), ask the user. Every template names its job `test`, so the required status check is always `test` regardless of stack.

**Also detect frontend UI.** The repo has a frontend if any of these hold: a `package.json` depending on a UI framework (`react`, `vue`, `svelte`, `solid-js`, `@angular/core`, `next`, `nuxt`, `astro`, `remix`), or committed `*.html` / `*.css` / `*.jsx` / `*.tsx` / `*.svelte` / `*.vue` files, or a `public/` / `src/components` tree. If markers are absent but the stack could host UI (a Node app), ask whether a frontend is planned. A backend-only Go/Rust/Python service, CLI, or library has no frontend — this gates step 2.

## 2. Design system interview (frontend UI repos only)

If step 1 found no frontend and none is planned, **skip this step** and note it skipped. Otherwise the repo gets a committed `DESIGN.md` that binds every future UI change, so grill the user on the design system **now**, before the plan confirmation. This is a conversation only — no mutations yet.

- **If `/impeccable` is installed**, run `/impeccable teach`. It grills more thoroughly and writes `PRODUCT.md` + `DESIGN.md` (the same files it later consumes from the repo root). Then skip the bundled interview.
- **Otherwise**, run the bundled interview in `templates/design-interview.md` — a one-decision-at-a-time grill distilled from impeccable's shared design laws: register (brand vs product), color **strategy** in OKLCH, the theme **scene sentence**, a type scale (ratio ≥1.25), spacing rhythm, motion (ease-out exponential, no bounce), the **absolute bans**, and the AI-slop **reflex test**. Push back on category-reflex answers ("fintech → navy + gold") until the system isn't guessable from the domain.

Hold the resolved decisions. `DESIGN.md` is written from `templates/design-md.md` during Apply (step 4) and committed with the shareable files — it is **not** gitignored like `CLAUDE.md`/`AGENTS.md`, because every agent must share it.

## 3. Build the plan — present, then wait for confirmation

Summarize exactly what will change, then ask the user to confirm before applying anything outward-facing:
- **Files:** `.github/workflows/ci.yml` (chosen template), `.github/ISSUE_TEMPLATE/task.md`. **Frontend repos also:** `DESIGN.md` (committed) from the step-2 interview.
- **Labels:** lifecycle — `ready`, `in-progress`, `review`, `blocked`; autonomy — `afk`, `hitl`; `prd` for parent specs.
- **Docs:** ensure `CLAUDE.md` exists; gitignore `CLAUDE.md` + `AGENTS.md`; symlink `AGENTS.md → CLAUDE.md`; append the **Parallel agent workflow** section (plus the **Frontend / UI work** clause for frontend repos).
- **Pre-commit hooks:** via the `setup-pre-commit` skill — a stack-aware hook (format → lint → test) that runs before every local commit, mirroring the CI `test` gate. Committed so every agent shares it.
- **GitHub config:** branch protection on `<default-branch>` requiring the `test` check, **no required reviews** (so an agent merges its own PR); enable auto-merge + delete-branch-on-merge.

## 4. Apply (after confirmation)

**Order matters:** land the workflow on the default branch BEFORE enabling branch protection, or other branches deadlock on a `test` check that never runs.

1. **Workflow + issue template.** Copy the chosen `templates/ci-<stack>.yml` → `.github/workflows/ci.yml`; set the `push:` branch to `<default-branch>`, add `working-directory` if the project lives in a subdir, and make the test run once (non-watch — e.g. vitest needs `-- --run`; pytest/cargo/go already exit). Copy `templates/issue-task.md` → `.github/ISSUE_TEMPLATE/task.md`.

2. **Docs pattern.** If `CLAUDE.md` is missing, create a minimal one (title + one-line overview). Add `CLAUDE.md`, `AGENTS.md`, and `.worktrees/` to `.gitignore` (under a `# Claude Code` / `# Codex` heading; skip lines already present) — without the `.worktrees/` line every agent sees every *other* agent's lane as untracked files, which pollutes `git status` and invites a stray `git add -A` into a PR. Symlink: `ln -s CLAUDE.md AGENTS.md` (skip if it exists). Append `templates/workflow-section.md` to `CLAUDE.md`, replacing every `<default-branch>` with the real branch name. **Frontend repos:** also append `templates/workflow-frontend.md`, and — unless `/impeccable teach` already wrote it in step 2 — write the resolved design decisions to `DESIGN.md` at the repo root using `templates/design-md.md`.

3. **Pre-commit hooks.** Invoke the **`setup-pre-commit`** skill for the same stack detected in step 1. It installs a format → lint → test pre-commit hook (Husky for JS/TS, the `pre-commit` framework for Python, a tracked `.githooks/` script for Rust/Go), verifies it, **commits its own files**, and records the per-clone activation command in the docs (Husky needs none; Python `pre-commit install`; Rust/Go `git config core.hooksPath .githooks`). Keep the hook's test command consistent with the CI workflow's so the local gate mirrors the `test` check. If the repo has no test/lint tooling, the skill omits those steps and says so.

4. **Labels — inline, never a committed script:**
   ```bash
   # Lifecycle
   gh label create ready       --color 0E8A16 --description "Refined and queued; grabbable once its blockers are completed" --force
   gh label create in-progress --color FBCA04 --description "Claimed (assignee) and being worked"                           --force
   gh label create review      --color 1D76DB --description "PR open, awaiting review/merge"                                --force
   gh label create blocked     --color B60205 --description "Escalated to a human (abandoned blocker, or CI failed 3x)"     --force
   # Autonomy — exactly one per work issue
   gh label create afk         --color C2E0C6 --description "Fully autonomous: an agent implements, tests, and merges it"   --force
   gh label create hitl        --color D93F0B --description "Human in the loop required; the autonomous worker skips it"    --force
   # Parent spec — carries neither autonomy label
   gh label create prd         --color 5319E7 --description "Product requirements document; parent of work slice issues"    --force
   ```

5. **Commit + land the workflow.** Stage the shareable files (`.github/`, plus `DESIGN.md` for a frontend repo), commit (`chore: add agentic-issues CI + issue template`), and push so `ci.yml` reaches `<default-branch>` (direct push as owner, or open + merge a bootstrap PR — the PR carries the workflow so its own `test` check can run). The pre-commit hook files (step 3) were already committed by that skill; `CLAUDE.md`/`AGENTS.md` are gitignored and stay local, but `DESIGN.md` is committed so every agent shares it.

6. **Branch protection + auto-merge.** Probe the Administration scope by enabling auto-merge:
   ```bash
   gh api -X PATCH repos/<owner>/<repo> -F allow_auto_merge=true -F delete_branch_on_merge=true -F allow_squash_merge=true
   ```
   - **403** → the PAT lacks **Administration: write**. Skip protection, warn the user, and print the manual UI steps (Settings → Branches: require the `test` status check, 0 required reviews; Settings → General → Pull Requests: allow auto-merge + auto-delete branches).
   - **Success** → set protection. Write the body to a temp file in `$TMPDIR`, apply, then delete it:
     ```bash
     printf '%s' '{"required_status_checks":{"strict":false,"contexts":["test"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}' > "$TMPDIR/ai-prot.json"
     gh api -X PUT repos/<owner>/<repo>/branches/<default-branch>/protection --input "$TMPDIR/ai-prot.json"
     rm -f "$TMPDIR/ai-prot.json"
     ```

## 5. Clean up

Remove every one-shot artifact created during bootstrap — the temp protection JSON and any scratch files. **Never leave a `setup-labels.sh` or similar in the repo.** Confirm `.github/` contains only `workflows/ci.yml` and `ISSUE_TEMPLATE/task.md`.

## 6. Report

State what changed, anything skipped (e.g. branch protection when the scope was missing + the manual steps; the design interview for a backend-only repo), whether a `DESIGN.md` was written, the pre-commit hook installed and its per-clone activation command (if any), and how the queue runs from here:

- **Fill the queue:** `/spec` — grill the idea → update docs → route by scope: publish a PRD with child slices for large features, or go straight to one or a few issues for small changes. Both reconcile against the open graph and label each issue `afk` or `hitl`.
- **Work the queue:** point each agent at `/start-next-issue` — it self-loops, grabbing the most-blocking ready **`afk`** issue, working it to a green-CI merge, then taking the next. `hitl` issues wait for you.
- **Review the queue:** `/catch-up` — reports what shipped, which lanes stalled, and which `hitl` issues are sitting on a human decision.

## Notes

- The job name `test` is the required-check context across every stack — keep it `test`.
- **Idempotent:** re-running skips existing labels (`--force` upserts), an existing `AGENTS.md` symlink, `.gitignore` lines already present, an existing `DESIGN.md` (don't overwrite a design system already in the repo — offer to re-run the interview instead), and (via `setup-pre-commit`) any pre-commit config files that already exist.
- **`DESIGN.md` is the binding design system.** Committed and shared (not gitignored), auto-loaded by `/impeccable` from the repo root, and every future frontend agent must conform to it — the appended **Frontend / UI work** docs point UI work at it.
- **`.github/ISSUE_TEMPLATE/task.md` is the per-repo source of truth for issue shape.** `/spec` reads it when filing issues (stripping frontmatter + comments, then applying labels as flags), so agent-filed and human-filed (web UI) issues come out identically shaped. Keep repo-specific gates — the `DESIGN.md` conformance line, branch-naming — in this template, **not** duplicated inside `/spec`; `templates/issue-task.md` here is only the seed, and the repo copy is expected to diverge with those specifics.
- **GitHub-only** (uses `gh`). For repos hosted elsewhere, only the docs + templates apply.
- Owner direct-pushes to the protected branch bypass the check (`enforce_admins=false`); agents go through PRs and hit the gate.
- **`afk`/`hitl` gate autonomy; `ready` gates refinement.** Orthogonal: a fully specified `hitl` issue is still `ready`. `/start-next-issue` requires `ready` **and** `afk`, so `hitl` never enters the ready set — a human works it, or relabels it `afk` once its decision is settled. Autonomy is a label rather than a body field (it replaced a `## Type` section) because the ready set is a mechanical read that can't parse prose.
- The dependency queue (`blocked-by` edges, the `ready`/`completed` rule, the autonomy labels, the `refs/claims/*` claim CAS) is described in `templates/workflow-section.md` and consumed by `/start-next-issue`. Keep all four skills (`bootstrap-issues`, `/spec`, `/start-next-issue`, `/catch-up`) in agreement on those conventions.
