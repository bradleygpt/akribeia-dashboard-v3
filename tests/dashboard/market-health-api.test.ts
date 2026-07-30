import { describe, expect, it } from "vitest";
import {
  buildMarketHealthSnapshot,
  handleMarketHealthApi,
} from "../../apps/dashboard/worker/market-health-api.js";

function chartResponse(start = 100): Response {
  const timestamps = Array.from({ length: 260 }, (_, index) => 1_735_689_600 + index * 86_400);
  const closes = Array.from({ length: 260 }, (_, index) => start + index * 0.1);
  return Response.json({
    chart: {
      result: [
        {
          timestamp: timestamps,
          indicators: { quote: [{ close: closes }] },
        },
      ],
    },
  });
}

const staticPayload = {
  generated_at: "2026-07-30T17:15:16",
  macro_data: {
    ism_composite: 53.9,
    unemployment_current: 4.2,
    gdp_latest_qoq_annualized: 2.4,
    cpi_current: 2.4,
  },
  earnings_forecast: {
    sp500_earnings_growth: 8.1,
  },
  macro_signals: {
    as_of: "2026-07-29",
    signals: [],
  },
};

function healthyFetcher(input: string | URL | Request): Promise<Response> {
  const url = String(input);

  if (url.includes("raw.githubusercontent.com")) {
    return Promise.resolve(Response.json(staticPayload));
  }

  if (url.includes("fredgraph.csv")) {
    const value = url.includes("MMMFFAQ027S")
      ? "7000000"
      : url.includes("FEDTARMDLR")
        ? "2.5"
        : "4";
    return Promise.resolve(new Response(`DATE,VALUE\n2026-07-01,${value}\n`));
  }

  return Promise.resolve(chartResponse());
}

describe("V3 Market Health server adapter", () => {
  it("returns a complete keyless snapshot with V2 cache behavior", async () => {
    const response = await handleMarketHealthApi(
      new Request("https://akribeia.example/api/v3/market-health"),
      {
        fetcher: healthyFetcher as typeof fetch,
        now: new Date("2026-07-30T18:00:00Z"),
        timeoutMs: 100,
      },
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get("cache-control")).toBe(
      "public, s-maxage=600, stale-while-revalidate=3600",
    );
    const body = (await response?.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "healthy",
      generatedAt: "2026-07-30T18:00:00.000Z",
      live: {
        vix: { ok: true },
        yields: { ok: true },
        buffett: { ok: true },
        pgi: { ok: true, fredKeyless: true },
      },
      source: {
        v2AppCommit: "b477349a8691fdc5000641a6ae2893dbbfae2de6",
        staticAsOf: "2026-07-29",
      },
    });
    expect((body.live as { indices: Array<{ name: string; ok: boolean }> }).indices).toHaveLength(
      4,
    );
    expect(
      (body.live as { indices: Array<{ name: string; ok: boolean }> }).indices[0],
    ).toMatchObject({ name: "S&P 500", ok: true });
  });

  it("returns valid baked data with an explicit partial state when live sources fail", async () => {
    const fetcher = (input: string | URL | Request) =>
      Promise.resolve(
        String(input).includes("raw.githubusercontent.com")
          ? Response.json(staticPayload)
          : new Response("Unavailable", { status: 503 }),
      );
    const snapshot = await buildMarketHealthSnapshot({
      fetcher: fetcher as typeof fetch,
      now: new Date("2026-07-30T18:00:00Z"),
      timeoutMs: 50,
    });

    expect(snapshot.status).toBe("partial");
    expect(snapshot.staticData?.earnings_forecast?.sp500_earnings_growth).toBe(8.1);
    expect(snapshot.live.vix.ok).toBe(false);
    expect(snapshot.unavailable).toContain("major indices");
  });

  it("fails closed when both baked and live sources are unavailable", async () => {
    const response = await handleMarketHealthApi(
      new Request("https://akribeia.example/api/v3/market-health"),
      {
        fetcher: (() =>
          Promise.resolve(new Response("Unavailable", { status: 503 }))) as typeof fetch,
        timeoutMs: 50,
      },
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      status: "unavailable",
      staticData: null,
    });
  });

  it("rejects unsupported methods and ignores non-Market-Health routes", async () => {
    const rejected = await handleMarketHealthApi(
      new Request("https://akribeia.example/api/v3/market-health", { method: "POST" }),
    );
    const ignored = await handleMarketHealthApi(
      new Request("https://akribeia.example/api/v3/health"),
    );

    expect(rejected?.status).toBe(405);
    expect(ignored).toBeNull();
  });
});
