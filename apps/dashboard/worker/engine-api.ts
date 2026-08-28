/**
 * Markets engine proxy.
 *
 * Upstream constraints (from the engine operator): the engine runs at most ONE
 * concurrent job, admits 8 submissions per 10 minutes, and a job takes 7-21
 * minutes to complete. This proxy is therefore submit-and-poll ONLY — it never
 * blocks a Worker request waiting for a job, and it preserves the upstream 503
 * (engine yielding to a running job) and 429 (rate limit) statuses distinctly
 * so the client can back off correctly.
 */
import { createFixedWindowRateLimiter, type RateLimiter } from "./evidence-api";

export interface EngineApiEnv {
  /** optional Markets engine origin (no trailing slash); with the token, presence configures the proxy. */
  MARKETS_ENGINE_URL?: string;
  /** optional Markets engine bearer credential; never logged and never echoed to clients. */
  MARKETS_ENGINE_TOKEN?: string;
}

interface EngineApiDependencies {
  fetcher?: typeof fetch;
  rateLimiter?: RateLimiter;
}

const ENGINE_HEALTH_PATH = "/api/v3/engine/health";
const ENGINE_QUERY_PATH = "/api/v3/engine/query";
const ENGINE_RESULT_PATH = "/api/v3/engine/result";
const CLIENT_HEADER = "x-akribeia-client";
const CLIENT_VALUE = "dashboard-v3";
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_QUERY_CHARS = 600;
const MAX_BODY_BYTES = 4096;
const HEALTH_TIMEOUT_MS = 4_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
/** upstream reply cap; engine bodies are small JSON envelopes. */
const MAX_UPSTREAM_BYTES = 1_000_000;

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

/** engine routes share one fixed-window limiter with their own bucket namespace. */
const defaultEngineRateLimiter = createFixedWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

function notConfiguredResponse(): Response {
  return jsonResponse({ ok: false, unavailableReason: "engine not configured" });
}

function engineConfigured(env: EngineApiEnv): env is Required<EngineApiEnv> {
  return (
    typeof env.MARKETS_ENGINE_URL === "string" &&
    env.MARKETS_ENGINE_URL.length > 0 &&
    typeof env.MARKETS_ENGINE_TOKEN === "string" &&
    env.MARKETS_ENGINE_TOKEN.length > 0
  );
}

function requestIdentity(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous"
  );
}

/**
 * Same validateProtectedRequest pattern as /api/v3/ai/*: the trusted client
 * header is ALWAYS required — nothing is forwarded upstream without it — and
 * any browser-supplied origin/referer must be same-origin. POST bodies must be
 * bounded JSON; the GET result route follows the health-route precedent of
 * skipping body rules while keeping the header and origin checks.
 */
function validateEngineRequest(request: Request, expectedMethod: "GET" | "POST"): Response | null {
  if (request.method !== expectedMethod) {
    return errorResponse(405, "method_not_allowed", `Use ${expectedMethod} for this endpoint.`);
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (expectedMethod === "POST") {
    if (origin === null || origin !== requestUrl.origin) {
      return errorResponse(403, "origin_forbidden", "A matching same-origin header is required.");
    }
  } else if (origin !== null && origin !== requestUrl.origin) {
    return errorResponse(403, "origin_forbidden", "A matching same-origin header is required.");
  } else {
    const referer = request.headers.get("referer");

    if (referer !== null) {
      try {
        if (new URL(referer).origin !== requestUrl.origin) {
          return errorResponse(403, "origin_forbidden", "A same-origin referer is required.");
        }
      } catch {
        return errorResponse(403, "origin_forbidden", "A same-origin referer is required.");
      }
    }
  }

  if (request.headers.get(CLIENT_HEADER) !== CLIENT_VALUE) {
    return errorResponse(
      403,
      "client_forbidden",
      "The trusted dashboard client header is required.",
    );
  }

  if (expectedMethod === "POST") {
    const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

    if (contentType !== "application/json") {
      return errorResponse(415, "unsupported_media_type", "Use application/json.");
    }

    const declaredLength = Number(request.headers.get("content-length"));

    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", "Request body exceeds 4096 bytes.");
    }
  }

  return null;
}

/**
 * Calls the engine and passes the upstream JSON body through with the upstream
 * status preserved (200/202 accepted, 503 engine yielding, 429 rate limited,
 * and error statuses alike). The bearer credential goes only into the upstream
 * Authorization header — it is never logged and never enters a response body.
 */
async function proxyUpstream(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let upstream: Response;

  try {
    upstream = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: { code: "engine_unreachable", message: "The markets engine did not respond." },
      },
      503,
    );
  }

  let text: string;

  try {
    text = await upstream.text();
  } catch {
    text = "";
  }

  if (text.length > MAX_UPSTREAM_BYTES) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "engine_invalid_response", message: "Engine reply exceeded the proxy cap." },
      },
      502,
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "engine_invalid_response",
          message: `The markets engine returned a non-JSON reply (HTTP ${upstream.status}).`,
        },
      },
      502,
    );
  }

  return jsonResponse(payload, upstream.status);
}

async function readQueryBody(request: Request): Promise<string | Response> {
  let body: unknown;

  try {
    const text = await request.text();

    if (text.length > MAX_BODY_BYTES) {
      return errorResponse(413, "payload_too_large", "Request body exceeds 4096 bytes.");
    }

    body = JSON.parse(text) as unknown;
  } catch {
    return errorResponse(400, "invalid_json", "Request body must contain valid JSON.");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1
  ) {
    return errorResponse(400, "invalid_request", 'Body must be exactly {"query": string}.');
  }

  const query = (body as Record<string, unknown>).query;

  if (typeof query !== "string" || query.length < 1 || query.length > MAX_QUERY_CHARS) {
    return errorResponse(
      400,
      "invalid_request",
      `Query must be a string of 1 to ${MAX_QUERY_CHARS} characters.`,
    );
  }

  return query;
}

export async function handleEngineApi(
  request: Request,
  env: EngineApiEnv,
  dependencies: EngineApiDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (
    pathname !== ENGINE_HEALTH_PATH &&
    pathname !== ENGINE_QUERY_PATH &&
    pathname !== ENGINE_RESULT_PATH
  ) {
    return null;
  }

  const fetcher = dependencies.fetcher ?? fetch;
  const rateLimiter = dependencies.rateLimiter ?? defaultEngineRateLimiter;

  if (pathname === ENGINE_HEALTH_PATH) {
    if (request.method !== "GET") {
      return errorResponse(405, "method_not_allowed", "Use GET for this endpoint.");
    }

    if (!engineConfigured(env)) {
      return notConfiguredResponse();
    }

    return proxyUpstream(
      fetcher,
      `${env.MARKETS_ENGINE_URL}/health`,
      { method: "GET", headers: { accept: "application/json" } },
      HEALTH_TIMEOUT_MS,
    );
  }

  const requestError = validateEngineRequest(
    request,
    pathname === ENGINE_QUERY_PATH ? "POST" : "GET",
  );

  if (requestError !== null) {
    return requestError;
  }

  // internal rate limit: its own bucket namespace, separate from /api/v3/ai/*.
  const limit = rateLimiter.take(`${requestIdentity(request)}:engine:${pathname}`);
  const rateHeaders = {
    "ratelimit-limit": String(limit.limit),
    "ratelimit-remaining": String(limit.remaining),
    "ratelimit-reset": String(Math.ceil(limit.resetAt / 1000)),
  };

  if (!limit.allowed) {
    return jsonResponse(
      {
        error: {
          code: "rate_limited",
          message: "Too many requests. Retry after the window resets.",
        },
      },
      429,
      {
        ...rateHeaders,
        "retry-after": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))),
      },
    );
  }

  if (pathname === ENGINE_QUERY_PATH) {
    const query = await readQueryBody(request);

    if (query instanceof Response) {
      return query;
    }

    if (!engineConfigured(env)) {
      return notConfiguredResponse();
    }

    return proxyUpstream(
      fetcher,
      `${env.MARKETS_ENGINE_URL}/api/query`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${env.MARKETS_ENGINE_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ query }),
      },
      UPSTREAM_TIMEOUT_MS,
    );
  }

  const jobId = url.searchParams.get("job") ?? "";

  if (!JOB_ID_PATTERN.test(jobId)) {
    return errorResponse(400, "invalid_job", "Job id must match [A-Za-z0-9_-]{1,64}.");
  }

  if (!engineConfigured(env)) {
    return notConfiguredResponse();
  }

  return proxyUpstream(
    fetcher,
    `${env.MARKETS_ENGINE_URL}/api/result/${jobId}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${env.MARKETS_ENGINE_TOKEN}`,
      },
    },
    UPSTREAM_TIMEOUT_MS,
  );
}
