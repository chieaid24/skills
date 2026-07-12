# Code comments

## Comment the constraint, not the code

Code states what it does. A comment earns its place only by carrying what the code cannot show:

- A **constraint** the reader would otherwise violate: `// Order matters: the index rebuild reads the old rows.`
- A **non-obvious why**: `// Retry twice, not once. The upstream LB drops the first request after a cold start.`
- A **landmine**: `// Do not lower this below 30s; the vendor rate-limits at 25.`

A comment restating the line under it (`// increment the counter`) costs a line and pays nothing.

## Do not write to the reviewer

The most common failure in agent-authored code is comments addressed to whoever is reading the PR, not whoever reads the file in a year:

- `// Fixed the bug where this returned null`
- `// Changed per review feedback`
- `// New implementation using the v2 client`
- `// This is the correct approach because...`

All of it is noise the moment the PR merges. History belongs in git; the comment belongs to the next reader, who has no idea a PR ever happened.

If a change genuinely needs explaining, the commit body or PR body is where it goes.

## Match the file

Comment density is a property of the codebase, not of the author. A file with no comments is telling you its convention. Adding a running narration to it, however well written, is drift.

Read the neighbors, then write like them.
