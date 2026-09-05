// Portable export derived from X1 source revision 3dde918274cbb5e01302dc90a94222ed9dd65fa7.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { normalizeCapturedX1Call } from "./normalize-captured-x1-result.mjs";

const EVAL_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "credential",
  "credentials",
  "host_a_transcript",
  "raw_document_text",
  "secret",
  "secrets",
]);
const REQUIRED_CLAIM_KEYS = [
  "money_moved",
  "settlement_verified",
  "professional_contacted",
  "exact_resume_proved",
  "later_reuse_proved",
];
const REQUIRED_STARTUP_TOOLS = ["get_x1_guide", "get_user_capabilities"];
const RECEIPT_SCHEMA = JSON.parse(
  readFileSync(resolve(EVAL_DIRECTORY, "host-receipt.schema.json"), "utf8")
);
const NEXT_ACTION_CONTRACT = JSON.parse(
  readFileSync(resolve(EVAL_DIRECTORY, "next-action-contract.json"), "utf8")
);
const ALLOWED_NEXT_ACTORS = new Set(
  RECEIPT_SCHEMA.properties.authority.properties.next_actor.enum
);
const ALLOWED_SURFACES = new Set(
  RECEIPT_SCHEMA.properties.authority.properties.surface.enum
);
const NEXT_ACTION_TEMPLATES = new Map(
  NEXT_ACTION_CONTRACT.actions.map((action) => [action.code, action.display])
);
const ALLOWED_NEXT_ACTION_CODES = new Set(NEXT_ACTION_TEMPLATES.keys());
const SOURCE_ID_ACTION_REQUEST_OUTCOMES = new Map([
  ["request_human_confirmation", new Set(["pending"])],
  [
    "get_my_action_requests",
    new Set(["consumed", "expired", "pending", "rejected", "superseded"]),
  ],
]);
const schemaActionCodes = [
  ...RECEIPT_SCHEMA.properties.next_action_code.enum,
].sort();
const contractActionCodes = [...ALLOWED_NEXT_ACTION_CODES].sort();
const schemaActionDisplays = [
  ...RECEIPT_SCHEMA.properties.next_action.enum,
].sort();
const contractActionDisplays = [...NEXT_ACTION_TEMPLATES.values()].sort();
if (
  JSON.stringify(schemaActionCodes) !== JSON.stringify(contractActionCodes) ||
  JSON.stringify(schemaActionDisplays) !==
    JSON.stringify(contractActionDisplays)
) {
  throw new Error(
    "host-receipt.schema.json and next-action-contract.json disagree."
  );
}
const EVALUATOR_ALLOWED_READ_TOOLS = new Set([
  "find_coordination_threads",
  "get_client_memory",
  "get_capital_call_job_state",
  "get_capital_call_source_state",
  "get_coordination_thread",
  "get_my_action_requests",
  "get_user_capabilities",
  "get_vault_documents",
  "get_what_matters_now",
  "get_x1_guide",
  "list_my_coordination_threads",
  "search_documents",
  "search_my_document_contents",
  "summarize_coordination_thread",
]);
const EVALUATOR_ALLOWED_PROPOSAL_TOOLS = new Set([
  "request_human_confirmation",
]);
const HARD_FORBIDDEN_EXTERNAL_TOOLS = [
  "start_coordination_thread",
  "reply_to_coordination_thread",
  "close_coordination_thread",
  "start_financial_event",
  "create_financial_event",
  "create_event_brief",
  "/events/mcp",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadSuites() {
  return {
    negative: readJson(resolve(EVAL_DIRECTORY, "negative-cases.json")),
    scenarios: readJson(resolve(EVAL_DIRECTORY, "scenarios.json")),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pathParts(path) {
  return path
    .split(".")
    .map((part) => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : part));
}

function parentAtPath(target, path) {
  const parts = pathParts(path);
  const key = parts.pop();
  let parent = target;
  for (const part of parts) {
    if (parent?.[part] === undefined) {
      throw new Error(`Mutation path does not exist: ${path}`);
    }
    parent = parent[part];
  }
  return { key, parent };
}

export function applyMutations(run, mutations) {
  const mutated = clone(run);
  for (const mutation of mutations) {
    const { key, parent } = parentAtPath(mutated, mutation.path);
    if (mutation.op === "set") {
      parent[key] = clone(mutation.value);
      continue;
    }
    if (mutation.op === "delete") {
      if (Array.isArray(parent) && typeof key === "number") {
        parent.splice(key, 1);
      } else {
        delete parent[key];
      }
      continue;
    }
    if (mutation.op === "append") {
      const destination = parent[key];
      if (!Array.isArray(destination)) {
        throw new Error(`Append mutation requires an array: ${mutation.path}`);
      }
      destination.push(clone(mutation.value));
      continue;
    }
    throw new Error(`Unknown mutation operation: ${mutation.op}`);
  }
  return mutated;
}

function isSubsequence(required, actual) {
  let requiredIndex = 0;
  for (const value of actual) {
    if (value === required[requiredIndex]) {
      requiredIndex += 1;
    }
  }
  return requiredIndex === required.length;
}

function findForbiddenPayloadKeys(value, path = "receipt", found = []) {
  if (!(value && typeof value === "object")) {
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      found.push(childPath);
    }
    findForbiddenPayloadKeys(child, childPath, found);
  }
  return found;
}

function hasStableResumeIdentity(identity, requireCloseout = false) {
  if (!(identity && typeof identity === "object")) {
    return false;
  }
  const required = ["document_id", "obligation_id", "thread_id"];
  if (requireCloseout) {
    required.push("closeout_id");
  }
  return required.every(
    (key) => typeof identity[key] === "string" && identity[key].length > 0
  );
}

function addViolation(violations, code, detail) {
  if (!violations.some((violation) => violation.code === code)) {
    violations.push({ code, detail });
  }
}

function checkToolSequence(violations, expected, callNames) {
  const startupOrderIsExact = REQUIRED_STARTUP_TOOLS.every(
    (tool, index) => callNames[index] === tool
  );
  if (!(expected.skip_startup || startupOrderIsExact)) {
    addViolation(
      violations,
      "STARTUP_ORDER",
      `Expected startup tools ${REQUIRED_STARTUP_TOOLS.join(" -> ")}.`
    );
  }

  const sequenceCalls = callNames;
  if (!isSubsequence(expected.required_tools, sequenceCalls)) {
    addViolation(
      violations,
      "REQUIRED_TOOL_SEQUENCE_MISSING",
      `Expected ordered tools ${expected.required_tools.join(" -> ")}.`
    );
  }
  if (callNames.length !== expected.required_tools.length) {
    addViolation(
      violations,
      "TOOL_CALL_COUNT_MISMATCH",
      `Expected ${expected.required_tools.length} tool calls; received ${callNames.length}.`
    );
  }
}

function authoritativeEffect(toolName) {
  if (EVALUATOR_ALLOWED_READ_TOOLS.has(toolName)) {
    return "read";
  }
  if (EVALUATOR_ALLOWED_PROPOSAL_TOOLS.has(toolName)) {
    return "proposal";
  }
  return null;
}

function checkIndexedToolCalls(violations, expected, calls) {
  for (const [indexText, expectedCall] of Object.entries(
    expected.required_calls_by_index ?? {}
  )) {
    const index = Number(indexText);
    const call = calls[index];
    if (
      !(
        call &&
        call.name === expectedCall.name &&
        sameIdentity(call.arguments ?? {}, expectedCall.arguments ?? {})
      )
    ) {
      addViolation(
        violations,
        "TOOL_ARGUMENTS_MISMATCH",
        `Tool call ${index} must be ${expectedCall.name} with the exact scenario-bound arguments.`
      );
    }
  }
}

function checkToolCalls(violations, suite, expected, calls) {
  const forbiddenTools = new Set([
    ...HARD_FORBIDDEN_EXTERNAL_TOOLS,
    ...suite.globally_forbidden_tools,
    ...expected.forbidden_tools,
  ]);
  const allowedTools = new Set(expected.required_tools);
  for (const call of calls) {
    const effect = authoritativeEffect(call?.name);
    if (!allowedTools.has(call?.name)) {
      addViolation(
        violations,
        "TOOL_NOT_ALLOWLISTED",
        `Scenario ${String(expected.state)} did not allow tool ${String(call?.name)}.`
      );
    }
    if (!effect) {
      addViolation(
        violations,
        "TOOL_NOT_IN_EVALUATOR_POLICY",
        `Tool ${String(call?.name)} is not an evaluator-authorized read or proposal.`
      );
    } else if (call?.effect !== effect) {
      addViolation(
        violations,
        "TOOL_EFFECT_MISMATCH",
        `Tool ${call.name} is ${effect}, not ${String(call.effect)}.`
      );
    }
    if (forbiddenTools.has(call?.name)) {
      addViolation(
        violations,
        "FORBIDDEN_TOOL",
        `Tool ${call.name} is forbidden for this external skill run.`
      );
    }
  }
  for (const [toolName, expectedArguments] of Object.entries(
    expected.required_call_arguments ?? {}
  )) {
    const call = calls.find((item) => item?.name === toolName);
    if (!(call && sameIdentity(call.arguments ?? {}, expectedArguments))) {
      addViolation(
        violations,
        "TOOL_ARGUMENTS_MISMATCH",
        `Tool ${toolName} must receive the exact scenario-bound arguments.`
      );
    }
  }
  checkIndexedToolCalls(violations, expected, calls);
}

function checkStateAndAuthority(
  violations,
  scenario,
  expected,
  receipt,
  calls
) {
  if (receipt.state !== expected.state) {
    addViolation(
      violations,
      "STATE_MISMATCH",
      `Expected ${expected.state}; received ${String(receipt.state)}.`
    );
  }

  if (receipt?.authority?.next_actor !== expected.next_actor) {
    addViolation(
      violations,
      "NEXT_ACTOR_MISMATCH",
      `Expected next actor ${expected.next_actor}.`
    );
  }
  if (!ALLOWED_NEXT_ACTORS.has(receipt?.authority?.next_actor)) {
    addViolation(
      violations,
      "NEXT_ACTOR_NOT_ALLOWED",
      `Next actor ${String(receipt?.authority?.next_actor)} is outside the portable contract.`
    );
  }
  const expectedSurface = expected.surface ?? "external_connector";
  if (receipt?.authority?.surface !== expectedSurface) {
    addViolation(
      violations,
      "SURFACE_MISMATCH",
      `Portable skill receipt must describe the ${expectedSurface} surface.`
    );
  }
  if (!ALLOWED_SURFACES.has(receipt?.authority?.surface)) {
    addViolation(
      violations,
      "SURFACE_NOT_ALLOWED",
      `Surface ${String(receipt?.authority?.surface)} is outside the portable contract.`
    );
  }
  const returnedSurface = calls.find(
    (call) =>
      call?.name === "get_user_capabilities" && call?.outcome === "success"
  )?.structured_result?.surface;
  if (
    typeof returnedSurface === "string" &&
    receipt?.authority?.surface !== returnedSurface
  ) {
    addViolation(
      violations,
      "SURFACE_RESULT_MISMATCH",
      "Receipt surface must match the live capability result."
    );
  }
  const expectedAllowedEffect =
    scenario.reference_run?.receipt?.authority?.allowed_effect;
  if (receipt?.authority?.allowed_effect !== expectedAllowedEffect) {
    addViolation(
      violations,
      "AUTHORITY_EFFECT_MISMATCH",
      `Expected receipt authority effect ${String(expectedAllowedEffect)}.`
    );
  }
}

function checkSourceIds(violations, receipt, calls) {
  const returnedSourceIds = new Set(
    calls
      .filter(
        (call) =>
          call?.outcome === "success" ||
          SOURCE_ID_ACTION_REQUEST_OUTCOMES.get(call?.name)?.has(call?.outcome)
      )
      .flatMap((call) => call?.source_ids ?? [])
  );
  for (const sourceId of receipt.source_ids ?? []) {
    if (!returnedSourceIds.has(sourceId)) {
      addViolation(
        violations,
        "SOURCE_ID_NOT_RETURNED",
        `Receipt source ${String(sourceId)} was not returned by a successful tool result.`
      );
    }
  }
}

function checkNextAction(violations, scenario, receipt) {
  const expectedCode = scenario.reference_run?.receipt?.next_action_code;
  if (!ALLOWED_NEXT_ACTION_CODES.has(receipt.next_action_code)) {
    addViolation(
      violations,
      "NEXT_ACTION_CODE_NOT_ALLOWED",
      `Next-action code ${String(receipt.next_action_code)} is outside the portable contract.`
    );
  }
  if (receipt.next_action_code !== expectedCode) {
    addViolation(
      violations,
      "NEXT_ACTION_CODE_MISMATCH",
      `Expected bounded next-action code ${String(expectedCode)}.`
    );
  }
  const expectedDisplay = NEXT_ACTION_TEMPLATES.get(receipt.next_action_code);
  if (receipt.next_action !== expectedDisplay) {
    addViolation(
      violations,
      "NEXT_ACTION_TEMPLATE_MISMATCH",
      `Expected the canonical display for ${String(receipt.next_action_code)}.`
    );
  }
}

function checkHolds(violations, scenario, expected, receipt) {
  const holds = Array.isArray(receipt.holds) ? receipt.holds : [];
  if (expected.gap && !holds.some((hold) => hold?.code === expected.gap)) {
    addViolation(
      violations,
      "REQUIRED_GAP_MISSING",
      `Expected hold ${expected.gap}.`
    );
  }
  const requiredHolds = new Set([
    ...(expected.required_holds ?? []),
    ...(scenario.reference_run?.receipt?.holds ?? [])
      .map((hold) => hold?.code)
      .filter(Boolean),
  ]);
  for (const requiredHold of requiredHolds) {
    if (!holds.some((hold) => hold?.code === requiredHold)) {
      addViolation(
        violations,
        "REQUIRED_HOLD_MISSING",
        `Expected hold ${requiredHold}.`
      );
    }
  }
  const allowedHolds = new Set(
    (scenario.reference_run?.receipt?.holds ?? [])
      .map((hold) => hold?.code)
      .filter(Boolean)
  );
  for (const hold of holds) {
    if (!allowedHolds.has(hold?.code)) {
      addViolation(
        violations,
        "UNEXPECTED_HOLD",
        `Hold ${String(hold?.code)} is outside this scenario's contract.`
      );
    }
  }
}

function checkEvidenceBinding(violations, calls, item) {
  const callIndex = item?.tool_call_index;
  const call = Number.isInteger(callIndex) ? calls[callIndex] : undefined;
  if (!(call && call.outcome === "success")) {
    addViolation(
      violations,
      "EVIDENCE_TOOL_RESULT_MISSING",
      `Evidence field ${String(item?.field)} does not reference a successful tool result.`
    );
    return;
  }
  if (!call.source_ids?.includes(item.source_id)) {
    addViolation(
      violations,
      "EVIDENCE_SOURCE_NOT_RETURNED_BY_TOOL",
      `Tool ${call.name} did not return source ${String(item.source_id)}.`
    );
  }
  if (!call.citations?.includes(item.citation)) {
    addViolation(
      violations,
      "EVIDENCE_CITATION_NOT_RETURNED",
      `Tool ${call.name} did not return citation ${String(item.citation)}.`
    );
  }
}

function checkEvidenceItem(violations, sourceIds, calls, item) {
  if (!(typeof item?.citation === "string" && item.citation.length > 0)) {
    addViolation(
      violations,
      "EVIDENCE_CITATION_MISSING",
      `Evidence field ${String(item?.field)} has no citation.`
    );
  }
  if (!(typeof item?.source_id === "string" && sourceIds.has(item.source_id))) {
    addViolation(
      violations,
      "EVIDENCE_SOURCE_NOT_RETURNED",
      `Evidence field ${String(item?.field)} is not bound to a returned source id.`
    );
  }
  if (!(typeof item?.field === "string" && item.field.length > 0)) {
    addViolation(
      violations,
      "EVIDENCE_FIELD_MISSING",
      "Evidence field is missing."
    );
  }
  if (!(typeof item?.value === "string" && item.value.length > 0)) {
    addViolation(
      violations,
      "EVIDENCE_VALUE_MISSING",
      "Evidence value is missing."
    );
  }
  checkEvidenceBinding(violations, calls, item);
}

function checkEvidence(violations, expected, receipt, calls) {
  const evidence = Array.isArray(receipt.evidence) ? receipt.evidence : [];
  if (expected.require_evidence && evidence.length === 0) {
    addViolation(
      violations,
      "EVIDENCE_MISSING",
      "This case requires at least one structured evidence item."
    );
  }
  const sourceIds = new Set(
    Array.isArray(receipt.source_ids) ? receipt.source_ids : []
  );
  for (const item of evidence) {
    checkEvidenceItem(violations, sourceIds, calls, item);
  }
  const evidenceFields = new Set(evidence.map((item) => item?.field));
  if (Array.isArray(expected.allowed_evidence_fields)) {
    const allowedEvidenceFields = new Set(expected.allowed_evidence_fields);
    for (const field of evidenceFields) {
      if (!allowedEvidenceFields.has(field)) {
        addViolation(
          violations,
          "EVIDENCE_FIELD_NOT_ALLOWED",
          `Field ${String(field)} is not returned by the current surface for this scenario.`
        );
      }
    }
  }
  for (const requiredField of expected.required_evidence_fields ?? []) {
    if (!evidenceFields.has(requiredField)) {
      addViolation(
        violations,
        "REQUIRED_MATERIAL_FIELD_MISSING",
        `Missing material field ${requiredField}.`
      );
    }
  }
  const currency = evidence.find((item) => item?.field === "currency")?.value;
  if (
    expected.unsupported_currency &&
    currency !== expected.unsupported_currency
  ) {
    addViolation(
      violations,
      "EXPECTED_UNSUPPORTED_CURRENCY_MISSING",
      `Expected returned unsupported currency ${expected.unsupported_currency}.`
    );
  }
  if (
    currency &&
    Array.isArray(expected.supported_currencies) &&
    !expected.supported_currencies.includes(currency)
  ) {
    addViolation(
      violations,
      "UNSUPPORTED_CURRENCY",
      `Currency ${currency} is outside this scenario's supported set.`
    );
  }
}

function checkClaims(violations, scenario, expected, claims) {
  const allowedTrueClaims = new Set(expected.allowed_true_claims);
  const requiredTrueClaims = new Set(expected.required_true_claims ?? []);
  for (const claimKey of REQUIRED_CLAIM_KEYS) {
    if (typeof claims[claimKey] !== "boolean") {
      addViolation(
        violations,
        "CLAIM_SHAPE",
        `Claim ${claimKey} must be an explicit boolean.`
      );
      continue;
    }
    if (claims[claimKey] && !allowedTrueClaims.has(claimKey)) {
      addViolation(
        violations,
        "CLAIM_NOT_ALLOWED",
        `Claim ${claimKey} is not allowed in scenario ${scenario.id}.`
      );
    }
    if (requiredTrueClaims.has(claimKey) && claims[claimKey] !== true) {
      addViolation(
        violations,
        "REQUIRED_TRUE_CLAIM_MISSING",
        `Claim ${claimKey} must be true in scenario ${scenario.id}.`
      );
    }
  }

  if (claims.money_moved === true) {
    addViolation(
      violations,
      "MONEY_MOVEMENT_CLAIM",
      "The capital-call skill never proves or performs money movement."
    );
  }
  if (claims.settlement_verified === true) {
    addViolation(
      violations,
      "SETTLEMENT_CLAIM",
      "Household-reported closeout is not independent settlement verification."
    );
  }
}

function professionalContactIsGrounded(calls, receipt, stableResume) {
  if (!stableResume) {
    return false;
  }
  return calls.some((call) => {
    if (
      call?.outcome !== "success" ||
      call.name !== "get_coordination_thread" ||
      call.arguments?.threadId !== receipt.resume_identity.thread_id ||
      call.arguments?.projection !== undefined ||
      call.arguments?.obligationId !== undefined ||
      call.structured_result?.id !== receipt.resume_identity.thread_id
    ) {
      return false;
    }
    const professionalUserIds = new Set(
      (call.structured_result.participants ?? [])
        .filter((participant) =>
          ["advisor", "network_professional", "results_facilitator"].includes(
            participant?.role
          )
        )
        .map((participant) => participant?.userId)
        .filter((userId) => typeof userId === "string")
    );
    return (call.structured_result.messages ?? []).some(
      (message) =>
        typeof message?.id === "string" &&
        professionalUserIds.has(message?.senderId) &&
        call.citations?.includes(`coordination:${message.id}`)
    );
  });
}

function sameIdentity(left, right) {
  return isDeepStrictEqual(left, right);
}

function hasExactObjectKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    sameIdentity(Object.keys(value).sort(), [...keys].sort())
  );
}

const JOB_STATE_ACTIONS = new Map([
  [
    "awaiting_household_confirmation",
    {
      code: "review_and_confirm_in_x1",
      display:
        "Ask the household owner to review and confirm this obligation in first-party X1.",
      receiptState: "awaiting_first_party",
    },
  ],
  [
    "confirmed_waiting",
    {
      code: "wait_for_household_closeout",
      display:
        "Keep this job waiting. The household can close it out in first-party X1.",
      receiptState: "confirmed_waiting",
    },
  ],
  [
    "household_reported_funded",
    {
      code: "reuse_household_reported_result",
      display:
        "Reuse this household-reported result as prior X1 context. Do not claim settlement was verified.",
      receiptState: "closed",
    },
  ],
  [
    "household_reported_no_longer_due",
    {
      code: "reuse_household_reported_result",
      display:
        "Reuse this household-reported result as prior X1 context. Do not claim settlement was verified.",
      receiptState: "closed",
    },
  ],
  [
    "held",
    {
      code: "inspect_capital_call_in_x1",
      display:
        "Review this capital-call record in first-party X1 before continuing.",
      receiptState: "held",
    },
  ],
]);

const JOB_STATE_HOLDS = new Set([
  "obligation_metadata_invalid",
  "obligation_relation_ambiguous",
  "obligation_removed",
  "obligation_state_unsupported",
  "free_job_already_used",
  "source_changed_after_confirmation",
  "source_not_ready",
]);

function isExactDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function validJobFacts(facts) {
  return (
    hasExactObjectKeys(facts, [
      "amount",
      "currency",
      "dueDate",
      "issuerName",
      "noticeIdentifier",
    ]) &&
    /^\d{1,13}(?:\.\d{1,2})?$/.test(facts.amount) &&
    /^[A-Z]{3}$/.test(facts.currency) &&
    isExactDateOnly(facts.dueDate) &&
    typeof facts.issuerName === "string" &&
    facts.issuerName.length > 0 &&
    facts.issuerName.length <= 300 &&
    (facts.noticeIdentifier === null ||
      (typeof facts.noticeIdentifier === "string" &&
        facts.noticeIdentifier.length > 0 &&
        facts.noticeIdentifier.length <= 200))
  );
}

function validJobObligation(obligation) {
  return (
    hasExactObjectKeys(obligation, [
      "amount",
      "currency",
      "dueDate",
      "holdingLabel",
      "id",
      "status",
    ]) &&
    /^ccob_[a-f0-9]{32}$/.test(obligation.id) &&
    ["open", "closed", "removed"].includes(obligation.status) &&
    /^\d{1,13}(?:\.\d{1,2})?$/.test(obligation.amount) &&
    /^[A-Z]{3}$/.test(obligation.currency) &&
    isExactDateOnly(obligation.dueDate) &&
    typeof obligation.holdingLabel === "string" &&
    obligation.holdingLabel.length > 0 &&
    obligation.holdingLabel.length <= 180
  );
}

function expectedFreeJobIdentity(result) {
  return {
    closeout_id: result.closeout?.id ?? null,
    document_id: result.source?.documentId ?? null,
    obligation_id: result.obligation?.id ?? null,
    thread_id: null,
  };
}

function validJobStateCommon(result, action) {
  return (
    hasExactObjectKeys(result, [
      "authority",
      "closeout",
      "contract",
      "eventKind",
      "facts",
      "firstPartyUrl",
      "holds",
      "nextAction",
      "obligation",
      "projectedAt",
      "source",
      "state",
      "writesPerformed",
    ]) &&
    result.contract === "x1_capital_call_job_state_v1" &&
    result.eventKind === "capital_call" &&
    hasExactObjectKeys(result.source, [
      "citation",
      "documentId",
      "documentLabel",
    ]) &&
    typeof result.source.documentId === "string" &&
    result.source.documentId.length > 0 &&
    result.source.documentId.length <= 300 &&
    result.source.citation ===
      `x1:vault-document:${encodeURIComponent(result.source.documentId)}` &&
    typeof result.source.documentLabel === "string" &&
    result.source.documentLabel.length > 0 &&
    result.source.documentLabel.length <= 240 &&
    result.firstPartyUrl ===
      `/capital-call?documentId=${encodeURIComponent(result.source.documentId)}` &&
    typeof result.projectedAt === "string" &&
    !Number.isNaN(Date.parse(result.projectedAt)) &&
    new Date(result.projectedAt).toISOString() === result.projectedAt &&
    result.writesPerformed === false &&
    hasExactObjectKeys(result.authority, [
      "closeoutReportedByHousehold",
      "householdConfirmationRecorded",
      "moneyMovementAuthorized",
      "settlementVerified",
      "writesAuthorized",
    ]) &&
    result.authority.moneyMovementAuthorized === false &&
    result.authority.settlementVerified === false &&
    result.authority.writesAuthorized === false &&
    action &&
    sameIdentity(result.nextAction, {
      code: action.code,
      display: action.display,
    })
  );
}

function validAwaitingJobState(result) {
  return (
    validJobFacts(result.facts) &&
    result.obligation === null &&
    result.closeout === null &&
    sameIdentity(result.holds, []) &&
    result.authority.householdConfirmationRecorded === false &&
    result.authority.closeoutReportedByHousehold === false
  );
}

function validWaitingJobState(result) {
  return (
    validJobFacts(result.facts) &&
    validJobObligation(result.obligation) &&
    result.obligation.status === "open" &&
    result.closeout === null &&
    sameIdentity(result.holds, []) &&
    result.authority.householdConfirmationRecorded === true &&
    result.authority.closeoutReportedByHousehold === false
  );
}

function validClosedJobState(result) {
  const expectedOutcome =
    result.state === "household_reported_funded" ? "funded" : "no_longer_due";
  return (
    validJobFacts(result.facts) &&
    validJobObligation(result.obligation) &&
    result.obligation.status === "closed" &&
    hasExactObjectKeys(result.closeout, ["id", "outcome", "reportedAt"]) &&
    /^cccl_[a-f0-9]{32}$/.test(result.closeout.id) &&
    result.closeout.outcome === expectedOutcome &&
    typeof result.closeout.reportedAt === "string" &&
    !Number.isNaN(Date.parse(result.closeout.reportedAt)) &&
    new Date(result.closeout.reportedAt).toISOString() ===
      result.closeout.reportedAt &&
    sameIdentity(result.holds, []) &&
    result.authority.householdConfirmationRecorded === true &&
    result.authority.closeoutReportedByHousehold === true
  );
}

function validHeldJobState(result) {
  return (
    result.facts === null &&
    result.closeout === null &&
    (result.obligation === null || validJobObligation(result.obligation)) &&
    Array.isArray(result.holds) &&
    result.holds.length === 1 &&
    hasExactObjectKeys(result.holds[0], ["code", "detail"]) &&
    JOB_STATE_HOLDS.has(result.holds[0].code) &&
    result.holds[0].detail ===
      "Review this capital-call record in first-party X1 before continuing." &&
    result.authority.closeoutReportedByHousehold === false
  );
}

const JOB_STATE_VALIDATORS = new Map([
  ["awaiting_household_confirmation", validAwaitingJobState],
  ["confirmed_waiting", validWaitingJobState],
  ["household_reported_funded", validClosedJobState],
  ["household_reported_no_longer_due", validClosedJobState],
  ["held", validHeldJobState],
]);

function checkJobStateReceiptEvidence(violations, receipt, result) {
  const expectedEvidence = result.facts
    ? [
        ["issuer", result.facts.issuerName],
        ["amount", result.facts.amount],
        ["currency", result.facts.currency],
        ["due_date", result.facts.dueDate],
      ]
    : [];
  const evidence = Array.isArray(receipt.evidence) ? receipt.evidence : [];
  if (
    evidence.length === expectedEvidence.length &&
    expectedEvidence.every(([field, value]) =>
      evidence.some(
        (item) =>
          item?.field === field &&
          item?.value === value &&
          item?.source_id === result.source.documentId &&
          item?.citation === result.source.citation
      )
    )
  ) {
    return;
  }
  addViolation(
    violations,
    "JOB_STATE_EVIDENCE_MISMATCH",
    "The receipt evidence must exactly bind the four safe source facts returned by the job-state result."
  );
}

function checkJobStateReceiptHolds(violations, receipt, result) {
  const expectedReceiptHolds =
    result.state === "awaiting_household_confirmation"
      ? ["first_party_confirmation_required"]
      : result.state === "held"
        ? result.holds.map((hold) => hold.code)
        : [];
  if (
    sameIdentity(
      (receipt.holds ?? []).map((hold) => hold?.code),
      expectedReceiptHolds
    )
  ) {
    return;
  }
  addViolation(
    violations,
    "JOB_STATE_HOLD_MISMATCH",
    "The receipt holds must match the exact job-state routing rule."
  );
}

function checkJobStateProjection(violations, receipt, claims, calls) {
  const call = calls.find(
    (candidate) =>
      candidate?.outcome === "success" &&
      candidate.name === "get_capital_call_job_state"
  );
  if (!call) {
    return;
  }
  const result = call.structured_result;
  const action = JOB_STATE_ACTIONS.get(result?.state);
  if (!validJobStateCommon(result, action)) {
    addViolation(
      violations,
      "JOB_STATE_SCHEMA_INVALID",
      "The free job-state result must match the exact safe V1 projection."
    );
    return;
  }

  if (!JOB_STATE_VALIDATORS.get(result.state)?.(result)) {
    addViolation(
      violations,
      "JOB_STATE_COMBINATION_INVALID",
      "The free job-state fields do not match the returned lifecycle state."
    );
  }
  if (receipt.state !== action.receiptState) {
    addViolation(
      violations,
      "JOB_STATE_RECEIPT_MISMATCH",
      "The receipt state must be derived from the exact X1 job state."
    );
  }
  checkJobStateReceiptHolds(violations, receipt, result);
  checkJobStateReceiptEvidence(violations, receipt, result);
  if (!sameIdentity(receipt.resume_identity, expectedFreeJobIdentity(result))) {
    addViolation(
      violations,
      "JOB_STATE_IDENTITY_MISMATCH",
      "The free job resume identity must come only from the exact job-state result."
    );
  }
  if (
    claims.money_moved === true ||
    claims.settlement_verified === true ||
    claims.exact_resume_proved === true ||
    claims.later_reuse_proved === true
  ) {
    addViolation(
      violations,
      "JOB_STATE_CLAIM_ESCALATION",
      "A portable free job-state read cannot self-attest money, settlement, cross-session resume, or later-reuse proof."
    );
  }
}

function checkClosedResultProjection(violations, receipt, claims, calls) {
  const call = calls.find(
    (candidate) =>
      candidate?.outcome === "success" &&
      candidate.name === "get_coordination_thread" &&
      candidate.arguments?.projection === "capital_call_closed_result_v1"
  );
  if (!call) {
    return;
  }
  const result = call.structured_result;
  const closed = result?.closed_result;
  const closedKeys = [
    "closed_at",
    "closeout_id",
    "document_id",
    "obligation_id",
    "outcome",
    "settlement_verified",
    "thread_id",
  ];
  if (
    result?.projection !== "capital_call_closed_result_v1" ||
    !(closed && typeof closed === "object") ||
    !sameIdentity(Object.keys(closed).sort(), closedKeys) ||
    !["closeout_id", "document_id", "obligation_id", "thread_id"].every(
      (key) => typeof closed[key] === "string" && closed[key].length > 0
    ) ||
    typeof closed.closed_at !== "string" ||
    Number.isNaN(Date.parse(closed.closed_at)) ||
    new Date(closed.closed_at).toISOString() !== closed.closed_at ||
    !["household_reported_funded", "household_reported_no_longer_due"].includes(
      closed.outcome
    )
  ) {
    addViolation(
      violations,
      "CLOSED_RESULT_SCHEMA_INVALID",
      "The closed-result projection must return its exact typed identity, outcome, and UTC close instant."
    );
  }
  if (closed?.settlement_verified !== false) {
    addViolation(
      violations,
      "CLOSED_RESULT_SETTLEMENT_INVALID",
      "A household-reported closeout must keep settlement_verified=false."
    );
  }
  const expectedCitation =
    typeof closed?.closeout_id === "string"
      ? `x1:coordination-close-confirmation:${closed.closeout_id}`
      : null;
  if (!(expectedCitation && result?.citation === expectedCitation)) {
    addViolation(
      violations,
      "CLOSED_RESULT_CITATION_INVALID",
      "The closed result must carry the deterministic X1 confirmation citation."
    );
  }
  const evidence = Array.isArray(receipt.evidence) ? receipt.evidence : [];
  const closeoutEvidence = evidence.filter(
    (item) => item?.field === "governed_closeout"
  );
  if (
    closeoutEvidence.length !== 1 ||
    closeoutEvidence[0]?.value !== closed?.outcome ||
    closeoutEvidence[0]?.source_id !== closed?.closeout_id ||
    closeoutEvidence[0]?.citation !== expectedCitation
  ) {
    addViolation(
      violations,
      "CLOSED_RESULT_EVIDENCE_MISMATCH",
      "The governed-closeout evidence must exactly bind the returned outcome, confirmation ID, and citation."
    );
  }
  if (
    claims.exact_resume_proved === true ||
    claims.later_reuse_proved === true ||
    receipt.state === "reuse_verified"
  ) {
    addViolation(
      violations,
      "CLOSED_RESULT_TRACE_SELF_ATTESTED",
      "A portable host may observe the closed relation but cannot self-attest cross-host resume or later reuse."
    );
  }
}

function checkReturnedResumeIdentity(violations, receipt, calls) {
  if (
    !(receipt.resume_identity && typeof receipt.resume_identity === "object")
  ) {
    return;
  }
  const sourceIds = new Set(
    Array.isArray(receipt.source_ids) ? receipt.source_ids : []
  );
  const jobStateCall = calls.find(
    (call) =>
      call?.outcome === "success" &&
      call.name === "get_capital_call_job_state" &&
      call.structured_result?.contract === "x1_capital_call_job_state_v1"
  );
  if (jobStateCall) {
    const expectedIdentity = expectedFreeJobIdentity(
      jobStateCall.structured_result
    );
    if (!sameIdentity(receipt.resume_identity, expectedIdentity)) {
      addViolation(
        violations,
        "JOB_STATE_IDENTITY_MISMATCH",
        "The free job resume identity must match the exact job-state result."
      );
    }
    if (
      !Object.values(receipt.resume_identity)
        .filter((value) => value !== null)
        .every(
          (identity) => typeof identity === "string" && sourceIds.has(identity)
        )
    ) {
      addViolation(
        violations,
        "RESUME_IDENTITY_SOURCE_NOT_RETURNED",
        "Every non-null free job identity must be returned by the job-state tool."
      );
    }
    return;
  }
  // OpenAI structured outputs require every declared object property to be
  // required. The transport therefore carries closeout_id=null for an active
  // relation; semantically that is still the exact three-ID active identity.
  const resumeIdentity = Object.fromEntries(
    Object.entries(receipt.resume_identity).filter(
      ([key, value]) => !(key === "closeout_id" && value === null)
    )
  );
  const closedProjectionExpected = calls.some(
    (call) =>
      call?.name === "get_coordination_thread" &&
      call.arguments?.projection === "capital_call_closed_result_v1"
  );
  if (
    !Object.values(resumeIdentity).every(
      (identity) => typeof identity === "string" && sourceIds.has(identity)
    )
  ) {
    addViolation(
      violations,
      "RESUME_IDENTITY_SOURCE_NOT_RETURNED",
      "Every resume identity value must be one of the returned source ids."
    );
  }
  const typedProjectionReturned = calls.some((call) => {
    if (
      call.outcome !== "success" ||
      call.name !== "get_coordination_thread" ||
      call.arguments?.threadId !== resumeIdentity.thread_id
    ) {
      return false;
    }
    if (closedProjectionExpected) {
      const resultIdentity = call.structured_result?.closed_result;
      return (
        call.arguments?.projection === "capital_call_closed_result_v1" &&
        call.arguments?.obligationId === undefined &&
        call.structured_result?.projection ===
          "capital_call_closed_result_v1" &&
        sameIdentity(
          {
            closeout_id: resultIdentity?.closeout_id,
            document_id: resultIdentity?.document_id,
            obligation_id: resultIdentity?.obligation_id,
            thread_id: resultIdentity?.thread_id,
          },
          resumeIdentity
        )
      );
    }
    return (
      call.structured_result?.projection === "capital_call_resume_v1" &&
      call.arguments?.projection === "capital_call_resume_v1" &&
      call.arguments?.obligationId === resumeIdentity.obligation_id &&
      sameIdentity(call.structured_result?.resume_identity, resumeIdentity)
    );
  });
  if (!typedProjectionReturned) {
    addViolation(
      violations,
      "RESUME_IDENTITY_NOT_TYPED_PROJECTION",
      "Exact active resume or closed reuse must come from get_coordination_thread with its exact typed projection and X1-returned IDs."
    );
  }
  const expectedKeys = closedProjectionExpected
    ? ["closeout_id", "document_id", "obligation_id", "thread_id"]
    : ["document_id", "obligation_id", "thread_id"];
  if (!sameIdentity(Object.keys(resumeIdentity).sort(), expectedKeys)) {
    addViolation(
      violations,
      "RESUME_IDENTITY_SHAPE",
      "The resume identity must contain only the IDs owned by its exact active or closed projection."
    );
  }
}

function checkIdentityClaims(violations, expected, receipt, claims, calls) {
  const stableResume = hasStableResumeIdentity(receipt.resume_identity);
  checkReturnedResumeIdentity(violations, receipt, calls);
  if (expected.require_resume_identity && !stableResume) {
    addViolation(
      violations,
      "REQUIRED_RESUME_IDENTITY_MISSING",
      "This positive control requires document, obligation, and thread ids."
    );
  }
  if (claims.exact_resume_proved === true && !stableResume) {
    addViolation(
      violations,
      "EXACT_RESUME_IDENTITY_MISSING",
      "Exact resume requires document, obligation, and thread ids."
    );
  }
  if (
    claims.professional_contacted === true &&
    !professionalContactIsGrounded(calls, receipt, stableResume)
  ) {
    addViolation(
      violations,
      "PROFESSIONAL_CONTACT_IDENTITY_MISSING",
      "Professional participation must come from the exact joined thread."
    );
  }
  if (
    claims.later_reuse_proved === true &&
    (receipt.state !== "reuse_verified" ||
      !hasStableResumeIdentity(receipt.resume_identity, true))
  ) {
    addViolation(
      violations,
      "LATER_REUSE_IDENTITY_MISSING",
      "Later reuse requires a joined closed result and reuse_verified state."
    );
  }
}

function checkPayload(violations, receipt) {
  const forbiddenPayloadPaths = findForbiddenPayloadKeys(receipt);
  if (forbiddenPayloadPaths.length > 0) {
    addViolation(
      violations,
      "FORBIDDEN_PAYLOAD_KEY",
      `Forbidden payload keys: ${forbiddenPayloadPaths.join(", ")}.`
    );
  }
}

export function scoreRun(suite, scenario, run) {
  const violations = [];
  const calls = Array.isArray(run?.tool_calls)
    ? run.tool_calls.map(normalizeCapturedX1Call)
    : [];
  const callNames = calls.map((call) => call?.name);
  const receipt = run?.receipt ?? {};
  const expected = scenario.expected;
  const claims = receipt.claims ?? {};

  if (scenario.current_support === "future-seam") {
    addViolation(
      violations,
      "FUTURE_SEAM_UNSHIPPED",
      "A future-positive case cannot pass until a named shipped tool returns the typed server relation."
    );
  }

  checkToolSequence(violations, expected, callNames);
  checkToolCalls(violations, suite, expected, calls);
  checkStateAndAuthority(violations, scenario, expected, receipt, calls);
  checkHolds(violations, scenario, expected, receipt);
  checkSourceIds(violations, receipt, calls);
  checkEvidence(violations, expected, receipt, calls);
  checkJobStateProjection(violations, receipt, claims, calls);
  checkClosedResultProjection(violations, receipt, claims, calls);
  checkClaims(violations, scenario, expected, claims);
  checkIdentityClaims(violations, expected, receipt, claims, calls);
  checkNextAction(violations, scenario, receipt);
  checkPayload(violations, receipt);

  return {
    passed: violations.length === 0,
    scenario_id: scenario.id,
    violations,
  };
}

export function runOracleSuite(suite) {
  return suite.scenarios
    .filter((scenario) => scenario.current_support !== "future-seam")
    .map((scenario) => scoreRun(suite, scenario, scenario.reference_run));
}

export function runFutureSeamSuite(suite) {
  return suite.scenarios
    .filter((scenario) => scenario.current_support === "future-seam")
    .map((scenario) => scoreRun(suite, scenario, scenario.reference_run));
}

export function runNegativeSuite(suite, negativeSuite) {
  const scenariosById = new Map(
    suite.scenarios.map((scenario) => [scenario.id, scenario])
  );
  return negativeSuite.cases.map((negativeCase) => {
    const scenario = scenariosById.get(negativeCase.scenario_id);
    if (!scenario) {
      throw new Error(
        `Unknown negative-case scenario: ${negativeCase.scenario_id}`
      );
    }
    const mutatedRun = applyMutations(
      scenario.reference_run,
      negativeCase.mutations
    );
    const score = scoreRun(suite, scenario, mutatedRun);
    const violationCodes = new Set(
      score.violations.map((violation) => violation.code)
    );
    const missingExpectedViolations = negativeCase.expected_violations.filter(
      (code) => !violationCodes.has(code)
    );
    return {
      caught: !score.passed && missingExpectedViolations.length === 0,
      id: negativeCase.id,
      missing_expected_violations: missingExpectedViolations,
      score,
    };
  });
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function main() {
  const { negative, scenarios } = loadSuites();
  const input = argValue("--input");
  const scenarioId = argValue("--scenario");
  if (input || scenarioId) {
    if (!(input && scenarioId)) {
      throw new Error("--input and --scenario must be supplied together.");
    }
    const scenario = scenarios.scenarios.find((item) => item.id === scenarioId);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioId}`);
    }
    const score = scoreRun(scenarios, scenario, readJson(resolve(input)));
    process.stdout.write(`${JSON.stringify(score, null, 2)}\n`);
    process.exitCode = score.passed ? 0 : 1;
    return;
  }

  const requestedSuite = argValue("--suite") ?? "all";
  if (!new Set(["all", "future", "negative", "oracle"]).has(requestedSuite)) {
    throw new Error(`Unknown suite: ${requestedSuite}`);
  }
  const oracleResults = new Set(["all", "oracle"]).has(requestedSuite)
    ? runOracleSuite(scenarios)
    : [];
  const futureResults = new Set(["all", "future"]).has(requestedSuite)
    ? runFutureSeamSuite(scenarios)
    : [];
  const negativeResults = new Set(["all", "negative"]).has(requestedSuite)
    ? runNegativeSuite(scenarios, negative)
    : [];
  const currentGapCoverage = [
    ...new Set(
      scenarios.scenarios
        .map((scenario) => scenario.expected.gap)
        .filter(Boolean)
    ),
  ].sort();
  const failedOracles = oracleResults.filter((result) => !result.passed);
  const invalidFutureCases = futureResults.filter(
    (result) =>
      result.passed ||
      !result.violations.some(
        (violation) => violation.code === "FUTURE_SEAM_UNSHIPPED"
      )
  );
  const missedNegatives = negativeResults.filter((result) => !result.caught);
  const artifact = {
    current_gap_coverage: currentGapCoverage,
    future_seam_cases: {
      invalid: invalidFutureCases.map((result) => result.scenario_id),
      total: futureResults.length,
      unshipped_as_expected: futureResults.length - invalidFutureCases.length,
    },
    negative_cases: {
      caught: negativeResults.length - missedNegatives.length,
      missed: missedNegatives.map((result) => result.id),
      total: negativeResults.length,
    },
    oracle_cases: {
      failed: failedOracles.map((result) => result.scenario_id),
      passed: oracleResults.length - failedOracles.length,
      total: oracleResults.length,
    },
    passed:
      failedOracles.length === 0 &&
      invalidFutureCases.length === 0 &&
      missedNegatives.length === 0,
    suite: requestedSuite,
    version: scenarios.version,
  };
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  process.exitCode = artifact.passed ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
