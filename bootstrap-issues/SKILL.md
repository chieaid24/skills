---
name: bootstrap-issues
description: Bootstrap a repo for parallel autonomous agents coordinated via a dependency-aware GitHub Issues queue — creates work-queue labels, a CI test gate, branch protection with self-merge, an agent issue template, and the AGENTS.md/CLAUDE.md workflow docs. Use when the user wants to set up the parallel-agent / GitHub Issues flow in a repo, "bootstrap issues", port the agent workflow to a new repo, or invokes /bootstrap-issues.
---

# Bootstrap Issues

Bootstraps the parallel-agent + GitHub Issues workflow in the current repo so several agents (Claude Code or Codex CLI, interchangeably) can each grab an issue, work in an isolated worktree, and self-merge through a CI gate. Work is ordered by native GitHub `blocked-by` dependencies; agents consume the queue with `/start-next-issue` and add to it with `to-issues` / `/to-issue`.

This skill makes **outward-facing changes to a GitHub repo** (creates labels, sets branch protection, enables auto-merge). Always present the plan and get explicit confirmation before applying them — see step 2.

## Preconditions

Check these first; stop with a clear message if any fail:
- Inside a git repo with a GitHub `origin` (`git remote get-url origin`).
- `gh` is authenticated (`gh auth status`).
- **`gh` ≥ 2.94.0** — the dependency-aware queue reads `blockedBy`/`stateReason` JSON fields that older `gh` cannot return, so `/start-next-issue` would silently compute the wrong ready set. Check `gh --version` and tell the user to upgrade if older.
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

## 2. Build the plan — present, then wait for confirmation

Summarize exactly what will change, then ask the user to confirm before applying anything outward-facing:
- **Files:** `.github/workflows/ci.yml` (chosen template), `.github/ISSUE_TEMPLATE/task.md`.
- **Labels:** `ready`, `in-progress`, `review`, `blocked`.
- **Docs:** ensure `CLAUDE.md` exists; gitignore `CLAUDE.md` + `AGENTS.md`; symlink `AGENTS.md → CLAUDE.md`; append the **Parallel agent workflow** section.
- **Pre-commit hooks:** via the `setup-pre-commit` skill — a stack-aware hook (format → lint → test) that runs before every local commit, mirroring the CI `test` gate. Committed so every agent shares it.
- **GitHub config:** branch protection on `<default-branch>` requiring the `test` check, **no required reviews** (so an agent merges its own PR); enable auto-merge + delete-branch-on-merge.

## 3. Apply (after confirmation)

**Order matters:** land the workflow on the default branch BEFORE enabling branch protection, or other branches deadlock on a `test` check that never runs.

1. **Workflow + issue template.** Copy the chosen `templates/ci-<stack>.yml` → `.github/workflows/ci.yml`; set the `push:` branch to `<default-branch>`, add `working-directory` if the project lives in a subdir, and make the test run once (non-watch — e.g. vitest needs `-- --run`; pytest/cargo/go already exit). Copy `templates/issue-task.md` → `.github/ISSUE_TEMPLATE/task.md`.

2. **Docs pattern.** If `CLAUDE.md` is missing, create a minimal one (title + one-line overview). Add `CLAUDE.md` and `AGENTS.md` to `.gitignore` (under a `# Claude Code` / `# Codex` heading; skip lines already present). Symlink: `ln -s CLAUDE.md AGENTS.md` (skip if it exists). Append `templates/workflow-section.md` to `CLAUDE.md`, replacing every `<default-branch>` with the real branch name.

3. **Pre-commit hooks.** Invoke the **`setup-pre-commit`** skill for the same stack detected in step 1. It installs a format → lint → test pre-commit hook (Husky for JS/TS, the `pre-commit` framework for Python, a tracked `.githooks/` script for Rust/Go), verifies it, **commits its own files**, and records the per-clone activation command in the docs (Husky needs none; Python `pre-commit install`; Rust/Go `git config core.hooksPath .githooks`). Keep the hook's test command consistent with the CI workflow's so the local gate mirrors the `test` check. If the repo has no test/lint tooling, the skill omits those steps and says so.

4. **Labels — inline, never a committed script:**
   ```bash
   gh label create ready       --color 0E8A16 --description "Refined AFK work; grabbable once its blockers are completed" --force
   gh label create in-progress --color FBCA04 --description "Claimed (assignee) and being worked"                         --force
   gh label create review      --color 1D76DB --description "PR open, awaiting review/merge"                              --force
   gh label create blocked     --color B60205 --description "Escalated to a human (abandoned blocker, or CI failed 3x)"   --force
   gh label create prd         --color 5319E7 --description "Product requirements document; parent of work slice issues"  --force
   ```

5. **Commit + land the workflow.** Stage only the shareable files (`.github/`), commit (`chore: add agentic-issues CI + issue template`), and push so `ci.yml` reaches `<default-branch>` (direct push as owner, or open + merge a bootstrap PR — the PR carries the workflow so its own `test` check can run). The pre-commit hook files (step 3) were already committed by that skill; `CLAUDE.md`/`AGENTS.md` are gitignored and stay local.

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

## 4. Clean up

Remove every one-shot artifact created during bootstrap — the temp protection JSON and any scratch files. **Never leave a `setup-labels.sh` or similar in the repo.** Confirm `.github/` contains only `workflows/ci.yml` and `ISSUE_TEMPLATE/task.md`.

## 5. Report

State what changed, anything skipped (e.g. branch protection when the scope was missing + the manual steps), the pre-commit hook installed and its per-clone activation command (if any), and how the queue runs from here:

- **Fill the queue:** `/spec` (grill idea → update docs → publish PRD → suggest `/to-issues`) or `/to-issue` (add one issue, reconciled against the open graph).
- **Work the queue:** point each agent at `/start-next-issue` — it self-loops, grabbing the most-blocking ready issue, working it to a green-CI merge, then taking the next.

## Notes

- The job name `test` is the required-check context across every stack — keep it `test`.
- **Idempotent:** re-running skips existing labels (`--force` upserts), an existing `AGENTS.md` symlink, `.gitignore` lines already present, and (via `setup-pre-commit`) any pre-commit config files that already exist.
- **GitHub-only** (uses `gh`). For repos hosted elsewhere, only the docs + templates apply.
- Owner direct-pushes to the protected branch bypass the check (`enforce_admins=false`); agents go through PRs and hit the gate.
- The dependency queue (`blocked-by` edges, the `ready`/`completed` rule, the claim mutex) is described in `templates/workflow-section.md` and consumed by `/start-next-issue`. Keep all four skills (`bootstrap-issues`, `to-issues`, `/to-issue`, `/start-next-issue`) in agreement on those conventions.
