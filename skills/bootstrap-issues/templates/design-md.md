# Design system

The binding design system for this repo. **Every agent making a frontend or UI change reads this
file first and conforms to it.** It is the source of truth for look and feel: when a request
conflicts with a decision here, flag the conflict instead of silently diverging. Evolve the system
by re-running the interview and editing this file in a PR, never by forking choices per feature.

If `/impeccable` is installed it auto-loads this file from the repo root - keep it here, named
`DESIGN.md`, so that path keeps working.

## Register

<brand | product> - one line on the relationship: does design lead the product (marketing, landing,
identity) or serve it (app UI, dashboard, tool)?

## Voice & tone

- Personality: <2-3 adjectives>
- Anti-references: <what this must NOT look or feel like - name the cliches to avoid>

## Color

- Strategy: <restrained (tinted neutrals + one accent <=10%) | committed (one saturated color 30-60%
  of surface) | full-palette (3-4 named roles) | drenched (surface IS the color)>
- Space: OKLCH. Reduce chroma near lightness 0/100. Never `#000` or `#fff`; tint every neutral
  toward the brand hue (chroma ~0.005-0.01).
- Roles:
  - Background: `oklch(...)`
  - Surface: `oklch(...)`
  - Text / muted text: `oklch(...)` / `oklch(...)`
  - Border: `oklch(...)`
  - Accent: `oklch(...)` - used for <...>
  - <extra named roles for full-palette / committed>
- Semantic: success / warning / danger `oklch(...)`
- Theme: <light | dark | both>. Scene sentence (must force the choice): "<who uses this, where,
  under what ambient light, in what mood>".

## Typography

- Heading / display font: <font, source>
- Body font: <font, source>
- Scale + ratio: <steps, >=1.25 between steps - no flat scale>
- Body measure: 65-75ch
- Hierarchy comes from scale + weight contrast, not color alone.

## Layout & spacing

- Spacing scale: <tokens, e.g. 4 / 8 / 12 / 16 / 24 / 32 / 48>
- Rhythm: vary spacing deliberately; uniform padding everywhere is monotony.
- Container policy: <when content gets a container; most things don't need one>
- Cards: <when a card is genuinely the best affordance>. Nested cards are always wrong.
- Breakpoints: <...>

## Elevation

<shadow scale, or border/tint strategy if flat>. State the one approach; don't mix.

## Motion

- Easing: ease-out with an exponential curve (quart / quint / expo). No bounce, no elastic.
- Never animate CSS layout properties.
- Durations: <e.g. 120ms micro, 240ms transitions>.

## Components

Canonical patterns as they stabilize (buttons, inputs, selects, tabs, toasts, empty states, ...).
Fill in here, or run `/impeccable document` to generate this section from the code.

## Absolute bans (match-and-refuse)

If you are about to write one of these, restructure the element instead.

- Side-stripe borders (`border-left`/`border-right` > 1px as a colored accent).
- Gradient text (`background-clip: text` + gradient background).
- Glassmorphism as a default.
- The hero-metric template (big number, small label, supporting stats, gradient accent).
- Identical card grids (same-sized icon + heading + text, repeated).
- Modal as the first thought - exhaust inline / progressive alternatives.
- Em dashes in UI copy (and `--`).

## The AI slop test

Ship nothing that reads as "AI made that". Avoid the first-order category reflex (domain -> obvious
theme + palette: "observability -> dark blue", "healthcare -> white + teal") and the second-order
reflex (category + anti-reference -> obvious aesthetic family). If the look is guessable from the
domain, rework the scene sentence and color strategy until it isn't.
