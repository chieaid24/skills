# skills

Claude Code / Codex CLI skills for running **parallel autonomous agents on a dependency-aware GitHub Issues queue**. One agent grabs a ready issue, works it to a green-CI merge, and self-loops to the next; work is ordered by native GitHub `blocked-by` dependencies.

## The skills

| Skill | What it does |
|---|---|
| **bootstrap-issues** | One-shot repo setup: CI test gate, work-queue labels, branch protection with self-merge, issue template, and the `AGENTS.md`/`CLAUDE.md` workflow docs. |
| **to-issues** | Break a plan/PRD into tracer-bullet vertical slices; author native `blocked-by` edges. |
| **issue** | Add a single issue and wire its bidirectional dependencies against the open graph. |
| **next-issue** | Self-looping worker: grab the most-blocking ready issue → work it → babysit CI → merge → repeat. |

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
for s in bootstrap-issues to-issues issue next-issue; do
  ln -s "$PWD/$s" ~/.agents/skills/$s
  ln -s ../../.agents/skills/$s ~/.claude/skills/$s
done
```

Then run `/bootstrap-issues` in a target repo to set it up, `to-issues` / `/issue` to fill the queue, and `/next-issue` to work it.

---

`to-issues` is adapted from Matt Pocock's skill of the same name.
