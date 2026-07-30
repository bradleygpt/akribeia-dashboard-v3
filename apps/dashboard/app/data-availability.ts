import {
  ActiveBuildPointerSchema,
  BuildManifestSchema,
  VerticalSliceDashboardSchema,
  type BuildManifest,
  type DataStatus,
  type VerticalSliceDashboard,
} from "@akribeia/contracts";

export type DashboardAvailabilityKind =
  "loading" | "healthy" | "stale" | "degraded" | "unavailable" | "error";

export interface DashboardAvailability {
  kind: DashboardAvailabilityKind;
  label: string;
  title: string;
  message: string;
  action: string;
  buildId?: string;
  observedAt?: string;
  ageSeconds?: number;
  maxAgeSeconds?: number;
}

export interface AvailabilityClassificationInput {
  buildId: string;
  manifestStatus: BuildManifest["status"];
  publicationDecision: BuildManifest["publication"]["decision"];
  artifactStatus: DataStatus;
  observedAt: string;
  maxAgeSeconds: number;
}

export interface LoadDashboardAvailabilityOptions {
  fetcher?: typeof fetch;
  now?: Date;
  signal?: AbortSignal;
}

const JSON_REQUEST = {
  accept: "application/json",
} as const;

export const INITIAL_DASHBOARD_AVAILABILITY: DashboardAvailability = {
  kind: "loading",
  label: "Checking",
  title: "Verifying the active evidence build",
  message: "Checking the active pointer, schema, lineage, byte size, and SHA-256 digest.",
  action: "The published dashboard remains visible while verification completes.",
};

function elapsedLabel(seconds: number): string {
  const hours = Math.floor(seconds / 3600);

  if (hours < 48) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function classifiedStatus(
  kind: Exclude<DashboardAvailabilityKind, "loading" | "error" | "unavailable">,
  input: AvailabilityClassificationInput,
  ageSeconds: number,
): DashboardAvailability {
  const common = {
    kind,
    buildId: input.buildId,
    observedAt: input.observedAt,
    ageSeconds,
    maxAgeSeconds: input.maxAgeSeconds,
  };

  if (kind === "stale") {
    return {
      ...common,
      label: "Historical snapshot",
      title: "Source freshness window has elapsed",
      message: `The source observation is ${elapsedLabel(ageSeconds)} old; this build allows ${elapsedLabel(input.maxAgeSeconds)}.`,
      action:
        "Verified evidence remains available for inspection, but it must not be treated as current market data.",
    };
  }

  if (kind === "degraded") {
    return {
      ...common,
      label: "Degraded",
      title: "Last-known-good evidence is in use",
      message:
        "One or more upstream checks are delayed or using an explicit fallback, so no questionable candidate replaced this build.",
      action: "Review provenance and freshness before relying on the displayed evidence.",
    };
  }

  return {
    ...common,
    label: "Current",
    title: "Active evidence build verified",
    message: "The active pointer, manifest, schema, lineage, byte size, and SHA-256 digest agree.",
    action:
      "This status describes data integrity and freshness, not expected investment performance.",
  };
}

export function classifyDashboardAvailability(
  input: AvailabilityClassificationInput,
  now: Date,
): DashboardAvailability {
  const observedAt = Date.parse(input.observedAt);

  if (!Number.isFinite(observedAt)) {
    return {
      kind: "error",
      label: "Error",
      title: "Evidence timestamp is invalid",
      message: "The selected build cannot establish a trustworthy observation time.",
      action: "The dashboard is withheld until a valid build is activated.",
      buildId: input.buildId,
    };
  }

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - observedAt) / 1000));

  if (
    input.manifestStatus === "failed" ||
    input.artifactStatus === "unavailable" ||
    input.artifactStatus === "invalid" ||
    input.publicationDecision === "block"
  ) {
    return {
      kind: "unavailable",
      label: "Unavailable",
      title: "No publishable evidence is available",
      message: "The selected build failed a required data or publication gate.",
      action: "Wait for a healthy build; failed evidence is never presented as current.",
      buildId: input.buildId,
      observedAt: input.observedAt,
      ageSeconds,
      maxAgeSeconds: input.maxAgeSeconds,
    };
  }

  if (input.artifactStatus === "stale" || ageSeconds > input.maxAgeSeconds) {
    return classifiedStatus("stale", input, ageSeconds);
  }

  if (
    input.manifestStatus === "degraded" ||
    input.publicationDecision !== "publish" ||
    input.artifactStatus === "delayed" ||
    input.artifactStatus === "fallback"
  ) {
    return classifiedStatus("degraded", input, ageSeconds);
  }

  return classifiedStatus("healthy", input, ageSeconds);
}

async function sha256(payload: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", payload);

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestJson(fetcher: typeof fetch, path: string, signal?: AbortSignal) {
  return fetcher(path, {
    cache: "no-store",
    headers: JSON_REQUEST,
    signal,
  });
}

function unavailableStatus(message: string, action: string): DashboardAvailability {
  return {
    kind: "unavailable",
    label: "Unavailable",
    title: "Active evidence is unavailable",
    message,
    action,
  };
}

function errorStatus(): DashboardAvailability {
  return {
    kind: "error",
    label: "Error",
    title: "Active evidence could not be verified",
    message: "The pointer, manifest, artifact, or schema did not pass runtime verification.",
    action: "The page keeps its build-time evidence visible, but runtime status is withheld.",
  };
}

function validateLineage(
  manifest: BuildManifest,
  dashboard: VerticalSliceDashboard,
  activeBuildId: string,
): void {
  if (
    manifest.buildId !== activeBuildId ||
    dashboard.buildId !== activeBuildId ||
    dashboard.schemaVersion !== manifest.schemaVersion ||
    dashboard.modelVersion !== manifest.modelVersion
  ) {
    throw new Error("Active build lineage does not reconcile.");
  }
}

export async function loadDashboardAvailability({
  fetcher = fetch,
  now = new Date(),
  signal,
}: LoadDashboardAvailabilityOptions = {}): Promise<DashboardAvailability> {
  try {
    const pointerResponse = await requestJson(fetcher, "/data/active-build.json", signal);

    if (pointerResponse.status === 404 || pointerResponse.status === 410) {
      return unavailableStatus(
        "No active-build pointer is currently available.",
        "Wait for a validated build to be activated.",
      );
    }

    if (!pointerResponse.ok) {
      return errorStatus();
    }

    const pointer = ActiveBuildPointerSchema.parse(await pointerResponse.json());
    const buildRoot = `/data/builds/${encodeURIComponent(pointer.activeBuildId)}`;
    const manifestResponse = await requestJson(fetcher, `${buildRoot}/manifest.json`, signal);

    if (manifestResponse.status === 404 || manifestResponse.status === 410) {
      return unavailableStatus(
        "The active pointer references a build that is not available.",
        "The pointer must be repaired or rolled back before evidence is current.",
      );
    }

    if (!manifestResponse.ok) {
      return errorStatus();
    }

    const manifest = BuildManifestSchema.parse(await manifestResponse.json());
    const dashboardArtifact = manifest.files.dashboard;

    if (dashboardArtifact === undefined || dashboardArtifact.path !== "dashboard.json") {
      return errorStatus();
    }

    const dashboardResponse = await fetcher(`${buildRoot}/${dashboardArtifact.path}`, {
      cache: "no-store",
      headers: JSON_REQUEST,
      signal,
    });

    if (dashboardResponse.status === 404 || dashboardResponse.status === 410) {
      return unavailableStatus(
        "The active dashboard artifact is missing.",
        "The pointer must be rolled back to an intact immutable build.",
      );
    }

    if (!dashboardResponse.ok) {
      return errorStatus();
    }

    const payload = new Uint8Array(await dashboardResponse.arrayBuffer());

    if (
      payload.byteLength !== dashboardArtifact.byteSize ||
      (await sha256(payload)) !== dashboardArtifact.sha256
    ) {
      return errorStatus();
    }

    const dashboard = VerticalSliceDashboardSchema.parse(
      JSON.parse(new TextDecoder().decode(payload)) as unknown,
    );
    validateLineage(manifest, dashboard, pointer.activeBuildId);

    return classifyDashboardAvailability(
      {
        buildId: pointer.activeBuildId,
        manifestStatus: manifest.status,
        publicationDecision: manifest.publication.decision,
        artifactStatus: dashboardArtifact.status,
        observedAt: dashboard.source.observedAt,
        maxAgeSeconds: dashboard.source.maxAgeSeconds,
      },
      now,
    );
  } catch {
    return errorStatus();
  }
}
