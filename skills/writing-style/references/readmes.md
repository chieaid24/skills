# READMEs

## Answer the three questions first

A reader landing on a README wants, in this order:

1. **What is this?** One sentence, concrete. Not the philosophy, not the origin story.
2. **Is it for me?** What it does and does not cover, so the wrong reader leaves fast.
3. **How do I run it?** The shortest path from clone to working.

Everything else - design rationale, architecture, contribution guide - sits below that, or in its own file. A README that opens on motivation buries the two facts every visitor came for.

## A README is a front door, not a manual

The failure mode is a README that tries to be four documents at once. After Diataxis, prose has four jobs, and they pull against each other:

- **Tutorial** - walks a newcomer through a working example. Optimizes for confidence.
- **How-to** - solves one stated problem fast, for someone who already knows the basics.
- **Reference** - describes the surface exhaustively and dryly. Optimizes for lookup.
- **Explanation** - argues why the design is the way it is. Optimizes for understanding.

A README is the front door: enough to orient and to get running, with links out to the rest. When it grows an exhaustive API table and a design essay, split those out rather than letting the entry point sink under them.

Any reference material that does stay is where hype and narration creep in hardest. Reference prose should be boring on purpose.

## Code samples are the documentation

For engineer-facing docs, a runnable snippet outperforms the paragraph explaining it. Lead with the snippet, then annotate only what the snippet cannot show.

Every sample must actually run. A sample with an invented flag or a stale API is worse than no sample, because it costs the reader a debugging session before they distrust it.

## Keep it current or delete it

A README describing a version that no longer exists actively misleads, and it does so with more authority than silence. When a change invalidates the README, updating it is part of that change, not a follow-up.

Prefer a short README that is true to a thorough one that is aspirational.
