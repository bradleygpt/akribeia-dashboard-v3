import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BuildManifestSchema, type ArtifactFile, type BuildManifest } from "@akribeia/contracts";

export interface AtomicPublicationInput {
  rootDirectory: string;
  manifest: unknown;
  artifacts: Readonly<Record<string, Uint8Array>>;
}

export interface AtomicPublicationResult {
  buildId: string;
  buildDirectory: string;
  manifestPath: string;
}

interface PreparedArtifact {
  key: string;
  relativePath: string;
  payload: Uint8Array;
  metadata: ArtifactFile;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}

function sha256(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function validateBuildId(buildId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(buildId) || buildId === "." || buildId === "..") {
    throw new Error(
      `Unsafe build ID "${buildId}". Use letters, numbers, dots, underscores, or hyphens.`,
    );
  }
}

function normalizeArtifactPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");

  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    throw new Error(`Unsafe artifact path "${path}".`);
  }

  const segments = normalized.split("/");

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`Unsafe artifact path "${path}".`);
  }

  return segments.join("/");
}

function parsePublishableManifest(value: unknown): BuildManifest {
  const parsed = BuildManifestSchema.safeParse(value);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length === 0 ? "root" : issue.path.join(".");

        return `${path}: ${issue.message}`;
      })
      .join("; ");

    throw new Error(`Invalid build manifest: ${issues}`);
  }

  const manifest = parsed.data;

  if (
    manifest.status !== "healthy" ||
    manifest.publication.decision !== "publish" ||
    manifest.publishedAt === undefined
  ) {
    throw new Error(
      "Atomic publication requires a healthy manifest with a publish decision and publishedAt timestamp.",
    );
  }

  validateBuildId(manifest.buildId);

  return manifest;
}

function prepareArtifacts(
  manifest: BuildManifest,
  artifacts: Readonly<Record<string, Uint8Array>>,
): PreparedArtifact[] {
  const manifestKeys = Object.keys(manifest.files).sort();
  const payloadKeys = Object.keys(artifacts).sort();

  if (
    manifestKeys.length !== payloadKeys.length ||
    manifestKeys.some((key, index) => key !== payloadKeys[index])
  ) {
    throw new Error(
      `Artifact payload keys must exactly match manifest file keys. Expected [${manifestKeys.join(
        ", ",
      )}], received [${payloadKeys.join(", ")}].`,
    );
  }

  const seenPaths = new Set<string>();

  return manifestKeys.map((key) => {
    const metadata = manifest.files[key];
    const payload = artifacts[key];

    if (!(payload instanceof Uint8Array)) {
      throw new Error(`Artifact "${key}" is not a Uint8Array payload.`);
    }

    const relativePath = normalizeArtifactPath(metadata.path);
    const comparablePath = relativePath.toLowerCase();

    if (comparablePath === "manifest.json") {
      throw new Error(`Artifact "${key}" uses the reserved path "manifest.json".`);
    }

    if (seenPaths.has(comparablePath)) {
      throw new Error(`Duplicate artifact path "${relativePath}".`);
    }

    seenPaths.add(comparablePath);

    if (payload.byteLength !== metadata.byteSize) {
      throw new Error(
        `Artifact "${key}" byte-size mismatch: expected ${metadata.byteSize}, received ${payload.byteLength}.`,
      );
    }

    const actualHash = sha256(payload);

    if (actualHash !== metadata.sha256.toLowerCase()) {
      throw new Error(
        `Artifact "${key}" SHA-256 mismatch: expected ${metadata.sha256}, received ${actualHash}.`,
      );
    }

    return {
      key,
      relativePath,
      payload,
      metadata,
    };
  });
}

function deterministicManifest(manifest: BuildManifest): BuildManifest {
  const sortedFiles = Object.fromEntries(
    Object.entries(manifest.files).sort(([left], [right]) => left.localeCompare(right)),
  ) as BuildManifest["files"];

  return {
    ...manifest,
    files: sortedFiles,
  };
}

async function verifyStagedArtifact(
  stagingDirectory: string,
  artifact: PreparedArtifact,
): Promise<void> {
  const stagedPath = join(stagingDirectory, ...artifact.relativePath.split("/"));

  const stagedPayload = await readFile(stagedPath);

  if (stagedPayload.byteLength !== artifact.metadata.byteSize) {
    throw new Error(`Staged artifact "${artifact.key}" failed byte-size verification.`);
  }

  if (sha256(stagedPayload) !== artifact.metadata.sha256.toLowerCase()) {
    throw new Error(`Staged artifact "${artifact.key}" failed SHA-256 verification.`);
  }
}

export async function publishBuildAtomically(
  input: AtomicPublicationInput,
): Promise<AtomicPublicationResult> {
  const manifest = deterministicManifest(parsePublishableManifest(input.manifest));
  const preparedArtifacts = prepareArtifacts(manifest, input.artifacts);

  const rootDirectory = resolve(input.rootDirectory);
  const buildsDirectory = join(rootDirectory, "builds");
  const stagingRoot = join(rootDirectory, ".staging");
  const finalDirectory = join(buildsDirectory, manifest.buildId);
  const finalManifestPath = join(finalDirectory, "manifest.json");

  await mkdir(buildsDirectory, { recursive: true });
  await mkdir(stagingRoot, { recursive: true });

  if (await pathExists(finalDirectory)) {
    throw new Error(
      `Build "${manifest.buildId}" already exists and immutable builds cannot be overwritten.`,
    );
  }

  let stagingDirectory: string | null = await mkdtemp(join(stagingRoot, `${manifest.buildId}-`));

  try {
    for (const artifact of preparedArtifacts) {
      const stagedPath = join(stagingDirectory, ...artifact.relativePath.split("/"));

      const pathSegments = artifact.relativePath.split("/");
      pathSegments.pop();

      if (pathSegments.length > 0) {
        await mkdir(join(stagingDirectory, ...pathSegments), {
          recursive: true,
        });
      }

      await writeFile(stagedPath, artifact.payload, {
        flag: "wx",
      });
    }

    for (const artifact of preparedArtifacts) {
      await verifyStagedArtifact(stagingDirectory, artifact);
    }

    const stagedManifestPath = join(stagingDirectory, "manifest.json");

    await writeFile(stagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });

    const persistedManifest = BuildManifestSchema.safeParse(
      JSON.parse(await readFile(stagedManifestPath, "utf8")),
    );

    if (!persistedManifest.success) {
      throw new Error("The staged manifest failed integrity validation after writing.");
    }

    if (persistedManifest.data.buildId !== manifest.buildId) {
      throw new Error("The staged manifest build ID changed during publication.");
    }

    await rename(stagingDirectory, finalDirectory);
    stagingDirectory = null;

    return {
      buildId: manifest.buildId,
      buildDirectory: finalDirectory,
      manifestPath: finalManifestPath,
    };
  } catch (error) {
    if (stagingDirectory !== null) {
      await rm(stagingDirectory, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    }

    throw error;
  }
}
