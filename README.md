# Agent Skills for dependency-aware development

Portable Agent Skills for running a parallel development workflow through a dependency-aware
GitHub Issues queue.

The skills use the open Agent Skills format and work with Codex, Claude Code, and other compatible
agents. Each worker claims a ready issue, works it to a green-CI merge, then takes the next issue.
Native GitHub `blocked-by` relationships determine work order.

## The skills

| Skill | What it does |
|---|---|
| **bootstrap-issues** | One-shot repo setup: CI test gate, work-queue labels, branch protection with self-merge, issue template, pre-commit hooks (via `setup-pre-commit`), and the `AGENTS.md`/`CLAUDE.md` workflow docs. |
| **setup-pre-commit** | Stack-aware pre-commit hook — format -> lint -> test before every commit (Husky for JS/TS, the `pre-commit` framework for Python, a tracked git hook for Rust/Go). Called by `bootstrap-issues`; runs standalone too. |
| **spec** | Pipeline entry: grill a rough idea -> sharpen domain language + write ADRs -> publish `[PRD]` issue -> suggest `/to-issue`. |
| **to-prd** | Synthesize already-grilled context into a `[PRD]` issue. Invoked automatically by `/spec`; use directly only if grilling was done separately. |
| **to-issue** | Create one or many dependency-aware issues from a task description or plan. Auto-detects single vs batch; always reconciles against the open graph (both directions); quizzes before publishing; labels each issue HITL or AFK. |
| **start-next-issue** | Self-looping worker: grab the most-blocking ready issue -> work it -> babysit CI -> merge -> repeat. |
| **catch-up** | Daily read-only reviewer: reconstruct what shipped / is in progress / is blocked since the last run, diagnose stalled lanes from their worktrees, log to `progress/progress.md`, print a summary with per-lane dev commands. |

## How it works

- **Edges = true logical dependencies only** (native GitHub `blocked-by`); file contention rides the merge gate via rebase.
- **Ready** = labelled `ready`, unassigned, every blocker closed as `completed`.
- **Claim** = assignment (atomic). **Select** = most-blocking-first.
- CI babysit: 3 fix attempts, then comment + `blocked` + stop the lane.

## Requirements

- Node.js and npm for the cross-platform Skills CLI installer.
- `gh` >= 2.94.0 (exposes `blockedBy` / `stateReason` and the dependency flags).
- Git and a GitHub repository with an `origin` remote.
- A GitHub token with the permissions required by the skill being used. `bootstrap-issues` needs
  Contents, Issues, Pull requests, and Administration access; read-only skills need less.

## Install

List the available skills without installing anything:

```bash
npx skills add chieaid24/skills --list
```

Install all skills globally for both Codex and Claude Code:

```bash
npx skills add chieaid24/skills --skill '*' --global --agent codex --agent claude-code --yes
```

Install only selected skills by repeating `--skill`:

```bash
npx skills add chieaid24/skills --global --agent codex --agent claude-code \
  --skill spec --skill to-issue --skill start-next-issue --yes
```

The installer maintains one canonical installation and links it into each selected agent when
symlinks are supported. Use `--copy` only on systems where symlinks are unavailable.

Then run `/bootstrap-issues` in a target repository to set up the queue, `/spec` to shape an idea
into a PRD, `/to-issue` to create dependency-linked work, `/start-next-issue` to work the queue,
and `/catch-up` to review progress.

## Update

Check whether installed skills have changed upstream, then update them:

```bash
npx skills check
npx skills update
```

Updates do not require a new npm release. The GitHub repository is the source of truth, so normal
commits to `main` become available to the update command.

## Develop locally

Clone the repository and install from the local checkout. Symlink mode keeps edits immediately
available to both agents:

```bash
git clone https://github.com/chieaid24/skills.git
cd skills
npx skills add . --skill '*' --global --agent codex --agent claude-code --yes
```

Validate metadata and confirm that every skill is discoverable before pushing:

```bash
node scripts/validate-skills.mjs
npx skills add . --list
```

GitHub Actions runs the same checks on every push and pull request.

## Portability scope

The skill format is agent-platform agnostic. The workflows themselves intentionally depend on
GitHub, Git, and the `gh` CLI; they are not portable to other issue trackers without adaptation.
Keep provider-specific frontmatter out of `SKILL.md` so Codex and Claude Code consume the same
source files.

## Security

Agent Skills are executable instructions. Review a skill before installing it, use the minimum
GitHub token permissions it needs, and test outward-facing workflows in a disposable repository
before using them on important projects.
