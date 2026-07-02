# Repository guidance

This repository publishes portable Agent Skills for Codex, Claude Code, and other clients that
implement the open Agent Skills standard.

## Structure

- Store each skill at `skills/<skill-name>/SKILL.md`.
- Keep the frontmatter limited to `name` and `description` for cross-platform compatibility.
- Keep skill names in lowercase kebab-case and identical to their directory names.
- Put reusable templates, scripts, references, and assets inside the skill that owns them.
- Do not add provider-specific behavior unless the skill detects the provider and has a portable
  fallback.

## Verification

Run both checks before committing changes to a skill or the distribution layout:

```bash
node scripts/validate-skills.mjs
npx -y skills add . --list
```

Confirm every directory under `skills/` appears in the Skills CLI output. Update `README.md` when
installation requirements, skill names, or supported platforms change.
