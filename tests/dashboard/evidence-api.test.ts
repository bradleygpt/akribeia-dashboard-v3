import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
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

const ACTIVE_PORTFOLIO = (
  JSON.parse(
    readFileSync(
      resolvePath(`apps/dashboard/public/data/builds/${ACTIVE_BUILD_ID}/portfolio.json`),
      "utf8",
    ),
  ) as {
    portfolio: { positions: { ticker: string; weight: number }[] };
  }
).portfolio;

const RELIABLE_THESIS_TEXT =
  "MU carries the published composite score with complete factor coverage across all five " +
  "pillars, and its strongest weighted contributions come from the published momentum and " +
  "profitability figures. The constrained published portfolio includes MU at its recorded " +
  "weight against the exact position cap, so the note stays grounded in the verified artifacts.";

const RELIABLE_PORTFOLIO_TEXT =
  "The book is concentrated in its top holdings, each sitting at the exact position cap, while " +
  "two sector weights run close to the published sector cap. Given the weighted average " +
  "composite score of the constrained portfolio, the published figures point to concentration " +
  "in the capped sectors rather than in any single name.";

function geminiReply(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });
}

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

  it("answers a thesis request deterministically with a reason when no model is configured", async () => {
    const response = await handleEvidenceApi(
      protectedRequest("/api/v3/ai/explain", { ticker: "MU", focus: "thesis" }),
      env(),
      limiter(),
    );
    const payload = await response?.json();

    expect(response?.status).toBe(200);
    expect(payload).toMatchObject({
      ticker: "MU",
      mode: "deterministic-evidence",
      externalModelUsed: false,
      focus: "thesis",
      thesisUnavailableReason: "external model not configured",
    });
  });

  it("serves a grounded THESIS narrative when the external model is configured", async () => {
    const calls: { url: string; body: string; headers: Headers }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          body: String(init?.body ?? ""),
          headers: new Headers(init?.headers),
        });
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: RELIABLE_THESIS_TEXT }] } }],
          }),
          { status: 200 },
        );
      }),
    );

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/explain", { ticker: "MU", focus: "thesis" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );
      const payload = await response?.json();

      expect(response?.status).toBe(200);
      expect(payload).toMatchObject({
        ticker: "MU",
        mode: "llm-thesis",
        externalModelUsed: true,
        focus: "thesis",
      });
      expect(payload.thesisUnavailableReason).toBeUndefined();
      expect(payload.citations).toContain("external-model:gemini-3.5-flash-lite");
      // grounded prompt: published figures in, credential out of the URL
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("generativelanguage.googleapis.com");
      expect(calls[0].url).not.toContain("test-key");
      expect(calls[0].headers.get("x-goog-api-key")).toBe("test-key");
      expect(calls[0].body).toContain("Ticker: MU");
      expect(calls[0].body).toContain("Do not give investment");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails closed to the deterministic explanation when the external model errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream error", { status: 500 })),
    );

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/explain", { ticker: "MU", focus: "thesis" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );
      const payload = await response?.json();

      expect(response?.status).toBe(200);
      expect(payload).toMatchObject({
        mode: "deterministic-evidence",
        externalModelUsed: false,
        focus: "thesis",
        thesisUnavailableReason: "external model returned HTTP 500",
      });
      expect(payload.explanation.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports the external model as configured in health when the secret exists", async () => {
    const response = await handleEvidenceApi(
      new Request("https://akribeia.example/api/v3/health"),
      { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
      limiter(),
    );

    await expect(response?.json()).resolves.toMatchObject({
      status: "healthy",
      externalModelConfigured: true,
    });
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

  it("rejects a thesis generation that fails the reliability gate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiReply("MU looks fine.")),
    );

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/explain", { ticker: "MU", focus: "thesis" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );
      const payload = await response?.json();

      expect(response?.status).toBe(200);
      expect(payload).toMatchObject({
        mode: "deterministic-evidence",
        externalModelUsed: false,
        focus: "thesis",
        thesisUnavailableReason: "external model returned an unusable response",
      });
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("protected AI assist route", () => {
  it("fails closed for both kinds when no external model is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    try {
      for (const body of [
        { kind: "screener", query: "cheap tech leaders" },
        { kind: "portfolio" },
      ]) {
        const response = await handleEvidenceApi(
          protectedRequest("/api/v3/ai/assist", body),
          env(),
          limiter(),
        );

        expect(response?.status).toBe(200);
        await expect(response?.json()).resolves.toMatchObject({
          ok: false,
          kind: body.kind,
          unavailableReason: "external model not configured",
          externalModelUsed: false,
        });
      }

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects assist bodies that carry unexpected client data", async () => {
    for (const body of [
      { kind: "portfolio", facts: "client-injected facts" },
      { kind: "screener", query: "" },
      { kind: "screener", query: "x".repeat(301) },
      { kind: "unknown" },
    ]) {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/assist", body),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toMatchObject({
        error: { code: "invalid_request" },
      });
    }
  });

  it("returns validated screener filters and never raw model text", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: String(init?.body ?? "") });
        return geminiReply(
          '```json\n{"sectors":["Technology"],"minScore":8,"maxCount":25,"sort":"score-desc","rating":null}\n```',
        );
      }),
    );

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/assist", { kind: "screener", query: "cheap tech leaders" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );
      const payload = await response?.json();

      expect(response?.status).toBe(200);
      expect(payload).toEqual({
        ok: true,
        kind: "screener",
        filters: { sectors: ["Technology"], minScore: 8, maxCount: 25, sort: "score-desc" },
        externalModelUsed: true,
        model: "gemini-3.5-flash-lite",
      });
      // the prompt grounds the mapping in the user query and the published sector vocabulary
      expect(calls).toHaveLength(1);
      expect(calls[0].body).toContain("cheap tech leaders");
      expect(calls[0].body).toContain("Technology");
      expect(calls[0].body).toContain('"temperature":0.1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["prose instead of JSON", "Here are your filters: minScore of eight."],
    ["truncated JSON", '{"minScore": 8, "sectors": ['],
    ["schema-violating JSON", '{"maxCount": 500, "sort": "alphabetical"}'],
    ["non-object JSON", '["Technology"]'],
  ])("fails closed when the screener model reply is %s", async (_case, reply) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiReply(reply)),
    );

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/assist", { kind: "screener", query: "cheap tech leaders" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );
      const payload = await response?.json();

      expect(response?.status).toBe(200);
      expect(payload).toMatchObject({
        ok: false,
        kind: "screener",
        unavailableReason: "external model returned an invalid filter specification",
        externalModelUsed: false,
      });
      expect(payload.filters).toBeUndefined();
      expect(payload.text).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("builds portfolio facts server-side from the verified artifacts only", async () => {
    const calls: { body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ body: String(init?.body ?? "") });
        return geminiReply(RELIABLE_PORTFOLIO_TEXT);
      }),
    );

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/assist", { kind: "portfolio" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );
      const payload = await response?.json();

      expect(response?.status).toBe(200);
      expect(payload).toMatchObject({
        ok: true,
        kind: "portfolio",
        text: RELIABLE_PORTFOLIO_TEXT,
        externalModelUsed: true,
        model: "gemini-3.5-flash-lite",
      });
      expect(payload.citations).toEqual([
        "portfolio.json:positions",
        "portfolio.json:sectorWeights",
        "scores.json:securities",
        "external-model:gemini-3.5-flash-lite",
      ]);

      // the prompt carries facts derived from the verified portfolio artifact itself
      const topPosition = [...ACTIVE_PORTFOLIO.positions].sort(
        (left, right) => right.weight - left.weight || left.ticker.localeCompare(right.ticker),
      )[0];
      expect(calls).toHaveLength(1);
      expect(calls[0].body).toContain(`Position count: ${ACTIVE_PORTFOLIO.positions.length}`);
      expect(calls[0].body).toContain(
        `${topPosition.ticker} ${(topPosition.weight * 100).toFixed(2)}%`,
      );
      expect(calls[0].body).toContain("Do not give investment advice");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("retries transient upstream failures and escalates to the fallback model", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return urls.length < 4
          ? new Response("overloaded", { status: 429 })
          : geminiReply(RELIABLE_PORTFOLIO_TEXT);
      }),
    );

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/assist", { kind: "portfolio" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );
      const payload = await response?.json();

      expect(response?.status).toBe(200);
      expect(payload).toMatchObject({
        ok: true,
        kind: "portfolio",
        externalModelUsed: true,
        model: "gemini-3.5-flash",
      });
      expect(urls).toHaveLength(4);
      expect(
        urls.slice(0, 3).every((url) => url.includes("gemini-3.5-flash-lite:generateContent")),
      ).toBe(true);
      expect(urls[3]).toContain("models/gemini-3.5-flash:generateContent");
    } finally {
      vi.unstubAllGlobals();
    }
  }, 15_000);

  it("does not retry a non-transient upstream rejection", async () => {
    const fetchSpy = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/assist", { kind: "portfolio" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );

      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        kind: "portfolio",
        unavailableReason: "external model returned HTTP 400",
        externalModelUsed: false,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["a sub-200-character reply", "The book looks balanced."],
    [
      "a placeholder-leaking reply",
      "The book is concentrated in its largest holdings and the sector weights run near their " +
        "caps, with the weighted average composite score at X.X for the constrained portfolio, " +
        "which suggests rebalancing toward the under-weighted published sectors over time.",
    ],
  ])("rejects %s through the reliability gate", async (_case, reply) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiReply(reply)),
    );

    try {
      const response = await handleEvidenceApi(
        protectedRequest("/api/v3/ai/assist", { kind: "portfolio" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        kind: "portfolio",
        unavailableReason: "external model returned an unusable response",
        externalModelUsed: false,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
