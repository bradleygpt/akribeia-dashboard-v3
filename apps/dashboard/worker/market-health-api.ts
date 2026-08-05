import type {
  LiveMarketSnapshot,
  MarketHealthApiResponse,
  MarketIndexSnapshot,
  MarketStaticData,
} from "../app/market-health-api-types";

const MARKET_HEALTH_PATH = "/api/v3/market-health";
const V2_APP_COMMIT = "b477349a8691fdc5000641a6ae2893dbbfae2de6";
const V2_SOURCE_COMMIT = "1858840c581f406492dec2e809830d05764ad3d9";
const MARKET_STATIC_URL = `https://raw.githubusercontent.com/bradleygpt/quant-dashboard-pro-v2/${V2_APP_COMMIT}/public/data/market_static.json`;
const PGI_BAKED_URL = `https://raw.githubusercontent.com/bradleygpt/quant-dashboard-pro-v2/${V2_APP_COMMIT}/public/data/pgi_money_market.json`;
const USER_AGENT = "Mozilla/5.0 (compatible; Akribeia/3.0; +https://akribeia.com)";
const US_GDP_TRILLIONS = 29.7;
const MACRO_CONTRACT_MESSAGE =
  "No authoritative free official event schedule is configured. No date, time, timezone, or recurrence is inferred. Market-implied FOMC probabilities unavailable: no permitted free official source is configured.";
const UNSUPPORTED_FED_FIELDS = new Set([
  "cut_probability",
  "hold_probability",
  "hike_probability",
  "next_meeting",
  "note",
]);
const UNSUPPORTED_MACRO_DATA_FIELDS = new Set(["coming_soon_indicators"]);
const UNSUPPORTED_STATIC_FIELDS = new Set(["coming_soon_indicators"]);

type Fetcher = typeof fetch;

interface DatedCloses {
  timestamps: number[];
  closes: number[];
}

interface MarketHealthDependencies {
  fetcher?: Fetcher;
  now?: Date;
  timeoutMs?: number;
}

interface PgiBakedData {
  ok?: boolean;
  money_market_t?: number;
  as_of?: string;
}

const indices: ReadonlyArray<readonly [string, string]> = [
  ["^GSPC", "S&P 500"],
  ["^IXIC", "Nasdaq"],
  ["^DJI", "Dow Jones"],
  ["^RUT", "Russell 2000"],
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=600, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function quarantineUnsupportedMacroFields(staticData: MarketStaticData): MarketStaticData {
  const fedOutlook = asRecord(staticData.fed_outlook);
  const macroData = asRecord(staticData.macro_data);
  const safeFedOutlook =
    fedOutlook === null
      ? undefined
      : Object.fromEntries(
          Object.entries(fedOutlook).filter(([key]) => !UNSUPPORTED_FED_FIELDS.has(key)),
        );
  const safeMacroData =
    macroData === null
      ? undefined
      : Object.fromEntries(
          Object.entries(macroData).filter(([key]) => !UNSUPPORTED_MACRO_DATA_FIELDS.has(key)),
        );
  const safeStaticData = Object.fromEntries(
    Object.entries(staticData).filter(([key]) => !UNSUPPORTED_STATIC_FIELDS.has(key)),
  );

  return {
    ...safeStaticData,
    ...(safeMacroData === undefined ? {} : { macro_data: safeMacroData }),
    ...(safeFedOutlook === undefined ? {} : { fed_outlook: safeFedOutlook }),
    economic_calendar: [],
    fomc_meetings: [],
    macro_contract: {
      status: "blocked",
      schedule: "unavailable",
      probability: "unavailable",
      provenance: "contract_pending",
      message: MACRO_CONTRACT_MESSAGE,
    },
  };
}

async function timedFetch(
  fetcher: Fetcher,
  url: string,
  timeoutMs: number,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
    });
    return response.ok ? response : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function yahooClosesDated(
  fetcher: Fetcher,
  symbol: string,
  timeoutMs: number,
): Promise<DatedCloses | null> {
  const response = await timedFetch(
    fetcher,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
    timeoutMs,
  );
  if (response === null) return null;

  try {
    const root = asRecord(await response.json());
    const chart = asRecord(root?.chart);
    const result = asRecord(asArray(chart?.result)[0]);
    const indicators = asRecord(result?.indicators);
    const quote = asRecord(asArray(indicators?.quote)[0]);
    const timestamps = asArray(result?.timestamp);
    const closes = asArray(quote?.close);
    const dated: DatedCloses = { timestamps: [], closes: [] };

    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = finite(timestamps[index]);
      const close = finite(closes[index]);
      if (timestamp !== null && close !== null) {
        dated.timestamps.push(timestamp * 1000);
        dated.closes.push(close);
      }
    }

    return dated.closes.length > 0 ? dated : null;
  } catch {
    return null;
  }
}

function percentChange(closes: number[], lookback: number): number | null {
  if (closes.length <= lookback) return null;
  const current = closes.at(-1);
  const previous = closes.at(-1 - lookback);
  return current !== undefined && previous !== undefined && previous !== 0
    ? ((current - previous) / previous) * 100
    : null;
}

function ytdChange(dated: DatedCloses): number | null {
  const currentTimestamp = dated.timestamps.at(-1);
  const current = dated.closes.at(-1);
  if (currentTimestamp === undefined || current === undefined) return null;

  const year = new Date(currentTimestamp).getUTCFullYear();
  const baseIndex = dated.timestamps.findIndex(
    (timestamp) => new Date(timestamp).getUTCFullYear() === year,
  );
  const base = dated.closes[baseIndex];

  return base !== undefined && base > 0 ? ((current - base) / base) * 100 : null;
}

function vixScore(value: number): [string, number] {
  if (value < 12) return ["Extreme Complacency", 95];
  if (value < 16) return ["Low Volatility", 80];
  if (value < 20) return ["Normal", 55];
  if (value < 25) return ["Elevated Caution", 35];
  if (value < 30) return ["High Fear", 20];
  if (value < 40) return ["Extreme Fear", 10];
  return ["Panic", 2];
}

function buffettLevel(value: number): [string, number] {
  if (value > 200) return ["Significantly Overvalued", 10];
  if (value > 150) return ["Overvalued", 30];
  if (value > 120) return ["Fairly Valued", 50];
  if (value > 90) return ["Undervalued", 70];
  return ["Significantly Undervalued", 90];
}

async function fredLatest(
  fetcher: Fetcher,
  series: string,
  timeoutMs: number,
): Promise<number | null> {
  const response = await timedFetch(
    fetcher,
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}`,
    timeoutMs,
  );
  if (response === null) return null;

  try {
    const lines = (await response.text()).trim().split("\n");
    for (let index = lines.length - 1; index >= 1; index -= 1) {
      const parsed = Number.parseFloat(lines[index]?.split(",")[1] ?? "");
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

async function loadStaticData(
  fetcher: Fetcher,
  timeoutMs: number,
): Promise<MarketStaticData | null> {
  const response = await timedFetch(fetcher, MARKET_STATIC_URL, timeoutMs);
  if (response === null) return null;

  try {
    const value = await response.json();
    return asRecord(value) === null
      ? null
      : quarantineUnsupportedMacroFields(value as MarketStaticData);
  } catch {
    return null;
  }
}

async function loadPgiBakedData(fetcher: Fetcher, timeoutMs: number): Promise<PgiBakedData | null> {
  const response = await timedFetch(fetcher, PGI_BAKED_URL, timeoutMs);
  if (response === null) return null;

  try {
    const value = await response.json();
    return asRecord(value) === null ? null : (value as PgiBakedData);
  } catch {
    return null;
  }
}

function ageDays(asOf: string | undefined, now: Date): number | null {
  if (asOf === undefined) return null;
  const timestamp = Date.parse(asOf);
  return Number.isFinite(timestamp) ? Math.floor((now.valueOf() - timestamp) / 86_400_000) : null;
}

function indexSnapshot(name: string, dated: DatedCloses | null): MarketIndexSnapshot {
  const current = dated?.closes.at(-1);
  if (dated === null || current === undefined) return { name, ok: false };

  const allTimeHigh = Math.max(...dated.closes);
  return {
    name,
    ok: true,
    price: current,
    allTimeHigh,
    distanceFromAthPct: ((current - allTimeHigh) / allTimeHigh) * 100,
    change1dPct: percentChange(dated.closes, 1),
    change5dPct: percentChange(dated.closes, 5),
    change1mPct: percentChange(dated.closes, 22),
    change3mPct: percentChange(dated.closes, 66),
    ytdPct: ytdChange(dated),
  };
}

export async function buildMarketHealthSnapshot({
  fetcher = fetch,
  now = new Date(),
  timeoutMs = 12_000,
}: MarketHealthDependencies = {}): Promise<MarketHealthApiResponse> {
  const [
    staticData,
    pgiBaked,
    indexData,
    dxyData,
    vixData,
    tenYearData,
    twoYearData,
    totalMarketData,
    moneyMarketMillions,
    sepMedian,
    sepLongRun,
  ] = await Promise.all([
    loadStaticData(fetcher, timeoutMs),
    loadPgiBakedData(fetcher, timeoutMs),
    Promise.all(indices.map(([symbol]) => yahooClosesDated(fetcher, symbol, timeoutMs))),
    yahooClosesDated(fetcher, "DX-Y.NYB", timeoutMs),
    yahooClosesDated(fetcher, "^VIX", timeoutMs),
    yahooClosesDated(fetcher, "^TNX", timeoutMs),
    yahooClosesDated(fetcher, "^IRX", timeoutMs),
    yahooClosesDated(fetcher, "^W5000", timeoutMs),
    fredLatest(fetcher, "MMMFFAQ027S", timeoutMs),
    fredLatest(fetcher, "FEDTARMD", timeoutMs),
    fredLatest(fetcher, "FEDTARMDLR", timeoutMs),
  ]);

  const indexSnapshots = indices.map(([, name], index) =>
    indexSnapshot(name, indexData[index] ?? null),
  );
  const dxyCurrent = dxyData?.closes.at(-1);
  const vixCurrent = vixData?.closes.at(-1);
  const tenYear = tenYearData?.closes.at(-1);
  const twoYear = twoYearData?.closes.at(-1);
  const totalMarket = totalMarketData?.closes.at(-1);
  const spCloses = indexData[0]?.closes ?? [];
  const spCurrent = spCloses.at(-1);
  const sma = (period: number) =>
    spCloses.length >= period
      ? spCloses.slice(-period).reduce((sum, value) => sum + value, 0) / period
      : null;

  const live: LiveMarketSnapshot = {
    indices: indexSnapshots,
    dxy:
      dxyData !== null && dxyCurrent !== undefined
        ? {
            ok: true,
            current: dxyCurrent,
            change1dPct: percentChange(dxyData.closes, 1),
            ytdPct: ytdChange(dxyData),
          }
        : { ok: false },
    spy:
      spCurrent !== undefined && spCloses.length >= 50
        ? {
            ok: true,
            price: spCurrent,
            sma50: sma(50),
            sma200: sma(200),
            return3mPct: percentChange(spCloses, 63),
          }
        : { ok: false },
    vix: (() => {
      if (vixData === null || vixCurrent === undefined) return { ok: false };
      const window = vixData.closes.slice(-252);
      const high = Math.max(...window);
      const low = Math.min(...window);
      const [level, score] = vixScore(vixCurrent);
      return {
        ok: true,
        current: vixCurrent,
        average1y: window.reduce((sum, value) => sum + value, 0) / window.length,
        high1y: high,
        low1y: low,
        percentile: high > low ? ((vixCurrent - low) / (high - low)) * 100 : 50,
        level,
        score,
      };
    })(),
    yields:
      tenYear !== undefined && twoYear !== undefined
        ? { ok: true, y10: tenYear, y2: twoYear, spread: tenYear - twoYear }
        : { ok: false },
    buffett: (() => {
      if (totalMarket === undefined) return { ok: false };
      const marketCapTrillions = (totalMarket * 1.2) / 1000;
      const ratio = (marketCapTrillions / US_GDP_TRILLIONS) * 100;
      const [level, score] = buffettLevel(ratio);
      return {
        ok: true,
        ratio,
        level,
        score,
        marketCapTrillions,
        gdpTrillions: US_GDP_TRILLIONS,
      };
    })(),
    pgi: (() => {
      if (totalMarket === undefined) return { ok: false };
      const bakedMoneyMarket = pgiBaked?.ok === true ? finite(pgiBaked.money_market_t) : null;
      let moneyMarketTrillions =
        moneyMarketMillions !== null ? moneyMarketMillions / 1_000_000 : (bakedMoneyMarket ?? 7);
      if (moneyMarketTrillions < 1 || moneyMarketTrillions > 20) {
        moneyMarketTrillions = 7;
      }
      const totalMarketCapTrillions = totalMarket / 1000;
      const value =
        totalMarketCapTrillions > 0 ? (moneyMarketTrillions / totalMarketCapTrillions) * 100 : 0;
      const level = value > 11.5 ? "Eager to Invest" : value >= 9.5 ? "Neutral" : "Cautious";
      const score =
        value > 11.5 ? Math.min(100, (value - 8) * 5) : value >= 9.5 ? 50 : Math.max(0, value * 5);
      return {
        ok: true,
        value,
        moneyMarketTrillions,
        totalMarketCapTrillions,
        level,
        score,
        fredKeyless: moneyMarketMillions !== null,
        source:
          moneyMarketMillions !== null ? "live" : bakedMoneyMarket !== null ? "baked" : "estimate",
        asOf: moneyMarketMillions !== null ? null : (pgiBaked?.as_of ?? null),
        stale:
          moneyMarketMillions !== null
            ? false
            : bakedMoneyMarket !== null
              ? (ageDays(pgiBaked?.as_of, now) ?? Number.POSITIVE_INFINITY) > 210
              : true,
      };
    })(),
    dots:
      sepMedian !== null || sepLongRun !== null
        ? {
            ok: true,
            ...(sepMedian === null ? {} : { medianCurrentYear: sepMedian }),
            ...(sepLongRun === null ? {} : { medianLongerRun: sepLongRun }),
          }
        : { ok: false },
  };

  const checks: Array<[string, boolean]> = [
    ["baked macro and earnings", staticData !== null],
    ["major indices", live.indices.every(({ ok }) => ok)],
    ["dollar index", live.dxy.ok],
    ["VIX", live.vix.ok],
    ["Treasury yields", live.yields.ok],
    ["Buffett indicator", live.buffett.ok],
    ["Potential Growth Indicator", live.pgi.ok],
  ];
  const passed = checks.filter(([, ok]) => ok).length;
  const status = passed === checks.length ? "healthy" : passed > 0 ? "partial" : "unavailable";

  return {
    status,
    generatedAt: now.toISOString(),
    source: {
      v2AppCommit: V2_APP_COMMIT,
      v2SourceCommit: V2_SOURCE_COMMIT,
      staticUrl: MARKET_STATIC_URL,
      pgiBakedUrl: PGI_BAKED_URL,
      staticAsOf:
        staticData?.macro_signals?.as_of ?? staticData?.generated_at?.slice(0, 10) ?? null,
      liveProvider: "Yahoo Finance chart API + FRED fredgraph.csv",
    },
    staticData,
    live,
    unavailable: checks.filter(([, ok]) => !ok).map(([name]) => name),
  };
}

export async function handleMarketHealthApi(
  request: Request,
  dependencies: MarketHealthDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== MARKET_HEALTH_PATH) return null;

  if (request.method !== "GET") {
    return json(
      {
        status: "unavailable",
        error: {
          code: "method_not_allowed",
          message: "Use GET for the Market Health endpoint.",
        },
      },
      405,
    );
  }

  const snapshot = await buildMarketHealthSnapshot(dependencies);
  return json(snapshot, snapshot.status === "unavailable" ? 503 : 200);
}
