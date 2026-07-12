# READMEs and docs

## Answer the three questions first

A reader landing on a README wants, in this order:

1. **What is this?** One sentence, concrete. Not the philosophy, not the origin story.
2. **Is it for me?** What it does and does not cover, so the wrong reader leaves fast.
3. **How do I run it?** The shortest path from clone to working.

Everything else - design rationale, architecture, contribution guide - sits below that, or in its own file. A README that opens on motivation buries the two facts every visitor came for.

## One document, one job

Mixing modes is the most common way docs rot. Four modes, after Diataxis:

- **Tutorial** - teaches a newcomer by walking them through a working example. Optimizes for confidence, not coverage.
- **How-to** - solves one stated problem for someone who already knows the basics. Optimizes for speed.
- **Reference** - describes the surface exhaustively and dryly. Optimizes for lookup.
- **Explanation** - argues for why the design is the way it is. Optimizes for understanding.

A page that tries to teach, enumerate, and justify at once does none of them. Pick the mode, name it, keep the others out.

Reference sections are where hype and narration creep in hardest. Reference prose should be boring on purpose.

## Code samples are the documentation

For engineer-facing docs, a runnable snippet outperforms the paragraph explaining it. Lead with the snippet, then annotate only what the snippet cannot show.

Every sample must actually run. A sample with an invented flag or a stale API is worse than no sample, because it costs the reader a debugging session before they distrust it.

## Keep it current or delete it

A doc that describes a version that no longer exists actively misleads, and it does so with more authority than silence. When a change invalidates a doc, updating it is part of the change, not a follow-up.

Prefer fewer docs that are true to many that are aspirational.
