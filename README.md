# Aidan's Agent Skills

The skills I use for my agentic development workflow.

Spec out the requirements with a grilling session,
create GitHub Issues and PRDs for auditability, run your agents autonomously,
keep yourself in the loop.

These skills are small, composable, and easy to change. No framework owns your process. Each one does a single job, works with any model, and is yours to rip apart and rebuild to fit how you work. They come out of doing real engineering with agents - shipping features and keeping them alive - not vibe coding.

The spine of the set is a dependency-aware GitHub Issues queue that several agents work in parallel, wrapped in a few autonomous passes that keep the code honest while they do. Here is why each piece exists.

## Why these skills exist

Every skill here fixes a failure mode I kept hitting with Claude Code, Codex, and other agents.

### The agent built the wrong thing

The most common failure is misalignment. You think the agent understood you, then you read the diff and it plainly did not. The gap is communication, and the fix is to close it before any code exists.

`/spec` opens with a grilling session: the agent interrogates your idea one question at a time, sharpens fuzzy terms against a project glossary, and writes down the decisions that were hard to reach. Only then does it route by scope - a `[PRD]` issue with child slices for a big feature, or one or a few dependency-linked issues for a small change. Alignment first, tickets second.

### One agent is slow, many agents collide

The way to go faster is to run several agents at once. The way that ends in tears is two of them grabbing the same ticket, or one building on code that does not exist yet.

`/bootstrap-issues` sets a repo up for this once: a CI test gate, work-queue labels, branch protection that lets an agent merge its own green PR, and pre-commit hooks. `/start-next-issue` then works the queue - it grabs the most-blocking ready ticket, drives it to a merged PR, and dispatches a fresh-context worker for the next one. Two things keep the parallel run sane. Dependencies are real `blocked-by` edges, so an agent never starts on missing code. And a claim is a compare-and-swap push of a git ref that GitHub arbitrates, so exactly one agent wins even across different machines - no shared lock to corrupt, no double-work.

### You lose track of what shipped overnight

Run agents while you sleep and you wake up to a pile of merged PRs and stalled lanes with no memory of how they got there.

`/catch-up` is the read-only morning report: what shipped, what is in progress, what is blocked, which `hitl` tickets are waiting on a decision only you can make, and which lanes stalled and why. It reconstructs the real product change from each merged diff, not the PR title, and starts your dev server so you can look. It never mutates anything beyond fast-forwarding a clean `main`.

### Agents build a ball of mud, fast

Agents write code faster than anyone, which means they grow complexity faster than anyone too. Left alone, an agent-built codebase turns into something no one - human or agent - can change safely.

The fix is to spend attention on design, every day. `/code-audit` runs an unattended architecture pass built on Ousterhout's idea from A Philosophy of Software Design: a deep module hides a lot of behaviour behind a small interface. It hunts for shallow modules, delegates behaviour-preserving refactors to subagents, and proves after every single change that nothing observable moved by keeping the unit, integration, and E2E suites green - reverting anything it cannot prove. `/ui-audit` and `/security-audit` are the same shape aimed at other kinds of rot: one screenshots every flow and measures visual defects and drift against your design system, the other runs a multi-agent hunt for exploitable vulnerabilities. All three fix what they find and prove the fix held before they stop.

Two more skills keep the meta honest. `writing-great-skills` is the reference for writing skills that behave predictably, and `writing-style` is the house style for anything a reader outside the work will see.

## Quickstart

Install the skills onto Codex and Claude Code:

```bash
npx skills add chieaid24/skills --skill '*' --global --agent codex --agent claude-code --yes
```

Repeat `--skill` to install specific ones instead of `'*'`; `npx skills add chieaid24/skills --list` shows what is available. Then, in a repo you want to work in:

- `/bootstrap-issues` sets up the queue.
- `/spec` shapes an idea into a PRD with child issues, or straight into one or a few issues for a small change.
- `/start-next-issue` works the queue.
- `/catch-up` reviews what happened.

## How the queue works

- Edges are true logical dependencies only (native GitHub `blocked-by`); file contention rides the merge gate via rebase, never an edge.
- A ticket is ready when it is labelled `ready` and `afk`, unassigned, unclaimed, and every blocker is closed as `completed`.
- Autonomy is a label, not prose. `afk` runs unattended; `hitl` waits for you. The worker skips `hitl` so an overnight chain never stalls against an absent human, and `/catch-up` lists them so they do not rot.
- A claim is a compare-and-swap push of `refs/claims/issue-<n>`, arbitrated by GitHub, so exactly one agent wins across clones and hosts. Assignment and labels only report the claim - neither can be set atomically. Selection is most-blocking-first.
- CI babysit: three fix attempts, then the lane comments, goes `blocked`, and stops.

## Requirements

- Node.js, npm, `gh` >= 2.94.0, and `git` >= 2.13 (the claim lock needs `--force-with-lease` with an empty expect).
- A GitHub repository with an `origin` remote.
- A GitHub token scoped to the skill in use (`bootstrap-issues` needs Contents, Issues, Pull requests, and Administration).
- `ui-audit` drives a browser: it reuses the repo's Playwright or Cypress config when there is one, and otherwise installs Playwright with headless Chromium.

## Reference

All ten skills are model-invoked: the agent can reach for one on its own when the task fits, or you can type it.

### The issue-queue workflow

- **bootstrap-issues** - one-shot repo setup: CI test gate, work-queue labels, branch protection with self-merge, issue template, pre-commit hooks, `AGENTS.md`/`CLAUDE.md` docs, and a grilled `DESIGN.md` design system that binds every future UI change (frontend repos).
- **setup-pre-commit** - stack-aware pre-commit hook: format -> lint -> test. Called by `bootstrap-issues`; runs standalone too.
- **spec** - grill a rough idea, sharpen domain language and write ADRs, then route by scope: a `[PRD]` issue with child slices for large features, or one or a few dependency-linked issues for small changes. Labels each issue `afk` or `hitl`.
- **start-next-issue** - iteration-capped orchestrator: grab the most-blocking ready `afk` issue, work it, babysit CI, merge, then dispatch a fresh-context worker per remaining issue (up to 3 total). Halts on any failure; never touches `hitl`.
- **catch-up** - daily read-only reviewer: what shipped, what is in progress or blocked, which `hitl` issues await you, plus stalled-lane diagnosis, logged to `progress/progress.md`.

### Autonomous audit passes

- **code-audit** - autonomous architecture pass: find shallow modules, delegate behaviour-preserving refactors to subagents, and verify after every change that the consumer contract held (unit + integration + E2E stay green), reverting what it cannot prove. Adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
- **ui-audit** - autonomous visual-consistency pass: screenshot every flow with the repo's own E2E runner, measure defects (misalignment, overlap, clipping, contrast) and drift from `DESIGN.md` or the app's dominant pattern, then repair each finding through a subagent and prove it with a committed probe that was red before and green after.
- **security-audit** - multi-agent security audit: reconnaissance, attack-class hunting, adversarial validation, and a schema-checked findings report. Targets exploitable issues with real impact. Vendored from [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) (MIT).

### Writing and meta

- **writing-great-skills** - reference for writing and editing skills: invocation trade-offs, description triggers, the steps-vs-reference hierarchy, and completion criteria, with a full `GLOSSARY.md` of the vocabulary. Vendored from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
- **writing-style** - house style for anything a reader outside the work sees: READMEs, posts, release notes, docs, PR bodies. Rules that fight a model's prose defaults (hype, throat-clearing, restating the diff, over-structuring, em dashes), plus an optional private voice overlay at `~/.agents/writing/voice/VOICE.md`. Stays out of the internal record: commit messages and code comments follow the repo's own convention.

## Update

```bash
npx skills check
npx skills update
```

`main` is the source of truth, so updates do not require a new npm release.

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

The skill format is agent-platform agnostic. The workflows depend on GitHub, Git, and `gh`, and are not portable to other issue trackers without adaptation. Keep frontmatter provider-neutral so Codex and Claude Code consume the same source files.

## Security

Agent Skills are executable instructions. Review a skill before installing, use the minimum GitHub token permissions it needs, and test outward-facing workflows in a disposable repo first.

## License

[MIT](LICENSE)
