import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createFixedWindowRateLimiter,
  handleEvidenceApi,
  type AssetFetcher,
  type EvidenceApiEnv,
} from "../../apps/dashboard/worker/evidence-api.js";

const publicRoot = resolve("apps/dashboard/public");

function protectedRequest(
  pathname: string,
  body: unknown = { ticker: "MU" },
  headers: Record<string, string> = {},
  method = "POST",
): Request {
  return new Request(`https://akribeia.example${pathname}`, {
    method,
    headers: {
      "cf-connecting-ip": "192.0.2.10",
      "content-type": "application/json",
      origin: "https://akribeia.example",
      "x-akribeia-client": "dashboard-v3",
      ...headers,
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function assetFetcher(transform?: (path: string, payload: Uint8Array) => Uint8Array): AssetFetcher {
  return {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      const filePath = resolve(publicRoot, pathname.replace(/^\/+/, ""));
      const containment = relative(publicRoot, filePath);

      if (containment.startsWith("..") || isAbsolute(containment)) {
        return new Response("Forbidden", { status: 403 });
      }

      try {
        const payload = new Uint8Array(await readFile(filePath));
        return new Response(transform?.(pathname, payload) ?? payload, { status: 200 });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  };
}

function env(fetcher = assetFetcher()): EvidenceApiEnv {
  return { ASSETS: fetcher };
}

function limiter(limit = 20) {
  return createFixedWindowRateLimiter({
    limit,
    windowMs: 60_000,
    now: () => 1_000_000,
  });
}

const ACTIVE_BUILD_ID = (
  JSON.parse(readFileSync(resolvePath("apps/dashboard/public/data/active-build.json"), "utf8")) as {
    activeBuildId: string;
  }
).activeBuildId;

describe("protected evidence API", () => {
  it("leaves non-API requests to the application router", async () => {
    const response = await handleEvidenceApi(
      new Request("https://akribeia.example/"),
      env(),
      limiter(),
    );

    expect(response).toBeNull();
  });

  it("reports deep active-evidence health without a secret or external model", async () => {
    const response = await handleEvidenceApi(
      new Request("https://akribeia.example/api/v3/health"),
      env(),
      limiter(),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      status: "healthy",
      buildId: ACTIVE_BUILD_ID,
      checks: {
        activePointer: "pass",
        scoreArtifact: "sha256-and-byte-size-pass",
        portfolioArtifact: "sha256-and-byte-size-pass",
        lineage: "pass",
      },
      aiMode: "deterministic-evidence",
      externalModelConfigured: false,
    });
  });

  it("fails the health check when active evidence is tampered", async () => {
    const response = await handleEvidenceApi(
      new Request("https://akribeia.example/api/v3/health"),
      env(
        assetFetcher((path, payload) =>
          path.endsWith("/portfolio.json")
            ? new TextEncoder().encode('{"tampered":true}')
            : payload,
        ),
      ),
      limiter(),
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      status: "unavailable",
      error: { code: "evidence_unavailable" },
    });
  });

  it.each([
    [
      "method",
      protectedRequest("/api/v3/evidence/security", undefined, {}, "GET"),
      405,
      "method_not_allowed",
    ],
    [
      "origin",
      protectedRequest(
        "/api/v3/evidence/security",
        { ticker: "MU" },
        { origin: "https://evil.test" },
      ),
      403,
      "origin_forbidden",
    ],
    [
      "client header",
      protectedRequest(
        "/api/v3/evidence/security",
        { ticker: "MU" },
        { "x-akribeia-client": "unknown" },
      ),
      403,
      "client_forbidden",
    ],
    [
      "content type",
      protectedRequest(
        "/api/v3/evidence/security",
        { ticker: "MU" },
        { "content-type": "text/plain" },
      ),
      415,
      "unsupported_media_type",
    ],
  ])("rejects an invalid protected-request %s", async (_case, request, status, code) => {
    const response = await handleEvidenceApi(request, env(), limiter());

    expect(response?.status).toBe(status);
    await expect(response?.json()).resolves.toMatchObject({ error: { code } });
  });

  it("validates request contracts before loading evidence", async () => {
    let assetRequests = 0;
    const response = await handleEvidenceApi(
      protectedRequest("/api/v3/evidence/security", {
        ticker: "../MU",
        unexpected: true,
      }),
      env({
        async fetch() {
          assetRequests += 1;
          return new Response("Should not load", { status: 500 });
        },
      }),
      limiter(),
    );

    expect(response?.status).toBe(400);
    expect(assetRequests).toBe(0);
  });

  it("rejects invalid JSON before loading evidence", async () => {
    let assetRequests = 0;
    const response = await handleEvidenceApi(
      new Request("https://akribeia.example/api/v3/evidence/security", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://akribeia.example",
          "x-akribeia-client": "dashboard-v3",
        },
        body: "{invalid",
      }),
      env({
        async fetch() {
          assetRequests += 1;
          return new Response("Should not load", { status: 500 });
        },
      }),
      limiter(),
    );

    expect(response?.status).toBe(400);
    expect(assetRequests).toBe(0);
  });

  it("rejects a declared oversized payload", async () => {
    const response = await handleEvidenceApi(
      protectedRequest("/api/v3/evidence/security", { ticker: "MU" }, { "content-length": "4097" }),
      env(),
      limiter(),
    );

    expect(response?.status).toBe(413);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "payload_too_large" },
    });
  });

  it("stops an undeclared oversized body while reading the stream", async () => {
    const response = await handleEvidenceApi(
      new Request("https://akribeia.example/api/v3/evidence/security", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://akribeia.example",
          "x-akribeia-client": "dashboard-v3",
        },
        body: JSON.stringify({ ticker: "MU", padding: "x".repeat(4096) }),
      }),
      env(),
      limiter(),
    );

    expect(response?.status).toBe(413);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "payload_too_large" },
    });
  });

  it("returns a verified security and exact portfolio position", async () => {
    const response = await handleEvidenceApi(
      protectedRequest("/api/v3/evidence/security", { ticker: "mu" }),
      env(),
      limiter(),
    );
    const payload = await response?.json();

    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(response?.headers.get("ratelimit-remaining")).toBe("19");
    expect(payload).toMatchObject({
      buildId: ACTIVE_BUILD_ID,
      security: {
        ticker: "MU",
        eligible: true,
        coverage: 1,
      },
      position: {
        ticker: "MU",
        weightUnits: 120_000_000,
      },
    });
  });

  it("returns a deterministic evidence-grounded explanation without an external model", async () => {
    const response = await handleEvidenceApi(
      protectedRequest("/api/v3/ai/explain", {
        ticker: "MU",
        focus: "factor-contributions",
      }),
      env(),
      limiter(),
    );
    const payload = await response?.json();

    expect(response?.status).toBe(200);
    expect(payload).toMatchObject({
      ticker: "MU",
      mode: "deterministic-evidence",
      externalModelUsed: false,
      focus: "factor-contributions",
    });
    expect(payload.explanation).toContain("Missing factors are never silently reweighted");
    expect(payload.citations).toContain("scores.json:security.contributions");
  });

  it("fails closed when an immutable artifact is tampered", async () => {
    const response = await handleEvidenceApi(
      protectedRequest("/api/v3/evidence/security"),
      env(
        assetFetcher((path, payload) =>
          path.endsWith("/scores.json") ? new TextEncoder().encode('{"tampered":true}') : payload,
        ),
      ),
      limiter(),
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: "evidence_unavailable" },
    });
  });

  it("enforces a bounded per-route fixed-window rate limit", async () => {
    const rateLimiter = limiter(1);
    const first = await handleEvidenceApi(
      protectedRequest("/api/v3/ai/explain"),
      env(),
      rateLimiter,
    );
    const second = await handleEvidenceApi(
      protectedRequest("/api/v3/ai/explain"),
      env(),
      rateLimiter,
    );

    expect(first?.status).toBe(200);
    expect(second?.status).toBe(429);
    expect(second?.headers.get("ratelimit-remaining")).toBe("0");
    expect(second?.headers.get("retry-after")).not.toBeNull();
  });
});
