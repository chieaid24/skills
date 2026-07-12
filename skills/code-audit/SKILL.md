---
name: code-audit
description: Autonomous architecture-improvement pass. Explore the codebase for deepening opportunities (shallow modules to deep modules), delegate behavior-preserving refactors to subagents, and continuously verify that nothing changed from the consumer side by keeping unit, integration, and E2E suites green. Use for unattended architecture cleanup, "audit the code", "improve the architecture", agent-driven refactoring runs, or /code-audit.
---

# Code Audit

You are running unattended. Your job: surface architectural friction, execute **deepening
refactors** (turn shallow modules into deep ones) through implementation subagents, and prove at
every step that observable behavior is unchanged. The aim is testability and AI-navigability.
No human is available to pick candidates or approve changes; the test suites are your approval
mechanism.

## Vocabulary

Use these terms exactly; do not drift into "component", "service", or "boundary".

- **Module** - any unit with an inside and an outside: a function, class, file, or package.
- **Interface** - everything a caller must know to use a module correctly, including hidden
  contracts like call order or shared state.
- **Depth** - the ratio of implementation hidden to interface exposed. A **deep** module hides a
  large implementation behind a small interface. A **shallow** module's interface is nearly as
  complex as what it hides.
- **Seam** - a place where the codebase can be split so the two sides only communicate through a
  narrow interface.
- **Adapter** - a thin translation layer at a seam. One adapter means a hypothetical seam; two
  adapters mean a real one.
- **Leverage** - how much behavior a single change or test exercises. Deep modules give tests
  leverage.
- **Locality** - whether the code that changes together lives together. Pure functions extracted
  solely for testability destroy locality: the real bugs hide in how they are called.
- **Deletion test** - ask of any suspect module: would deleting it and inlining its work
  concentrate complexity behind a real interface, or just relocate it? "Concentrates" marks a
  deepening opportunity.
- **The interface is the test surface** - tests should exercise a module through its interface;
  if a module is hard to test that way, the interface is wrong.

## Hard rules

- **The consumer contract is frozen.** Nothing observable from outside the codebase may change:
  exported/public API of a published library, HTTP/RPC routes and payload shapes, CLI flags and
  output, UI behavior, persisted data formats, emitted events, error types and messages that
  callers match on. Internal structure may change freely - that is the point.
- **Never work on a red baseline.** If the suite fails before you touch anything, stop and
  report; you cannot prove behavior preservation without a green starting point.
- **Never leave the tree red.** A candidate that cannot be made green is reverted, not parked.
- **Verify after every candidate, never in batches.** A batch that fails cannot be attributed.

## Process

### 1. Baseline

Discover how this repo verifies itself: read `AGENTS.md`/`CLAUDE.md`/`README.md`, package
manifests, and CI workflow files. Identify the commands for unit tests, integration tests, E2E
tests, typecheck, lint, and build. Run all of them and record the results. If anything fails,
stop and report the failures instead of refactoring.

### 2. Explore

If the repo has a domain glossary (`CONTEXT.md`) or ADRs (`docs/adr/`), read them first. Name
modules in the domain's language, and treat ADRs as settled: discard any candidate that
contradicts one.

Delegate one or more read-only exploration subagents to walk the codebase. No rigid heuristics -
explore organically and note friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules shallow - interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how
  they are called (no locality)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the deletion test to anything suspected shallow.

### 3. Select and plan

For each candidate record: the files involved, the problem (why the current shape causes
friction), the solution (what deepens), the benefit in terms of locality, leverage, and test
surface, and a strength rating of `Strong`, `Worth exploring`, or `Speculative`.

Execute only `Strong` candidates; list the rest in the final report for a future run. Order them
so earlier refactors do not invalidate later ones. Run candidates sequentially unless their file
sets are fully disjoint, in which case implementation subagents may run in parallel.

If a candidate's area is not covered by tests through its consumer-visible surface, first write
characterization tests that pin current behavior - inputs, outputs, errors, side effects. They
must pass before the refactor and unchanged after it. If current behavior cannot be pinned this
way, skip the candidate.

### 4. Delegate implementation

Send one implementation subagent per candidate with a scoped brief: the exact files it may touch,
the target interface shape, the tests that must stay green, and the consumer contract items it
must not alter. The subagent changes nothing outside its file set and rewrites tests only where
the refactor moved an internal interface - never to make a failing assertion pass by weakening it.

### 5. Verify

After each candidate, before starting the next:

1. Run the tests nearest the touched area, then the full unit suite, then integration and E2E.
2. Check the consumer contract directly where tools exist: diff public type declarations or
   exported symbols, compare API schemas or snapshots, diff CLI help/output.
3. On failure, give the implementing subagent up to two fix attempts. Still red: revert the
   candidate completely, re-run the suite to confirm the revert restored green, and log why.
4. On green, commit the candidate on its own (conventional `refactor(scope): ...`), so every
   refactor is independently revertable.

### 6. Report

End with a summary: refactors executed with their verification evidence (suites run, pass
counts, contract checks), candidates reverted or skipped and why, and remaining opportunities
(`Worth exploring` / `Speculative`) for a future run.
