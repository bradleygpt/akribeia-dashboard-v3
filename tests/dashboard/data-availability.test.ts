import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INITIAL_DASHBOARD_AVAILABILITY,
  classifyDashboardAvailability,
  loadDashboardAvailability,
  type AvailabilityClassificationInput,
} from "../../apps/dashboard/app/data-availability.js";

const dashboardRoot = resolve("apps/dashboard/public/data");
const pointerPath = resolve(dashboardRoot, "active-build.json");
const activeBuildId = "preview-20260728-pipeline-v4-a34fc842220f";
const buildRoot = resolve(dashboardRoot, "builds", activeBuildId);
const observedAt = "2026-07-28T17:06:46.000Z";

const healthyInput: AvailabilityClassificationInput = {
  buildId: activeBuildId,
  manifestStatus: "healthy",
  publicationDecision: "publish",
  artifactStatus: "current",
  observedAt,
  maxAgeSeconds: 604_800,
};

async function fixtureFetcher(input: string | URL | Request): Promise<Response> {
  const path =
    typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

  if (path === "/data/active-build.json") {
    return new Response(await readFile(pointerPath), { status: 200 });
  }

  if (path === `/data/builds/${activeBuildId}/manifest.json`) {
    return new Response(await readFile(resolve(buildRoot, "manifest.json")), { status: 200 });
  }

  if (path === `/data/builds/${activeBuildId}/dashboard.json`) {
    return new Response(await readFile(resolve(buildRoot, "dashboard.json")), { status: 200 });
  }

  return new Response("Not found", { status: 404 });
}

describe("dashboard data availability", () => {
  it("starts in an explicit loading state", () => {
    expect(INITIAL_DASHBOARD_AVAILABILITY.kind).toBe("loading");
    expect(INITIAL_DASHBOARD_AVAILABILITY.message).toContain("SHA-256");
  });

  it("reports a current build while source freshness is within policy", () => {
    const result = classifyDashboardAvailability(
      healthyInput,
      new Date("2026-07-29T17:06:46.000Z"),
    );

    expect(result.kind).toBe("healthy");
    expect(result.title).toBe("Active evidence build verified");
    expect(result.ageSeconds).toBe(86_400);
  });

  it("keeps verified history visible with an explicit stale warning", () => {
    const result = classifyDashboardAvailability(
      healthyInput,
      new Date("2026-08-04T17:06:47.000Z"),
    );

    expect(result.kind).toBe("stale");
    expect(result.label).toBe("Historical snapshot");
    expect(result.action).toContain("must not be treated as current market data");
  });

  it("reports delayed or fallback evidence as degraded", () => {
    const result = classifyDashboardAvailability(
      {
        ...healthyInput,
        manifestStatus: "degraded",
        publicationDecision: "hold-last-known-good",
        artifactStatus: "fallback",
      },
      new Date("2026-07-29T17:06:46.000Z"),
    );

    expect(result.kind).toBe("degraded");
    expect(result.title).toBe("Last-known-good evidence is in use");
  });

  it("withholds failed or invalid evidence as unavailable", () => {
    const result = classifyDashboardAvailability(
      {
        ...healthyInput,
        manifestStatus: "failed",
        publicationDecision: "block",
        artifactStatus: "invalid",
      },
      new Date("2026-07-29T17:06:46.000Z"),
    );

    expect(result.kind).toBe("unavailable");
    expect(result.action).toContain("never presented as current");
  });

  it("verifies the real pointer, manifest, dashboard hash, size, schema, and lineage", async () => {
    const result = await loadDashboardAvailability({
      fetcher: fixtureFetcher as typeof fetch,
      now: new Date("2026-07-29T17:06:46.000Z"),
    });

    expect(result.kind).toBe("healthy");
    expect(result.buildId).toBe(activeBuildId);
  });

  it("fails closed when the dashboard payload does not match its manifest", async () => {
    const result = await loadDashboardAvailability({
      fetcher: (async (input) => {
        const path =
          typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

        if (path.endsWith("/dashboard.json")) {
          return new Response('{"tampered":true}', { status: 200 });
        }

        return fixtureFetcher(input);
      }) as typeof fetch,
    });

    expect(result.kind).toBe("error");
    expect(result.title).toBe("Active evidence could not be verified");
  });

  it("distinguishes a missing active pointer from malformed evidence", async () => {
    const result = await loadDashboardAvailability({
      fetcher: (async () => new Response("Not found", { status: 404 })) as typeof fetch,
    });

    expect(result.kind).toBe("unavailable");
    expect(result.message).toContain("No active-build pointer");
  });

  it.each([
    {
      activeBuildId: "../outside-build-root",
      previousBuildId: null,
    },
    {
      activeBuildId: "preview-current",
      previousBuildId: "preview-current",
    },
    {
      activeBuildId: "preview-current",
      previousBuildId: null,
      unexpected: true,
    },
  ])("rejects an unsafe active pointer before requesting build artifacts", async (pointer) => {
    let requests = 0;
    const result = await loadDashboardAvailability({
      fetcher: (async () => {
        requests += 1;
        return new Response(JSON.stringify(pointer), { status: 200 });
      }) as typeof fetch,
    });

    expect(result.kind).toBe("error");
    expect(requests).toBe(1);
  });
});
