/* global Buffer, URL */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ETF_ARTIFACT_SHARD_SCHEMA_VERSION = "1.0.0";
export const ETF_ARTIFACT_MAX_SHARD_BYTES = 4 * 1024 * 1024;
const INLINE_VALUE_MAX_BYTES = 128 * 1024;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function normalizePath(path) {
  return path instanceof URL ? fileURLToPath(path) : path;
}

export function etfArtifactShardDirectory(path) {
  const normalized = normalizePath(path);
  return extname(normalized) === ".json" ? normalized.slice(0, -5) : normalized;
}

export function etfArtifactManifestPath(path) {
  return join(etfArtifactShardDirectory(path), "manifest.json");
}

function assertManifest(manifest, manifestPath) {
  if (manifest.schemaVersion !== ETF_ARTIFACT_SHARD_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported ETF artifact shard schema ${manifest.schemaVersion} in ${manifestPath}`,
    );
  }
  if (!Array.isArray(manifest.sections)) {
    throw new Error(`ETF artifact manifest has no sections: ${manifestPath}`);
  }
}

function verifyBytes(bytes, record, path) {
  if (bytes.length !== record.bytes) {
    throw new Error(`ETF artifact shard byte mismatch for ${path}`);
  }
  if (sha256(bytes) !== record.sha256) {
    throw new Error(`ETF artifact shard hash mismatch for ${path}`);
  }
}

function reconstructSync(manifest, directory) {
  const artifact = {};
  for (const section of manifest.sections) {
    if (section.kind === "inline") {
      artifact[section.key] = section.value;
      continue;
    }
    if (section.kind === "array") {
      artifact[section.key] = section.shards.flatMap((record) => {
        const path = join(directory, record.filename);
        const bytes = readFileSync(path);
        verifyBytes(bytes, record, path);
        return JSON.parse(bytes.toString("utf8"));
      });
      continue;
    }
    if (section.kind === "object") {
      artifact[section.key] = Object.assign(
        {},
        ...section.shards.map((record) => {
          const path = join(directory, record.filename);
          const bytes = readFileSync(path);
          verifyBytes(bytes, record, path);
          return JSON.parse(bytes.toString("utf8"));
        }),
      );
      continue;
    }
    throw new Error(`Unsupported ETF artifact section kind ${section.kind}`);
  }
  const logicalBytes = Buffer.from(JSON.stringify(artifact));
  verifyBytes(logicalBytes, manifest.logical, directory);
  return artifact;
}

async function reconstruct(manifest, directory) {
  const artifact = {};
  for (const section of manifest.sections) {
    if (section.kind === "inline") {
      artifact[section.key] = section.value;
      continue;
    }
    if (section.kind === "array") {
      const values = [];
      for (const record of section.shards) {
        const path = join(directory, record.filename);
        const bytes = await readFile(path);
        verifyBytes(bytes, record, path);
        values.push(...JSON.parse(bytes.toString("utf8")));
      }
      artifact[section.key] = values;
      continue;
    }
    if (section.kind === "object") {
      const value = {};
      for (const record of section.shards) {
        const path = join(directory, record.filename);
        const bytes = await readFile(path);
        verifyBytes(bytes, record, path);
        Object.assign(value, JSON.parse(bytes.toString("utf8")));
      }
      artifact[section.key] = value;
      continue;
    }
    throw new Error(`Unsupported ETF artifact section kind ${section.kind}`);
  }
  const logicalBytes = Buffer.from(JSON.stringify(artifact));
  verifyBytes(logicalBytes, manifest.logical, directory);
  return artifact;
}

export function readEtfArtifactSync(path) {
  const normalized = normalizePath(path);
  if (existsSync(normalized)) return JSON.parse(readFileSync(normalized, "utf8"));
  const manifestPath = etfArtifactManifestPath(normalized);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assertManifest(manifest, manifestPath);
  return reconstructSync(manifest, dirname(manifestPath));
}

export async function readEtfArtifact(path) {
  const normalized = normalizePath(path);
  try {
    return JSON.parse(await readFile(normalized, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const manifestPath = etfArtifactManifestPath(normalized);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assertManifest(manifest, manifestPath);
  return await reconstruct(manifest, dirname(manifestPath));
}

function shardName(key, index) {
  const stem = key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${stem}-${String(index).padStart(3, "0")}.json`;
}

function packArray(value) {
  const chunks = [];
  let chunk = [];
  let bytes = 3;
  for (const item of value) {
    const itemBytes = Buffer.byteLength(JSON.stringify(item));
    const nextBytes = bytes + (chunk.length === 0 ? 0 : 1) + itemBytes;
    if (chunk.length > 0 && nextBytes > ETF_ARTIFACT_MAX_SHARD_BYTES) {
      chunks.push(chunk);
      chunk = [];
      bytes = 3;
    }
    if (bytes + itemBytes > ETF_ARTIFACT_MAX_SHARD_BYTES) {
      throw new Error("A single ETF artifact array value exceeds the shard byte limit");
    }
    bytes += (chunk.length === 0 ? 0 : 1) + itemBytes;
    chunk.push(item);
  }
  if (chunk.length > 0 || value.length === 0) chunks.push(chunk);
  return chunks;
}

function packObject(value) {
  const chunks = [];
  let chunk = {};
  let count = 0;
  let bytes = 3;
  for (const [key, item] of Object.entries(value)) {
    const entryBytes = Buffer.byteLength(`${JSON.stringify(key)}:${JSON.stringify(item)}`);
    const nextBytes = bytes + (count === 0 ? 0 : 1) + entryBytes;
    if (count > 0 && nextBytes > ETF_ARTIFACT_MAX_SHARD_BYTES) {
      chunks.push(chunk);
      chunk = {};
      count = 0;
      bytes = 3;
    }
    if (bytes + entryBytes > ETF_ARTIFACT_MAX_SHARD_BYTES) {
      throw new Error(`ETF artifact object entry ${key} exceeds the shard byte limit`);
    }
    bytes += (count === 0 ? 0 : 1) + entryBytes;
    chunk[key] = item;
    count += 1;
  }
  if (count > 0 || Object.keys(value).length === 0) chunks.push(chunk);
  return chunks;
}

async function writeShard(directory, key, index, value) {
  const filename = shardName(key, index);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (bytes.length > ETF_ARTIFACT_MAX_SHARD_BYTES) {
    throw new Error(`${filename} exceeds ${ETF_ARTIFACT_MAX_SHARD_BYTES} bytes`);
  }
  await writeFile(join(directory, filename), bytes);
  return {
    filename,
    count: Array.isArray(value) ? value.length : Object.keys(value).length,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

export async function writeEtfArtifact(path, artifact, options = {}) {
  const normalized = normalizePath(path);
  const directory = etfArtifactShardDirectory(normalized);
  const serializedArtifact = JSON.stringify(artifact);
  if (serializedArtifact === undefined) {
    throw new Error(`ETF artifact is not JSON serializable: ${normalized}`);
  }
  const persistedArtifact = JSON.parse(serializedArtifact);
  await rm(normalized, { force: true });
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  const sections = [];
  for (const [key, value] of Object.entries(persistedArtifact)) {
    const logicalBytes = Buffer.from(JSON.stringify(value));
    if (logicalBytes.length <= INLINE_VALUE_MAX_BYTES) {
      sections.push({ key, kind: "inline", value });
      continue;
    }
    const kind = Array.isArray(value) ? "array" : "object";
    const chunks = kind === "array" ? packArray(value) : packObject(value);
    const shards = [];
    for (const [index, chunk] of chunks.entries()) {
      shards.push(await writeShard(directory, key, index, chunk));
    }
    sections.push({
      key,
      kind,
      count: kind === "array" ? value.length : Object.keys(value).length,
      logical: { bytes: logicalBytes.length, sha256: sha256(logicalBytes) },
      shards,
    });
  }

  const logicalBytes = Buffer.from(serializedArtifact);
  const sourceBytes = options.sourceBytes ?? logicalBytes;
  const manifest = {
    schemaVersion: ETF_ARTIFACT_SHARD_SCHEMA_VERSION,
    artifact: basename(normalized, extname(normalized)),
    maxShardBytes: ETF_ARTIFACT_MAX_SHARD_BYTES,
    source: { bytes: sourceBytes.length, sha256: sha256(sourceBytes) },
    logical: { bytes: logicalBytes.length, sha256: sha256(logicalBytes) },
    sections,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  if (manifestBytes.length > ETF_ARTIFACT_MAX_SHARD_BYTES) {
    throw new Error(`ETF artifact manifest exceeds ${ETF_ARTIFACT_MAX_SHARD_BYTES} bytes`);
  }
  await writeFile(join(directory, "manifest.json"), manifestBytes);
  return manifest;
}
