# Inspection

What counts as a finding, how to measure it, and what to leave alone.

Read the screenshot to *suspect*; measure the page to *confirm*. Every entry below names the
measurement that turns the suspicion into a probe. A suspicion you cannot measure is covered under
Eye-only findings at the bottom, and it is a narrow door.

## Defects

Wrong on their own evidence. No design system needed to call them.

**Misalignment.** Elements that share an edge in the layout but not in the render. Measure
`getBoundingClientRect()` on both and compare `left`, `right`, or `top`. Offsets under 0.5px are
subpixel rounding, not findings. Optically centered text inside a button is centered *optically*
-- an icon's bounding box and its glyph rarely agree, so measure the box you actually intend to
align.

**Overflow and clipping.** `scrollWidth > clientWidth` on a container that shows no scrollbar;
text with `text-overflow: ellipsis` where the full string was meant to fit; a child rect extending
past its parent's rect. Check at the narrowest breakpoint, where it always surfaces first.

**Overlap.** Two rects intersecting where the layout implies they should not. Sticky headers over
content on scroll, and modal or toast layers landing under the element they should cover, are the
recurring pair; both read as a `z-index` fight.

**Contrast.** Compute the ratio from `getComputedStyle` foreground against the nearest painted
background. Below 4.5:1 for body text, 3:1 for large text and UI boundaries. Semi-transparent text
over an image is the classic miss -- resolve the composite, not the declared color.

**Target size.** Interactive elements whose rect is below 24x24 CSS px, or 44x44 on touch
viewports. Measure the hit area, which padding can enlarge past the visible glyph.

**Focus visibility.** Tab through every interactive element and confirm a visible `:focus-visible`
indicator. `outline: none` with nothing put back is the single most common accessibility defect in
a styled app.

**Responsive break.** `document.scrollWidth > window.innerWidth` at any breakpoint means horizontal
scroll the design did not ask for. Content that overlaps or truncates only at narrow widths belongs
here too.

**Rhythm.** Gaps between siblings in the same list, grid, or stack that differ from each other
without cause. Measure the gaps and compare; one odd value among many equal ones is a defect, not a
style choice.

**State gaps.** An empty state with no affordance to leave it, a loading state with no skeleton or
spinner, an error state with no message. Reach these through the flow's own error and empty paths.

## Drift

Correct alone, wrong in company. The authority is `DESIGN.md` when it speaks, and the app's
**dominant pattern** when it does not.

**Color.** A computed color outside the role set `DESIGN.md` declares. Literal `#000` or `#fff`,
and untinted neutrals, where the system requires every neutral tinted toward the brand hue.

**Spacing.** Any `padding`, `margin`, or `gap` off the declared spacing scale. This is the highest
yield check in most repos, and it consolidates: one off-scale token usually explains findings across
many flows.

**Type.** A `font-size` off the type scale, steps closer than the declared ratio, body measure past
75ch, or hierarchy carried by color where the system says scale and weight carry it.

**Elevation.** Shadow and border strategies mixed in one interface when the system commits to one.

**Motion.** Layout properties animated rather than `transform` and `opacity`; bounce or elastic
easing where the system specifies ease-out; durations off the declared scale.

**Bans.** `DESIGN.md` may list match-and-refuse patterns -- side-stripe borders, gradient text,
glassmorphism, nested cards, the hero-metric template, identical card grids, em dashes in UI copy.
A ban is binary and needs no judgment.

**Component divergence.** The same semantic control rendered differently across flows: a primary
button 36px tall on one screen and 40px on another, one radius here and another there. Collect the
value from every instance and compare.

## The dominant pattern

When `DESIGN.md` is silent, the correct value is the one most instances already use. Collect the
value across every flow before ruling. A clear majority makes the minority the finding. No
majority means the app never decided, and *you* do not get to decide either: mark the finding
`needs-decision`, defer it, and put the choice in the report for a human.

## What is not a finding

The report's credibility, and the fix loop's time, both depend on this list.

- **Intentional variation.** A destructive action styled unlike a primary action is design, not
  drift. Look for a token, a comment, or a named variant before calling it.
- **Third-party surfaces.** Embedded widgets, payment iframes, and OAuth screens are not yours to
  restyle.
- **Content-authored differences.** Copy length, user-uploaded images, and CMS-driven layout vary
  by data, not by code.
- **Subpixel rounding.** Under 0.5px is the renderer, not the stylesheet.
- **Anything only reachable by redesign.** If clearing the finding means restructuring the screen,
  the finding is `deferred` with a note. That is a decision, not a defect.

## Severity

Rank by what the user loses.

- **HIGH** -- reading or interaction breaks: text clipped past legibility, controls overlapping or
  unreachable, horizontal scroll on a primary flow, contrast below threshold on body text, focus
  invisible for keyboard users.
- **MEDIUM** -- the eye catches it: visible misalignment, a broken rhythm, one control shaped unlike
  its twins, a missing empty or error state.
- **LOW** -- only a measurement catches it: an off-scale value that lands within a pixel or two of
  the scale, a neutral that should have carried a hue tint.

Defects outrank drift at equal visibility. Fix HIGH before anything else, since a fix in a broken
region often clears the MEDIUMs stacked on top of it.

## Eye-only findings

A few real problems resist measurement: an illustration optically heavy on one side, a layout
balanced by geometry but not by mass, hierarchy that reads wrong despite every token being legal.

Record them, mark them `eye-only`, and hand them to a human. Do not send an implementation subagent
after them: with no red probe there is no green, so the loop has no way to know when the fix landed
and no way to stop. The completion criterion is what protects the run, and an unprobeable finding
is outside it.
