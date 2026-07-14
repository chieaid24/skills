# Aidan's Agent Skills

The skills I use for my agentic development workflow.

Spec out the requirements with a grilling session,
create GitHub Issues and PRDs for auditability, run your agents autonomously,
keep yourself in the loop.

## Quickstart

Run the installer and add the skills to your coding agents:

```bash
npx skills@latest add chieaid24/skills
```

Then, in a repo you want to work in:

- `/bootstrap-issues` sets up the queue.
- `/spec` shapes an idea into a PRD with child issues, or straight into one or a few issues for a small change.
- `/start-next-issue` works the queue.
- `/catch-up` reviews what happened.

To work several repos in one run, invoke `/start-next-issue` from the folder that holds them (say
`~/projects`) with a `.start-next-issue-repos` file listing the clones, one per line. It then picks
each issue from whichever repo has the most-blocking one.

## Skills

All ten are model-invoked: the agent can reach for one on its own when the task fits, or you can type it.

### The issue-queue workflow

- [**bootstrap-issues**](skills/bootstrap-issues) - One-shot repo setup for the queue: CI test gate, work-queue labels, self-merge branch protection, issue template, pre-commit hooks, and a grilled `DESIGN.md` for frontend repos.
- [**setup-pre-commit**](skills/setup-pre-commit) - Stack-aware pre-commit hook that runs format, lint, and test before every commit.
- [**spec**](skills/spec) - Grills a rough idea into sharpened terms and ADRs, then publishes either a `[PRD]` with child slices or a few dependency-linked issues.
- [**start-next-issue**](skills/start-next-issue) - Claims the most-blocking ready issue, drives it to a merged PR, and chains up to three of them, halting on any failure. Runs against one repo, or against every repo in a list when you invoke it from the folder above them. Never touches `hitl`.
- [**catch-up**](skills/catch-up) - Read-only morning report of what shipped, what stalled, and which `hitl` issues are waiting on you.

### Autonomous audit passes

- [**code-audit**](skills/code-audit) - Deepens shallow modules through subagents, reverting any change the unit, integration, and E2E suites cannot prove behaviour-preserving.
- [**ui-audit**](skills/ui-audit) - Screenshots every flow, measures visual defects and design-system drift, and fixes each with a committed probe that was red before and green after.
- [**security-audit**](skills/security-audit) - Multi-agent hunt for exploitable vulnerabilities: recon, attack-class hunting, adversarial validation, and a schema-checked report.

### Writing and meta

- [**writing-great-skills**](skills/writing-great-skills) - The vocabulary and principles for writing skills that behave predictably, backed by a full `GLOSSARY.md`.
- [**writing-style**](skills/writing-style) - House style for anything a reader outside the work sees, tuned to fight a model's prose defaults.

## Credits

`code-audit` and `writing-great-skills` are adapted from [mattpocock/skills](https://github.com/mattpocock/skills), and `security-audit` from [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill), all MIT-licensed.
