# Capture

A screenshot the agent cannot reproduce is not evidence. Everything here exists to make the same
flow produce the same bytes twice, so that a difference means the UI changed and nothing else.

## Pick the driver

In order:

1. **The repo already runs Playwright** (`playwright.config.*`). Drive it. Reuse its `baseURL`, its
   `webServer` block (so the dev server starts the way the repo starts it), its `storageState` or
   auth fixture, and its `projects` as your viewport and theme matrix. Add a project for capture
   rather than editing theirs.
2. **The repo already runs Cypress** (`cypress.config.*`). Drive it, reusing `baseUrl`, session
   setup, and viewport presets. `cy.screenshot()` for shots, `cy.window()` for probes.
3. **Neither.** Install Playwright with headless Chromium and script the flows yourself:
   ```
   npm i -D @playwright/test && npx playwright install --with-deps chromium
   ```
   Discover the dev-server command and port from the package manifest, `AGENTS.md`, or CI.

Reusing the repo's config matters more than the tool. Auth and dev-server startup are already
solved there; re-solving them is where these runs fail.

## Pin the page

Apply all of these before the first screenshot. Each removes one source of frame-to-frame variance.

**Motion.** Freeze it at both layers, since a transition mid-flight shifts every rect a probe reads:

```js
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.addStyleTag({ content: `*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}` });
```

**Fonts.** A screenshot taken before webfonts settle measures the fallback face:
`await page.evaluate(() => document.fonts.ready)`.

**Images and lazy content.** Scroll to the bottom, wait for network idle, scroll back to the top,
then assert every `img` reports `complete && naturalWidth > 0`. Lazy-loaded content that arrives
after the shot reads as a layout defect that does not exist.

**Time and randomness.** Pin `Date.now()` and `Math.random` through an init script, before any app
code runs. A relative timestamp ("3 minutes ago") that ticks between the two captures will fail the
determinism gate for the rest of the run.

**Dynamic content.** Intercept the network (`page.route`) and serve fixtures. Where the repo's E2E
specs already seed data, seed it the same way -- divergent seed data produces divergent screenshots
and phantom drift findings.

**Geometry.** Fixed viewport per project, `deviceScaleFactor: 1`. Take shots with
`{ fullPage: true, animations: 'disabled', caret: 'hide' }`.

## The determinism gate

Capture every flow twice and compare the bytes. Identical: inspect. Different: the difference is
in your capture, not the UI. Bisect it against the list above -- an unpinned clock and an
unsettled font account for most of it -- and pin the source before inspecting. Inspecting an
unstable capture manufactures findings that no fix can clear, and the fix loop will thrash against
them until the cap stops it.

## Probes

A probe reproduces one finding as a measurement. It reads geometry or computed style from the live
page, fails while the finding stands, and passes once the fix lands. It is the reason a fix can be
verified without a human looking at anything.

Write each probe as a test in the repo's own runner, so the fix loop and CI run the same
assertion:

```js
// e2e/ui-audit/UA-004.spec.ts
// red: submit button left edge sits 3px right of the input above it
import { test, expect } from '@playwright/test';

test('UA-004: submit aligns with the email input', async ({ page }) => {
  await page.goto('/signup');
  const input = await page.getByLabel('Email').boundingBox();
  const submit = await page.getByRole('button', { name: 'Create account' }).boundingBox();
  expect(Math.abs(input.x - submit.x)).toBeLessThanOrEqual(0.5);
});
```

Rules that keep probes honest:

- **Select by role, label, or visible text.** Reach for `data-testid` only when the element exposes
  no stable accessible handle, and add the attribute as part of the fix.
- **Assert the rule, not the current pixel.** `toBeLessThanOrEqual(0.5)` on a shared edge, or
  `expect(SPACING_SCALE).toContain(paddingTop)`. A probe hard-coded to today's number goes red the
  next time the design system legitimately moves.
- **Tolerate subpixel.** Compare geometry at 0.5px; browsers round differently across platforms.
- **One probe, one finding.** Its id matches the ledger entry, so a red probe names the finding.
- **A probe that passes before the fix is not a probe.** Run it against the unfixed page and watch
  it go red first. A probe that was never red proves nothing, and a subagent that "fixes" a finding
  by loosening its own probe has produced exactly that.

Probes ship with their fix under `e2e/ui-audit/`, which is what stops a cleared finding from
quietly returning.
