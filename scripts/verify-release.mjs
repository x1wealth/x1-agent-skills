#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const root = realpathSync(new URL("..", import.meta.url));
const manifestPath = resolve(root, "release-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const errors = [];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const forbiddenSegments = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "qualification",
]);
const forbiddenBasenames = new Set([
  ".env",
  "HOST_INVOCATION.md",
  "LICENSE_DECISION.md",
]);
const allowedPublicHosts = new Set([
  "eve.dev",
  "github.com",
  "json-schema.org",
  "mcp.x1wealth.com",
  "www.apache.org",
  "x1wealth.com",
]);
const forbiddenInternalStrategyText = [
  /\bx1-w-[a-z0-9][a-z0-9.-]*\b/iu,
  /(?:^|[/\\])\.beads(?:[/\\]|$)/imu,
  /docs\/plans\//iu,
  /strategy\/agent-native/iu,
  /X1_AGENT_(?:FIRST_FINANCIAL_EVENT_ACQUISITION_PROGRAM|NATIVE_HOUSEHOLD_CONTROL_PLANE)/u,
  /45[- ]day assisted commercial cohort/iu,
  /household\/operator\/professional distribution barbell/iu,
  /repeated professional initiation/iu,
];

function isRootGitMetadata(path, entry) {
  return path === ".git" && (entry.isDirectory() || entry.isFile());
}

function releaseEntries(directory) {
  return readdirSync(directory, { withFileTypes: true }).filter((entry) => {
    const path = relative(root, resolve(directory, entry.name))
      .split(sep)
      .join("/");
    return !isRootGitMetadata(path, entry);
  });
}

function walk(directory) {
  const files = [];
  for (const entry of releaseEntries(directory)) {
    const absolute = resolve(directory, entry.name);
    const path = relative(root, absolute).split(sep).join("/");
    const stats = lstatSync(absolute);
    if (stats.isSymbolicLink()) {
      errors.push(`symlink is forbidden: ${path}`);
      continue;
    }
    if (stats.nlink > 1 && stats.isFile()) {
      errors.push(`hardlink is forbidden: ${path}`);
    }
    if (entry.isDirectory()) {
      if (path.split("/").some((segment) => forbiddenSegments.has(segment))) {
        errors.push(`forbidden path segment: ${path}`);
        continue;
      }
      files.push(...walk(absolute));
      continue;
    }
    if (!(entry.isFile() || stats.isFile())) {
      errors.push(`non-regular file is forbidden: ${path}`);
      continue;
    }
    if (forbiddenBasenames.has(entry.name) || path.includes("real-x1-")) {
      errors.push(`private export path is forbidden: ${path}`);
    }
    if (path !== "release-manifest.json") {
      files.push(path);
    }
  }
  return files;
}

const actualPaths = walk(root).sort();
const declaredPaths = manifest.files.map((file) => file.path).sort();
if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
  errors.push("release manifest file inventory does not match the repository");
}

for (const entry of manifest.files) {
  const absolute = resolve(root, entry.path);
  const normalized = relative(root, absolute).split(sep).join("/");
  if (normalized !== entry.path || normalized.startsWith("../")) {
    errors.push(`unsafe manifest path: ${entry.path}`);
    continue;
  }
  const bytes = readFileSync(absolute);
  if (bytes.length !== entry.bytes) {
    errors.push(`byte count mismatch: ${entry.path}`);
  }
  if (sha256(bytes) !== entry.sha256) {
    errors.push(`SHA mismatch: ${entry.path}`);
  }
  if (
    /\.(?:json|md|mjs|txt|yaml)$/u.test(entry.path) &&
    entry.path !== "scripts/verify-release.mjs"
  ) {
    const text = bytes.toString("utf8");
    if (
      /\/Users\/|\/home\/|private candidate|not for publication/iu.test(text)
    ) {
      errors.push(`forbidden private text in ${entry.path}`);
    }
    if (/docs\/mcp\/skills/iu.test(text)) {
      errors.push(`forbidden private monorepo path in ${entry.path}`);
    }
    if (forbiddenInternalStrategyText.some((pattern) => pattern.test(text))) {
      errors.push(`forbidden internal strategy text in ${entry.path}`);
    }
    for (const match of text.matchAll(/https:\/\/[^\s)"'<>`]+/gu)) {
      let url;
      try {
        url = new URL(match[0].replace(/[.,;:]$/u, ""));
      } catch {
        errors.push(`malformed public URL in ${entry.path}`);
        continue;
      }
      if (!allowedPublicHosts.has(url.hostname)) {
        errors.push(
          `unapproved public URL host ${url.hostname} in ${entry.path}`
        );
      }
    }
  }
}

if (manifest.contractId !== "x1.agent-skills-public-release.v1") {
  errors.push("unexpected release manifest contractId");
}
if (manifest.artifactQualificationStatus !== "exact_bytes_qualified") {
  errors.push("unexpected artifact qualification status");
}
if (
  manifest.publicationAuthorized !== true ||
  manifest.releaseStatus !== "exact_bytes_qualified_for_publication"
) {
  errors.push("release authorization status is not exact");
}
const expectedPublicationStatus = {
  directories: {
    claude: "x1_hosted_marketplace_published_anthropic_directory_not_submitted",
    grok: "not_published",
    openai: "submitted_provider_status_pending_publication_unverified",
  },
  github: { priorVerifiedRelease: "v0.3.1", repository: "published" },
};
if (
  JSON.stringify(manifest.publicationStatus) !==
  JSON.stringify(expectedPublicationStatus)
) {
  errors.push("unexpected publication status");
}
const compatibility = JSON.parse(
  readFileSync(resolve(root, "compatibility.json"), "utf8")
);
const pluginExportManifest = JSON.parse(
  readFileSync(
    resolve(root, "plugins/x1-agent-skills/export-manifest.json"),
    "utf8"
  )
);
if (compatibility.artifactQualificationStatus !== "exact_bytes_qualified") {
  errors.push("compatibility artifact qualification status disagrees");
}
if (
  pluginExportManifest.artifactQualificationStatus !== "exact_bytes_qualified"
) {
  errors.push("plugin export manifest artifact qualification status disagrees");
}
for (const [label, metadata] of [
  ["compatibility", compatibility],
  ["plugin export manifest", pluginExportManifest],
]) {
  if (
    metadata.publicationAuthorized !== true ||
    metadata.releaseStatus !== "exact_bytes_qualified_for_publication"
  ) {
    errors.push(`${label} release authorization status disagrees`);
  }
}
for (const [label, metadata] of [
  ["compatibility", compatibility],
  ["plugin export manifest", pluginExportManifest],
]) {
  if (
    JSON.stringify(metadata.publicationStatus) !==
    JSON.stringify(expectedPublicationStatus)
  ) {
    errors.push(`${label} publication status disagrees`);
  }
}
if (manifest.license !== "Apache-2.0") {
  errors.push("public release must use Apache-2.0");
}
if (manifest.publisher !== "Lever Wealth LLC") {
  errors.push("public release publisher must be Lever Wealth LLC");
}

const requiredPaths = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  ".grok-plugin/marketplace.json",
  "GROK_BOT_PROFILE.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "RECEIPTS.md",
  "SECURITY.md",
  "THE_STOP_TEST.md",
  "compatibility.json",
  "dependency-licenses.json",
  "discovery-prompts.json",
  "llms.txt",
  "integrations/eve/README.md",
  "integrations/grok/README.md",
  "plugins/x1-agent-skills/.claude-plugin/plugin.json",
  "plugins/x1-agent-skills/.codex-plugin/plugin.json",
  "plugins/x1-agent-skills/GROK_BOT_PROFILE.md",
  "plugins/x1-agent-skills/integrations/grok/README.md",
  "plugins/x1-agent-skills/skills/handle-capital-call/SKILL.md",
  "sbom.spdx.json",
];
for (const path of requiredPaths) {
  if (!declaredPaths.includes(path)) {
    errors.push(`required public file is missing: ${path}`);
  }
}
for (const forbidden of [
  ".app.json",
  ".mcp.json",
  "plugins/x1-agent-skills/LICENSE_DECISION.md",
]) {
  if (declaredPaths.some((path) => path.endsWith(forbidden))) {
    errors.push(`unverified integration file is forbidden: ${forbidden}`);
  }
}

const codexManifest = JSON.parse(
  readFileSync(
    resolve(root, "plugins/x1-agent-skills/.codex-plugin/plugin.json"),
    "utf8"
  )
);
if (codexManifest.license !== "Apache-2.0") {
  errors.push("Codex manifest license is not Apache-2.0");
}
if (
  codexManifest.repository !== "https://github.com/x1wealth/x1-agent-skills"
) {
  errors.push("Codex manifest repository is not the approved branded URL");
}
if (codexManifest.apps || codexManifest.mcpServers) {
  errors.push(
    "Codex manifest must remain skill-only until the exact app is verified"
  );
}
if (
  !Array.isArray(codexManifest.interface?.defaultPrompt) ||
  codexManifest.interface.defaultPrompt.length === 0 ||
  codexManifest.interface.defaultPrompt.length > 3 ||
  codexManifest.interface.defaultPrompt.some(
    (prompt) => typeof prompt !== "string" || prompt.length > 128
  )
) {
  errors.push("Codex defaultPrompt must contain one to three short prompts");
}

const claudeManifest = JSON.parse(
  readFileSync(
    resolve(root, "plugins/x1-agent-skills/.claude-plugin/plugin.json"),
    "utf8"
  )
);
if (claudeManifest.defaultEnabled !== false) {
  errors.push("Claude external-service plugin must default to disabled");
}
if (claudeManifest.mcpServers?.x1?.url !== "https://mcp.x1wealth.com/mcp") {
  errors.push("Claude manifest must use the exact public X1 MCP endpoint");
}

const grokMarketplace = JSON.parse(
  readFileSync(resolve(root, ".grok-plugin/marketplace.json"), "utf8")
);
const grokPlugin = grokMarketplace.plugins?.find(
  (plugin) => plugin.name === "x1-agent-skills"
);
if (
  grokMarketplace.name !== "x1-wealth" ||
  grokPlugin?.source?.type !== "local" ||
  grokPlugin?.source?.path !== "./plugins/x1-agent-skills"
) {
  errors.push("Grok marketplace must bind the exact local X1 plugin path");
}

const discovery = JSON.parse(
  readFileSync(resolve(root, "discovery-prompts.json"), "utf8")
);
const discoveryIds = new Set();
const discoveryPrompts = new Set();
for (const [kind, minimum] of [
  ["direct", 5],
  ["indirect", 5],
  ["negative", 8],
]) {
  const count = discovery.cases.filter((item) => item.kind === kind).length;
  if (count < minimum) {
    errors.push(`discovery prompt set needs at least ${minimum} ${kind} cases`);
  }
}
for (const item of discovery.cases) {
  if (discoveryIds.has(item.id) || discoveryPrompts.has(item.prompt)) {
    errors.push(`duplicate discovery case: ${item.id}`);
  }
  discoveryIds.add(item.id);
  discoveryPrompts.add(item.prompt);
  if (item.kind === "negative" && item.shouldActivate !== false) {
    errors.push(`negative discovery case activates: ${item.id}`);
  }
  if (
    (item.kind === "direct" || item.kind === "indirect") &&
    item.shouldActivate !== true
  ) {
    errors.push(`positive discovery case does not activate: ${item.id}`);
  }
}
const skill = readFileSync(
  resolve(root, "plugins/x1-agent-skills/skills/handle-capital-call/SKILL.md"),
  "utf8"
);
if (
  !(
    skill.includes("Use when a user received, uploaded, needs to fund") &&
    skill.includes("never use it to move money")
  )
) {
  errors.push(
    "skill metadata lost its positive or negative activation boundary"
  );
}

if (errors.length > 0) {
  process.stdout.write(`${JSON.stringify({ errors, ok: false }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify(
      {
        files: declaredPaths.length + 1,
        manifestSha256: sha256(readFileSync(manifestPath)),
        ok: true,
      },
      null,
      2
    )}\n`
  );
}
