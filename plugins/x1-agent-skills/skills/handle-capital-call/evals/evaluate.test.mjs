// Portable export derived from X1 source revision e91e1658669cc73e0c13ce6444892105edd31955.
import assert from "node:assert/strict";
import test from "node:test";
import {
  loadSuites,
  runFutureSeamSuite,
  runNegativeSuite,
  runOracleSuite,
  scoreRun,
} from "./evaluate.mjs";

const { negative, scenarios } = loadSuites();

test("every deterministic oracle run satisfies its authority and state contract", () => {
  const failures = runOracleSuite(scenarios).filter((result) => !result.passed);
  assert.deepEqual(failures, []);
});

test("the structured-output null closeout transports the exact active identity", () => {
  const scenario = scenarios.scenarios.find(
    (candidate) => candidate.id === "stable-join-waiting-on-professional"
  );
  assert.ok(scenario);
  const run = structuredClone(scenario.reference_run);
  run.receipt.resume_identity.closeout_id = null;
  assert.deepEqual(scoreRun(scenarios, scenario, run).violations, []);
});

test("no fixture remains mislabeled as an unshipped future seam", () => {
  const results = runFutureSeamSuite(scenarios);
  assert.deepEqual(results, []);
  const closedResult = scenarios.scenarios.find(
    (scenario) => scenario.id === "stable-closed-result-reused"
  );
  assert.equal(closedResult?.current_support, "supported-existing-record-read");
  assert.equal(closedResult?.expected.state, "closed");
  assert.deepEqual(closedResult?.expected.required_holds, [
    "later_reuse_unproved",
  ]);
});

test("unsafe mutations are rejected with the named violation evidence", () => {
  const missed = runNegativeSuite(scenarios, negative).filter(
    (result) => !result.caught
  );
  assert.deepEqual(missed, []);
});

test("the suite covers every current-master red seam", () => {
  const covered = new Set(
    scenarios.scenarios.map((scenario) => scenario.expected.gap).filter(Boolean)
  );
  assert.deepEqual([...covered].sort(), [
    "CC-GAP-1",
    "CC-GAP-2",
    "CC-GAP-3",
    "CC-GAP-4",
    "CC-GAP-5",
    "CC-GAP-6",
  ]);
});

test("the suite covers the required control families", () => {
  const categories = new Set(
    scenarios.scenarios.map((scenario) => scenario.category)
  );
  for (const category of [
    "amended-control",
    "authority-refusal",
    "conflict-control",
    "current-product-gap",
    "duplicate-control",
    "future-positive-control",
    "hostile-input-control",
    "intent-abstention",
    "positive-tool-selection",
    "stale-evidence",
    "terminal-action-request",
    "visibility-refusal",
    "workflow-state",
  ]) {
    assert.ok(categories.has(category), `Missing category: ${category}`);
  }
});

test("captured startup preflight order cannot be rewritten by the scorer", () => {
  const scenario = scenarios.scenarios.find(
    (candidate) => candidate.id === "notice-missing-governed-intake-approved"
  );
  assert.ok(scenario);
  const run = structuredClone(scenario.reference_run);
  [run.tool_calls[0], run.tool_calls[1]] = [
    run.tool_calls[1],
    run.tool_calls[0],
  ];
  const codes = scoreRun(scenarios, scenario, run).violations.map(
    (violation) => violation.code
  );
  assert.ok(codes.includes("STARTUP_ORDER"));
  assert.ok(codes.includes("REQUIRED_TOOL_SEQUENCE_MISSING"));
});
