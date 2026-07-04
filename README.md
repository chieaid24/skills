# Aidan's Agent Skills

The skills I use for my agentic development workflow. 

Spec out the requirements with a grilling session,
create GitHub Issues and PRDs for auditability, run your agents autonomously, 
keep yourself in the loop.

## The skills

| Skill | What it does |
|---|---|
| **bootstrap-issues** | One-shot repo setup: CI test gate, work-queue labels, branch protection with self-merge, issue template, pre-commit hooks, `AGENTS.md`/`CLAUDE.md` docs. |
| **setup-pre-commit** | Stack-aware pre-commit hook: format -> lint -> test. Called by `bootstrap-issues`; runs standalone too. |
| **spec** | Grill a rough idea -> sharpen domain language + write ADRs -> route by scope: publish a `[PRD]` issue with child slices for large features, or create one or a few dependency-linked issues directly for small changes. Reconciles the open graph, quizzes before publishing, labels HITL or AFK. |
| **start-next-issue** | Iteration-capped worker: grab the most-blocking ready issue -> work it -> babysit CI -> merge -> hand off to a fresh-context agent for the next, up to 3 total. |
| **catch-up** | Daily read-only reviewer: what shipped/in-progress/blocked, diagnose stalled lanes, log to `progress/progress.md`. |

## How it works

- Edges are true logical dependencies only (native GitHub `blocked-by`); file contention rides the merge gate via rebase.
- Ready = labelled `ready`, unassigned, every blocker closed as `completed`.
- Claim = assignment (atomic). Select = most-blocking-first.
- CI babysit: 3 fix attempts, then comment + `blocked` + stop the lane.

## Requirements

- Node.js, npm, Git, `gh` >= 2.94.0.
- A GitHub repository with an `origin` remote.
- A GitHub token scoped to the skill in use (`bootstrap-issues` needs Contents, Issues, Pull requests, Administration).

## Install

```bash
npx skills add chieaid24/skills --skill '*' --global --agent codex --agent claude-code --yes
```

Install specific skills instead of `'*'` by repeating `--skill`. List available skills with
`npx skills add chieaid24/skills --list`.

Then, in a target repo: `/bootstrap-issues` to set up the queue, `/spec` to shape an idea into a
PRD with child issues (or straight into one or a few issues for small changes), `/start-next-issue`
to work the queue, `/catch-up` to review progress.

## Update

```bash
npx skills check
npx skills update
```

`main` is the source of truth, so updates don't require a new npm release.

## Develop locally

```bash
git clone https://github.com/chieaid24/skills.git
cd skills
npx skills add . --skill '*' --global --agent codex --agent claude-code --yes
node scripts/validate-skills.mjs
npx skills add . --list
```

Symlink mode keeps edits immediately available to both agents. CI runs the same validation.

## Portability scope

The skill format is agent-platform agnostic. The workflows depend on GitHub, Git, and `gh`, and
are not portable to other issue trackers without adaptation. Keep frontmatter provider-neutral so
Codex and Claude Code consume the same source files.

## Security

Agent Skills are executable instructions. Review a skill before installing, use the minimum
GitHub token permissions it needs, and test outward-facing workflows in a disposable repo first.

## License

[MIT](LICENSE)
