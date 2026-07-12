# Create-issues reference

The shared issue-creation flow. Both `/spec` routes converge here:

- **PRD path** - a `[PRD]` issue was just published (see `references/prd.md`). Source is the PRD;
  run **batch mode** with the PRD as parent.
- **Issues-only path** - a small change; no PRD. Source is the grilled context; run **single mode**
  (one slice) or a **small batch** (a few independent slices), with no parent.

Create dependency-aware issues - one or many - and slot them into the existing queue. Always
reconcile against the open graph; always quiz before publishing.

## 0. Confirm mode

- **Batch** - a plan or PRD is the source. Break into tracer-bullet vertical slices. (PRD path is
  always batch; the small path may also be a small batch when grilling surfaced a few independent
  tasks.)
- **Single** - one specific change with no decomposition needed. Create one issue.

If ambiguous, ask.

## Preconditions

- Git repo with GitHub `origin`; `gh` authenticated; **`gh` >= 2.94.0** (needs `--add-blocked-by` / `--add-blocking` and `blockedBy` JSON fields).
- Capture `<owner>/<repo>` via `gh repo view --json nameWithOwner`.
- On the PRD path, you already have the PRD issue number; use it as the parent for every child.

## 1. Explore (optional)

If the codebase is unfamiliar, explore it. Issue titles and descriptions must use the project's domain glossary and respect any ADRs.

## 2. Draft the issue(s)

### Single mode

Draft one **tracer-bullet vertical slice** - narrow but complete end-to-end, independently mergeable.

### Batch mode

Break the plan into tracer-bullet slices. Each slice must:
- Cut through ALL integration layers end-to-end (schema, API, UI, tests)
- Be demoable or verifiable on its own
- Prefer many thin slices over few thick ones

For large decompositions, consider a **parent issue** that scopes the overall work with child issues as individual slices (each child references it in `## Parent`). Small standalone tasks need no parent. On the PRD path, record the PRD issue number as the parent for every child.

### Label each draft `afk` or `hitl`

Autonomy is a **label**, not a body section - `/start-next-issue` reads it mechanically. Every work
issue gets exactly one:

- **`afk`** - fully autonomous: an agent implements, tests, and merges it without human involvement.
- **`hitl`** - a human is on the critical path: an architectural decision, a design review, or an
  external dependency (credentials, a third-party account, a human-only approval).

**Prefer `afk`.** The worker skips `hitl` entirely, so those issues sit until a human picks them up -
and anything they block sits too. Never reach for it just because a slice looks large or unfamiliar.
If the only human input a slice needs is one decision, settle it *now* during the grill and publish
`afk` with the decision written into `## Notes / context`.

### Issue body - read the repo's issue template (source of truth)

**Do not carry your own body shape.** The repo's GitHub issue template is the single per-repo source
of truth for issue structure, so agent-filed and human-filed (web UI) issues stay identical. Read it:

```bash
cat .github/ISSUE_TEMPLATE/task.md   # the agent-task template bootstrap-issues installs
```

Use its section skeleton as the body, filling each section for this slice:

- **Strip the YAML frontmatter** (`--- ... ---`) - `--body-file` treats the file as literal markdown, so
  frontmatter would render as junk in the issue. Labels come from `--label` flags in section 5, never the body.
- **Replace every `<!-- guidance -->` comment** with real content (or delete it) - the comments are
  fill instructions, not issue text.
- **Keep the template's repo-specific lines verbatim** - its `## Definition of done` carries this
  repo's real gates (e.g. a `DESIGN.md` conformance line, the branch-naming convention). That is the
  whole point of reading it: those bits must not be hardcoded generically here.
- Autonomy lives in the labels, so fill no autonomy field. For a `hitl` issue, state in
  `## Notes / context` what human input it needs and who can give it.

**Fallback - only if `.github/ISSUE_TEMPLATE/task.md` is absent** (repo not bootstrapped for the
queue). Use this generic skeleton; the repo template, when present, always wins:

```markdown
## Parent

A reference to the parent PRD or tracking issue on the issue tracker. Omit if standalone.

## What to build

Concise end-to-end description of this slice. Describe behavior, not layer-by-layer implementation.
Avoid specific file paths - they go stale fast. Exception: if a prototype produced a snippet that
encodes a decision more precisely than prose (state machine, schema, type shape), inline it and
note it came from a prototype.

## Acceptance criteria

- [ ] Criterion 1

## Blocked by

- #<issue> description (or "None - can start immediately")

## Definition of done

- [ ] CI `test` check green
- [ ] Verified locally if runtime behavior or UI changes
- [ ] PR on branch `<issue#>-<slug>` with `Closes #<this issue>`

## Notes / context

Links to specs, ADRs, related issues.
```

## 3. Open-graph edge detection

Fetch the open issue graph:

```bash
gh issue list --state open --json number,title,body,labels --limit 100
```

For each drafted issue, determine edges in **both** directions:

- **blocked-by (upward)** - open issues whose code/output must exist first.
- **blocking (downward)** - open issues that now logically need *this* issue first (e.g. it extracts a shared helper or introduces a type they assume). **Always evaluate this direction** - a missing downward edge is the silent, dangerous failure.

**Logical dependencies only.** File overlap is contention, handled at merge via rebase; never model it as an edge.

**Conservative bias.** When genuinely unsure a real dependency exists, propose the edge. A false edge costs a little parallelism (recoverable); a missing edge sends an agent to build on code that isn't there (expensive).

For batch mode: also model edges *between* the new slices themselves.

## 4. Quiz the user

Present the proposed issue(s). For each issue, show:

- **Title**
- **Autonomy**: `afk` / `hitl` - for `hitl`, the specific human input it needs
- **Blocked by**: other slices or pre-existing open issues that must complete first
- **Blocking**: pre-existing open issues that now depend on this issue (if any)
- **User stories covered** (batch mode only, when source material has them)

Call out any `hitl` issue that blocks other issues, and how many - the throughput cost made concrete.

Ask:
- Do the issue(s) feel right? (for batch: granularity - too coarse / too fine?)
- Are the dependency relationships correct?
- (Batch) Should any slices be merged or split further?
- Are the `afk` / `hitl` labels correct - can any `hitl` become `afk` by settling its decision now?

Iterate until the user approves.

## 5. Publish

Publish in **dependency order** (blockers first) so real issue numbers exist when wiring edges.

For each issue:

```bash
# Write body to a temp file, create the issue, wire edges, then clean up
gh issue create --title "<title>" --body-file "$TMPDIR/issue-body.md" --label ready --label afk   # or --label hitl
gh issue edit <n> --add-blocked-by <A> [--add-blocked-by <B> ...]   # n needs A, B
gh issue edit <n> --add-blocking  <C> [--add-blocking  <D> ...]      # C, D now need n
rm -f "$TMPDIR/issue-body.md"
```

Label every issue `ready` **plus exactly one of `afk` / `hitl`** - including those with open
blockers. `ready` means refined, not grabbable: grabbability is computed from dependency edges +
`completed` state. Never ship both autonomy labels or neither; the worker skips an unlabelled issue
silently.

**Where the labels come from:** `--body-file` ignores the template's frontmatter, so labels are
always explicit `--label` flags. Take the **lifecycle** label (`ready`) from the repo template's
`labels:` line; **always append your own per-issue autonomy pick** (`afk` or `hitl`) from section 2's
decision - overriding whatever autonomy default the template lists (its `afk` is just the human web-UI
default). So: `--label ready --label <afk|hitl>`.

If the repo predates these labels, create them before publishing (`gh label list` to check):

```bash
gh label create afk  --color C2E0C6 --description "Fully autonomous: an agent implements, tests, and merges it" --force
gh label create hitl --color D93F0B --description "Human in the loop required; the autonomous worker skips it"  --force
```

Do NOT close or modify any parent or PRD issue.

## 6. Report

State each new issue number, its edges, and its status:

- **grabbable** - `afk`, no open blockers; an agent takes it now.
- **waiting** - `afk` with open blockers; frees itself as they merge.
- **awaiting human** - `hitl`; no agent picks it up, blockers or not.

If the queue now has grabbable `afk` work, suggest `/start-next-issue`. If everything published is
`hitl`, say so plainly - `/start-next-issue` would find an empty ready set and exit.

## Notes

- **`gh` >= 2.94.0** required for dependency flags - fail loudly on older versions.
- Never model file contention as a dependency edge.
- Scan the open issue set for duplicates before creating.
- `prd` parents carry neither `afk` nor `hitl` - autonomy applies to work slices, and a PRD is never
  worked directly. `/start-next-issue` closes it when its last child merges.
