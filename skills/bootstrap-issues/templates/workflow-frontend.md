
**Frontend / UI work**
- `DESIGN.md` (repo root) is the **binding design system** - every agent touching UI reads it first and conforms. A request that conflicts with it is flagged, not silently diverged from. It is committed and shared (unlike this gitignored file).
- Evolve the system by re-running the design interview and editing `DESIGN.md` in a PR - never fork design choices per feature.
- If `/impeccable` is installed, drive UI work through it (`/impeccable craft`, `critique`, `polish`, `document`); it auto-loads `DESIGN.md` from the repo root.
