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
