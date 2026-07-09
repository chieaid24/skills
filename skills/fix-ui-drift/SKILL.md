---
name: fix-ui-drift
description: Autonomous visual consistency pass. Screenshot every UI flow with the repo's browser runner, find defects (misalignment, overlap, clipped text, overflow) and drift from DESIGN.md or from the app's own dominant patterns, then dispatch a fix subagent per finding and re-run its probe until every flow is clean. Use for unattended UI polish, "fix the UI inconsistencies", "screenshot all the flows and check them", or agent-driven visual cleanup.
---

# Fix UI Drift

You are running unattended. Your job: capture every flow, prove what is visually wrong, repair it
through implementation subagents, and show that each repair held. No human picks findings or
approves fixes. The **probes** and the repo's test suite are your approval mechanism.

## Platform terminology

This skill is agent-neutral. **Task tool** means the coding agent's delegation mechanism;
**subagent** means a delegated agent. Inspection subagents are read-only; implementation subagents
write code. Use the platform's equivalents while preserving the roles, parallelism, and
independence boundaries below.

## Vocabulary

Use these terms exactly.

- **Flow** -- a scripted journey through the UI that ends in a set of screenshots. The unit of
  capture, of assignment, and of re-verification.
- **Defect** -- wrong on its own evidence, with no authority needed to call it: edges that should
  align and do not, elements that overlap, text clipped or truncated, content overflowing its
  container, a contrast pair below threshold, a control below its minimum target size.
- **Drift** -- correct alone, wrong in company: a value that deviates from `DESIGN.md`, or from the
  pattern the rest of the app already uses. Only a comparison reveals it.
- **Probe** -- a snippet that reproduces a finding as a measurement in the live page: two
  `getBoundingClientRect()` left edges that should be equal, a `getComputedStyle` padding that
  should sit on the spacing scale. A probe is **red** while the finding stands and **green** once
  it is fixed.
- **Clean** -- a flow with every probe green and no open finding.
- **Ledger** -- `ui-findings.json`, the single record of every finding and its status. The run ends
  when the ledger says it does, not when the work feels done.

## Hard rules

- **Only report what you can measure.** Every finding carries a probe that reads the DOM or a
  computed style. A screenshot *shows* a finding; a probe *proves* it, and later proves the fix.
  "Looks off" is not a finding; "these two rects differ by 3px on x" is. The narrow exception is in
  [INSPECTION.md](INSPECTION.md) under Eye-only findings.
- **Scope every change to its finding.** Behavior, copy, and information architecture stay as they
  are; styles, tokens, and markup move only as far as the probe requires. A finding that can be
  cleared only by redesigning the screen is deferred for a human, not fixed here.
- **Never inspect a nondeterministic capture.** Capture each flow twice and compare. If the two
  differ, the difference is your tooling, not the UI -- stabilize it per
  [CAPTURE.md](CAPTURE.md) before inspecting, or every finding after this point is noise.
- **Never work from a red baseline.** If the repo's test suite fails before you touch anything,
  stop and report. You cannot show a fix preserved behavior without a green start.
- **Verify per finding, never in batches.** A batch that goes red cannot be attributed.
- **A fix that cannot go green is reverted, not parked.** Revert, confirm the revert restored
  green, record why.

## Process

### 0. Setup

Create the working branch from the default branch: `ui-drift-<yyyy-mm-dd>`.

Establish the **output directory** at `~/fix-ui-drift-skill/<repo-name>/run-<N>/`, where `<N>` is
the next unused run integer. It holds `flows.md`, `shots/`, `ui-findings.json`, and `REPORT.md`.
It lives outside the repo because screenshots must never be committed. Probes are the exception:
they are code, and they ship with their fix.

Pick the browser driver and reuse the repo's existing E2E configuration per
[CAPTURE.md](CAPTURE.md).

Read `DESIGN.md` if the repo has one -- it is the authority for drift. Without it, the only
authority is the app's dominant pattern; say so in the report and recommend the `bootstrap-issues`
design interview.

Run the repo's test suite (find the commands in `AGENTS.md`/`CLAUDE.md`/`README.md`, package
manifests, and CI workflows). Red means stop and report.

### 1. Discover flows

Read the repo's E2E specs first. Each spec is a flow already written down, and it carries what is
hard to rediscover: the base URL, the auth fixture or stored session, the seeded data, the
multi-step form paths, the modal and error states.

Then enumerate every route the specs never reach -- from the file-based router, the route config,
or the sitemap -- and script a flow for each. Capture each flow at the `DESIGN.md` breakpoints (or
mobile and desktop if it is silent) and in each theme the design system declares.

Write `flows.md`. **Completion criterion:** every route in the router appears in exactly one flow,
or is listed as unreachable with its reason (auth wall, feature flag, dead route). A route list
without that accounting is not done.

### 2. Capture

Follow [CAPTURE.md](CAPTURE.md) exactly -- animations frozen, fonts loaded, time and randomness
pinned, dynamic regions stubbed. Screenshot every step of every flow into `shots/`.

Capture each flow a second time and compare. Identical means proceed. Different means find the
source of the difference and pin it before going further.

### 3. Inspect

Delegate one read-only inspection subagent per flow, in parallel. Each receives the flow's
screenshots, `DESIGN.md`, [INSPECTION.md](INSPECTION.md), and the means to run measurements
against the live page. Each returns findings, and every finding arrives with its probe.

Consolidate what comes back. One root cause touching six flows is one finding listing six flows,
not six findings -- fix the token once. Where `DESIGN.md` is silent, the correct value is the one
the majority of instances already use; where no majority exists, the finding is `needs-decision`
and gets deferred rather than guessed.

Rank by severity: a defect that breaks reading or interaction outranks a defect that offends the
eye, which outranks drift. Write the ledger against [ledger-schema.json](ledger-schema.json).

### 4. Fix

Order by severity, then group findings that share a root cause so the token moves once. Run
findings sequentially unless their file sets are fully disjoint, in which case implementation
subagents may run in parallel.

For each finding:

1. Brief an implementation subagent with the finding, its probe, the exact files it may touch, the
   `DESIGN.md` rule it must satisfy, and the frozen contract from the hard rules.
2. Run the finding's probe, then every other probe, then the repo's test suite.
3. Green on all three: commit alone as `fix(ui): <what changed>`, with the probe committed
   alongside under `e2e/ui-drift/`, so the finding cannot silently return.
4. Red: give the subagent two more attempts. Still red, or green only by weakening its own probe:
   revert the finding completely, re-run to confirm green is restored, mark it `reverted` with the
   reason.
5. Recapture the affected flows. A defect the fix introduced becomes a new ledger entry and is
   worked once. If clearing *that* entry introduces another, revert the fix that started the chain
   -- the screen needs a human.

Stop early if a full pass over the ledger fixes nothing.

**Completion criterion:** every ledger entry is terminal (`fixed`, `reverted`, or `deferred`), and
a final recapture of every flow in `flows.md` comes back clean. An entry still `open` means the run
is not finished, whatever the count of fixed findings says.

### 5. Ship

Push the branch and open one PR. Its body carries the before and after screenshot for each fixed
finding, and the ledger summary: fixed, reverted with reasons, deferred with what a human must
decide. Squash-merge only after CI is green.

End with a report: flows captured, findings by kind and severity, what was fixed, what was reverted
and why, what awaits a human decision, and any route that stayed unreachable.
