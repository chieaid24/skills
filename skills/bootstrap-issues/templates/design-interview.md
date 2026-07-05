# Design system interview

Grill the user until `DESIGN.md` is a set of committed decisions, not defaults. This is the portable
fallback for when `/impeccable` is not installed — it distills impeccable's shared design laws into
an interview. If `/impeccable` **is** installed, run `/impeccable teach` instead (it grills more
thoroughly and writes `PRODUCT.md` + `DESIGN.md`, the same files it later consumes), then skip this.

**How to run it:** one decision at a time, most-consequential first. Push back on the first answer
when it is a category reflex — the goal is a system nobody could guess from the domain alone. Do not
move on from a branch until it is resolved. When every section below has a committed answer, fill
`templates/design-md.md` and write it to the repo root as `DESIGN.md`.

## The reflex test (frame the whole interview)

Before accepting any visual choice, run it twice:
- **First-order:** could someone guess this theme + palette from the category alone? ("fintech →
  navy + gold", "crypto → neon on black"). If yes, it is the training-data reflex — rework it.
- **Second-order:** could someone guess the aesthetic family from category + anti-reference? ("AI
  tool that's not SaaS-cream → editorial-typographic"). If yes, go one tier deeper.

## Questions

Ask these in order. Each maps to a section of `DESIGN.md`.

1. **Register.** Is this **brand** (design leads: marketing, landing, identity) or **product**
   (design serves: app UI, dashboard, tool)? This changes how bold every later answer should be.
2. **Voice & anti-references.** Two or three adjectives for the personality. Then the sharper
   question: name two or three products/sites this must **not** look like. Anti-references do more
   work than references.
3. **Color strategy.** Pick one commitment level before any hue: **restrained** (tinted neutrals +
   one accent ≤10%), **committed** (one saturated color 30–60% of the surface), **full-palette**
   (3–4 named roles), or **drenched** (the surface is the color). Restrained is the product default;
   don't collapse a brand page to it by reflex.
4. **Hue + neutrals.** The accent/brand hue, in OKLCH. Confirm neutrals tint toward it (never pure
   `#000`/`#fff`), and chroma drops near the lightness extremes.
5. **Theme.** Light, dark, or both — but first make the user write the **scene sentence**: who uses
   this, where, under what ambient light, in what mood. If the sentence doesn't force the answer, it
   isn't concrete enough yet; add detail until it does. Reject "dark because tools look cool dark".
6. **Typography.** Heading font and body font (and where they come from). A type scale with ≥1.25
   ratio between steps — refuse a flat scale. Body measure caps at 65–75ch.
7. **Layout & spacing.** A spacing scale, and the rule that spacing varies for rhythm. When does
   content earn a container, and when is a card genuinely the right affordance? (Nested cards never.)
8. **Elevation.** One approach: a shadow scale, or borders, or background tints. Not a mix.
9. **Motion.** Confirm ease-out exponential curves (quart/quint/expo), no bounce/elastic, never
   animating layout properties. Rough durations for micro-interactions vs. transitions.
10. **Bans acknowledged.** Confirm the absolute bans in `DESIGN.md` are accepted as hard rules
    (side-stripe borders, gradient text, default glassmorphism, hero-metric template, identical card
    grids, modal-first, em dashes in copy).

## Output

Write the resolved decisions into `DESIGN.md` at the repo root using `templates/design-md.md`.
Leave the **Components** section as a stub — it fills in as the UI stabilizes, or via
`/impeccable document`. `DESIGN.md` is **committed** (shared by all agents), unlike the gitignored
`CLAUDE.md`/`AGENTS.md`.
