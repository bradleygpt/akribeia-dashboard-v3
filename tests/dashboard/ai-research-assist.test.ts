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

const FUNDAMENTALS_FIXTURE = {
  generatedAt: "2026-08-27T00:00:00.000Z",
  sourceNote: "test fixture",
  securities: {
    MU: {
      fv: 1306.61,
      fvPremium: -23.7,
      fvVerdict: "Undervalued",
      qbp: 552.08,
      qbpSignal: "Approaching",
      qbpDistance: 6.5,
      grades: { Valuation: "B", Growth: "B+", Profitability: "A" },
      raw: {
        forwardPE: 6.248,
        trailingPE: 21.8949,
        pegRatio: 0.13,
        grossMargins: 0.7257,
        operatingMargins: 0.8037,
        profitMargins: 0.5591,
        returnOnEquity: 0.6664,
        revenueGrowth: 3.457,
        earningsGrowth: 13.685,
        momentum_3m: 0.194,
        momentum_12m: 6.6695,
        analyst_mean_target_upside: 0.5517,
        earnings_surprise_pct: 21.39,
      },
    },
  },
};

const RELIABLE_RESEARCH_TEXT =
  "MU pairs strong published pillar grades with wide margins in the verified data, and the " +
  "weighted factor contributions lean on profitability and revisions. Risks center on the " +
  "weaker valuation grade in the published set. The stated fair-value verdict of Undervalued " +
  "with the recorded premium frames the price question, and on balance the published evidence " +
  "reads constructively for MU over the recorded horizon.";

function fundamentalsAssetFetcher(
  fundamentals: unknown = FUNDAMENTALS_FIXTURE,
  available = true,
): AssetFetcher {
  return {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;

      if (pathname === "/data/ai-fundamentals.json") {
        return available
          ? new Response(JSON.stringify(fundamentals), { status: 200 })
          : new Response("Not found", { status: 404 });
      }

      const filePath = resolve(publicRoot, pathname.replace(/^\/+/, ""));
      const containment = relative(publicRoot, filePath);

      if (containment.startsWith("..") || isAbsolute(containment)) {
        return new Response("Forbidden", { status: 403 });
      }

      try {
        return new Response(new Uint8Array(await readFile(filePath)), { status: 200 });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  };
}

function env(fetcher: AssetFetcher = fundamentalsAssetFetcher()): EvidenceApiEnv {
  return { ASSETS: fetcher };
}

function limiter() {
  return createFixedWindowRateLimiter({ limit: 20, windowMs: 60_000, now: () => 1_000_000 });
}

function assistRequest(body: unknown): Request {
  return new Request("https://akribeia.example/api/v3/ai/assist", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "192.0.2.10",
      "content-type": "application/json",
      origin: "https://akribeia.example",
      "x-akribeia-client": "dashboard-v3",
    },
    body: JSON.stringify(body),
  });
}

function geminiReply(text: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
    status: 200,
  });
}

describe("protected AI assist research kind", () => {
  it("fails closed when no external model is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const response = await handleEvidenceApi(
        assistRequest({ kind: "research", ticker: "MU" }),
        env(),
        limiter(),
      );

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        kind: "research",
        unavailableReason: "external model not configured",
        externalModelUsed: false,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects malformed research requests before loading evidence", async () => {
    for (const body of [
      { kind: "research" },
      { kind: "research", ticker: "../MU" },
      { kind: "research", ticker: "" },
      { kind: "research", ticker: "MU", extra: true },
    ]) {
      const response = await handleEvidenceApi(
        assistRequest(body),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toMatchObject({
        error: { code: "invalid_request" },
      });
    }
  });

  it("grounds the research note in verified scores and served fundamentals", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: String(init?.body ?? "") });
        return geminiReply(RELIABLE_RESEARCH_TEXT);
      }),
    );

    try {
      const response = await handleEvidenceApi(
        assistRequest({ kind: "research", ticker: "mu" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );
      const payload = await response?.json();

      expect(response?.status).toBe(200);
      expect(payload).toEqual({
        ok: true,
        kind: "research",
        ticker: "MU",
        text: RELIABLE_RESEARCH_TEXT,
        citations: [
          "scores.json:security",
          "ai-fundamentals.json:MU",
          "external-model:gemini-3.5-flash-lite",
        ],
        externalModelUsed: true,
        model: "gemini-3.5-flash-lite",
      });

      // the fact block carries fair value and margins from the served artifact
      // and the verified scores row — never client-supplied figures.
      expect(calls).toHaveLength(1);
      expect(calls[0].url).not.toContain("test-key");
      expect(calls[0].body).toContain("Ticker: MU");
      expect(calls[0].body).toContain("Fair value $1306.61");
      expect(calls[0].body).toContain("verdict Undervalued");
      // Ratios reach the model pre-formatted as percentages — the LLM never
      // converts units itself (the V2 endpoint's no-arithmetic rule).
      expect(calls[0].body).toContain("gross margin 72.6%");
      expect(calls[0].body).toContain("operating margin 80.4%");
      expect(calls[0].body).toContain("revenue +345.7% YoY");
      expect(calls[0].body).toContain("12M +667.0%");
      expect(calls[0].body).toContain("Factor contributions:");
      expect(calls[0].body).toContain("Do not give investment advice");
      expect(calls[0].body).toContain('"temperature":0.45');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails closed when the ticker is not in the active build", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const response = await handleEvidenceApi(
        assistRequest({ kind: "research", ticker: "ZZZT" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        kind: "research",
        unavailableReason: "ticker is not present in the active build",
        externalModelUsed: false,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails closed when the fundamentals artifact is unavailable", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    try {
      const response = await handleEvidenceApi(
        assistRequest({ kind: "research", ticker: "MU" }),
        { ...env(fundamentalsAssetFetcher(undefined, false)), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        kind: "research",
        unavailableReason: "baked fundamentals are unavailable for this ticker",
        externalModelUsed: false,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["a sub-200-character reply", "MU looks fine on the published figures."],
    ["a reply missing the ticker grounding token", RELIABLE_RESEARCH_TEXT.replaceAll("MU", "it")],
    [
      "a placeholder-leaking reply",
      RELIABLE_RESEARCH_TEXT.replace("wide margins", "margins near X.X"),
    ],
  ])("rejects %s through the reliability gate", async (_case, reply) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiReply(reply)),
    );

    try {
      const response = await handleEvidenceApi(
        assistRequest({ kind: "research", ticker: "MU" }),
        { ...env(), THESIS_GEMINI_API_KEY: "test-key" },
        limiter(),
      );

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toMatchObject({
        ok: false,
        kind: "research",
        unavailableReason: "external model returned an unusable response",
        externalModelUsed: false,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("serves the generated ai-fundamentals artifact with the required shape", async () => {
    const artifact = JSON.parse(
      await readFile(resolve(publicRoot, "data/ai-fundamentals.json"), "utf8"),
    ) as {
      generatedAt: string;
      sourceNote: string;
      securities: Record<string, { raw?: Record<string, number> }>;
    };

    expect(typeof artifact.generatedAt).toBe("string");
    expect(typeof artifact.sourceNote).toBe("string");
    expect(Object.keys(artifact.securities).length).toBeGreaterThan(1000);

    const allowedTop = new Set([
      "fv",
      "fvPremium",
      "fvVerdict",
      "qbp",
      "qbpSignal",
      "qbpDistance",
      "grades",
      "raw",
    ]);
    const allowedRaw = new Set([
      "forwardPE",
      "trailingPE",
      "pegRatio",
      "priceToSalesTrailing12Months",
      "grossMargins",
      "operatingMargins",
      "profitMargins",
      "returnOnEquity",
      "revenueGrowth",
      "earningsGrowth",
      "momentum_3m",
      "momentum_12m",
      "analyst_mean_target_upside",
      "earnings_surprise_pct",
    ]);

    for (const security of Object.values(artifact.securities)) {
      for (const key of Object.keys(security)) {
        expect(allowedTop.has(key), `unexpected field ${key}`).toBe(true);
      }
      for (const [key, value] of Object.entries(security.raw ?? {})) {
        expect(allowedRaw.has(key), `unexpected raw field ${key}`).toBe(true);
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
