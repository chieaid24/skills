---
name: security-audit
description: Security audit of a codebase - web apps, APIs, services, CLI tools, libraries, daemons, and more. Use when asked to find security bugs, do a security review, audit for vulnerabilities, or pen-test the code. Focuses on exploitable issues with real impact, not theoretical concerns or industry-standard behavior.
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

This skill audits a **git worktree** - a disposable checkout pinned to a single commit - so every run examines a clean, reproducible snapshot without touching your working tree, uncommitted changes, or current branch.

**GitHub is the store.** This skill does not keep a local run history. The persistent record is the set of GitHub artifacts the run produces - merged fix PRs, private advisories, and any fallback issues (see [Remediate, verify, and file](#remediate-verify-and-file)); everything written to disk during the run is transient and deleted at cleanup. Each run performs a **full scan** of the whole codebase - it does not read a prior run's output to decide what to look at.

Before starting, establish the worktree and a scratch directory. Both are ephemeral.

1. **Create the worktree.** From inside the target repository, pick the ref to audit - default to the tip of the default branch (`git fetch`, then `origin/main`, or `main`/`master`/`origin/HEAD` as the repo uses); use a user-named branch, tag, or commit if given. Then add it under the repo's own `.worktrees/` directory (never `.claude/worktrees`):
   ```
   git worktree add .worktrees/security-audit <ref>
   ```
   If the target is not a git repository, audit it in place and note that the isolation and reproducibility guarantees do not hold.
2. **Create a scratch directory** for transient artifacts, e.g. `mktemp -d`. Nothing here survives the run.

### Paths

- **Target**: the worktree checkout (`.worktrees/security-audit`). Every Phase 1 and Phase 2 agent reads code from here, not from the live working tree.
- **Scratch directory**: where the transient audit artifacts go. Never write them inside the worktree (they would dirty the checkout) and never commit them anywhere (they carry live vulnerability detail).
- **Fix worktrees** (Phase 7): each confirmed finding gets its own `.worktrees/security-fix-<fp>` branched from the audited ref, where its fix subagent works. Transient like the rest - merged branches auto-delete, and cleanup removes the worktrees.

Transient files written to the scratch directory during the run:
- `architecture.md` - Phase 1 output, fed into Phase 2 agent prompts
- `findings.json` - machine-readable structured output (Phase 5); the input Phase 7 remediation reads to route and fix, and the fallback filer reads for any finding whose fix failed
- `REPORT.md` / `FINDINGS-DETAIL.md` - optional human-readable report (Phase 4). Since the GitHub artifacts are the durable record, produce these only if you want a one-off summary for the current run; they are deleted at cleanup like everything else.

Subagents in Phases 1, 2, 3, 6, and 8 do NOT write files - they return results to you via the Task tool. The Phase 7 fix subagents are the exception: each writes its fix into its own fix worktree. You are responsible for writing the transient scratch files.

### Coverage

Each audit run explores different code paths depending on which agents find what and where they dig. No single run finds everything. Testing shows the best single run finds roughly half the total vulnerabilities across multiple runs, so running periodically (e.g. weekly) and on a fresh checkout each time is expected.

Because GitHub is the store, the only prior state consulted is at **delivery time**: a finding whose fix is already open or merged as a PR, or already tracked by an open issue or existing advisory, is skipped, so repeated runs do not re-fix or duplicate. Dedup skips only *delivered* fixes, never live bugs - a vulnerability a fix failed to close reappears in the next full scan. It does not reopen closed issues or auto-close fixed ones - on a small repo, triage those by hand. The hunt itself always runs full; it does not try to skip ground a previous run covered.

## Core Principles

### Only report what you can exploit

Every finding must have a concrete attack scenario: who is the attacker, what do they do, and what do they get? "An attacker could theoretically..." is not a finding. "Send this request, get this result" is.

### Confirm dynamically when you can

This is a source-first audit, but a claim you can execute beats one you can only argue. Where the target is locally buildable - a parser, a library, a CLI, a native component - build and run it: reproduce the crash, run the payload, diff the two parsers on the same bytes. Better still, **extract the suspect code into a minimal standalone harness** and test the hypothesis in isolation - fuzz the one function, feed it the crafted input, watch what it does. Where confirmation needs infrastructure you don't have - a proxy chain, a live cache, production auth - you cannot confirm from source alone: mark it "requires deployment testing" and do not report it as confirmed. Dynamic evidence is what resolves the memory-safety and request-framing classes that static reading leaves ambiguous.

### Determine the baseline dynamically

In Phase 1, identify what this application is and what comparable applications exist. Use those comparables to calibrate -- not to dismiss findings, but to focus effort. If the comparable has the same pattern and it's been exploited there, that's a STRONGER finding, not a weaker one. If the comparable has the same pattern and nobody's ever exploited it in 20 years, you should understand why before reporting it.

Do NOT hardcode a specific comparable. A CMS gets compared to other CMSes. An API gateway gets compared to other API gateways. A novel application may have no meaningful comparable.

### Defense-in-depth gaps are not vulnerabilities

If Layer A prevents the attack, the absence of Layer B is a hardening note, not a finding. Report it separately if you want, but do not inflate its severity.

### Severity requires impact

Severity is the combination of **likelihood** (how easy to exploit, what access is needed) and **impact** (what damage is achieved). Use both axes:

- **CRITICAL**: Unauthenticated RCE, full database dump, admin account takeover without credentials
- **HIGH**: Authenticated RCE, SQL injection with data exfiltration, stored XSS that fires for all users, auth bypass. Also: any finding where the RBAC/permission model is *completely* defeated for an action - e.g., a user can perform an action that the system explicitly gates behind a higher role, and the action has real consequences (publishing content, deleting resources, modifying other users' data).
- **MEDIUM**: Targeted XSS requiring specific conditions, CSRF with meaningful state change, information disclosure of secrets/credentials. Also: business logic bypasses with real but limited consequences - e.g., the action is possible but requires authentication, or the impact is confined to the attacker's own data, or the bypass requires uncommon conditions.
- **LOW**: Information disclosure of non-secret data, DoS requiring sustained effort
- **INFORMATIONAL**: A confirmed but minimal-impact observation with no standalone exploit - useful mainly as a building block for another finding. Pure defense-in-depth gaps belong in hardening notes, not here.

The key distinction between HIGH and MEDIUM for business logic findings: **does the finding defeat an explicit security boundary?** Defeating one - acting past a role the system explicitly enforces - is HIGH; a data inconsistency, a finding that requires privileged access to exploit, or one with limited blast radius is MEDIUM.

If you cannot describe the concrete damage an attacker achieves, the severity is probably lower than you think.

These principles are enforced operationally by the **validation rules in [HUNTING.md](HUNTING.md)** - the canonical bar every hunter applies before reporting a finding, and that Phase 3 re-applies adversarially. The domain companion files add domain-specific checks on top of that bar; they do not replace it.

## Workflow overview

Follow all eight phases in order:

1. **Recon** - Run Phase 1 from [RECONNAISSANCE.md](RECONNAISSANCE.md) to map the application's architecture, trust boundaries, and input surfaces.
2. **Hunt** - Use [HUNTING.md](HUNTING.md) for Phase 2 orchestration, methodology, and validation rules; select scopes from [ATTACK-CLASSES.md](ATTACK-CLASSES.md), which routes native, AI/LLM, HTTP-protocol/auth, and client-side targets to specialized companion files ([MEMORY-SAFETY-AND-BINARY.md](MEMORY-SAFETY-AND-BINARY.md), [AI-AND-LLM.md](AI-AND-LLM.md), [WEB-PROTOCOL-AND-AUTH.md](WEB-PROTOCOL-AND-AUTH.md), [CLIENT-SIDE.md](CLIENT-SIDE.md)).
3. **Validate** - Use Phase 3 in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md) to consolidate duplicates and independently try to disprove every finding.
4. **Report** - Use Phase 4 in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md) to write `REPORT.md` and `FINDINGS-DETAIL.md`.
5. **Structured output** - Use Phase 5 in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md), `report-schema.json`, and `validate-findings.cjs` to write and validate `findings.json`.
6. **Independent verification** - Use Phase 6 in [VALIDATION-AND-REPORTING.md](VALIDATION-AND-REPORTING.md) to verify every factual claim and reconcile all outputs.
7. **Remediate** - Use Phase 7 in [REMEDIATION.md](REMEDIATION.md) to dispatch one fix subagent per confirmed finding on its own branch, routing delivery by the disclosure split.
8. **Verify** - Use Phase 8 in [REMEDIATION.md](REMEDIATION.md) to re-run each finding's exploit against the patched code with an independent verifier, so only proven fixes merge.

## Remediate, verify, and file

Phases 7 and 8 ([REMEDIATION.md](REMEDIATION.md)) fix each confirmed finding on its own branch and prove the fix before it merges. `findings.json` (in the scratch directory) is the input; `file-findings.cjs` (in this skill's directory) is now the **fallback** filer and the advisory vehicle, run **before cleanup deletes the scratch directory**.

Route every confirmed finding by `overall_severity` - this split is the whole safety mechanism:

- **informational / low / medium** -> a **public fix PR**. The agent fixes the finding on a branch, an independent verifier proves the vulnerability is gone (Phase 8), and the PR auto-merges through the CI `test` gate. The PR body is deliberately neutral - intended behavior only, no description, trace, preconditions, exploitation steps, payloads, or severity words. If the fix fails or cannot be verified, it falls back to a **public issue** (labelled `ready` + `afk`) with that same neutral body, so an autonomous worker (e.g. the `start-next-issue` flow) can pick it up.
- **high / critical** -> a **private GitHub Security Advisory** with the complete finding, and the fix developed in the advisory's **temporary private fork** as a private PR for a human to review, publish, and merge. **No public issue and no public PR is ever filed.**

Why the split: on a public repo the fix diff itself discloses the vulnerability, so a HIGH/CRITICAL must go through coordinated disclosure (advisory + fix published together), never a public artifact that broadcasts an unpatched hole. LOW/MEDIUM disclosure is the accepted tradeoff of fixing the bug in the open. The severity gate is the whole safety mechanism - do not widen the public path for a public repo.

`file-findings.cjs` is **idempotent** and this is what makes GitHub the store: each artifact embeds a fingerprint marker (`AUDIT-FINDING:<fp>`) derived from the trace's file+function locations (line-independent, so it survives code drift) plus the title. Phase 7 skips any finding whose fix PR is already open or merged; the filer skips any finding already tracked by an open issue or existing advisory. So a weekly re-scan neither re-fixes nor duplicates. Neither reopens closed items nor closes fixed ones - triage the open queue by hand on a small repo.

For the fallback subset (findings whose fix failed) and the high/critical advisories, invoke the filer directly. ALWAYS dry-run first and read the public bodies it prints - confirm no exploit detail leaked through free-text fields:

```
node <skill-dir>/file-findings.cjs <scratch-dir>/findings.json --repo <owner/name> --assignee <human> --dry-run

# then file for real, capturing the GHSA ids Phase 7 needs to build private forks
node <skill-dir>/file-findings.cjs <scratch-dir>/findings.json --repo <owner/name> --assignee <human> --emit-map <scratch-dir>/filed.json
```

`--emit-map` writes a JSON array of `{fp, kind, ref}` for every artifact filed, so Phase 7 reads a high/critical finding's GHSA id deterministically instead of scraping stdout. Requires the `gh` CLI authenticated with repo access; filing advisories needs the security-advisories API enabled (default on public repos). The target repo must be bootstrapped for the queue - `ready`/`afk` labels, the CI `test` gate, branch protection, and auto-merge (see the `bootstrap-issues` flow). Run `--help` for all options (`--issue-label`, `--min-confidence`, `--verbatim-titles`).

## Cleanup

Once the fixes are delivered, verified, and any fallback subset filed, tear down everything transient - GitHub now holds the durable record (merged fix PRs, advisories, fallback issues):

```
git worktree remove .worktrees/security-audit
git worktree remove .worktrees/security-fix-*   # every per-finding fix worktree
rm -rf <scratch-dir>
```

Merged low/medium fix branches auto-delete (delete-branch-on-merge); the unmerged private-fork PRs are intentionally left for a human to publish. Nothing else persists locally. To re-examine, run the audit again against the same ref.

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
