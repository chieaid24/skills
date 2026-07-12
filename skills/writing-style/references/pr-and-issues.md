# PR and issue bodies

## The diff already says what

A reviewer can read the diff. They cannot read why you wrote it. Spend the body on the reasoning the code cannot carry: the constraint you were working under, the approach you rejected, the risk you are asking them to weigh.

A PR body that narrates the diff file by file is **restatement** at scale, and it trains reviewers to skip bodies.

## Shape

```markdown
<one paragraph: what changed and why, outcome first>

## Approach            <- only if a reader would ask "why this way?"
<the decision and the alternative you dropped>

## Verification
<what you ran, and what it showed>

## Risk                <- only if there is one
<what could break, and the blast radius>
```

Sections are optional and earn their place. A one-line fix gets a one-line body. Reaching for the full skeleton on a typo fix is padding.

## Title

The title is the line most people read and the only line some people read. Same rule as a commit subject: imperative, specific, no type-and-scope noise beyond what the repo convention requires.

`fix(auth): treat expiry as exclusive` beats `fix(auth): fix bug in auth middleware`.

## Verification is not a promise

`Tests pass` is a claim with no evidence and no information. Say what you ran and what happened: `pytest tests/auth: 34 passed. Reproduced the 401 against staging, confirmed the fix clears it.`

If a change has no runtime surface you could exercise, say that plainly rather than implying coverage you do not have.

## Issue bodies

An issue is a request for work, so it is written for whoever picks it up cold - possibly an agent, with no memory of the conversation that produced it.

State the observable problem, the expected behavior, and how to reproduce or where to look. Leave the solution open unless the solution is the point; an issue that prescribes an implementation forecloses the thinking the assignee is there to do.
