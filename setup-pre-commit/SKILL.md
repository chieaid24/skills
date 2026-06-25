---
name: setup-pre-commit
description: Set up stack-aware pre-commit hooks — format, lint, and test before every commit. JS/TS via Husky + lint-staged + Prettier; Python via the pre-commit framework (ruff); Rust/Go via a tracked git hook (fmt + lint + test). Use when the user wants pre-commit hooks, commit-time formatting/typechecking/testing, or when bootstrap-issues wires up a repo.
---

# Setup Pre-Commit Hooks

Installs a pre-commit hook that runs **format → lint → test** before every commit, adapted to the repo's stack. Runs standalone or is called by `bootstrap-issues` during repo bootstrap so every committed change is formatted, linted, and tested locally before it reaches the CI `test` gate.

The hook config is **committed** (shared with every agent). Husky self-installs via its `prepare` script on `npm install`; every other stack needs a one-time activation command per fresh clone — see step 4.

## 1. Detect the stack

Same marker files as `bootstrap-issues` (check the repo root or the obvious project subdir):

| Marker | Stack | Format | Lint | Test |
|---|---|---|---|---|
| `package.json` | JS/TS | Prettier | eslint (if present) | `<pm> test` |
| `pyproject.toml` / `requirements.txt` | Python | `ruff format` | `ruff` | `pytest` |
| `Cargo.toml` | Rust | `cargo fmt` | `cargo clippy` | `cargo test` |
| `go.mod` | Go | `gofmt` | `go vet` | `go test ./...` |

Monorepo, or the test command / project dir is ambiguous (tests in a subdir like `backend/`) → ask the user. **Omit any lint/test step whose tool or script isn't present** and tell the user what you skipped.

## 2. Set up the hook (per stack)

### JS/TS — Husky + lint-staged + Prettier

1. Detect the package manager: `package-lock.json`→npm, `pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `bun.lockb`→bun. Default to npm.
2. Install as devDependencies: `husky lint-staged prettier`.
3. `npx husky init` — creates `.husky/` and adds `"prepare": "husky"` to package.json. The `prepare` script auto-installs the hook on every `npm install`, so JS/TS needs **no** per-clone activation.
4. Write `.husky/pre-commit` (no shebang for Husky v9+; swap `npm` for the detected PM; omit a line whose script is missing):
   ```
   npx lint-staged
   npm run typecheck
   npm run test
   ```
5. `.lintstagedrc`:
   ```json
   { "*": "prettier --ignore-unknown --write" }
   ```
   If eslint is configured, add a line: `"*.{js,jsx,ts,tsx}": "eslint --fix"`.
6. `.prettierrc` — **only if no Prettier config already exists**:
   ```json
   {
     "useTabs": false,
     "tabWidth": 2,
     "printWidth": 80,
     "singleQuote": false,
     "trailingComma": "es5",
     "semi": true,
     "arrowParens": "always"
   }
   ```

### Python — the pre-commit framework

1. Install `pre-commit` (`pip install pre-commit`, or as a dev dependency / via `uv`/`pipx`).
2. Write `.pre-commit-config.yaml` (pin `rev` to the latest ruff release):
   ```yaml
   repos:
     - repo: https://github.com/astral-sh/ruff-pre-commit
       rev: v0.6.9
       hooks:
         - id: ruff           # lint
           args: [--fix]
         - id: ruff-format    # format
     - repo: local
       hooks:
         - id: pytest
           name: pytest
           entry: pytest -q
           language: system
           pass_filenames: false
           stages: [pre-commit]
   ```
   Drop the `pytest` hook if the repo has no tests.
3. `pre-commit install` — writes `.git/hooks/pre-commit` (**per-clone activation**, step 4).

### Rust / Go — tracked git hook

`.git/hooks` isn't shared, so commit the hook under `.githooks/` and point git at it.

1. Write `.githooks/pre-commit` and `chmod +x` it.

   Rust:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   cargo fmt --all -- --check
   cargo clippy --all-targets --all-features -- -D warnings
   cargo test
   ```
   Go:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   test -z "$(gofmt -l .)" || { echo "run gofmt -w ."; exit 1; }
   go vet ./...
   go test ./...
   ```
2. `git config core.hooksPath .githooks` (**per-clone activation**, step 4).

## 3. Verify

Exercise the hook without committing, and fix config until it passes clean:
- JS/TS: stage a file, then `npx lint-staged`.
- Python: `pre-commit run --all-files`.
- Rust/Go: run `.githooks/pre-commit` directly.

## 4. Activation per clone — record it in the docs

Husky self-installs via `prepare`; every other stack needs one command after a fresh clone. Add it to the repo's contributor docs (`README` and/or `CLAUDE.md` — which `AGENTS.md` symlinks to) so agents enable the hook:
- Python: `pre-commit install`
- Rust/Go: `git config core.hooksPath .githooks`

`git config` and `.git/hooks` are shared across a repo's worktrees, so a single activation covers every worktree — only a brand-new clone re-runs it.

## 5. Commit

Stage the created/changed files and commit `chore: add pre-commit hooks (format + lint + test)`. The commit runs through the new hook — a built-in smoke test that it works.

## Notes

- Order is **format → lint → test**: cheap staged-only work first, full test suite last.
- **Idempotent:** skip a config file that already exists (`.prettierrc`, `.pre-commit-config.yaml`, `.githooks/pre-commit`); re-running just re-verifies.
- Husky v9+ hook files need no shebang; `prettier --ignore-unknown` skips files it can't parse (images, etc.).
- Called by `bootstrap-issues` so the local gate mirrors the CI `test` gate — keep the hook's test command consistent with the CI workflow's.
