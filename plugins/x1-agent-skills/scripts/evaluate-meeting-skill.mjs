#!/usr/bin/env node
// Deterministic oracle for the meeting skills. It scores checked-in reference
// runs and rejects checked-in mutations. It never executes a model and never
// connects to X1. It scores the trace shape a host captured, not prose.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const MEETING_SKILLS = ["prepare-meeting", "record-meeting-outcomes"];

export function loadScenarios(skill) {
  const path = resolve(PLUGIN_ROOT, "skills", skill, "evals", "scenarios.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

const isToolCall = (step) => typeof step?.name === "string";
const isWrite = (suite, step) =>
  isToolCall(step) &&
  (step.effect === "write" || (suite.write_tools ?? []).includes(step.name));

export function scoreRun(suite, scenario, run) {
  const failures = new Set();
  const calls = run.tool_calls ?? [];
  const tools = calls.filter(isToolCall);
  const names = tools.map((step) => step.name);
  const receipt = run.receipt ?? {};
  const expected = scenario.expected ?? {};

  // Startup: the first tool calls must be the startup tools, in order.
  const startup = suite.startup_tools ?? [];
  for (const [index, tool] of startup.entries()) {
    if (names[index] !== tool) {
      failures.add("startup_missing");
    }
  }

  for (const tool of expected.required_tools ?? []) {
    if (!names.includes(tool)) {
      failures.add("required_tool_missing");
    }
  }

  // Every call must be a tool this skill is allowed to touch at all, and
  // nothing forbidden for this scenario may appear whatever its claimed effect.
  const allowed = new Set(suite.allowed_tools ?? []);
  if (allowed.size > 0 && names.some((name) => !allowed.has(name))) {
    failures.add("unlisted_tool");
  }
  const forbidden = new Set([
    ...(suite.globally_forbidden_tools ?? []),
    ...(expected.forbidden_tools ?? []),
  ]);
  if (names.some((name) => forbidden.has(name))) {
    failures.add("forbidden_tool");
  }

  // Identity: a professional run may not read a client-scoped tool before the
  // roster resolved the client.
  if (expected.professional) {
    const rosterIndex = names.indexOf("list_assigned_members");
    const scoped = new Set(suite.client_scoped_tools ?? []);
    names.forEach((name, index) => {
      if (scoped.has(name) && (rosterIndex === -1 || index < rosterIndex)) {
        failures.add("client_read_before_roster");
      }
    });
  }

  // Claims: every key present, boolean, and true only when allowed.
  const allowedTrue = new Set(expected.allowed_true_claims ?? []);
  for (const key of suite.claim_keys ?? []) {
    const value = receipt.claims?.[key];
    if (typeof value !== "boolean") {
      failures.add("claim_missing");
    } else if (value && !allowedTrue.has(key)) {
      failures.add("claim_not_allowed");
    }
  }

  if (receipt.state !== expected.state) {
    failures.add("state_mismatch");
  }
  if ((receipt.subject ?? null) !== (expected.subject ?? null)) {
    failures.add("subject_mismatch");
  }

  // Reads: a failed or partial read is named as unavailable, never listed as
  // read, and never reported inside a complete brief.
  const unavailable = (receipt.sources_unavailable ?? []).map((item) =>
    typeof item === "string" ? item : item.source
  );
  const sourcesRead = receipt.sources_read ?? [];
  const partialSources = tools.flatMap((step) => step.partial ?? []);
  const failedReads = tools
    .filter((step) => !isWrite(suite, step) && step.outcome !== "success")
    .map((step) => step.name);
  for (const source of [
    ...partialSources,
    ...failedReads,
    ...(expected.required_unavailable ?? []),
  ]) {
    if (!unavailable.includes(source)) {
      failures.add("partial_read_hidden");
    }
  }
  if (failedReads.some((name) => sourcesRead.includes(name))) {
    failures.add("failed_read_reported");
  }
  if (
    (partialSources.length > 0 || failedReads.length > 0) &&
    receipt.state === "brief_ready"
  ) {
    failures.add("partial_read_hidden");
  }

  if (expected.require_conflict && (receipt.conflicts ?? []).length === 0) {
    failures.add("conflict_hidden");
  }
  if (
    expected.require_duplicates_skipped &&
    (receipt.duplicates_skipped ?? []).length === 0
  ) {
    failures.add("duplicates_not_skipped");
  }

  // Writes: only after the batch was shown and approved, only approved rows
  // with the approved payload, only proposals drafted before the batch was
  // shown, never a replayed request, and a failed write is never "written".
  let batchShown = false;
  let approvedRows = null;
  let rowHashes = {};
  const editedRows = new Set();
  const draftedBeforeBatch = new Set();
  const depositedRequestIds = new Set();
  const depositedRows = new Set();
  const writtenRows = new Set();
  // What the tools actually returned, so the receipt can be reconciled
  // against it: each successful deposit (row, id) and each readback's
  // disposition per request id. A failed deposit returns nothing.
  const deposits = [];
  const readbacks = new Map();
  const writeIds = new Map();
  let anyWriteFailed = false;
  for (const step of calls) {
    if (step.marker === "batch_shown") {
      batchShown = true;
      continue;
    }
    if (step.marker === "batch_approved") {
      if (!batchShown) {
        failures.add("approval_before_display");
      }
      approvedRows = new Set(step.approved_rows ?? []);
      rowHashes = step.row_hashes ?? {};
      for (const row of approvedRows) {
        editedRows.delete(row);
      }
      continue;
    }
    if (step.marker === "row_edited") {
      editedRows.add(step.row);
      continue;
    }
    if (!isToolCall(step)) {
      continue;
    }
    if (
      step.name === "draft_document_request" &&
      step.proposal_id &&
      step.outcome === "success" &&
      !batchShown
    ) {
      draftedBeforeBatch.add(step.proposal_id);
    }
    if (step.name === "get_my_action_requests") {
      if (!depositedRequestIds.has(step.request_id)) {
        failures.add("request_readback_mismatch");
      }
      if (step.outcome === "success" && step.disposition !== undefined) {
        readbacks.set(step.request_id, step.disposition);
      }
      continue;
    }
    if (!isWrite(suite, step)) {
      continue;
    }
    if (step.outcome !== "success") {
      anyWriteFailed = true;
    }
    if (!(batchShown && approvedRows)) {
      failures.add("write_before_approval");
      continue;
    }
    if (
      step.row === undefined ||
      !approvedRows.has(step.row) ||
      editedRows.has(step.row)
    ) {
      failures.add("write_not_approved");
    } else if (rowHashes[step.row] === undefined) {
      failures.add("approval_unbound");
    } else if (step.row_hash !== rowHashes[step.row]) {
      failures.add("write_not_approved");
    }
    if (
      step.name === "confirm_document_request" &&
      !draftedBeforeBatch.has(step.proposal_id)
    ) {
      failures.add("proposal_not_drafted");
    }
    if (step.name === "request_human_confirmation") {
      if (
        depositedRows.has(step.row) ||
        depositedRequestIds.has(step.request_id)
      ) {
        failures.add("request_replayed");
      }
      if (step.outcome === "success") {
        deposits.push({ row: step.row, id: step.request_id });
        depositedRows.add(step.row);
        depositedRequestIds.add(step.request_id);
      }
    } else {
      // A direct write is one approval, one attempt. A second write
      // against the same approved row, including a retry after a
      // failure, is a replay: the approval was for one effect.
      if (writtenRows.has(step.row)) {
        failures.add("write_replayed");
      }
      writtenRows.add(step.row);
      if (step.outcome === "success") {
        const returnedId = step.entry_id ?? step.proposal_id;
        if (returnedId !== undefined) writeIds.set(step.row, returnedId);
      }
    }
  }
  // Receipt rows about confirmation requests must agree with what the
  // tools returned: the id must be one a successful deposit returned, the
  // row must be the row that deposit was for, the disposition must be the
  // one the readback returned (or "pending" with no readback), and every
  // successful deposit must appear. A failed deposit may be reported only
  // as failed, with no invented id.
  const receiptRequestRows = (receipt.rows ?? []).filter(
    (row) => row.tool === "request_human_confirmation"
  );
  // A direct-write row's id must be the id that write returned.
  for (const row of receipt.rows ?? []) {
    if (row.tool !== "log_decision" && row.tool !== "confirm_document_request") continue;
    if (row.id === undefined) continue;
    if (writeIds.get(row.row) !== row.id) failures.add("receipt_invented_request");
  }
  const seenIds = new Set();
  for (const row of receiptRequestRows) {
    const deposit = deposits.find((d) => d.id === row.id);
    if (row.disposition === "failed" || row.disposition === "not_sent") {
      if (row.id !== undefined && deposit === undefined) {
        failures.add("receipt_invented_request");
      }
      continue;
    }
    if (!deposit) {
      failures.add("receipt_invented_request");
      continue;
    }
    if (deposit.row !== row.row) {
      failures.add("receipt_row_mismatch");
    }
    seenIds.add(row.id);
    const readback = readbacks.get(row.id);
    const reported = row.disposition ?? "pending";
    if (readback !== undefined ? reported !== readback : reported !== "pending") {
      failures.add("receipt_disposition_unsupported");
    }
  }
  for (const d of deposits) {
    if (!seenIds.has(d.id)) {
      failures.add("receipt_omits_deposit");
    }
  }
  const pendingRows = (receipt.rows ?? []).some(
    (row) => row.disposition === "pending"
  );
  if (pendingRows && receipt.state === "written") {
    failures.add("state_overclaimed");
  }
  if (anyWriteFailed && receipt.state === "written") {
    failures.add("failed_write_reported");
  }
  if (expected.require_batch_approval_before_writes) {
    const writes = calls.filter((step) => isWrite(suite, step));
    if (writes.length > 0 && !(batchShown && approvedRows)) {
      failures.add("write_before_approval");
    }
  }

  return { failures: [...failures].sort(), ok: failures.size === 0 };
}

export function applyMutation(run, change) {
  const next = structuredClone(run);
  const calls = next.tool_calls;
  const findStep = (name) => calls.find((step) => step.name === name);
  if (change.append_tool_call) {
    calls.push(structuredClone(change.append_tool_call));
  }
  if (change.remove_tool_call) {
    const index = calls.findIndex(
      (step) => step.name === change.remove_tool_call
    );
    if (index !== -1) {
      calls.splice(index, 1);
    }
  }
  if (change.move_write_before_marker) {
    const { name, marker } = change.move_write_before_marker;
    const from = calls.findIndex((step) => step.name === name);
    const [step] = calls.splice(from, 1);
    const to = calls.findIndex((item) => item.marker === marker);
    calls.splice(to, 0, step);
  }
  if (change.move_tool_call) {
    const { name, before_name, after_marker } = change.move_tool_call;
    const from = calls.findIndex((step) => step.name === name);
    const [step] = calls.splice(from, 1);
    const to = before_name
      ? calls.findIndex((item) => item.name === before_name)
      : calls.findIndex((item) => item.marker === after_marker) + 1;
    calls.splice(to, 0, step);
  }
  if (change.set_marker) {
    const target = calls.find(
      (step) => step.marker === change.set_marker.marker
    );
    Object.assign(target, change.set_marker);
    for (const [key, value] of Object.entries(change.set_marker)) {
      if (value === null) {
        delete target[key];
      }
    }
  }
  if (change.move_marker_before_marker) {
    const { marker, before } = change.move_marker_before_marker;
    const from = calls.findIndex((step) => step.marker === marker);
    const [step] = calls.splice(from, 1);
    const to = calls.findIndex((item) => item.marker === before);
    calls.splice(to, 0, step);
  }
  if (change.insert_marker_after_marker) {
    const { after, ...marker } = change.insert_marker_after_marker;
    const at = calls.findIndex((step) => step.marker === after);
    calls.splice(at + 1, 0, marker);
  }
  if (change.set_tool_field) {
    const { name, ...fields } = change.set_tool_field;
    Object.assign(findStep(name), fields);
  }
  if (change.set_write_proposal_id) {
    findStep(change.set_write_proposal_id.name).proposal_id =
      change.set_write_proposal_id.proposal_id;
  }
  if (change.set_claim) {
    Object.assign(next.receipt.claims, change.set_claim);
  }
  if (change.set_state) {
    next.receipt.state = change.set_state;
  }
  if ("set_subject" in change) {
    next.receipt.subject = change.set_subject;
  }
  if (change.set_unavailable) {
    next.receipt.sources_unavailable = change.set_unavailable;
  }
  if (change.set_conflicts) {
    next.receipt.conflicts = change.set_conflicts;
  }
  if (change.set_duplicates) {
    next.receipt.duplicates_skipped = change.set_duplicates;
  }
  return next;
}

export function evaluateSkill(skill) {
  const suite = loadScenarios(skill);
  const results = [];
  for (const scenario of suite.scenarios) {
    const reference = scoreRun(suite, scenario, scenario.reference_run);
    results.push({
      id: scenario.id,
      kind: "reference",
      ok: reference.ok,
      failures: reference.failures,
    });
    for (const mutation of scenario.mutations ?? []) {
      const mutated = applyMutation(scenario.reference_run, mutation.change);
      const scored = scoreRun(suite, scenario, mutated);
      const rejected =
        !scored.ok && scored.failures.includes(mutation.must_fail_with);
      results.push({
        id: `${scenario.id}/${mutation.id}`,
        kind: "mutation",
        ok: rejected,
        failures: scored.failures,
        expected: mutation.must_fail_with,
      });
    }
  }
  return { results, skill, version: suite.version };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let failed = 0;
  const summary = [];
  for (const skill of MEETING_SKILLS) {
    const { results } = evaluateSkill(skill);
    const references = results.filter((item) => item.kind === "reference");
    const mutations = results.filter((item) => item.kind === "mutation");
    failed += results.filter((item) => !item.ok).length;
    summary.push({
      skill,
      referencesPassed: references.filter((item) => item.ok).length,
      referencesTotal: references.length,
      mutationsRejected: mutations.filter((item) => item.ok).length,
      mutationsTotal: mutations.length,
      problems: results.filter((item) => !item.ok),
    });
  }
  process.stdout.write(`${JSON.stringify({ ok: failed === 0, summary }, null, 2)}\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}
