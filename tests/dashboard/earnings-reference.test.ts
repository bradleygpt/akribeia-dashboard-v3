import { describe, expect, it } from "vitest";
import { handleResearchReferenceApi } from "../../apps/dashboard/worker/research-reference-api.js";

const V2_APP_COMMIT = "538ec29b41172d7b44c96e67a7346f96c41ebede";

function referenceRequest(dataset: string, ticker?: string): Request {
  const query = ticker === undefined ? "" : `&ticker=${encodeURIComponent(ticker)}`;
  return new Request(`https://akribeia.test/api/v3/research-reference?dataset=${dataset}${query}`);
}

function jsonFetcher(payload: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(payload), { status: 200 });
}

const REVIEW_CORPUS = {
  "CRM_2026-05-27": { ok: true, verdict: "HOLD", filing_date: "2026-05-27" },
  "CRM_2026-05": { ok: true, verdict: "HOLD", filing_date: "2026-05-27" },
  "MU_2025-12-19": { ok: true, verdict: "HOLD", filing_date: "2025-12-19" },
  "MU_2025-12": { ok: true, verdict: "HOLD", filing_date: "2025-12-19" },
  "MU_2026-03-18": {
    ok: true,
    verdict: "BUY ON STRENGTH",
    headline: "Record quarter.",
    full_text: "VERDICT: BUY ON STRENGTH",
    filing_date: "2026-03-18",
    filing_url: "https://example.test/8k",
    prior_filing_date: "2025-12-19",
    company_name: "Micron Technology, Inc.",
    provider: "gemini",
    model: "gemini-2.5-flash",
    cached_at: "2026-07-06",
  },
  "MU_2026-03": { ok: true, verdict: "BUY ON STRENGTH", filing_date: "2026-03-18" },
};

describe("baked earnings reviews via the pinned V2 proxy", () => {
  it("requires a valid ticker for both earnings datasets", async () => {
    for (const dataset of ["earnings-reviews", "earnings-quality"]) {
      const missing = await handleResearchReferenceApi(referenceRequest(dataset));
      expect(missing?.status).toBe(400);
      await expect(missing?.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_ticker" },
      });

      const invalid = await handleResearchReferenceApi(referenceRequest(dataset, "../etc"));
      expect(invalid?.status).toBe(400);
      await expect(invalid?.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "invalid_ticker" },
      });
    }
  });

  it("narrows earnings reviews to the newest full-date key for the ticker", async () => {
    let requestedUrl = "";
    const response = await handleResearchReferenceApi(referenceRequest("earnings-reviews", "mu"), {
      fetcher: async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify(REVIEW_CORPUS), { status: 200 });
      },
      now: new Date("2026-08-27T12:00:00Z"),
    });

    expect(requestedUrl).toContain(`${V2_APP_COMMIT}/public/data/earnings_reviews.json`);
    expect(requestedUrl).toContain("raw.githubusercontent.com");
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as {
      ok: boolean;
      dataset: string;
      ticker: string;
      payload: { key: string; record: { verdict: string; filing_date: string } };
    };
    expect(body.ok).toBe(true);
    expect(body.dataset).toBe("earnings-reviews");
    expect(body.ticker).toBe("MU");
    // MU_2026-03-18 beats the older MU_2025-12-19 and every month-only key.
    expect(body.payload.key).toBe("MU_2026-03-18");
    expect(body.payload.record).toMatchObject({
      verdict: "BUY ON STRENGTH",
      filing_date: "2026-03-18",
      company_name: "Micron Technology, Inc.",
    });
  });

  it("falls back to the newest month key when no full-date key exists", async () => {
    const response = await handleResearchReferenceApi(
      referenceRequest("earnings-reviews", "AAPL"),
      {
        fetcher: jsonFetcher({
          "AAPL_2026-01": { ok: true, verdict: "HOLD" },
          "AAPL_2026-04": { ok: true, verdict: "BUY" },
        }),
      },
    );

    const body = (await response?.json()) as { payload: { key: string } };
    expect(response?.status).toBe(200);
    expect(body.payload.key).toBe("AAPL_2026-04");
  });

  it("returns an explicit not-found shape for a ticker without any review", async () => {
    const response = await handleResearchReferenceApi(
      referenceRequest("earnings-reviews", "ZZZT"),
      { fetcher: jsonFetcher(REVIEW_CORPUS) },
    );

    expect(response?.status).toBe(404);
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      dataset: "earnings-reviews",
      ticker: "ZZZT",
      error: { code: "ticker_not_found" },
    });
  });

  it("does not treat another ticker sharing a prefix as a match", async () => {
    const response = await handleResearchReferenceApi(referenceRequest("earnings-reviews", "M"), {
      fetcher: jsonFetcher(REVIEW_CORPUS),
    });

    expect(response?.status).toBe(404);
  });

  it("narrows earnings quality to the ticker with its method provenance", async () => {
    const response = await handleResearchReferenceApi(referenceRequest("earnings-quality", "MU"), {
      fetcher: jsonFetcher({
        generated_at: "2026-08-27",
        method: "heuristic over the baked review text",
        quality: {
          "MU_2025-12-19": { quality: "Medium", verdict: "HOLD" },
          "MU_2026-03-18": { quality: "High", verdict: "BUY ON STRENGTH" },
          "CRM_2026-05-27": { quality: "High", verdict: "HOLD" },
        },
      }),
    });

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { payload: Record<string, unknown> };
    expect(body.payload).toEqual({
      key: "MU_2026-03-18",
      record: { quality: "High", verdict: "BUY ON STRENGTH" },
      generatedAt: "2026-08-27",
      method: "heuristic over the baked review text",
    });
  });

  it("accepts a large earnings corpus under the raised 7MB cap", async () => {
    const padded = {
      ...REVIEW_CORPUS,
      PAD_2026_01_01: { pad: "x".repeat(6_000_000) },
    };
    const response = await handleResearchReferenceApi(referenceRequest("earnings-reviews", "MU"), {
      fetcher: jsonFetcher(padded),
    });

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { payload: { key: string } };
    expect(body.payload.key).toBe("MU_2026-03-18");
  });

  it("rejects an earnings corpus above the raised cap", async () => {
    const response = await handleResearchReferenceApi(referenceRequest("earnings-reviews", "MU"), {
      fetcher: async () => new Response("x".repeat(7_000_001), { status: 200 }),
    });

    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "source_too_large" },
    });
  });

  it("keeps the default 2MB cap for every non-earnings dataset", async () => {
    const response = await handleResearchReferenceApi(referenceRequest("risk-radar"), {
      fetcher: async () => new Response("x".repeat(2_000_001), { status: 200 }),
    });

    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "source_too_large" },
    });
  });

  it("serves the whole ticker anchor map and narrows it on request", async () => {
    const anchorMap = {
      MU: { anchor: "ANCHOR_SMH", alias: "semis", mapping_kind: "sector_proxy" },
      AAPL: { anchor: "ANCHOR_XLK", alias: "tech", mapping_kind: "sector_proxy" },
    };

    const whole = await handleResearchReferenceApi(referenceRequest("ticker-anchor-map"), {
      fetcher: jsonFetcher(anchorMap),
    });
    expect(whole?.status).toBe(200);
    const wholeBody = (await whole?.json()) as { ticker?: string; payload: unknown };
    expect(wholeBody.payload).toEqual(anchorMap);
    expect(wholeBody.ticker).toBeUndefined();

    const narrowed = await handleResearchReferenceApi(referenceRequest("ticker-anchor-map", "mu"), {
      fetcher: jsonFetcher(anchorMap),
    });
    expect(narrowed?.status).toBe(200);
    await expect(narrowed?.json()).resolves.toMatchObject({
      ok: true,
      ticker: "MU",
      payload: { ticker: "MU", entry: anchorMap.MU },
    });

    const absent = await handleResearchReferenceApi(referenceRequest("ticker-anchor-map", "ZZZT"), {
      fetcher: jsonFetcher(anchorMap),
    });
    expect(absent?.status).toBe(404);
    await expect(absent?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "ticker_not_found" },
    });
  });
});
