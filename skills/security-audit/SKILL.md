---
name: security-audit
description: Security audit of a codebase — web apps, APIs, services, CLI tools, libraries, daemons, and more. Use when asked to find security bugs, do a security review, audit for vulnerabilities, or pen-test the code. Focuses on exploitable issues with real impact, not theoretical concerns or industry-standard behavior.
---

# Security Audit

You are a security auditor. Your job is to find **exploitable vulnerabilities with real impact**.

## Platform terminology

This skill is agent-neutral. In the methodology:

- **Task tool** means the coding agent's delegation or sub-agent mechanism.
- **`research` agent** means a delegated agent optimized for focused codebase exploration and factual verification.
- **`general` agent** means a delegated agent that can investigate broadly and spawn focused research agents.
- **`subagent_type`** means the equivalent delegated-agent role supported by the current platform.

Use the platform's equivalent capabilities while preserving the specified roles, parallelism, prompts, and independence boundaries.

## Setup

This skill audits a **git worktree** — a disposable checkout pinned to a single commit — so every run examines a clean, reproducible snapshot without touching your working tree, uncommitted changes, or current branch. Create one per run.

Before starting, establish the audit worktree, then the two paths.

### Create the audit worktree

Run `ls ~/security-audit-skill/<repo-name>/` first to find `<N>`, the next unused run integer. Use the same `<N>` for both the worktree and the output directory. Then, from inside the target repository:

1. **Pick the ref.** Default to the tip of the default branch: `git fetch`, then use `origin/main` (or `main`/`master`/`origin/HEAD` as the repo uses). If the user named a branch, tag, or commit, audit that instead.
2. **Add the worktree** under the repo's own `.worktrees/` directory (never `.claude/worktrees`):
   ```
   git worktree add .worktrees/security-audit-run-<N> <ref>
   ```
3. **Record the commit.** `git -C .worktrees/security-audit-run-<N> rev-parse HEAD` — pin the run to this SHA so periodic runs can be compared commit-to-commit. Record it in `architecture.md`.

If the target is not a git repository, audit it in place and note that the isolation and reproducibility guarantees do not hold.

### Paths

- **Target**: the worktree checkout (`.worktrees/security-audit-run-<N>`). Every Phase 1 and Phase 2 agent reads code from here, not from the live working tree.
- **Output directory**: where all audit artifacts go. It lives **outside** the worktree so it survives cleanup and accumulates run history across weeks. Default to `~/security-audit-skill/<repo-name>/run-<N>` (ask the user if they want a different location). Create it if it does not exist, and use the same `<N>` as the worktree. **Never write artifacts inside the worktree** — they would be destroyed at cleanup and could be committed by accident. Because reports contain live vulnerability detail, the output directory must never be committed into the repo.

All files written during the audit go in the output directory:
- `architecture.md` — Phase 1 output, fed into Phase 2 agent prompts
- `REPORT.md` — human-readable report (Phase 4)
- `FINDINGS-DETAIL.md` — detailed data flows for MEDIUM+ findings (Phase 4)
- `findings.json` — machine-readable structured output (Phase 5)

Subagents (Phases 1, 2, 3, 6) do NOT write files — they return results to you via the Task tool. You are responsible for writing all files to the output directory.

### Coverage and prior runs

Each audit run explores different code paths depending on which agents find what and where they dig. No single run finds everything. Testing shows the best single run finds roughly half the total vulnerabilities across multiple runs.

**If prior runs exist** for the same repo (check `~/security-audit-skill/<repo-name>/`), read their `findings.json` files before starting Phase 2. Use them to:
1. **Skip known findings** — don't waste agents re-discovering the same status bypass. Mention prior findings in the report but focus hunting effort on new ground.
2. **Target gaps** — if prior runs focused heavily on injection and auth, weight this run toward business logic, creative attacks, and the wildcard agent. If prior runs missed public endpoints, focus there.
3. **Resolve disagreements** — if prior runs gave conflicting verdicts on the same finding, validate it definitively.
4. **Diff since the last run** — this skill is meant to run on a schedule (e.g. weekly), so compare the ref you are auditing against the previous run's recorded SHA: `git -C .worktrees/security-audit-run-<N> log --oneline <prev-sha>..HEAD`. Weight extra hunting effort toward code that changed since the last audit. In Phase 4, tag each finding's status relative to the previous run — **new**, **still open** (reported before, still present), or **regressed** (previously fixed, now back) — and list prior findings that are now fixed as **resolved**. This week-over-week delta is the main value of running periodically.

Include a brief summary of prior runs in the architecture summary so Phase 2 agents know what's already been found.

**If no prior runs exist**, note in the report that coverage improves with additional runs and recommend the user run the audit again to catch findings this run may have missed.

## Core Principles

### Only report what you can exploit

Every finding must have a concrete attack scenario: who is the attacker, what do they do, and what do they get? "An attacker could theoretically..." is not a finding. "Send this request, get this result" is.

### Confirm dynamically when you can

This is a source-first audit, but a claim you can execute beats one you can only argue. Where the target is locally buildable — a parser, a library, a CLI, a native component — build and run it: reproduce the crash, run the payload, diff the two parsers on the same bytes. Better still, **extract the suspect code into a minimal standalone harness** and test the hypothesis in isolation — fuzz the one function, feed it the crafted input, watch what it does. Where confirmation needs infrastructure you don't have — a proxy chain, a live cache, production auth — you cannot confirm from source alone: mark it "requires deployment testing" and do not report it as confirmed. Dynamic evidence is what resolves the memory-safety and request-framing classes that static reading leaves ambiguous.

### Determine the baseline dynamically

In Phase 1, identify what this application is and what comparable applications exist. Use those comparables to calibrate -- not to dismiss findings, but to focus effort. If the comparable has the same pattern and it's been exploited there, that's a STRONGER finding, not a weaker one. If the comparable has the same pattern and nobody's ever exploited it in 20 years, you should understand why before reporting it.

Do NOT hardcode a specific comparable. A CMS gets compared to other CMSes. An API gateway gets compared to other API gateways. A novel application may have no meaningful comparable.

### Defense-in-depth gaps are not vulnerabilities

If Layer A prevents the attack, the absence of Layer B is a hardening note, not a finding. Report it separately if you want, but do not inflate its severity.

### Severity requires impact

Severity is the combination of **likelihood** (how easy to exploit, what access is needed) and **impact** (what damage is achieved). Use both axes:

- **CRITICAL**: Unauthenticated RCE, full database dump, admin account takeover without credentials
- **HIGH**: Authenticated RCE, SQL injection with data exfiltration, stored XSS that fires for all users, auth bypass. Also: any finding where the RBAC/permission model is *completely* defeated for an action — e.g., a user can perform an action that the system explicitly gates behind a higher role, and the action has real consequences (publishing content, deleting resources, modifying other users' data).
- **MEDIUM**: Targeted XSS requiring specific conditions, CSRF with meaningful state change, information disclosure of secrets/credentials. Also: business logic bypasses with real but limited consequences — e.g., the action is possible but requires authentication, or the impact is confined to the attacker's own data, or the bypass requires uncommon conditions.
- **LOW**: Information disclosure of non-secret data, DoS requiring sustained effort
- **INFORMATIONAL**: A confirmed but minimal-impact observation with no standalone exploit — useful mainly as a building block for another finding. Pure defense-in-depth gaps belong in hardening notes, not here.

The key distinction between HIGH and MEDIUM for business logic findings: **does the finding defeat an explicit security boundary?** Defeating one — acting past a role the system explicitly enforces — is HIGH; a data inconsistency, a finding that requires privileged access to exploit, or one with limited blast radius is MEDIUM.

If you cannot describe the concrete damage an attacker achieves, the severity is probably lower than you think.

These principles are enforced operationally by the **validation rules in [HUNTING.md](HUNTING.md)** — the canonical bar every hunter applies before reporting a finding, and that Phase 3 re-applies adversarially. The domain companion files add domain-specific checks on top of that bar; they do not replace it.

## Workflow overview

Follow all six phases in order:

1. **Recon** — Run Phase 1 from [RECONNAISSANCE.md](RECONNAISSANCE.md) to map the application's architecture, trust boundaries, and input surfaces.
2. **Hunt** — Use [HUNTING.md](HUNTING.md) for Phase 2 orchestration, methodology, and validation rules; select scopes from [ATTACK-CLASSES.md](ATTACK-CLASSES.md), which routes native, AI/LLM, HTTP-protocol/auth, and client-side targets to specialized companion files ([MEMORY-SAFETY-AND-BINARY.md](MEMORY-SAFETY-AND-BINARY.md), [AI-AND-LLM.md](AI-AND-LLM.md), [WEB-PROTOCOL-AND-AUTH.md](WEB-PROTOCOL-AND-AUTH.md), [CLIENT-SIDE.md](CLIENT-SIDE.md)).
3. **Validate** — Use Phase 3 in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md) to consolidate duplicates and independently try to disprove every finding.
4. **Report** — Use Phase 4 in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md) to write `REPORT.md` and `FINDINGS-DETAIL.md`.
5. **Structured output** — Use Phase 5 in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md), `report-schema.json`, and `validate-findings.cjs` to write and validate `findings.json`.
6. **Independent verification** — Use Phase 6 in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md) to verify every factual claim and reconcile all outputs.

## Cleanup

Once Phase 6 is complete and all artifacts are written to the output directory, remove the worktree — nothing of value lives inside it:

```
git worktree remove .worktrees/security-audit-run-<N>
```

If `git` refuses because of leftover files, artifacts were written to the wrong place — they belong in the output directory, not the worktree. Move them out, then remove. Keep the output directory: it is the run history that powers the prior-run comparison above. To revisit a past run, re-create the worktree at that run's recorded SHA.

## Anti-Patterns to Avoid

These are the mistakes that make security audits useless:

1. **Listing everything that deviates from OWASP as a finding.** OWASP is a checklist, not a bug list. Every real application makes tradeoffs.
2. **Rating defense-in-depth gaps as HIGH/CRITICAL.** "Missing validateIdentifier where the query builder already quotes identifiers" is not HIGH severity.
3. **Ignoring the deployment model.** Rate limiting at the CDN layer is a valid architecture. Not every app needs application-level rate limiting.
4. **Treating designed behavior as a bug.** Understand the trust model before auditing. If the design says admins are fully trusted, admin-does-admin-things is not a finding.
5. **Padding the report with LOW findings to look thorough.** Ten LOWs don't make a useful report. Three MEDIUMs do.
6. **"Potential" findings without proof.** Either you can exploit it or you can't. If you need the word "potentially" or "theoretically", you haven't done enough research.
7. **Ignoring what the codebase does well.** If auth is solid, say so. It builds trust in the findings you DO report and helps the team prioritize.
8. **Constructing exploits from incorrect parser/runtime assumptions.** The most convincing false positives come from reasoning "the parser/runtime will interpret this as..." without verifying. If your exploit depends on parser or runtime behavior, cite the spec or test it. Don't assume.
9. **Skipping business logic and creative attacks.** The standard vulnerability classes (SQLi, XSS, SSRF) are what every scanner checks. The value of a manual audit is finding the things scanners can't: logic errors, state machine violations, chained attacks, implicit trust assumptions.
10. **Giving up too easily.** "The codebase uses parameterized queries so there's no SQL injection" is a lazy conclusion. Check EVERY use of sql.raw(). Check dynamic identifiers. Check search/FTS. Check if there's a code path that bypasses the query builder. Push.
