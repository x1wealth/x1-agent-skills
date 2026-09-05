import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  boundedHostFailure,
  buildClaudeHostEnvironment,
  buildClaudeMcpEnvironment,
  buildHostEnvironment,
  buildPrompt,
  enrichEvidence,
  parseClaudeOutput,
  parseCodexUnexpectedTools,
  verifyDeclaredPackageBinding,
} from "./run-host-eval.mjs";

test("Claude host loads only the empty project settings source", () => {
  const source = readFileSync(
    new URL("./run-host-eval.mjs", import.meta.url),
    "utf8"
  );
  assert.match(
    source,
    /"--setting-sources",\s*"project"/u,
    "Claude must not load user settings, env injection, or hooks"
  );
});

test("host package binding rejects changed declared bytes", () => {
  const manifest = {
    contractId: "x1.agent-skills-public-plugin.v1",
    files: [
      {
        bytes: 4,
        path: "README.md",
        sha256:
          "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
      },
    ],
    artifactQualificationStatus: "exact_bytes_qualified",
    sourceRevision: "e91e1658669cc73e0c13ce6444892105edd31955",
  };
  const verified = verifyDeclaredPackageBinding(manifest, () =>
    Buffer.from([1, 2, 3, 4])
  );
  assert.equal(verified.files, 1);
  assert.throws(
    () =>
      verifyDeclaredPackageBinding(manifest, () => Buffer.from([4, 3, 2, 1])),
    /do not match/
  );
});

test("host failures retain only a bounded code and no raw diagnostic", () => {
  const result = boundedHostFailure(
    "codex",
    { id: "case-id" },
    { id: "score-id" },
    Object.assign(new Error("secret /private/example/raw-output"), {
      code: "ETIMEDOUT",
    })
  );
  assert.equal(result.passed, false);
  assert.deepEqual(result.violations, [
    {
      code: "HOST_EXECUTION_FAILED",
      detail: "Host timed out before producing a qualified receipt",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /Users|secret|raw-output/);
});

test("host environment carries locators but no ambient provider secrets", () => {
  const environment = buildHostEnvironment({
    ANTHROPIC_API_KEY: "must-not-cross",
    CLERK_SECRET_KEY: "must-not-cross",
    DATABASE_URL: "must-not-cross",
    HOME: "/tmp/home",
    OPENAI_API_KEY: "must-not-cross",
    PATH: "/usr/bin",
    USER: "portable-eval",
  });
  assert.deepEqual(environment, {
    HOME: "/tmp/home",
    PATH: "/usr/bin",
    USER: "portable-eval",
  });
});

test("Claude keeps its API key while the MCP child gets a scrubbed disposable home", () => {
  const hostEnvironment = buildClaudeHostEnvironment({
    ANTHROPIC_API_KEY: "host-only-key",
    CLAUDE_CODE_OAUTH_TOKEN: "must-not-cross",
    CLERK_SECRET_KEY: "must-not-cross",
    DATABASE_URL: "must-not-cross",
    HOME: "/real/home",
    PATH: process.env.PATH,
    USER: "portable-eval",
  });
  assert.equal(hostEnvironment.ANTHROPIC_API_KEY, "host-only-key");
  assert.equal(hostEnvironment.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB, "1");
  assert.equal(hostEnvironment.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(hostEnvironment.CLERK_SECRET_KEY, undefined);
  assert.equal(hostEnvironment.DATABASE_URL, undefined);

  const runDirectory = "/tmp/x1-portable-eval";
  const childEnvironment = {
    ...hostEnvironment,
    ...buildClaudeMcpEnvironment(runDirectory),
  };
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      "process.stdout.write(JSON.stringify({anthropic: Boolean(process.env.ANTHROPIC_API_KEY), auth: Boolean(process.env.ANTHROPIC_AUTH_TOKEN), claude: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN), home: process.env.HOME, config: process.env.CLAUDE_CONFIG_DIR, scrub: process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB}))",
    ],
    { encoding: "utf8", env: childEnvironment }
  );
  assert.equal(probe.status, 0);
  assert.deepEqual(JSON.parse(probe.stdout), {
    anthropic: false,
    auth: false,
    claude: false,
    config: "/tmp/x1-portable-eval/mcp-child-home/.claude",
    home: "/tmp/x1-portable-eval/mcp-child-home",
    scrub: "1",
  });
});

test("prompt states the synthetic and tool-bounded evaluation contract", () => {
  const prompt = buildPrompt("skill-body", { user_input: "user-input" });
  assert.match(prompt, /synthetic\s+fixtures, not customer data/);
  assert.match(
    prompt,
    /Never recompute them by comparing expiresAt or another\s+fixture timestamp to the real host clock/
  );
  assert.match(
    prompt,
    /hostile-wiring row owns both\s+untrusted_instructions_ignored and tool_wiring_changed/
  );
  assert.match(
    prompt,
    /call get_x1_guide and wait for its result; then call\s+get_user_capabilities and wait for its result/
  );
  assert.match(
    prompt,
    /get_what_matters_now before calling find_coordination_threads with exactly\s+\{\}/
  );
  assert.match(
    prompt,
    /Action-request, refusal, preflight-only, and\s+hostile-wiring cases therefore use an empty evidence array/
  );
  assert.match(
    prompt,
    /household_member for a matched hold[\s\S]*response_ready after an exact\s+professional-response match/
  );
  assert.match(
    prompt,
    /Copy every non-null\s+resume_identity value into source_ids/
  );
  assert.match(
    prompt,
    /unrelated intent stops before\s+startup and there is no capability result, use external_connector as the\s+portable receipt surface/
  );
  assert.match(
    prompt,
    /For a bounded free job whose capability result returns free_connector,\s+preserve free_connector as the receipt surface/
  );
  assert.match(
    prompt,
    /Evidence must include\s+the four safe source facts returned by the job state with their exact source ID\s+and citation/
  );
  assert.match(prompt, /Do not use shell,\s+filesystem, browser, web/);
  assert.match(prompt, /<skill>\nskill-body/);
  assert.match(prompt, /<user_request>\nuser-input/);
});

test("evidence binds only to captured source and citation pairs", () => {
  const result = enrichEvidence(
    {
      evidence: [
        { citation: "page:1", field: "amount", source_id: "doc_1" },
        { citation: "page:2", field: "issuer", source_id: "doc_2" },
      ],
    },
    [{ citations: ["page:1"], source_ids: ["doc_1"] }]
  );
  assert.equal(result.evidence[0].tool_call_index, 0);
  assert.equal(result.evidence[1].tool_call_index, -1);
});

test("Claude parser rejects and reports unapproved tools", () => {
  const stdout = [
    JSON.stringify({
      message: {
        content: [
          { name: "mcp__x1_capital_call_eval__approved", type: "tool_use" },
          { name: "Bash", type: "tool_use" },
        ],
      },
      type: "assistant",
    }),
    JSON.stringify({
      is_error: false,
      structured_output: { state: "held" },
      type: "result",
    }),
  ].join("\n");
  const parsed = parseClaudeOutput(
    stdout,
    new Set(["mcp__x1_capital_call_eval__approved"])
  );
  assert.deepEqual(parsed.receipt, { state: "held" });
  assert.deepEqual(parsed.unexpectedTools, ["Bash"]);
});

test("Codex parser rejects non-MCP and wrong-server activity", () => {
  const stdout = [
    JSON.stringify({ item: { type: "reasoning" } }),
    JSON.stringify({
      item: {
        name: "approved",
        server: "x1_capital_call_eval",
        type: "mcp_tool_call",
      },
    }),
    JSON.stringify({ item: { type: "command_execution" } }),
    JSON.stringify({
      item: { name: "approved", server: "other", type: "mcp_tool_call" },
    }),
  ].join("\n");
  const unexpected = parseCodexUnexpectedTools(
    stdout,
    new Set(["mcp__x1_capital_call_eval__approved"])
  );
  assert.deepEqual(unexpected, ["command_execution", "mcp:other:approved"]);
});
