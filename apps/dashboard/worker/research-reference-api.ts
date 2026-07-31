const REFERENCE_PATH = "/api/v3/research-reference";
const V2_APP_COMMIT = "b477349a8691fdc5000641a6ae2893dbbfae2de6";
const RAW_BASE = `https://raw.githubusercontent.com/bradleygpt/quant-dashboard-pro-v2/${V2_APP_COMMIT}/public/data`;
const USER_AGENT = "Mozilla/5.0 (compatible; Akribeia/3.0; +https://akribeia.com)";

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
} as const;

type Dataset = keyof typeof DATASETS;
type Fetcher = typeof fetch;

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
    if (text.length > 2_000_000) {
      return json(
        {
          ok: false,
          dataset,
          error: { code: "source_too_large", message: "The source exceeded the adapter limit." },
        },
        502,
      );
    }
    const payload = JSON.parse(text) as unknown;
    return json({
      ok: true,
      dataset,
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
