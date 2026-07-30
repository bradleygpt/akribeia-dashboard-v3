import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { BuildManifestSchema, type BuildManifest } from "@akribeia/contracts";

export const ACTIVE_BUILD_POINTER_FILENAME = "active-build.json";

export interface ActiveBuildPointer {
  activeBuildId: string;
  previousBuildId: string | null;
}

export interface ActivateBuildInput {
  rootDirectory: string;
  buildId: string;
}

export interface RollbackActiveBuildInput {
  rootDirectory: string;
}

export interface BuildActivationResult extends ActiveBuildPointer {
  operation: "activate";
  pointerPath: string;
  buildDirectory: string;
  manifestPath: string;
}

export interface BuildRollbackResult extends ActiveBuildPointer {
  operation: "rollback";
  rolledBackFromBuildId: string;
  pointerPath: string;
  buildDirectory: string;
  manifestPath: string;
}

interface ValidatedBuild {
  buildId: string;
  buildDirectory: string;
  manifestPath: string;
}

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function validateBuildId(buildId: string): void {
  const usesSafeCharacters = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9_-])?$/.test(buildId);
  const usesWindowsReservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(buildId);

  if (!usesSafeCharacters || usesWindowsReservedName) {
    throw new Error(
      `Unsafe build ID "${buildId}". Use a cross-platform name containing only letters, numbers, dots, underscores, or hyphens.`,
    );
  }
}

function formatManifestIssues(manifestPath: string, value: unknown): BuildManifest {
  const parsed = BuildManifestSchema.safeParse(value);

  if (parsed.success) {
    return parsed.data;
  }

  const issues = parsed.error.issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "root" : issue.path.join(".");

      return `${path}: ${issue.message}`;
    })
    .join("; ");

  throw new Error(`Malformed build manifest at "${manifestPath}": ${issues}`);
}

function isContainedPath(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);

  return (
    relativePath.length > 0 &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

async function validateManifestArtifacts(
  buildDirectory: string,
  manifest: BuildManifest,
): Promise<void> {
  const canonicalBuildDirectory = await realpath(buildDirectory);

  for (const [key, artifact] of Object.entries(manifest.files)) {
    const artifactPath = resolve(buildDirectory, artifact.path);

    if (!isContainedPath(buildDirectory, artifactPath)) {
      throw new Error(`Build "${manifest.buildId}" artifact "${key}" resolves outside its build.`);
    }

    let artifactStat;

    try {
      artifactStat = await lstat(artifactPath);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) {
        throw new Error(
          `Build "${manifest.buildId}" artifact "${key}" is missing at "${artifact.path}".`,
          { cause: error },
        );
      }

      throw error;
    }

    if (!artifactStat.isFile() || artifactStat.isSymbolicLink()) {
      throw new Error(
        `Build "${manifest.buildId}" artifact "${key}" is not a regular immutable file.`,
      );
    }

    const canonicalArtifactPath = await realpath(artifactPath);

    if (!isContainedPath(canonicalBuildDirectory, canonicalArtifactPath)) {
      throw new Error(
        `Build "${manifest.buildId}" artifact "${key}" resolves outside its canonical build.`,
      );
    }

    const payload = await readFile(canonicalArtifactPath);

    if (payload.byteLength !== artifact.byteSize) {
      throw new Error(
        `Build "${manifest.buildId}" artifact "${key}" failed byte-size verification.`,
      );
    }
    if (sha256(payload) !== artifact.sha256.toLowerCase()) {
      throw new Error(`Build "${manifest.buildId}" artifact "${key}" failed SHA-256 verification.`);
    }
  }
}

async function validateTargetBuild(
  rootDirectory: string,
  buildId: string,
): Promise<ValidatedBuild> {
  validateBuildId(buildId);

  const buildsDirectory = resolve(rootDirectory, "builds");
  const buildDirectory = resolve(buildsDirectory, buildId);

  if (dirname(buildDirectory) !== buildsDirectory) {
    throw new Error(`Unsafe build ID "${buildId}" resolves outside the builds directory.`);
  }

  let buildStat;

  try {
    buildStat = await lstat(buildDirectory);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      throw new Error(`Build "${buildId}" does not exist in "${buildsDirectory}".`, {
        cause: error,
      });
    }

    throw error;
  }

  if (!buildStat.isDirectory() || buildStat.isSymbolicLink()) {
    throw new Error(`Build "${buildId}" is not an immutable build directory.`);
  }

  const manifestPath = join(buildDirectory, "manifest.json");
  let manifestStat;

  try {
    manifestStat = await lstat(manifestPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      throw new Error(`Build "${buildId}" is missing manifest.json.`, {
        cause: error,
      });
    }

    throw error;
  }

  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error(`Build "${buildId}" does not contain a regular manifest.json file.`);
  }

  let manifestValue: unknown;

  try {
    manifestValue = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Malformed build manifest at "${manifestPath}": invalid JSON.`, {
        cause: error,
      });
    }

    throw error;
  }

  const manifest = formatManifestIssues(manifestPath, manifestValue);

  if (manifest.buildId !== buildId) {
    throw new Error(
      `Build manifest ID "${manifest.buildId}" does not match requested build ID "${buildId}".`,
    );
  }

  if (
    manifest.status !== "healthy" ||
    manifest.publication.decision !== "publish" ||
    manifest.publishedAt === undefined
  ) {
    throw new Error(
      `Build "${buildId}" is not eligible for activation: it must be healthy, published, and approved with a publish decision.`,
    );
  }

  await validateManifestArtifacts(buildDirectory, manifest);

  return {
    buildId,
    buildDirectory,
    manifestPath,
  };
}

function parseActiveBuildPointer(pointerPath: string, value: unknown): ActiveBuildPointer {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Malformed active-build pointer at "${pointerPath}".`);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  if (
    keys.length !== 2 ||
    keys[0] !== "activeBuildId" ||
    keys[1] !== "previousBuildId" ||
    typeof record.activeBuildId !== "string" ||
    (record.previousBuildId !== null && typeof record.previousBuildId !== "string")
  ) {
    throw new Error(`Malformed active-build pointer at "${pointerPath}".`);
  }

  validateBuildId(record.activeBuildId);

  if (record.previousBuildId !== null) {
    validateBuildId(record.previousBuildId);
  }

  if (record.activeBuildId === record.previousBuildId) {
    throw new Error(`Malformed active-build pointer at "${pointerPath}": build IDs must differ.`);
  }

  return {
    activeBuildId: record.activeBuildId,
    previousBuildId: record.previousBuildId,
  };
}

async function readActiveBuildPointer(pointerPath: string): Promise<ActiveBuildPointer | null> {
  let pointerStat;

  try {
    pointerStat = await lstat(pointerPath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return null;
    }

    throw error;
  }

  if (!pointerStat.isFile() || pointerStat.isSymbolicLink()) {
    throw new Error(`Active-build pointer at "${pointerPath}" is not a regular file.`);
  }

  let pointerValue: unknown;

  try {
    pointerValue = JSON.parse(await readFile(pointerPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Malformed active-build pointer at "${pointerPath}": invalid JSON.`, {
        cause: error,
      });
    }

    throw error;
  }

  return parseActiveBuildPointer(pointerPath, pointerValue);
}

function deterministicPointerJson(pointer: ActiveBuildPointer): string {
  return `${JSON.stringify(
    {
      activeBuildId: pointer.activeBuildId,
      previousBuildId: pointer.previousBuildId,
    },
    null,
    2,
  )}\n`;
}

async function replaceActiveBuildPointer(
  pointerPath: string,
  pointer: ActiveBuildPointer,
): Promise<void> {
  const temporaryPath = join(
    dirname(pointerPath),
    `.${basename(pointerPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, deterministicPointerJson(pointer), {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, pointerPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function activateBuild(input: ActivateBuildInput): Promise<BuildActivationResult> {
  const rootDirectory = resolve(input.rootDirectory);
  const pointerPath = join(rootDirectory, ACTIVE_BUILD_POINTER_FILENAME);
  const target = await validateTargetBuild(rootDirectory, input.buildId);
  const currentPointer = await readActiveBuildPointer(pointerPath);
  const previousBuildId =
    currentPointer?.activeBuildId === target.buildId
      ? currentPointer.previousBuildId
      : (currentPointer?.activeBuildId ?? null);
  const pointer: ActiveBuildPointer = {
    activeBuildId: target.buildId,
    previousBuildId,
  };

  await replaceActiveBuildPointer(pointerPath, pointer);

  return {
    operation: "activate",
    ...pointer,
    pointerPath,
    buildDirectory: target.buildDirectory,
    manifestPath: target.manifestPath,
  };
}

export async function rollbackActiveBuild(
  input: RollbackActiveBuildInput,
): Promise<BuildRollbackResult> {
  const rootDirectory = resolve(input.rootDirectory);
  const pointerPath = join(rootDirectory, ACTIVE_BUILD_POINTER_FILENAME);
  const currentPointer = await readActiveBuildPointer(pointerPath);

  if (currentPointer === null || currentPointer.previousBuildId === null) {
    throw new Error("Cannot roll back because the active-build pointer has no previous build.");
  }

  const target = await validateTargetBuild(rootDirectory, currentPointer.previousBuildId);
  const pointer: ActiveBuildPointer = {
    activeBuildId: target.buildId,
    previousBuildId: currentPointer.activeBuildId,
  };

  await replaceActiveBuildPointer(pointerPath, pointer);

  return {
    operation: "rollback",
    rolledBackFromBuildId: currentPointer.activeBuildId,
    ...pointer,
    pointerPath,
    buildDirectory: target.buildDirectory,
    manifestPath: target.manifestPath,
  };
}
