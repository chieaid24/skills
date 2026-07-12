# Remediation and Verification

Phases 7 and 8 turn each confirmed finding into a delivered fix and then prove the vulnerability is gone. They run inside the audit, while you still hold the full finding, instead of handing a scrubbed issue to a cold worker who never sees the trace, the PoC, or the intended patch.

**Precondition: the target repo is bootstrapped for the agent queue** (see `bootstrap-issues`) - `ready`/`afk` labels, a CI `test` check, branch protection requiring `test`, and auto-merge + delete-branch-on-merge. The fix PR proves itself against that `test` gate; without it there is nothing to merge against. If the repo is not bootstrapped, stop and bootstrap it first.

Input is the verified `findings.json` from Phase 6. Route every confirmed finding by `overall_severity` using the exact disclosure split defined in SKILL.md ("Remediate, verify, and file"): **low / medium / informational** fixes land in a **public PR**; **high / critical** fixes are developed in a **private advisory fork** and left for a human to publish. The split is the whole safety mechanism - a public fix diff for a high/critical on a public repo discloses the unpatched hole. Never widen the public path.

## Phase 7: Remediate

One fix subagent per confirmed finding, dispatched in parallel like the Phase 2 hunters. Each fix is isolated so parallel subagents never collide.

**Isolate each fix.** For a finding with fingerprint `<fp>` (the same `AUDIT-FINDING:<fp>` marker `file-findings.cjs` computes), branch from the audited base ref into its own worktree:

```
git worktree add -b security-fix/<fp> .worktrees/security-fix-<fp> <base-ref>
```

The base ref is the commit the audit ran against, so the fix and its regression test are written against the exact code the finding describes.

**Dedup against already-delivered fixes.** Before dispatching, skip any finding whose fix is already open or merged - the marker rides in the PR body, so a weekly re-scan does not re-fix:

```
gh pr list --repo <owner>/<repo> --state all --search "AUDIT-FINDING:<fp>" --json number
```

A non-empty result means skip this finding. (Dedup skips only *delivered* fixes, never live bugs: a vulnerability that was never fixed reappears in the next full scan.)

**Fix subagent prompt.** Use a `general` agent and give it the **complete finding JSON** - the branch is private until it merges, so full `trace`, `execution`, and `remediation` detail is exactly what it needs to fix precisely:

```
You are fixing one confirmed security finding on an isolated branch. Full finding JSON below.

Work only inside your worktree: <worktree-path> (branch security-fix/<fp>).

1. Write the MINIMAL fix. Start from remediation.strategy and
   remediation.code_changes[].fixed_code; adapt them to the real code. Change only
   what closes the vulnerability. No drive-by refactors.

2. Add a regression test that goes RED then GREEN: it must FAIL against the code as it
   was (the vulnerability reproduces, derived from execution.payloads / instructions) and
   PASS once your fix is in. If you cannot make it fail before your fix, you have not
   reproduced the finding. Say so rather than writing a test that never exercised the bug.

3. Run the repo's full test suite. It must be green. Your fix must not regress anything.

4. Commit with NEUTRAL text: describe the change as intended behavior ("bind the session
   token to the request origin"), never the attack. No payloads, no exploit steps, no
   severity words. For a low/medium finding this branch becomes a PUBLIC PR whose words
   an attacker can read. The diff carries the fix; the prose carries nothing usable.

Return: the branch name, the files changed, the regression test's name, and the
red-then-green evidence (the test output before and after your fix).
```

**Deliver by severity.**

- **Low / medium / informational: public PR.** Push the branch and open a PR with a neutral body that carries the marker, then let the `test` gate merge it:

  ```
  git -C .worktrees/security-fix-<fp> push -u origin security-fix/<fp>
  gh pr create --repo <owner>/<repo> --head security-fix/<fp> \
    --title "<neutral title>" --body "<neutral summary>

  <!-- AUDIT-FINDING:<fp> -->"
  gh pr merge security-fix/<fp> --squash --auto
  ```

- **High / critical: private advisory fork.** File the advisory first and capture its GHSA id deterministically with `file-findings.cjs --emit-map` (it writes the id to a JSON map instead of stdout you have to scrape). Then create the advisory's temporary private fork, push the fix there, and open a PR **in the fork** for a human to review, publish, and merge:

  ```
  node <skill-dir>/file-findings.cjs <scratch>/findings-highcrit.json \
    --repo <owner>/<repo> --assignee <human> --emit-map <scratch>/filed.json
  # read the ghsa for <fp> from <scratch>/filed.json, then:
  fork=$(gh api -X POST /repos/<owner>/<repo>/security-advisories/<ghsa>/forks --jq .full_name)
  git -C .worktrees/security-fix-<fp> push "https://github.com/$fork.git" security-fix/<fp>
  gh pr create --repo "$fork" --head security-fix/<fp> --title "<neutral title>" \
    --body "Fix for advisory <ghsa>. <!-- AUDIT-FINDING:<fp> -->"
  ```

  Do **not** auto-merge or publish - publishing the advisory (and assigning any CVE) is the human's coordinated-disclosure decision. If the forks API errors (the repo lacks the security-advisories fork capability), keep the advisory, skip the fork, and flag in the report that the high/critical fix needs a human to open the private fork from the advisory UI.

## Phase 8: Verify (the re-scan)

Every fix gets an **independent** verifier subagent - one that did not write the fix, so it cannot rubber-stamp its own blind spots. This is the re-scan that proves the change worked, not merely that it compiled.

Launch one `research` verifier per fix, in parallel. Give each the finding JSON and its fix branch:

```
You are an independent verifier. You did NOT write this fix. Prove the vulnerability is
gone, or prove it is not.

Check out branch security-fix/<fp> in <worktree-path>.

1. Re-run the original exploit. Using the finding's execution PoC, attempt to reproduce the
   vulnerability against the PATCHED code. Confirm dynamically where the target is buildable
   (build it, run the payload) rather than arguing from the source. It must now FAIL to
   reproduce.

2. Confirm the regression test is real: it goes RED on the base ref and GREEN on the fix.
   A test that passes on both never exercised the bug.

3. Run the full suite. It must be green. No regression.

Return exactly one:
- "FIXED: [the PoC no longer reproduces; regression test red then green; suite green, with evidence]"
- "NOT-FIXED: [the PoC still reproduces, or the regression test never went red, with evidence]"
- "REGRESSION: [the fix broke the suite or other behavior, with evidence]"
```

Act on the verdict:

- **FIXED**: let the delivery from Phase 7 stand (the public PR auto-merges through the `test` gate; the private fork PR waits for its human).
- **NOT-FIXED / REGRESSION**: the fix failed. Close the PR, remove the fix worktree and branch, and add the finding to a **fallback set**. After the loop, file the fallback set with `file-findings.cjs` (its normal issue/advisory path) so the work is tracked instead of lost - this is the replace-filing fallback.

The per-fix verifier is the immediate proof. The **weekly full re-scan is the codebase-level backstop**: because dedup skips only delivered fixes, any vulnerability a fix failed to close reappears in the next run and gets another attempt.
