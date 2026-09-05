#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const releaseRoot = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(releaseRoot, "release-manifest.json");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function safeRelativePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..")
  );
}

function isRootGitMetadata(path, entry) {
  return path === ".git" && (entry.isDirectory() || entry.isFile());
}

function releaseEntries(root, directory) {
  return readdirSync(directory, { withFileTypes: true }).filter((entry) => {
    const path = relative(root, resolve(directory, entry.name))
      .split(sep)
      .join("/");
    return !isRootGitMetadata(path, entry);
  });
}

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of releaseEntries(root, directory)) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      const stats = lstatSync(absolute);
      if (stats.isSymbolicLink() || !(stats.isDirectory() || stats.isFile())) {
        throw new Error(`Release tree contains unsupported entry: ${path}`);
      }
      if (stats.isDirectory()) {
        visit(absolute);
      } else {
        if (stats.nlink !== 1) {
          throw new Error(`Release tree contains hardlinked file: ${path}`);
        }
        const permissionDigits = (stats.mode % 0o1000)
          .toString(8)
          .padStart(3, "0");
        if ([...permissionDigits].some((digit) => Number(digit) % 2 === 1)) {
          throw new Error(`Release tree contains executable file: ${path}`);
        }
        files.push(path);
      }
    }
  };
  visit(root);
  return files.sort();
}

function writeOctal(buffer, offset, length, value) {
  const rendered = value.toString(8).padStart(length - 1, "0");
  if (rendered.length > length - 1) {
    throw new Error("Archive value does not fit the ustar header");
  }
  buffer.write(rendered, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function splitArchivePath(path) {
  if (Buffer.byteLength(path) <= 100) {
    return { name: path, prefix: "" };
  }
  const segments = path.split("/");
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const prefix = segments.slice(0, index).join("/");
    const name = segments.slice(index).join("/");
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`Archive path is too long for ustar: ${path}`);
}

function tarHeader(path, size) {
  const header = Buffer.alloc(512);
  const { name, prefix } = splitArchivePath(path);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("root", 265, 32, "ascii");
  header.write("root", 297, 32, "ascii");
  if (prefix) {
    header.write(prefix, 345, 155, "utf8");
  }
  const checksum = header.reduce((total, byte) => total + byte, 0);
  const renderedChecksum = checksum.toString(8).padStart(6, "0");
  header.write(renderedChecksum, 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function readQualificationReceipt(path) {
  if (!isAbsolute(path ?? "")) {
    throw new Error("--qualification-receipt must be an absolute path");
  }
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1) {
    throw new Error("qualification receipt must be one regular file");
  }
  const canonicalPath = realpathSync(path);
  const fromReleaseRoot = relative(releaseRoot, canonicalPath)
    .split(sep)
    .join("/");
  if (fromReleaseRoot !== ".." && !fromReleaseRoot.startsWith("../")) {
    throw new Error("qualification receipt must be outside the release tree");
  }
  const receipt = JSON.parse(readFileSync(canonicalPath, "utf8"));
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
    !/^[a-f0-9]{64}$/u.test(
      receipt.candidate.deterministicArchiveSha256 ?? ""
    ) ||
    !/^[a-f0-9]{64}$/u.test(receipt.candidate.releaseManifestSha256 ?? "") ||
    !/^[a-f0-9]{40}$/u.test(receipt.sourceRevision ?? "") ||
    receipt.candidate.version !== "0.4.0"
  ) {
    throw new Error("qualification receipt is not the exact reviewed contract");
  }
  return {
    deterministicArchiveSha256: receipt.candidate.deterministicArchiveSha256,
    releaseManifestSha256: receipt.candidate.releaseManifestSha256,
    sourceRevision: receipt.sourceRevision,
    version: receipt.candidate.version,
  };
}

export function buildReleaseArchive({ outputPath, qualificationReceiptPath }) {
  if (!isAbsolute(outputPath)) {
    throw new Error("--output must be an absolute path");
  }
  const qualificationReceipt = readQualificationReceipt(
    qualificationReceiptPath
  );
  const resolvedOutput = resolve(outputPath);
  const canonicalOutput = resolve(
    realpathSync(dirname(resolvedOutput)),
    basename(resolvedOutput)
  );
  const outputFromRoot = relative(releaseRoot, canonicalOutput)
    .split(sep)
    .join("/");
  if (outputFromRoot !== ".." && !outputFromRoot.startsWith("../")) {
    throw new Error("release archive output must be outside the release tree");
  }

  const manifestBytes = readFileSync(manifestPath);
  const manifestSha256 = sha256(manifestBytes);
  if (manifestSha256 !== qualificationReceipt.releaseManifestSha256) {
    throw new Error(
      "release manifest does not match the exact qualified manifest SHA-256"
    );
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest.contractId !== "x1.agent-skills-public-release.v1" ||
    manifest.artifactQualificationStatus !== "exact_bytes_qualified" ||
    !Array.isArray(manifest.files) ||
    manifest.sourceRevision !== qualificationReceipt.sourceRevision ||
    manifest.version !== qualificationReceipt.version
  ) {
    throw new Error(
      "release manifest is not an exact qualified X1 public release"
    );
  }
  const archivePrefix = `x1-agent-skills-${manifest.version}`;
  const declared = new Set();
  for (const entry of manifest.files) {
    if (!safeRelativePath(entry.path) || declared.has(entry.path)) {
      throw new Error("release manifest contains an unsafe or duplicate path");
    }
    declared.add(entry.path);
    const bytes = readFileSync(resolve(releaseRoot, entry.path));
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`release manifest mismatch: ${entry.path}`);
    }
  }
  const actual = listFiles(releaseRoot);
  const expected = [...declared, "release-manifest.json"].sort();
  if (
    actual.length !== expected.length ||
    actual.some((path, index) => path !== expected[index])
  ) {
    throw new Error("release tree inventory does not match the manifest");
  }

  const chunks = [];
  for (const path of expected) {
    const bytes = readFileSync(resolve(releaseRoot, path));
    chunks.push(tarHeader(`${archivePrefix}/${path}`, bytes.length), bytes);
    const remainder = bytes.length % 512;
    if (remainder !== 0) {
      chunks.push(Buffer.alloc(512 - remainder));
    }
  }
  chunks.push(Buffer.alloc(1024));
  const archive = Buffer.concat(chunks);
  const archiveSha256 = sha256(archive);
  if (archiveSha256 !== qualificationReceipt.deterministicArchiveSha256) {
    throw new Error(
      `release archive does not match the exact qualified archive SHA-256 (actual archive SHA-256: ${archiveSha256})`
    );
  }
  writeFileSync(canonicalOutput, archive, { flag: "wx", mode: 0o600 });
  return {
    archiveSha256,
    files: expected.length,
    manifestSha256,
    sourceRevision: manifest.sourceRevision,
    version: manifest.version,
  };
}

const invokedPath = process.argv[1]
  ? realpathSync(resolve(process.argv[1]))
  : null;
const modulePath = realpathSync(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const outputPath = argValue("--output");
  const qualificationReceiptPath = argValue("--qualification-receipt");
  if (!outputPath) {
    throw new Error("--output is required");
  }
  process.stdout.write(
    `${JSON.stringify(
      buildReleaseArchive({ outputPath, qualificationReceiptPath }),
      null,
      2
    )}\n`
  );
}
