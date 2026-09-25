#!/usr/bin/env node
// Run a real agent against the synthetic Quill household and grade it.
//
//   node scripts/run-agent-review-k1.mjs [--out <dir>] [--budget 5]
//
// It starts scripts/mock-x1-k1-household.mjs as the only MCP server, runs
// Claude Code headless (`claude -p`) with the review-k1 skill and its
// references as a system prompt and only the synthetic X1 tools allowed,
// extracts the receipt the agent returns, and grades trace plus receipt with
// scripts/evaluate-review-k1.mjs. Requires the Claude Code CLI signed in.
// Nothing here touches X1 or any real document.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKILL_ROOT = resolve(PLUGIN_ROOT, "skills", "review-k1");
const argValue = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
};
const out = resolve(argValue("--out", mkdtempSync(join(tmpdir(), "x1-review-k1-run-"))));
mkdirSync(out, { recursive: true });
const budget = argValue("--budget", "5");

const system = [
  readFileSync(resolve(SKILL_ROOT, "SKILL.md"), "utf8"),
  "# references/current-x1-contract.md",
  readFileSync(resolve(SKILL_ROOT, "references", "current-x1-contract.md"), "utf8"),
  "# references/k1-review-reference.md",
  readFileSync(resolve(SKILL_ROOT, "references", "k1-review-reference.md"), "utf8"),
].join("\n\n");
writeFileSync(join(out, "system.md"), system);
const trace = join(out, "trace.json");
writeFileSync(
  join(out, "mcp.json"),
  JSON.stringify({
    mcpServers: {
      x1: {
        args: [resolve(PLUGIN_ROOT, "scripts", "mock-x1-k1-household.mjs"), "--log", trace, "--surface", "member"],
        command: process.execPath,
      },
    },
  })
);
const prompt =
  "I'm Elena Quill. Our 2025 K-1s have been arriving all year. Use the review-k1 skill to review them against my X1 record, including anything that belongs to Marcus or the trust. This time, read only: don't file anything, deposit requests, or draft requests. Give me the review, then end with the bounded review receipt as a single ```json fenced block in exactly the schema the skill describes (use the evidence field names from the reference, with page numbers and verbatim quotes).";

const run = spawnSync(
  "claude",
  [
    "-p",
    "--strict-mcp-config",
    "--mcp-config", join(out, "mcp.json"),
    "--allowedTools", "mcp__x1__*",
    "--disallowedTools", "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit",
    "--append-system-prompt-file", join(out, "system.md"),
    "--max-budget-usd", budget,
    "--output-format", "json",
    prompt,
  ],
  { cwd: out, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }
);
if (run.status !== 0) {
  process.stderr.write(run.stderr);
  throw new Error(`claude exited ${run.status}`);
}
const result = JSON.parse(run.stdout);
writeFileSync(join(out, "answer.md"), result.result ?? "");
const blocks = [...(result.result ?? "").matchAll(/```json\s*([\s\S]*?)```/g)];
if (blocks.length === 0) {
  throw new Error(`The agent returned no receipt block; see ${join(out, "answer.md")}.`);
}
writeFileSync(join(out, "receipt.json"), `${JSON.stringify(JSON.parse(blocks.at(-1)[1]), null, 2)}\n`);

const graded = spawnSync(
  process.execPath,
  [resolve(PLUGIN_ROOT, "scripts", "evaluate-review-k1.mjs"), "--trace", trace, "--receipt", join(out, "receipt.json"), "--scenario", "member-full-review"],
  { encoding: "utf8" }
);
writeFileSync(join(out, "grade.json"), graded.stdout);
process.stdout.write(
  `${JSON.stringify({ cost_usd: result.total_cost_usd, grade: JSON.parse(graded.stdout), models: Object.keys(result.modelUsage ?? {}), out, turns: result.num_turns }, null, 2)}\n`
);
process.exitCode = graded.status;
