# Commit messages

## Subject

Conventional Commits, lowercase, imperative: `fix(auth): treat token expiry as exclusive`.

The subject completes the sentence "applying this commit will...". If you cannot finish that sentence, the commit is doing more than one thing and wants splitting.

Name the actual change, not its category. `refactor(parser): collapse three visitors into one` says something; `refactor(parser): clean up code` does not.

Keep it under ~72 characters so it survives `git log --oneline` and every tool that truncates.

## Body

Most commits do not need one. Add a body when the change carries information the diff cannot:

- **Why now** - the bug report, the constraint, the incident that forced it.
- **Why this way** - the approach you rejected and what ruled it out.
- **What to watch** - a migration step, a behavior change downstream, a follow-up left undone.

A body that walks the diff hunk by hunk is noise. The diff is right there.

Wrap at 72 columns. Separate from the subject with a blank line.

## One logical unit per commit

A commit is the unit someone will later revert, bisect to, or cherry-pick. Each one should leave the tree working and do exactly one thing. A commit mixing a rename, a bug fix, and a dependency bump cannot be reverted without collateral damage, and that cost lands on whoever is debugging at 2am, not on you.
