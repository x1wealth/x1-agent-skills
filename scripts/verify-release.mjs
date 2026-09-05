#!/usr/bin/env node

import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const root = realpathSync(new URL("..", import.meta.url));
const manifestPath = resolve(root, "release-manifest.json");
const errors = [];
const QUALIFICATION_SIGNATURE_NAMESPACE = "x1-agent-skills-v0.4.0";
const QUALIFICATION_SIGNING_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL1PEUvCxkxFyNwITXDaOCGPs57EP3n1k1R06CbvKRdc";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function hasExactKeys(value, keys) {
  if (!(value && typeof value === "object" && !Array.isArray(value))) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function readExternalFile(path, label) {
  if (!isAbsolute(path ?? "")) {
    throw new Error(`${label} must be an absolute path`);
  }
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    throw new Error(`${label} must be one regular file`, { cause: error });
  }
  if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1) {
    throw new Error(`${label} must be one regular file`);
  }
  const canonicalPath = realpathSync(path);
  const fromReleaseRoot = relative(root, canonicalPath).split(sep).join("/");
  if (
    !isAbsolute(fromReleaseRoot) &&
    fromReleaseRoot !== ".." &&
    !fromReleaseRoot.startsWith("../")
  ) {
    throw new Error(`${label} must be outside the release tree`);
  }
  return {
    bytes: readFileSync(canonicalPath),
    canonicalPath,
  };
}

function sshString(bytes) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  return Buffer.concat([header, bytes]);
}

function readSshString(bytes, offset, label) {
  if (offset + 4 > bytes.length) {
    throw new Error(`${label} is truncated`);
  }
  const length = bytes.readUInt32BE(offset);
  const start = offset + 4;
  const end = start + length;
  if (end > bytes.length) {
    throw new Error(`${label} is truncated`);
  }
  return { bytes: bytes.subarray(start, end), offset: end };
}

function parseExactEd25519KeyBlob(bytes, label) {
  const type = readSshString(bytes, 0, label);
  const key = readSshString(bytes, type.offset, label);
  if (
    type.bytes.toString("ascii") !== "ssh-ed25519" ||
    key.bytes.length !== 32 ||
    key.offset !== bytes.length
  ) {
    throw new Error(`${label} is not an exact Ed25519 key`);
  }
  return key.bytes;
}

function decodeSshSignatureArmor(bytes) {
  const lines = bytes.toString("utf8").trim().split(/\r?\n/u);
  if (
    lines.length < 3 ||
    lines[0] !== "-----BEGIN SSH SIGNATURE-----" ||
    lines.at(-1) !== "-----END SSH SIGNATURE-----"
  ) {
    throw new Error("qualification receipt signature is invalid");
  }
  const encoded = lines.slice(1, -1).join("");
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    throw new Error("qualification receipt signature is invalid");
  }
  return Buffer.from(encoded, "base64");
}

function verifyQualificationSignature(receiptPath, receiptBytes) {
  const signature = readExternalFile(
    `${receiptPath}.sig`,
    "qualification signature"
  );
  try {
    const decoded = decodeSshSignatureArmor(signature.bytes);
    if (decoded.subarray(0, 6).toString("ascii") !== "SSHSIG") {
      throw new Error("qualification receipt signature is invalid");
    }
    let offset = 6;
    if (offset + 4 > decoded.length || decoded.readUInt32BE(offset) !== 1) {
      throw new Error("qualification receipt signature is invalid");
    }
    offset += 4;
    const publicKey = readSshString(decoded, offset, "signature public key");
    offset = publicKey.offset;
    const namespace = readSshString(decoded, offset, "signature namespace");
    offset = namespace.offset;
    const reserved = readSshString(decoded, offset, "signature reserved field");
    offset = reserved.offset;
    const hashAlgorithm = readSshString(
      decoded,
      offset,
      "signature hash algorithm"
    );
    offset = hashAlgorithm.offset;
    const signatureBlob = readSshString(decoded, offset, "signature blob");
    if (signatureBlob.offset !== decoded.length) {
      throw new Error("qualification receipt signature is invalid");
    }

    const expectedKeyBlob = Buffer.from(
      QUALIFICATION_SIGNING_PUBLIC_KEY.split(" ")[1],
      "base64"
    );
    if (
      publicKey.bytes.length !== expectedKeyBlob.length ||
      !timingSafeEqual(publicKey.bytes, expectedKeyBlob) ||
      namespace.bytes.toString("utf8") !== QUALIFICATION_SIGNATURE_NAMESPACE ||
      reserved.bytes.length !== 0 ||
      hashAlgorithm.bytes.toString("ascii") !== "sha512"
    ) {
      throw new Error("qualification receipt signature is invalid");
    }

    const embeddedKey = parseExactEd25519KeyBlob(
      publicKey.bytes,
      "signature public key"
    );
    const expectedKey = parseExactEd25519KeyBlob(
      expectedKeyBlob,
      "qualification public key"
    );
    if (!timingSafeEqual(embeddedKey, expectedKey)) {
      throw new Error("qualification receipt signature is invalid");
    }

    const algorithm = readSshString(
      signatureBlob.bytes,
      0,
      "signature algorithm"
    );
    const rawSignature = readSshString(
      signatureBlob.bytes,
      algorithm.offset,
      "signature value"
    );
    if (
      algorithm.bytes.toString("ascii") !== "ssh-ed25519" ||
      rawSignature.bytes.length !== 64 ||
      rawSignature.offset !== signatureBlob.bytes.length
    ) {
      throw new Error("qualification receipt signature is invalid");
    }

    const signedPayload = Buffer.concat([
      Buffer.from("SSHSIG", "ascii"),
      sshString(namespace.bytes),
      sshString(reserved.bytes),
      sshString(hashAlgorithm.bytes),
      sshString(createHash("sha512").update(receiptBytes).digest()),
    ]);
    const spki = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      expectedKey,
    ]);
    const key = createPublicKey({ format: "der", key: spki, type: "spki" });
    if (!verify(null, signedPayload, key, rawSignature.bytes)) {
      throw new Error("qualification receipt signature is invalid");
    }
  } catch (error) {
    throw new Error("qualification receipt signature is invalid", {
      cause: error,
    });
  }
}

function readQualificationReceipt(path) {
  const receiptFile = readExternalFile(path, "--qualification-receipt");
  verifyQualificationSignature(receiptFile.canonicalPath, receiptFile.bytes);
  const receipt = JSON.parse(receiptFile.bytes.toString("utf8"));
  if (
    !(
      hasExactKeys(receipt, [
        "candidate",
        "claimBoundary",
        "contractId",
        "hostReceiptDigestRule",
        "namedHostQualification",
        "priorGrokQualification",
        "published",
        "qualified",
        "qualifiedDate",
        "releaseGates",
        "releaseTarget",
        "sourceRevision",
        "staticQualification",
        "status",
      ]) &&
      hasExactKeys(receipt.candidate, [
        "artifactQualificationStatus",
        "containsCustomerData",
        "containsGitHistory",
        "containsInternalStrategy",
        "containsProductionAdapter",
        "containsProductionTrace",
        "containsProviderCredential",
        "declaredFilesIncludingManifest",
        "deterministicArchiveSha256",
        "pluginExportManifestSha256",
        "releaseManifestSha256",
        "version",
      ])
    ) ||
    receipt.contractId !== "x1.agent-skills.github-release-qualification.v4" ||
    receipt.qualified !== true ||
    receipt.published !== false ||
    receipt.status !== "exact_v0_4_0_release_bytes_qualified_not_published" ||
    receipt.candidate.artifactQualificationStatus !== "exact_bytes_qualified" ||
    receipt.candidate.declaredFilesIncludingManifest !== 54 ||
    !/^[a-f0-9]{64}$/u.test(receipt.candidate.releaseManifestSha256 ?? "") ||
    !/^[a-f0-9]{40}$/u.test(receipt.sourceRevision ?? "") ||
    receipt.candidate.version !== "0.4.0"
  ) {
    throw new Error("qualification receipt is not the exact reviewed contract");
  }
  return receipt;
}

let qualificationReceipt = null;
try {
  qualificationReceipt = readQualificationReceipt(
    argValue("--qualification-receipt")
  );
} catch (error) {
  errors.push(
    error instanceof Error ? error.message : "qualification receipt is invalid"
  );
}
const manifestBytes = readFileSync(manifestPath);
const manifestSha256 = sha256(manifestBytes);
if (
  qualificationReceipt &&
  manifestSha256 !== qualificationReceipt.candidate.releaseManifestSha256
) {
  errors.push(
    "release manifest does not match the exact qualification receipt"
  );
}
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (
  qualificationReceipt &&
  (manifest.sourceRevision !== qualificationReceipt.sourceRevision ||
    manifest.version !== qualificationReceipt.candidate.version)
) {
  errors.push(
    "release identity does not match the exact qualification receipt"
  );
}

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
  /\bX1_[A-Z0-9_]{8,}_(?:PROGRAM|STRATEGY|PLANE)(?:_\d{4}(?:-\d{2}){2})?\b/u,
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
        manifestSha256,
        ok: true,
      },
      null,
      2
    )}\n`
  );
}
