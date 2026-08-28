const REFERENCE_PATH = "/api/v3/research-reference";
const V2_APP_COMMIT = "538ec29b41172d7b44c96e67a7346f96c41ebede";
const RAW_BASE = `https://raw.githubusercontent.com/bradleygpt/quant-dashboard-pro-v2/${V2_APP_COMMIT}/public/data`;
const USER_AGENT = "Mozilla/5.0 (compatible; Akribeia/3.0; +https://akribeia.com)";
const TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/;

const DATASETS = {
  "risk-radar": "risk_radar.json",
  etf: "etf.json",
  "etf-descriptions": "etf_descriptions.json",
  "etf-holdings": "etf_holdings.json",
  "etf-lookthrough": "etf_lookthrough.json",
  "etf-reverse": "etf_reverse.json",
  "sector-narratives": "sector_narratives.json",
  "index-add-candidates": "index_add_candidates.json",
  "macro-forecasts": "macro_forecasts.json",
  "macro-rotation": "macro_rotation.json",
  "strategies-holdings-performance": "strategies_holdings_perf.json",
  "strategy-rationale": "strategy_rationale.json",
  "system-status": "system_status.json",
  "basket-summary": "basket_summary.json",
  "strategies-correlation": "strategies_correlation.json",
  "rebalance-schedule": "rebalance_schedule.json",
  "regime-timeseries": "regime_timeseries.json",
  "universe-summary": "universe_summary.json",
  anomalies: "anomalies.json",
  "ai-theme": "ai_theme.json",
  pundits: "pundits.json",
  c78q: "c78q.json",
  "auxo-strategy": "auxo_strategy.json",
  "statera-strategy": "statera_strategy.json",
  "pronoia-strategy": "pronoia_strategy.json",
  "kairos-strategy": "kairos_strategy.json",
  "earnings-reviews": "earnings_reviews.json",
  "earnings-quality": "earnings_quality.json",
  "ticker-anchor-map": "ticker_anchor_map.json",
} as const;

type Dataset = keyof typeof DATASETS;
type Fetcher = typeof fetch;

/**
 * The baked earnings review corpus (~6 MB) exceeds the default 2 MB adapter cap,
 * mirroring how worker/security-reference-api.ts treats the quarterly map: the
 * source is fetched from raw.githubusercontent (jsDelivr may reject payloads this
 * large) with a raised cap, and the response is always narrowed server-side to a
 * single required ticker so clients never receive the whole corpus.
 */
const EARNINGS_DATASETS = new Set<Dataset>(["earnings-reviews", "earnings-quality"]);
const EARNINGS_SOURCE_LIMIT = 7_000_000;
const DEFAULT_SOURCE_LIMIT = 2_000_000;

interface ResearchReferenceDependencies {
  fetcher?: Fetcher;
  timeoutMs?: number;
  now?: Date;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=900, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

function tickerNotFound(dataset: Dataset, ticker: string): Response {
  return json(
    {
      ok: false,
      dataset,
      ticker,
      error: {
        code: "ticker_not_found",
        message: "The pinned dataset has no record for this ticker.",
      },
    },
    404,
  );
}

/**
 * Selects the newest record for a ticker from a map double-keyed as
 * `TICKER_YYYY-MM-DD` and `TICKER_YYYY-MM`. Full-date keys are preferred (newest
 * first); month-only keys are only a fallback, so the narrowed payload is always
 * the most recent baked filing review for the ticker.
 */
function newestTickerRecord(
  records: Record<string, unknown>,
  ticker: string,
): { key: string; record: unknown } | null {
  const prefix = `${ticker}_`;
  const fullDateKeys: string[] = [];
  const monthKeys: string[] = [];

  for (const key of Object.keys(records)) {
    if (!key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(suffix)) fullDateKeys.push(key);
    else if (/^\d{4}-\d{2}$/.test(suffix)) monthKeys.push(key);
  }

  // ISO dates sort lexicographically, so a plain descending sort is newest-first.
  const key = fullDateKeys.sort().reverse()[0] ?? monthKeys.sort().reverse()[0] ?? null;

  return key === null ? null : { key, record: records[key] };
}

function narrowEarningsReviews(parsed: unknown, dataset: Dataset, ticker: string): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return tickerNotFound(dataset, ticker);
  }

  const selected = newestTickerRecord(parsed as Record<string, unknown>, ticker);

  return selected === null ? tickerNotFound(dataset, ticker) : selected;
}

function narrowEarningsQuality(parsed: unknown, dataset: Dataset, ticker: string): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return tickerNotFound(dataset, ticker);
  }

  const source = parsed as {
    generated_at?: unknown;
    method?: unknown;
    quality?: unknown;
  };
  const qualityMap = source.quality;

  if (typeof qualityMap !== "object" || qualityMap === null || Array.isArray(qualityMap)) {
    return tickerNotFound(dataset, ticker);
  }

  const selected = newestTickerRecord(qualityMap as Record<string, unknown>, ticker);

  return selected === null
    ? tickerNotFound(dataset, ticker)
    : {
        key: selected.key,
        record: selected.record,
        generatedAt: source.generated_at ?? null,
        method: source.method ?? null,
      };
}

function narrowTickerAnchorMap(parsed: unknown, dataset: Dataset, ticker: string): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return tickerNotFound(dataset, ticker);
  }

  const entry = (parsed as Record<string, unknown>)[ticker];

  return entry === undefined ? tickerNotFound(dataset, ticker) : { ticker, entry };
}

export async function handleResearchReferenceApi(
  request: Request,
  dependencies: ResearchReferenceDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== REFERENCE_PATH) return null;
  if (request.method !== "GET") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Use GET." } }, 405);
  }

  const requested = url.searchParams.get("dataset") ?? "";
  if (!(requested in DATASETS)) {
    return json(
      {
        ok: false,
        error: {
          code: "invalid_dataset",
          message: "The requested research reference dataset is not available.",
        },
      },
      400,
    );
  }
  const dataset = requested as Dataset;
  const rawTicker = url.searchParams.get("ticker");
  const ticker = (rawTicker ?? "").trim().toUpperCase();
  // Earnings datasets are too large to forward whole: a ticker is REQUIRED and
  // the response is narrowed server-side. The anchor map is small enough to
  // serve whole, but accepts the same optional narrowing.
  const tickerRequired = EARNINGS_DATASETS.has(dataset);
  const tickerProvided = rawTicker !== null && rawTicker.trim().length > 0;

  if ((tickerRequired || tickerProvided) && !TICKER_PATTERN.test(ticker)) {
    return json(
      {
        ok: false,
        dataset,
        error: {
          code: "invalid_ticker",
          message: tickerRequired
            ? "This dataset requires a valid ticker query parameter."
            : "Ticker is invalid.",
        },
      },
      400,
    );
  }

  const sourceUrl = `${RAW_BASE}/${DATASETS[dataset]}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 7_000);

  try {
    const response = await (dependencies.fetcher ?? fetch)(sourceUrl, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return json(
        {
          ok: false,
          dataset,
          error: {
            code: "source_unavailable",
            message: "The pinned V2 reference source did not respond.",
          },
        },
        503,
      );
    }
    const text = await response.text();
    const sourceLimit = EARNINGS_DATASETS.has(dataset)
      ? EARNINGS_SOURCE_LIMIT
      : DEFAULT_SOURCE_LIMIT;
    if (text.length > sourceLimit) {
      return json(
        {
          ok: false,
          dataset,
          error: { code: "source_too_large", message: "The source exceeded the adapter limit." },
        },
        502,
      );
    }
    const parsed = JSON.parse(text) as unknown;
    let payload: unknown = parsed;

    if (dataset === "earnings-reviews") {
      payload = narrowEarningsReviews(parsed, dataset, ticker);
    } else if (dataset === "earnings-quality") {
      payload = narrowEarningsQuality(parsed, dataset, ticker);
    } else if (dataset === "ticker-anchor-map" && tickerProvided) {
      payload = narrowTickerAnchorMap(parsed, dataset, ticker);
    }

    if (payload instanceof Response) {
      return payload;
    }

    return json({
      ok: true,
      dataset,
      ...(tickerRequired || (dataset === "ticker-anchor-map" && tickerProvided) ? { ticker } : {}),
      fetchedAt: (dependencies.now ?? new Date()).toISOString(),
      source: {
        v2AppCommit: V2_APP_COMMIT,
        url: sourceUrl,
      },
      payload,
    });
  } catch {
    return json(
      {
        ok: false,
        dataset,
        error: {
          code: "source_unavailable",
          message: "The pinned V2 reference source is currently unavailable.",
        },
      },
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}
