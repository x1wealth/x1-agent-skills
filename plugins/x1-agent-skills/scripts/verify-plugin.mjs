#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const root = realpathSync(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, "export-manifest.json"), "utf8"));
const errors = [];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const absolute = resolve(directory, entry.name);
  const path = relative(root, absolute).split(sep).join("/");
  const stats = lstatSync(absolute);
  if (stats.isSymbolicLink()) {
    errors.push(`symlink is forbidden: ${path}`);
    return [];
  }
  if (entry.isDirectory()) {
    return entry.name === "node_modules" ? [] : walk(absolute);
  }
  return path === "export-manifest.json" ? [] : [path];
});
const actual = walk(root).sort();
const declared = manifest.files.map((file) => file.path).sort();
if (JSON.stringify(actual) !== JSON.stringify(declared)) {
  errors.push("plugin export inventory does not match");
}
for (const entry of manifest.files) {
  const bytes = readFileSync(resolve(root, entry.path));
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
    errors.push(`plugin file mismatch: ${entry.path}`);
  }
}
if (manifest.artifactQualificationStatus !== "exact_bytes_qualified") {
  errors.push("unexpected plugin artifact qualification status");
}
const expectedPublicationStatus = {
  "directories": {
    "claude": "not_published",
    "grok": "not_published",
    "openai": "not_published"
  },
  "github": {
    "priorVerifiedRelease": "v0.1.1",
    "repository": "published"
  }
};
if (
  JSON.stringify(manifest.publicationStatus) !==
  JSON.stringify(expectedPublicationStatus)
) {
  errors.push("unexpected plugin publication status");
}
if (errors.length) {
  process.stdout.write(`${JSON.stringify({ errors, ok: false }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ files: declared.length + 1, ok: true }, null, 2)}\n`);
}
