#!/usr/bin/env node
// Portable export derived from X1 source revision e91e1658669cc73e0c13ce6444892105edd31955.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { normalizeCapturedX1Call } from "./normalize-captured-x1-result.mjs";

const EVAL_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));

const PROVIDER_CREDENTIAL_NAMES = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
];
for (const name of PROVIDER_CREDENTIAL_NAMES) {
  if (process.env[name]) {
    throw new Error("Provider credential crossed into the synthetic MCP child");
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const scenarioId = argValue("--scenario");
const logPath = argValue("--log");
if (!(scenarioId && logPath)) {
  throw new Error("--scenario and --log are required.");
}

const suite = loadJson(resolve(EVAL_DIRECTORY, "host-scenarios.json"));
const scenario = suite.scenarios.find((item) => item.id === scenarioId);
if (!scenario) {
  throw new Error(`Unknown host scenario: ${scenarioId}`);
}

const toolCalls = [];
writeFileSync(logPath, `${JSON.stringify(toolCalls, null, 2)}\n`);

const server = new McpServer({
  name: "x1-capital-call-eval",
  version: suite.version,
});
const toolCallCounts = new Map();

for (const [name, fixture] of Object.entries(scenario.tools)) {
  const inputSchema =
    fixture.input_schema === "action_request_disposition_v1"
      ? {
          projection: z.literal("disposition_v1"),
          requestId: z.string().uuid(),
        }
      : fixture.input_schema === "exact_finance_document_metadata_v1"
        ? {
            category: z.string().trim().min(1).optional(),
            clientId: z.string().trim().min(1).optional(),
            documentId: z.string().trim().min(1).optional(),
            limit: z.number().min(1).max(100).optional(),
          }
        : fixture.input_schema === "capital_call_resume_and_detail_v1"
          ? {
              obligationId: z
                .literal(fixture.expected_arguments.obligationId)
                .optional(),
              projection: z.literal("capital_call_resume_v1").optional(),
              threadId: z.literal(fixture.expected_arguments.threadId),
            }
          : fixture.input_schema === "coordination_thread_id"
            ? {
                threadId: z.literal(fixture.expected_arguments.threadId),
              }
            : {};
  server.registerTool(
    name,
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: fixture.effect === "read",
        openWorldHint: false,
        readOnlyHint: fixture.effect === "read",
      },
      description: fixture.description,
      inputSchema,
      title: `X1 eval: ${name}`,
    },
    (args) => {
      const callCount = toolCallCounts.get(name) ?? 0;
      toolCallCounts.set(name, callCount + 1);
      const result = fixture.results?.[callCount] ?? fixture.result;
      if (!result) {
        throw new Error(`No fixture result ${callCount} for ${name}.`);
      }
      const resumeIdentityIds = Object.values(
        result.resume_identity ?? {}
      ).filter((identity) => typeof identity === "string");
      const sourceIds = [
        ...(result.source_ids ?? []),
        ...(typeof result.id === "string" ? [result.id] : []),
        ...resumeIdentityIds,
        ...(typeof result.requestId === "string" ? [result.requestId] : []),
        ...(result.requests ?? [])
          .map((request) => request?.requestId)
          .filter((requestId) => typeof requestId === "string"),
      ];
      toolCalls.push(
        normalizeCapturedX1Call({
          arguments: args,
          citations: [
            ...(result.citations ?? []),
            ...(result.messages ?? [])
              .map((message) => message?.id)
              .filter((messageId) => typeof messageId === "string")
              .map((messageId) => `coordination:${messageId}`),
          ],
          effect: fixture.effect,
          name,
          outcome: result.outcome ?? "success",
          source_ids: [...new Set(sourceIds)],
          structured_result: result,
        })
      );
      writeFileSync(logPath, `${JSON.stringify(toolCalls, null, 2)}\n`);
      return {
        content: [{ text: JSON.stringify(result), type: "text" }],
        structuredContent: result,
      };
    }
  );
}

await server.connect(new StdioServerTransport());
