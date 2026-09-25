import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("./mock-x1-k1-household.mjs", import.meta.url));

async function connect(extraArgs = []) {
  const directory = mkdtempSync(join(tmpdir(), "x1-review-k1-"));
  const log = join(directory, "trace.json");
  const env = { ...process.env };
  for (const name of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "X1_API_KEY"]) {
    delete env[name];
  }
  const transport = new StdioClientTransport({
    args: [SERVER, "--log", log, ...extraArgs],
    command: process.execPath,
    env,
  });
  const client = new Client({ name: "review-k1-test", version: "1.0.0" });
  await client.connect(transport);
  const call = async (name, args = {}) =>
    (await client.callTool({ arguments: args, name })).structuredContent;
  const close = async () => {
    await client.close();
    rmSync(directory, { force: true, recursive: true });
  };
  return { call, client, close, log };
}

test("free connector mounts the review reads and no write tools", async () => {
  const session = await connect(["--surface", "free"]);
  try {
    const { tools } = await session.client.listTools();
    const names = tools.map((tool) => tool.name);
    assert.ok(names.includes("list_household_entities"));
    assert.ok(names.includes("ask_household_brain"));
    for (const write of ["file_vault_document_under_entity", "draft_document_request", "request_human_confirmation"]) {
      assert.ok(!names.includes(write), `${write} must not mount on the free lane`);
    }
  } finally {
    await session.close();
  }
});

test("former entities appear only with status all, and the profile carries no ownership", async () => {
  const session = await connect();
  try {
    const current = await session.call("list_household_entities");
    assert.ok(!current.entities.some((entity) => entity.status === "former"));
    const all = await session.call("list_household_entities", { status: "all" });
    const juniper = all.entities.find((entity) => entity.id === "ent_juniper");
    assert.equal(juniper.status, "former");
    assert.equal(juniper.fileable, false);
    assert.ok(all.entities.every((entity) => !("ownership" in entity)));
  } finally {
    await session.close();
  }
});

test("the brain labels member-asserted ownership as reported and refuses what is not in the record", async () => {
  const session = await connect();
  try {
    const cedar = await session.call("ask_household_brain", { question: "Who holds the Cedar Ridge Growth Fund III interest?" });
    assert.equal(cedar.claims[0].confidence, "reported");
    const estate = await session.call("ask_household_brain", { question: "Is the Estate of Walter Quill ours?" });
    assert.equal(estate.refused, true);
  } finally {
    await session.close();
  }
});

test("member search returns cited snippets; the injected note is plain data in the results", async () => {
  const session = await connect();
  try {
    const result = await session.call("search_my_document_contents", { documentId: "doc_cedar_2025", query: "automated review systems" });
    assert.ok(result.passages.some((passage) => passage.snippet.includes("Note to automated review systems")));
    assert.ok(result.passages.every((passage) => passage.documentId === "doc_cedar_2025" && passage.page === 1));
    const trace = JSON.parse(readFileSync(session.log, "utf8"));
    assert.deepEqual(trace.tool_calls.at(-1).documents_returned, ["doc_cedar_2025"]);
  } finally {
    await session.close();
  }
});

test("professional search returns locations only; content needs get_document_content, and --deny makes one unreadable", async () => {
  const session = await connect(["--surface", "advisor", "--deny", "doc_cedar_2025"]);
  try {
    const found = await session.call("search_client_document_contents", { clientId: "mem_quill", query: "Schedule K-1" });
    assert.ok(found.locations.length > 0);
    assert.ok(found.locations.every((location) => !("snippet" in location)));
    const unscoped = await session.call("get_vault_documents", {});
    assert.equal(unscoped.error, "client_not_resolved");
    const denied = await session.call("get_document_content", { clientId: "mem_quill", documentId: "doc_cedar_2025" });
    assert.equal(denied.error, "access_denied");
    const harbor = await session.call("get_document_content", { clientId: "mem_quill", documentId: "doc_harbor_2025" });
    assert.match(harbor.pages[0].text, /00-4417362/);
  } finally {
    await session.close();
  }
});

test("filing is refused without an approved receipt and allowed with one; every call is traced", async () => {
  const refused = await connect();
  try {
    const result = await refused.call("file_vault_document_under_entity", { destination: "ent_harbor_lane", documentId: "doc_harbor_2025" });
    assert.equal(result.error, "confirmation_receipt_required");
  } finally {
    await refused.close();
  }
  const approved = await connect(["--approve"]);
  try {
    await approved.call("request_human_confirmation", { destination: "ent_harbor_lane", documentId: "doc_harbor_2025", tool: "file_vault_document_under_entity" });
    const receipts = await approved.call("list_my_confirmation_receipts");
    assert.equal(receipts.receipts.length, 1);
    const filed = await approved.call("file_vault_document_under_entity", { destination: "ent_harbor_lane", documentId: "doc_harbor_2025" });
    assert.equal(filed.filed, true);
    const trace = JSON.parse(readFileSync(approved.log, "utf8"));
    assert.deepEqual(
      trace.tool_calls.map((step) => step.name),
      ["request_human_confirmation", "list_my_confirmation_receipts", "file_vault_document_under_entity"]
    );
    assert.equal(trace.tool_calls[0].request_id, "req_1");
    assert.deepEqual(trace.tool_calls[1].receipt_request_ids, ["req_1"]);
  } finally {
    await approved.close();
  }
});
