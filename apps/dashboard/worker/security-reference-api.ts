const SECURITY_REFERENCE_PATH = "/api/v3/security-reference";
const BULK_DATA_COMMIT = "9f2d2322fc52847e435dbb6a83137712788f5b52";
const DATA_BASE = `https://cdn.jsdelivr.net/gh/bradleygpt/akribeia-data@${BULK_DATA_COMMIT}/data`;
const RAW_DATA_BASE = `https://raw.githubusercontent.com/bradleygpt/akribeia-data/${BULK_DATA_COMMIT}/data`;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

const KINDS = {
  detail: (ticker: string) => `detail/floor0/${ticker}.json`,
  prices: (ticker: string) => `prices/${ticker}.json`,
  timeseries: (ticker: string) => `detail_timeseries/${ticker}.json`,
  quarterly: () => "quarterly.json",
} as const;

type Kind = keyof typeof KINDS;
type Fetcher = typeof fetch;

interface Dependencies {
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

function normalizeBareNaN(text: string): { text: string; count: number } {
  let normalized = "";
  let count = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      normalized += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      normalized += character;
      continue;
    }
    if (text.startsWith("NaN", index)) {
      const previous = text[index - 1] ?? " ";
      const next = text[index + 3] ?? " ";
      if (/[\s[:,]/.test(previous) && /[\s,}\]]/.test(next)) {
        normalized += "null";
        count += 1;
        index += 2;
        continue;
      }
    }
    normalized += character;
  }

  return { text: normalized, count };
}

export async function handleSecurityReferenceApi(
  request: Request,
  dependencies: Dependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== SECURITY_REFERENCE_PATH) return null;
  if (request.method !== "GET") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Use GET." } }, 405);
  }
  const ticker = (url.searchParams.get("ticker") ?? "").trim().toUpperCase();
  const requestedKind = url.searchParams.get("kind") ?? "detail";
  if (!TICKER_PATTERN.test(ticker)) {
    return json(
      { ok: false, error: { code: "invalid_ticker", message: "Ticker is invalid." } },
      400,
    );
  }
  if (!(requestedKind in KINDS)) {
    return json(
      { ok: false, error: { code: "invalid_kind", message: "Reference kind is invalid." } },
      400,
    );
  }
  const kind = requestedKind as Kind;
  // The 4 MB quarterly map is intermittently rejected by the local Worker runtime when
  // streamed through jsDelivr. Raw GitHub serves the byte-identical file at the same immutable
  // commit; smaller per-security shards retain the accepted CDN path.
  const sourceUrl = `${kind === "quarterly" ? RAW_DATA_BASE : DATA_BASE}/${KINDS[kind](ticker)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 7_000);
  try {
    const response = await (dependencies.fetcher ?? fetch)(sourceUrl, {
      headers: { accept: "application/json", "user-agent": "Akribeia/3.0" },
      signal: controller.signal,
    });
    if (response.status === 404) {
      return json(
        {
          ok: false,
          ticker,
          kind,
          error: { code: "reference_not_found", message: "No preserved shard exists." },
        },
        404,
      );
    }
    if (!response.ok) {
      return json(
        {
          ok: false,
          ticker,
          kind,
          error: { code: "source_unavailable", message: "Pinned shard source unavailable." },
        },
        503,
      );
    }
    const text = await response.text();
    const sourceLimit = kind === "quarterly" ? 6_000_000 : 2_000_000;
    if (text.length > sourceLimit) {
      return json(
        {
          ok: false,
          ticker,
          kind,
          error: { code: "source_too_large", message: "Pinned shard exceeded adapter limit." },
        },
        502,
      );
    }
    const normalized = kind === "quarterly" ? normalizeBareNaN(text) : { text, count: 0 };
    const parsed = JSON.parse(normalized.text) as unknown;
    const payload =
      kind === "quarterly" && typeof parsed === "object" && parsed !== null
        ? {
            quarters: ((parsed as Record<string, unknown>)[ticker] as unknown[] | undefined) ?? [],
            deepGeneratedAt:
              ((parsed as Record<string, unknown>).deep_generated_at as string | undefined) ?? null,
          }
        : parsed;
    return json({
      ok: true,
      ticker,
      kind,
      fetchedAt: (dependencies.now ?? new Date()).toISOString(),
      source: {
        bulkDataCommit: BULK_DATA_COMMIT,
        url: sourceUrl,
        asOf: "2026-07-30",
        nonFiniteTokensMappedToNull: normalized.count,
      },
      payload,
    });
  } catch (error) {
    console.error(
      `[security-reference] ${kind}:${ticker} failed: ${
        error instanceof Error ? error.message : "unknown upstream error"
      }`,
    );
    return json(
      {
        ok: false,
        ticker,
        kind,
        error: { code: "source_unavailable", message: "Pinned shard source unavailable." },
      },
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}
