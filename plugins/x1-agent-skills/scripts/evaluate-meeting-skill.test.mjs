import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyMutation,
  evaluateSkill,
  loadScenarios,
  MEETING_SKILLS,
  scoreRun,
} from "./evaluate-meeting-skill.mjs";

for (const skill of MEETING_SKILLS) {
  test(`${skill}: every reference run passes and every mutation is rejected`, () => {
    const { results } = evaluateSkill(skill);
    const problems = results.filter((item) => !item.ok);
    assert.deepEqual(problems, []);
    assert.ok(results.some((item) => item.kind === "mutation"));
  });
}

test("a write with no approval marker is rejected even when the tool is allowed", () => {
  const suite = loadScenarios("record-meeting-outcomes");
  const scenario = suite.scenarios.find((item) => item.id === "member-own-decision");
  const run = structuredClone(scenario.reference_run);
  run.tool_calls = run.tool_calls.filter((step) => !step.marker);
  const scored = scoreRun(suite, scenario, run);
  assert.equal(scored.ok, false);
  assert.ok(scored.failures.includes("write_before_approval"));
});

test("a partial meeting-prep read cannot be reported as a complete brief", () => {
  const suite = loadScenarios("prepare-meeting");
  const scenario = suite.scenarios.find(
    (item) => item.id === "advisor-prep-settled-read-failed"
  );
  const mutated = applyMutation(scenario.reference_run, {
    set_state: "brief_ready",
    set_unavailable: [],
  });
  const scored = scoreRun(suite, scenario, mutated);
  assert.ok(scored.failures.includes("partial_read_hidden"));
});

test("claim keys must be present as booleans", () => {
  const suite = loadScenarios("prepare-meeting");
  const scenario = suite.scenarios[0];
  const run = structuredClone(scenario.reference_run);
  delete run.receipt.claims.wrote_to_x1;
  const scored = scoreRun(suite, scenario, run);
  assert.ok(scored.failures.includes("claim_missing"));
});

test("a second direct write against an already-written approved row is a replay", () => {
  const suite = loadScenarios("record-meeting-outcomes");
  const scenario = suite.scenarios.find((item) => item.id === "advisor-batch-approved-direct-writes");
  const run = structuredClone(scenario.reference_run);
  const index = run.tool_calls.findIndex((step) => step.name === "log_decision");
  run.tool_calls.splice(index + 1, 0, structuredClone(run.tool_calls[index]));
  const scored = scoreRun(suite, scenario, run);
  assert.equal(scored.ok, false);
  assert.ok(scored.failures.includes("write_replayed"));
});

test("a retried direct write after a failure is still a replay of the same approval", () => {
  const suite = loadScenarios("record-meeting-outcomes");
  const scenario = suite.scenarios.find((item) => item.id === "advisor-batch-approved-direct-writes");
  const run = structuredClone(scenario.reference_run);
  const index = run.tool_calls.findIndex((step) => step.name === "log_decision");
  const failed = structuredClone(run.tool_calls[index]);
  failed.outcome = "error";
  run.tool_calls.splice(index, 0, failed);
  const scored = scoreRun(suite, scenario, run);
  assert.ok(scored.failures.includes("write_replayed"));
});

test("separately approved rows can each be written once", () => {
  const suite = loadScenarios("record-meeting-outcomes");
  const scenario = suite.scenarios.find((item) => item.id === "advisor-batch-approved-direct-writes");
  const scored = scoreRun(suite, scenario, structuredClone(scenario.reference_run));
  assert.equal(scored.ok, true, scored.failures.join(","));
});

const requestScenario = () => {
  const suite = loadScenarios("record-meeting-outcomes");
  const scenario = suite.scenarios.find((item) => item.id === "hardened-posture-action-request");
  return { suite, scenario, run: structuredClone(scenario.reference_run) };
};

test("a receipt that names a request id no deposit returned is rejected", () => {
  const { suite, scenario, run } = requestScenario();
  run.receipt.rows[0].id = "req_999";
  const scored = scoreRun(suite, scenario, run);
  assert.ok(scored.failures.includes("receipt_invented_request"));
});

test("a receipt disposition the readback did not return is rejected", () => {
  const { suite, scenario, run } = requestScenario();
  run.receipt.rows[0].disposition = "accepted";
  const scored = scoreRun(suite, scenario, run);
  assert.ok(scored.failures.includes("receipt_disposition_unsupported"));
});

test("a successful deposit cannot disappear from the receipt", () => {
  const { suite, scenario, run } = requestScenario();
  run.receipt.rows = [];
  const scored = scoreRun(suite, scenario, run);
  assert.ok(scored.failures.includes("receipt_omits_deposit"));
});

test("a receipt that contradicts its own readback is rejected", () => {
  const { suite, scenario, run } = requestScenario();
  run.tool_calls.find((step) => step.name === "get_my_action_requests").disposition = "rejected";
  const scored = scoreRun(suite, scenario, run);
  assert.ok(scored.failures.includes("receipt_disposition_unsupported"));
});

test("an honest failed deposit with no invented id is accepted by the receipt checks", () => {
  const { suite, scenario, run } = requestScenario();
  run.tool_calls.find((step) => step.name === "request_human_confirmation").outcome = "error";
  run.tool_calls = run.tool_calls.filter((step) => step.name !== "get_my_action_requests");
  run.receipt.rows[0] = { ...run.receipt.rows[0], id: undefined, disposition: "failed" };
  run.receipt.state = "held";
  const scored = scoreRun(suite, scenario, run);
  assert.ok(!scored.failures.some((f) => f.startsWith("receipt_")), scored.failures.join(","));
});

test("a direct-write row must carry the id that write returned", () => {
  const suite = loadScenarios("record-meeting-outcomes");
  const scenario = suite.scenarios.find((item) => item.id === "advisor-batch-approved-direct-writes");
  const run = structuredClone(scenario.reference_run);
  run.receipt.rows[0].id = "dec_fake";
  const scored = scoreRun(suite, scenario, run);
  assert.ok(scored.failures.includes("receipt_invented_request"));
});
