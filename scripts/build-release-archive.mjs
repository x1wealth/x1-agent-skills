#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const releaseRoot = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(releaseRoot, "release-manifest.json");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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

function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
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

export function buildReleaseArchive({ outputPath }) {
  if (!isAbsolute(outputPath)) {
    throw new Error("--output must be an absolute path");
  }
  const resolvedOutput = resolve(outputPath);
  const outputFromRoot = relative(releaseRoot, resolvedOutput)
    .split(sep)
    .join("/");
  if (outputFromRoot !== ".." && !outputFromRoot.startsWith("../")) {
    throw new Error("release archive output must be outside the release tree");
  }

  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest.contractId !== "x1.agent-skills-public-release.v1" ||
    manifest.artifactQualificationStatus !== "exact_bytes_qualified" ||
    !Array.isArray(manifest.files)
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
  writeFileSync(resolvedOutput, archive, { flag: "wx", mode: 0o600 });
  return {
    archiveSha256: sha256(archive),
    files: expected.length,
    manifestSha256: sha256(manifestBytes),
    sourceRevision: manifest.sourceRevision,
    version: manifest.version,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const outputPath = argValue("--output");
  if (!outputPath) {
    throw new Error("--output is required");
  }
  process.stdout.write(
    `${JSON.stringify(buildReleaseArchive({ outputPath }), null, 2)}\n`
  );
}
