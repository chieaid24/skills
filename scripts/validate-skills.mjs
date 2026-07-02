#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";

const root = new URL("../skills/", import.meta.url);
const entries = await readdir(root, { withFileTypes: true });
const skillDirectories = entries.filter((entry) => entry.isDirectory()).sort((a, b) =>
  a.name.localeCompare(b.name),
);
const errors = [];

if (skillDirectories.length === 0) {
  errors.push("skills/: no skill directories found");
}

for (const directory of skillDirectories) {
  const fileUrl = new URL(`${directory.name}/SKILL.md`, root);
  let source;

  try {
    source = await readFile(fileUrl, "utf8");
  } catch {
    errors.push(`skills/${directory.name}: missing SKILL.md`);
    continue;
  }

  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    errors.push(`skills/${directory.name}/SKILL.md: malformed frontmatter`);
    continue;
  }

  const fields = new Map();
  for (const [index, line] of match[1].split(/\r?\n/).entries()) {
    const field = line.match(/^([a-z][a-z0-9-]*):\s*(.+)$/);
    if (!field) {
      errors.push(
        `skills/${directory.name}/SKILL.md:${index + 2}: expected a single-line YAML field`,
      );
      continue;
    }
    fields.set(field[1], field[2]);
  }

  for (const field of fields.keys()) {
    if (!new Set(["name", "description"]).has(field)) {
      errors.push(`skills/${directory.name}/SKILL.md: unsupported frontmatter field '${field}'`);
    }
  }

  let name = fields.get("name");
  let description = fields.get("description");

  if (!name) errors.push(`skills/${directory.name}/SKILL.md: missing name`);
  if (!description) errors.push(`skills/${directory.name}/SKILL.md: missing description`);

  if (name?.startsWith('"')) {
    try {
      name = JSON.parse(name);
    } catch {
      errors.push(`skills/${directory.name}/SKILL.md: name is not a valid quoted string`);
    }
  }

  if (description?.startsWith('"')) {
    try {
      description = JSON.parse(description);
    } catch {
      errors.push(`skills/${directory.name}/SKILL.md: description is not a valid quoted string`);
    }
  } else if (description && /:\s/.test(description)) {
    errors.push(
      `skills/${directory.name}/SKILL.md: quote descriptions containing a colon followed by a space`,
    );
  }

  if (name && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    errors.push(`skills/${directory.name}/SKILL.md: name must use lowercase kebab-case`);
  }
  if (name && name.length > 64) {
    errors.push(`skills/${directory.name}/SKILL.md: name exceeds 64 characters`);
  }
  if (name && name !== basename(directory.name)) {
    errors.push(`skills/${directory.name}/SKILL.md: name must match its directory`);
  }
  if (typeof description === "string" && description.trim().length === 0) {
    errors.push(`skills/${directory.name}/SKILL.md: description cannot be empty`);
  }
  if (match[2].trim().length === 0) {
    errors.push(`skills/${directory.name}/SKILL.md: instruction body cannot be empty`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`Validated ${skillDirectories.length} skills.`);
