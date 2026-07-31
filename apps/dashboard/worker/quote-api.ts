const QUOTE_PATH = "/api/v3/quote";
const QUOTES_PATH = "/api/v3/quotes";
const USER_AGENT = "Mozilla/5.0 (compatible; Akribeia/3.0; +https://akribeia.com)";
const VALID_RANGES = new Set(["6mo", "1y", "2y", "5y", "10y", "max"]);
const TICKER_PATTERN = /^[A-Z0-9.^=-]{1,15}$/;

type Fetcher = typeof fetch;

interface QuoteDependencies {
  fetcher?: Fetcher;
  now?: Date;
  timeoutMs?: number;
}

interface YahooSeries {
  timestamp?: unknown[];
  indicators?: {
    quote?: Array<{
      close?: unknown[];
      high?: unknown[];
      low?: unknown[];
      volume?: unknown[];
    }>;
  };
  meta?: Record<string, unknown>;
}

function json(body: unknown, status = 200, staleSeconds = 900): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, s-maxage=120, stale-while-revalidate=${staleSeconds}`,
      "x-content-type-options": "nosniff",
    },
  });
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function yahooResult(value: unknown): YahooSeries | null {
  const root = record(value);
  const chart = record(root?.chart);
  const result = Array.isArray(chart?.result) ? chart.result[0] : null;
  return record(result) as YahooSeries | null;
}

async function timedJson(
  fetcher: Fetcher,
  url: string,
  timeoutMs: number,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { "user-agent": USER_AGENT },
      signal: controller.signal,
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseHistory(series: YahooSeries | null) {
  if (!Array.isArray(series?.timestamp)) return null;
  const quote = series.indicators?.quote?.[0];
  const dates: string[] = [];
  const close: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const volume: number[] = [];

  for (let index = 0; index < series.timestamp.length; index += 1) {
    const timestamp = finite(series.timestamp[index]);
    const closingPrice = finite(quote?.close?.[index]);
    if (timestamp === null || closingPrice === null) continue;
    dates.push(new Date(timestamp * 1000).toISOString().slice(0, 10));
    close.push(closingPrice);
    high.push(finite(quote?.high?.[index]) ?? closingPrice);
    low.push(finite(quote?.low?.[index]) ?? closingPrice);
    volume.push(finite(quote?.volume?.[index]) ?? 0);
  }

  return close.length === 0 ? null : { dates, close, high, low, volume };
}

async function buildQuote(ticker: string, range: string, dependencies: QuoteDependencies) {
  const fetcher = dependencies.fetcher ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? 9_000;
  const encoded = encodeURIComponent(ticker);
  const [dailyPayload, intradayPayload] = await Promise.all([
    timedJson(
      fetcher,
      `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=${range}&interval=1d`,
      timeoutMs,
    ),
    timedJson(
      fetcher,
      `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1d&interval=1m`,
      timeoutMs,
    ),
  ]);
  const daily = yahooResult(dailyPayload);
  const intraday = yahooResult(intradayPayload);
  const history = parseHistory(daily);
  const meta = daily?.meta ?? intraday?.meta ?? {};

  let volumeTotal = 0;
  let priceVolume = 0;
  let intradayHigh: number | null = null;
  let intradayLow: number | null = null;
  const intradayQuote = intraday?.indicators?.quote?.[0];
  for (let index = 0; index < (intraday?.timestamp?.length ?? 0); index += 1) {
    const close = finite(intradayQuote?.close?.[index]);
    const high = finite(intradayQuote?.high?.[index]);
    const low = finite(intradayQuote?.low?.[index]);
    const volume = finite(intradayQuote?.volume?.[index]) ?? 0;
    if (close === null) continue;
    priceVolume += (((high ?? close) + (low ?? close) + close) / 3) * volume;
    volumeTotal += volume;
    intradayHigh = high === null ? intradayHigh : Math.max(intradayHigh ?? high, high);
    intradayLow = low === null ? intradayLow : Math.min(intradayLow ?? low, low);
  }

  const price =
    finite(meta.regularMarketPrice) ?? (history === null ? null : (history.close.at(-1) ?? null));
  const previousClose = finite(meta.chartPreviousClose) ?? finite(meta.previousClose);
  const dayHigh = finite(meta.regularMarketDayHigh) ?? intradayHigh;
  const dayLow = finite(meta.regularMarketDayLow) ?? intradayLow;
  const change = price !== null && previousClose !== null ? price - previousClose : null;
  const changePercent =
    change !== null && previousClose !== null && previousClose !== 0
      ? (change / previousClose) * 100
      : null;

  return {
    ok: price !== null || history !== null,
    ticker,
    generatedAt: (dependencies.now ?? new Date()).toISOString(),
    price,
    previousClose,
    change,
    changePercent,
    dayHigh,
    dayLow,
    rangePosition:
      price !== null && dayHigh !== null && dayLow !== null && dayHigh > dayLow
        ? ((price - dayLow) / (dayHigh - dayLow)) * 100
        : null,
    vwap: volumeTotal > 0 ? priceVolume / volumeTotal : null,
    volume: finite(meta.regularMarketVolume),
    history,
  };
}

async function buildLatestPrice(
  ticker: string,
  dependencies: QuoteDependencies,
): Promise<number | null> {
  const payload = await timedJson(
    dependencies.fetcher ?? fetch,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker,
    )}?range=1d&interval=1d`,
    dependencies.timeoutMs ?? 7_000,
  );
  const series = yahooResult(payload);
  return finite(series?.meta?.regularMarketPrice) ?? parseHistory(series)?.close.at(-1) ?? null;
}

function parseTicker(raw: string | null): string | null {
  const normalized = raw?.trim().toUpperCase() ?? "";
  return TICKER_PATTERN.test(normalized) ? normalized : null;
}

export async function handleQuoteApi(
  request: Request,
  dependencies: QuoteDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== QUOTE_PATH && url.pathname !== QUOTES_PATH) return null;
  if (request.method !== "GET") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Use GET." } }, 405);
  }

  if (url.pathname === QUOTE_PATH) {
    const ticker = parseTicker(url.searchParams.get("ticker"));
    if (ticker === null) {
      return json(
        {
          ok: false,
          error: {
            code: "invalid_ticker",
            message: "Provide a valid ticker of at most 15 characters.",
          },
        },
        400,
      );
    }
    const requestedRange = url.searchParams.get("range") ?? "1y";
    const range = VALID_RANGES.has(requestedRange) ? requestedRange : "1y";
    const quote = await buildQuote(ticker, range, dependencies);
    return json(quote, quote.ok ? 200 : 503);
  }

  const tickers = [
    ...new Set(
      (url.searchParams.get("tickers") ?? "")
        .split(",")
        .map((value) => parseTicker(value))
        .filter((value): value is string => value !== null),
    ),
  ].slice(0, 120);
  if (tickers.length === 0) {
    return json(
      {
        ok: false,
        error: { code: "invalid_tickers", message: "Provide one or more valid tickers." },
      },
      400,
      600,
    );
  }

  const prices: Record<string, number> = {};
  const chunkSize = 12;
  for (let offset = 0; offset < tickers.length; offset += chunkSize) {
    await Promise.all(
      tickers.slice(offset, offset + chunkSize).map(async (ticker) => {
        const price = await buildLatestPrice(ticker, dependencies);
        if (price !== null) prices[ticker] = price;
      }),
    );
  }

  return json(
    {
      ok: Object.keys(prices).length > 0,
      requested: tickers.length,
      available: Object.keys(prices).length,
      prices,
      generatedAt: (dependencies.now ?? new Date()).toISOString(),
    },
    Object.keys(prices).length > 0 ? 200 : 503,
    600,
  );
}
