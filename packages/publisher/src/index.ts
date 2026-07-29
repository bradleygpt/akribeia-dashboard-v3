import {
  ArtifactFileSchema,
  BuildManifestSchema,
  type ArtifactFile,
  type BuildManifest,
  type PublicationDecision,
} from "@akribeia/contracts";

export interface ManifestEvaluationInput {
  buildId: string;
  schemaVersion: string;
  modelVersion: string;
  generatedAt: string;
  evaluatedAt: string;
  requiredArtifacts: readonly string[];
  files: Readonly<Record<string, unknown>>;
  previousManifest?: unknown;
}

export interface ManifestEvaluation {
  decision: PublicationDecision;
  activeBuildId: string | null;
  candidateManifest: BuildManifest | null;
  reasons: readonly string[];
}

function eligiblePreviousManifest(value: unknown): BuildManifest | null {
  const parsed = BuildManifestSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  const manifest = parsed.data;

  if (
    manifest.status !== "healthy" ||
    manifest.publication.decision !== "publish" ||
    manifest.publishedAt === undefined
  ) {
    return null;
  }

  return manifest;
}

function failClosed(
  reasons: readonly string[],
  previousManifest: BuildManifest | null,
): ManifestEvaluation {
  const normalizedReasons = [...new Set(reasons)].sort();

  if (previousManifest !== null) {
    return {
      decision: "hold-last-known-good",
      activeBuildId: previousManifest.buildId,
      candidateManifest: null,
      reasons: normalizedReasons,
    };
  }

  return {
    decision: "block",
    activeBuildId: null,
    candidateManifest: null,
    reasons: normalizedReasons,
  };
}

function deriveBuildStatus(files: Readonly<Record<string, ArtifactFile>>): BuildManifest["status"] {
  const statuses = Object.values(files).map((file) => file.status);

  if (statuses.some((status) => status === "unavailable" || status === "invalid")) {
    return "failed";
  }

  if (
    statuses.some((status) => status === "delayed" || status === "stale" || status === "fallback")
  ) {
    return "degraded";
  }

  return "healthy";
}

function artifactReasons(files: Readonly<Record<string, ArtifactFile>>): string[] {
  return Object.entries(files)
    .filter(([, file]) => file.status !== "current")
    .map(
      ([key, file]) => `${key}: ${file.status} - ${file.freshness.reason ?? "No reason supplied."}`,
    )
    .sort();
}

export function evaluateManifest(input: ManifestEvaluationInput): ManifestEvaluation {
  const previousManifest = eligiblePreviousManifest(input.previousManifest);

  const requiredArtifacts = [...new Set(input.requiredArtifacts)].sort();
  const reasons: string[] = [];

  if (requiredArtifacts.length === 0) {
    reasons.push("At least one required artifact must be declared.");
  }

  if (requiredArtifacts.length !== input.requiredArtifacts.length) {
    reasons.push("Required artifact names must be unique.");
  }

  const files: Record<string, ArtifactFile> = {};

  for (const key of Object.keys(input.files).sort()) {
    const parsed = ArtifactFileSchema.safeParse(input.files[key]);

    if (parsed.success) {
      files[key] = parsed.data;
      continue;
    }

    for (const issue of parsed.error.issues) {
      const path = issue.path.length === 0 ? "root" : issue.path.join(".");

      reasons.push(`${key}: invalid artifact at ${path}: ${issue.message}`);
    }
  }

  for (const requiredArtifact of requiredArtifacts) {
    if (!(requiredArtifact in files)) {
      reasons.push(`Missing required artifact: ${requiredArtifact}.`);
    }
  }

  if (reasons.length > 0) {
    return failClosed(reasons, previousManifest);
  }

  const status = deriveBuildStatus(files);
  const nonCurrentReasons = artifactReasons(files);

  const decision: PublicationDecision =
    status === "healthy" ? "publish" : previousManifest !== null ? "hold-last-known-good" : "block";

  const publicationReasons =
    decision === "publish"
      ? []
      : nonCurrentReasons.length > 0
        ? nonCurrentReasons
        : ["Candidate build is not publishable."];

  const candidate = {
    buildId: input.buildId,
    schemaVersion: input.schemaVersion,
    modelVersion: input.modelVersion,
    generatedAt: input.generatedAt,
    ...(decision === "publish" ? { publishedAt: input.evaluatedAt } : {}),
    status,
    publication: {
      decision,
      evaluatedAt: input.evaluatedAt,
      reasons: publicationReasons,
      ...(decision === "hold-last-known-good" && previousManifest !== null
        ? { previousBuildId: previousManifest.buildId }
        : {}),
    },
    files,
  };

  const parsedCandidate = BuildManifestSchema.safeParse(candidate);

  if (!parsedCandidate.success) {
    const schemaReasons = parsedCandidate.error.issues.map((issue) => {
      const path = issue.path.length === 0 ? "root" : issue.path.join(".");

      return `Candidate manifest at ${path}: ${issue.message}`;
    });

    return failClosed(schemaReasons, previousManifest);
  }

  return {
    decision,
    activeBuildId:
      decision === "publish"
        ? parsedCandidate.data.buildId
        : decision === "hold-last-known-good" && previousManifest !== null
          ? previousManifest.buildId
          : null,
    candidateManifest: parsedCandidate.data,
    reasons: parsedCandidate.data.publication.reasons,
  };
}

export * from "./atomic.js";
export * from "./active-build.js";
