#!/usr/bin/env node

/**
 * file-findings.cjs -- bridge from a security-audit findings.json to a GitHub tracker.
 *
 * Severity routing (overall_severity):
 *   informational | low | medium  -> PUBLIC issue (labels: ready, afk) with a
 *                                     neutral body: intended behavior + fix
 *                                     strategy + affected file names only. No
 *                                     exploit detail, no trace lines, no
 *                                     payloads, no severity words. start-next-issue
 *                                     can pick these up like any other work.
 *   high | critical               -> PRIVATE GitHub Security Advisory carrying the
 *                                     full finding. No public issue is filed, so a
 *                                     dangerous fix task is never broadcast before
 *                                     coordinated disclosure.
 *   verdict "rejected"            -> skipped.
 *
 * Idempotent: every artifact embeds a stable fingerprint marker
 * (<!-- AUDIT-FINDING:<fp> -->) derived from the trace's file+function locations
 * (line-independent, so it survives week-to-week code drift) plus the title.
 * Re-running (e.g. on a weekly audit) skips any finding whose marker already
 * exists in an issue (any state) or an advisory.
 *
 * Requires the `gh` CLI, authenticated, with repo access. Filing advisories needs
 * the security-advisories API enabled on the repo (default on public repos).
 * Zero npm dependencies.
 *
 * Usage:
 *   node file-findings.cjs <findings.json> --repo <owner/name> [options]
 *
 * Options:
 *   --repo <owner/name>     Target repository (required).
 *   --assignee <login>      Human named as owner on high/critical advisories.
 *   --issue-label <label>   Extra label for public issues (repeatable).
 *   --min-confidence <lvl>  Skip confirmed findings below this confidence
 *                           (low|medium|high; default low = file everything).
 *   --verbatim-titles       Use the finding's real title for public issues
 *                           instead of a neutral derived one (off by default).
 *   --dry-run               Print planned actions; perform reads but no writes.
 *   --help                  Show this help and exit.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

// --- Argument parsing ---------------------------------------------------------

function parseArgs(argv) {
	const opts = {
		findings: null,
		repo: null,
		assignee: null,
		issueLabels: [],
		minConfidence: "low",
		verbatimTitles: false,
		dryRun: false,
		help: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		switch (a) {
			case "--repo": opts.repo = argv[++i]; break;
			case "--assignee": opts.assignee = argv[++i]; break;
			case "--issue-label": opts.issueLabels.push(argv[++i]); break;
			case "--min-confidence": opts.minConfidence = argv[++i]; break;
			case "--verbatim-titles": opts.verbatimTitles = true; break;
			case "--dry-run": opts.dryRun = true; break;
			case "--help": case "-h": opts.help = true; break;
			default:
				if (a.startsWith("-")) fail(`Unknown option: ${a}`);
				else if (!opts.findings) opts.findings = a;
				else fail(`Unexpected argument: ${a}`);
		}
	}
	return opts;
}

function fail(msg) {
	console.error(`error: ${msg}`);
	process.exit(1);
}

const HELP = fs
	.readFileSync(__filename, "utf8")
	.split("\n")
	.filter((l) => l.startsWith(" *"))
	.map((l) => l.replace(/^ \*\/?/, "").replace(/^ /, ""))
	.join("\n");

// --- Severity + confidence maps ----------------------------------------------

const PUBLIC_SEVERITY = new Set(["informational", "low", "medium"]);
const PRIVATE_SEVERITY = new Set(["high", "critical"]);
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

// --- Fingerprint (stable identity across runs) -------------------------------

function normalizeTitle(t) {
	return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fingerprint(f) {
	const parts = [];
	if (Array.isArray(f.trace)) {
		for (const s of f.trace) parts.push(`${s.file}::${s.scope}`);
	}
	parts.push(normalizeTitle(f.title));
	return crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

function marker(fp) {
	return `<!-- AUDIT-FINDING:${fp} -->`;
}

// --- gh helpers ---------------------------------------------------------------

function gh(args, input) {
	return execFileSync("gh", args, {
		input,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
}

function ghJSON(args) {
	const out = gh(args);
	return out.trim() ? JSON.parse(out) : null;
}

function preflight() {
	try {
		execFileSync("gh", ["--version"], { stdio: "ignore" });
	} catch {
		fail("`gh` CLI not found on PATH. Install and authenticate the GitHub CLI first.");
	}
}

// Existing fingerprints already filed, so re-runs don't duplicate.
function existingIssueFingerprints(repo) {
	const found = new Set();
	let issues = [];
	try {
		issues = ghJSON([
			"issue", "list", "--repo", repo, "--state", "all",
			"--limit", "1000", "--json", "number,body",
		]) || [];
	} catch (e) {
		console.error(`warning: could not list issues (${firstLine(e)}); dedup on issues disabled.`);
	}
	for (const it of issues) {
		const m = String(it.body || "").match(/AUDIT-FINDING:([0-9a-f]{12})/g);
		if (m) for (const hit of m) found.add(hit.split(":")[1]);
	}
	return found;
}

function existingAdvisoryFingerprints(repo) {
	const found = new Set();
	let advisories = [];
	try {
		advisories = ghJSON([
			"api", `/repos/${repo}/security-advisories?per_page=100`,
		]) || [];
	} catch (e) {
		console.error(`warning: could not list advisories (${firstLine(e)}); dedup on advisories disabled.`);
	}
	for (const a of advisories) {
		const hay = `${a.summary || ""}\n${a.description || ""}`;
		const m = hay.match(/AUDIT-FINDING:([0-9a-f]{12})/g);
		if (m) for (const hit of m) found.add(hit.split(":")[1]);
	}
	return found;
}

function firstLine(e) {
	return String((e && (e.stderr || e.message)) || e).split("\n")[0];
}

// --- Body builders ------------------------------------------------------------

function baseName(p) {
	return p ? path.basename(p) : null;
}

function sinkFile(f) {
	if (Array.isArray(f.trace) && f.trace.length) return f.trace[f.trace.length - 1].file;
	return null;
}

function affectedFiles(f) {
	const files = new Set();
	const changes = f.remediation && Array.isArray(f.remediation.code_changes) ? f.remediation.code_changes : [];
	for (const c of changes) if (c.file_name) files.add(c.file_name);
	if (files.size === 0 && Array.isArray(f.trace)) for (const s of f.trace) if (s.file) files.add(s.file);
	return [...files];
}

function neutralTitle(f) {
	const changes = f.remediation && Array.isArray(f.remediation.code_changes) ? f.remediation.code_changes : [];
	const primary = baseName((changes[0] && changes[0].file_name) || sinkFile(f)) || "affected module";
	return `Harden ${primary}`;
}

// Neutral public issue body: what the code should do + the fix + which files.
// Deliberately omits description (PoC), trace lines, conditions, execution
// (attacker/payloads/instructions), and every severity word.
function publicIssueBody(f, fp) {
	const files = affectedFiles(f);
	const strategy = (f.remediation && f.remediation.strategy) || "Harden the affected code path.";
	const lines = [];
	lines.push("## Recommended change");
	lines.push("");
	lines.push(strategy);
	lines.push("");
	if (f.intended_behavior) {
		lines.push("## Intended behavior");
		lines.push("");
		lines.push(f.intended_behavior);
		lines.push("");
	}
	if (files.length) {
		lines.push("## Files to review");
		lines.push("");
		for (const file of files) lines.push(`- \`${file}\``);
		lines.push("");
	}
	lines.push(marker(fp));
	lines.push(`_Full analysis is tracked privately (finding ${fp}). Do not paste exploit detail, payloads, or reproduction steps into this public issue._`);
	return lines.join("\n");
}

// Full private advisory body: everything, for coordinated remediation.
function advisoryBody(f, fp, assignee) {
	const L = [];
	if (assignee) L.push(`> Owner: @${assignee}`, "");
	if (f.description) L.push("## Description", "", f.description, "");
	if (f.root_cause) L.push("## Root cause", "", f.root_cause, "");
	if (f.intended_behavior) L.push("## Intended behavior", "", f.intended_behavior, "");

	if (Array.isArray(f.trace) && f.trace.length) {
		L.push("## Trace", "");
		for (const s of f.trace) L.push(`- **${s.kind}** \`${s.file}:${s.line}\` (${s.scope}) -- ${s.description}`);
		L.push("");
	}
	if (Array.isArray(f.conditions) && f.conditions.length) {
		L.push("## Preconditions", "");
		for (const c of f.conditions) L.push(`- **${c.kind}**: ${c.description}`);
		L.push("");
	}
	if (f.execution) {
		const e = f.execution;
		L.push("## Exploitation", "");
		if (e.attacker_perspective) L.push(`**Attacker:** ${e.attacker_perspective}`, "");
		if (Array.isArray(e.payloads) && e.payloads.length) {
			L.push("**Payloads:**", "");
			for (const p of e.payloads) L.push("```", p, "```");
			L.push("");
		}
		if (Array.isArray(e.instructions) && e.instructions.length) {
			L.push("**Steps:**", "");
			e.instructions.forEach((s, i) => L.push(`${i + 1}. ${s}`));
			L.push("");
		}
		if (e.expected_result) L.push(`**Expected result:** ${e.expected_result}`, "");
	}
	if (f.remediation) {
		L.push("## Remediation", "");
		if (f.remediation.strategy) L.push(f.remediation.strategy, "");
		const changes = Array.isArray(f.remediation.code_changes) ? f.remediation.code_changes : [];
		for (const c of changes) {
			L.push(`\`${c.file_name}\``, "", "```", c.fixed_code, "```", "");
		}
	}
	if (f.severity) {
		L.push("## Severity", "");
		L.push(`- **Overall:** ${f.severity.overall_severity}`);
		if (f.severity.likelihood) L.push(`- **Likelihood:** ${f.severity.likelihood.score} -- ${f.severity.likelihood.reason}`);
		if (f.severity.impact) L.push(`- **Impact:** ${f.severity.impact.score} -- ${f.severity.impact.reason}`);
		L.push("");
	}
	if (f.confidence) L.push(`**Confidence:** ${f.confidence.score} -- ${f.confidence.reason}`, "");
	L.push(marker(fp));
	return L.join("\n");
}

// --- Filing -------------------------------------------------------------------

function tmpWrite(prefix, content) {
	const file = path.join(os.tmpdir(), `${prefix}-${crypto.randomBytes(6).toString("hex")}.md`);
	fs.writeFileSync(file, content);
	return file;
}

function indent(s) {
	return s.split("\n").map((l) => `    | ${l}`).join("\n");
}

function createIssue(repo, title, body, labels, dryRun) {
	if (dryRun) {
		console.log(`  DRY-RUN would create issue: "${title}" [${labels.join(", ")}]`);
		console.log(indent(body));
		return;
	}
	const bodyFile = tmpWrite("audit-issue", body);
	try {
		const args = ["issue", "create", "--repo", repo, "--title", title, "--body-file", bodyFile];
		for (const l of labels) args.push("--label", l);
		const url = gh(args).trim();
		console.log(`  filed issue: ${url}`);
	} finally {
		fs.rmSync(bodyFile, { force: true });
	}
}

function createAdvisory(repo, summary, body, severity, dryRun) {
	if (dryRun) {
		console.log(`  DRY-RUN would create ${severity} advisory: "${summary}"`);
		console.log(indent(body));
		return;
	}
	const payload = { summary: summary.slice(0, 1024), description: body, severity };
	const payloadFile = tmpWrite("audit-advisory", JSON.stringify(payload));
	try {
		const out = gh(["api", "--method", "POST", `/repos/${repo}/security-advisories`, "--input", payloadFile]);
		let ghsa = "(created)";
		try { ghsa = JSON.parse(out).ghsa_id || ghsa; } catch { /* ignore */ }
		console.log(`  filed advisory: ${ghsa}`);
	} finally {
		fs.rmSync(payloadFile, { force: true });
	}
}

// --- Main ---------------------------------------------------------------------

function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.help) { console.log(HELP); return; }
	if (!opts.findings) fail("Missing <findings.json> path. See --help.");
	if (!opts.repo) fail("Missing --repo <owner/name>. See --help.");
	if (!(opts.minConfidence in CONFIDENCE_RANK)) fail(`--min-confidence must be low|medium|high, got "${opts.minConfidence}"`);

	let findings;
	try {
		findings = JSON.parse(fs.readFileSync(opts.findings, "utf8"));
	} catch (e) {
		fail(`Could not read findings JSON: ${firstLine(e)}`);
	}
	if (!Array.isArray(findings)) fail("findings.json must be a top-level array.");

	preflight();
	console.log(`Reading existing markers in ${opts.repo} ...`);
	const filed = new Set([...existingIssueFingerprints(opts.repo), ...existingAdvisoryFingerprints(opts.repo)]);

	const minRank = CONFIDENCE_RANK[opts.minConfidence];
	const stats = { issues: 0, advisories: 0, skippedExisting: 0, skippedRejected: 0, skippedConfidence: 0, skippedUnknown: 0, failed: 0 };

	for (const f of findings) {
		if (!f || f.verdict !== "confirmed") { stats.skippedRejected++; continue; }

		const sev = f.severity && f.severity.overall_severity;
		const conf = (f.confidence && f.confidence.score) || "low";
		if (CONFIDENCE_RANK[conf] < minRank) { stats.skippedConfidence++; continue; }

		const fp = fingerprint(f);
		const label = `[${sev || "?"}] ${f.title || "(untitled)"} (${fp})`;

		if (filed.has(fp)) {
			console.log(`skip (already filed): ${label}`);
			stats.skippedExisting++;
			continue;
		}

		try {
			if (PUBLIC_SEVERITY.has(sev)) {
				console.log(`public: ${label}`);
				const title = opts.verbatimTitles ? f.title : neutralTitle(f);
				const labels = ["ready", "afk", ...opts.issueLabels];
				createIssue(opts.repo, title, publicIssueBody(f, fp), labels, opts.dryRun);
				if (!opts.dryRun) stats.issues++;
			} else if (PRIVATE_SEVERITY.has(sev)) {
				console.log(`private: ${label}`);
				createAdvisory(opts.repo, f.title || "Security finding", advisoryBody(f, fp, opts.assignee), sev, opts.dryRun);
				if (!opts.dryRun) stats.advisories++;
			} else {
				console.error(`skip (unknown severity ${JSON.stringify(sev)}): ${label}`);
				stats.skippedUnknown++;
			}
			filed.add(fp);
		} catch (e) {
			console.error(`  FAILED: ${firstLine(e)}`);
			stats.failed++;
		}
	}

	console.log("\nSummary:");
	console.log(`  public issues filed:   ${stats.issues}`);
	console.log(`  advisories filed:      ${stats.advisories}`);
	console.log(`  skipped (already):     ${stats.skippedExisting}`);
	console.log(`  skipped (rejected):    ${stats.skippedRejected}`);
	console.log(`  skipped (confidence):  ${stats.skippedConfidence}`);
	if (stats.skippedUnknown) console.log(`  skipped (bad severity):${stats.skippedUnknown}`);
	if (stats.failed) console.log(`  FAILED:                ${stats.failed}`);
	if (opts.dryRun) console.log("  (dry-run: no writes performed)");

	process.exit(stats.failed > 0 ? 1 : 0);
}

main();
