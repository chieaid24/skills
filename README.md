# skills

My personal skills for a parallel-agent development workflow.

These are Claude Code and Codex CLI skills that run autonomous agents against a dependency-aware GitHub Issues queue. Each agent grabs a ready issue, works it to a green-CI merge, then self-loops to the next. Work is ordered by native GitHub `blocked-by` dependencies.

## The skills

| Skill | What it does |
|---|---|
| **bootstrap-issues** | One-shot repo setup: CI test gate, work-queue labels, branch protection with self-merge, issue template, and the `AGENTS.md`/`CLAUDE.md` workflow docs. |
| **spec** | Pipeline entry: grill a rough idea → sharpen domain language + write ADRs → publish `[PRD]` issue → suggest `/to-issues`. |
| **to-prd** | Synthesize already-grilled context into a `[PRD]` issue. Invoked automatically by `/spec`; use directly only if grilling was done separately. |
| **to-issues** | Break a plan/PRD into tracer-bullet vertical slices; author native `blocked-by` edges. |
| **to-issue** | Add a single issue and wire its bidirectional dependencies against the open graph. |
| **start-next-issue** | Self-looping worker: grab the most-blocking ready issue → work it → babysit CI → merge → repeat. |

## How it works

- **Edges = true logical dependencies only** (native GitHub `blocked-by`); file contention rides the merge gate via rebase.
- **Ready** = labelled `ready`, unassigned, every blocker closed as `completed`.
- **Claim** = assignment (atomic). **Select** = most-blocking-first.
- CI babysit: 3 fix attempts, then comment + `blocked` + stop the lane.

## Requirements

- `gh` ≥ 2.94.0 (exposes `blockedBy` / `stateReason` and the dependency flags).
- A GitHub repo with `origin`; a PAT with Contents / Issues / Pull requests / Administration.

## Install

Symlink each skill into your skills dirs (Codex reads `~/.agents/skills/`, Claude reads `~/.claude/skills/`):

```bash
for s in bootstrap-issues spec to-prd to-issues to-issue start-next-issue; do
  ln -s "$PWD/$s" ~/.agents/skills/$s
  ln -s ../../.agents/skills/$s ~/.claude/skills/$s
done
```

Then run `/bootstrap-issues` in a target repo to set it up, `/spec` to shape an idea into a PRD + issue slices, and `/start-next-issue` to work the queue.

---

`to-issues` is adapted from Matt Pocock's skill of the same name.
