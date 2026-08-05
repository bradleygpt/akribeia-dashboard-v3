import { describe, expect, it } from "vitest";
import {
  buildMarketHealthSnapshot,
  handleMarketHealthApi,
  quarantineUnsupportedMacroFields,
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
    coming_soon_indicators: [
      { name: "FOMC Rate Decision Probability", status: "Needs futures data" },
    ],
  },
  earnings_forecast: {
    sp500_earnings_growth: 8.1,
  },
  macro_signals: {
    as_of: "2026-07-29",
    signals: [],
  },
  fed_outlook: {
    cut_probability: 35,
    hold_probability: 55,
    hike_probability: 10,
    next_meeting: "2026-05-06",
    bias: "Data Dependent",
  },
  economic_calendar: [{ event: "Unsupported recurring event", date: "6 weeks" }],
  fomc_meetings: ["2026-06-18", "2026-09-17"],
};
const pgiBakedPayload = {
  ok: true,
  money_market_t: 7.95,
  as_of: "2026-07-01",
};
const expectedMarketStaticPath =
  "/bradleygpt/quant-dashboard-pro-v2/b477349a8691fdc5000641a6ae2893dbbfae2de6/public/data/market_static.json";

function isExpectedMarketStaticUrl(input: string | URL | Request): boolean {
  try {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    return (
      url.protocol === "https:" &&
      url.hostname === "raw.githubusercontent.com" &&
      url.port === "" &&
      url.pathname === expectedMarketStaticPath &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function healthyFetcher(input: string | URL | Request): Promise<Response> {
  const url = String(input);

  if (url.includes("pgi_money_market.json")) {
    return Promise.resolve(Response.json(pgiBakedPayload));
  }

  if (url.includes("market_static.json")) {
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
        pgi: { ok: true, fredKeyless: true, source: "live", stale: false },
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
    expect(body.staticData).toMatchObject({
      fed_outlook: { bias: "Data Dependent" },
      economic_calendar: [],
      fomc_meetings: [],
      macro_contract: {
        status: "blocked",
        schedule: "unavailable",
        probability: "unavailable",
        provenance: "contract_pending",
      },
    });
    const safeFedOutlook = (body.staticData as { fed_outlook: Record<string, unknown> })
      .fed_outlook;
    expect(safeFedOutlook).not.toHaveProperty("cut_probability");
    expect(safeFedOutlook).not.toHaveProperty("hold_probability");
    expect(safeFedOutlook).not.toHaveProperty("hike_probability");
    expect(safeFedOutlook).not.toHaveProperty("next_meeting");
  });

  it("quarantines unsupported macro values without mutating the approved static input", () => {
    const source = structuredClone(staticPayload);
    const safe = quarantineUnsupportedMacroFields(source);

    expect(source).toEqual(staticPayload);
    expect(safe.economic_calendar).toEqual([]);
    expect(safe.fomc_meetings).toEqual([]);
    expect(safe.fed_outlook).toEqual({ bias: "Data Dependent" });
    expect(safe.macro_data).toEqual({
      ism_composite: 53.9,
      unemployment_current: 4.2,
      gdp_latest_qoq_annualized: 2.4,
      cpi_current: 2.4,
    });
    expect(safe).not.toHaveProperty("coming_soon_indicators");
    expect(safe.macro_contract?.message).toContain(
      "Market-implied FOMC probabilities unavailable: no permitted free official source is configured.",
    );
    expect(safe.macro_contract?.message).toContain(
      "No authoritative free official event schedule is configured. No date, time, timezone, or recurrence is inferred.",
    );
  });

  it("uses the dated V2 baked PGI observation before the flagged hardcoded estimate", async () => {
    const fetcher = (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("market_static.json")) return Promise.resolve(Response.json(staticPayload));
      if (url.includes("pgi_money_market.json")) {
        return Promise.resolve(
          Response.json({ ok: true, money_market_t: 7.95, as_of: "2025-01-01" }),
        );
      }
      if (url.includes("MMMFFAQ027S")) {
        return Promise.resolve(new Response("Unavailable", { status: 503 }));
      }
      if (url.includes("fredgraph.csv")) {
        return Promise.resolve(new Response("DATE,VALUE\n2026-07-01,4\n"));
      }
      return Promise.resolve(chartResponse());
    };
    const snapshot = await buildMarketHealthSnapshot({
      fetcher: fetcher as typeof fetch,
      now: new Date("2026-07-30T18:00:00Z"),
      timeoutMs: 50,
    });

    expect(snapshot.live.pgi).toMatchObject({
      ok: true,
      source: "baked",
      asOf: "2025-01-01",
      stale: true,
      moneyMarketTrillions: 7.95,
    });
  });

  it("returns valid baked data with an explicit partial state when live sources fail", async () => {
    const fetcher = (input: string | URL | Request) =>
      Promise.resolve(
        isExpectedMarketStaticUrl(input)
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

  it("matches the baked static source by exact URL components", () => {
    expect(
      isExpectedMarketStaticUrl(`https://raw.githubusercontent.com${expectedMarketStaticPath}`),
    ).toBe(true);
    expect(
      isExpectedMarketStaticUrl(
        `https://raw.githubusercontent.com.example.invalid${expectedMarketStaticPath}`,
      ),
    ).toBe(false);
    expect(
      isExpectedMarketStaticUrl(
        `https://example.invalid/raw.githubusercontent.com${expectedMarketStaticPath}`,
      ),
    ).toBe(false);
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

  it("times out stalled upstreams and returns an unavailable snapshot", async () => {
    const stalledFetcher = (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    const snapshot = await buildMarketHealthSnapshot({
      fetcher: stalledFetcher as typeof fetch,
      timeoutMs: 5,
    });

    expect(snapshot.status).toBe("unavailable");
    expect(snapshot.staticData).toBeNull();
    expect(snapshot.unavailable).toContain("Potential Growth Indicator");
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
