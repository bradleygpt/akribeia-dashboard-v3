import {
  ActiveBuildPointerSchema,
  BuildManifestSchema,
  EvidenceExplanationRequestSchema,
  EvidenceExplanationResponseSchema,
  EvidenceSecurityRequestSchema,
  PublishedPortfolioArtifactSchema,
  PublishedScoresArtifactSchema,
  type PublishedPortfolioArtifact,
  type PublishedScoredSecurity,
  type PublishedScoresArtifact,
} from "@akribeia/contracts";

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface EvidenceApiEnv {
  ASSETS: AssetFetcher;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  take(key: string): RateLimitResult;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface ActiveEvidence {
  buildId: string;
  scores: PublishedScoresArtifact;
  portfolio: PublishedPortfolioArtifact;
}

const API_PREFIX = "/api/v3/";
const CLIENT_HEADER = "x-akribeia-client";
const CLIENT_VALUE = "dashboard-v3";
const MAX_BODY_BYTES = 4096;
const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

export function createFixedWindowRateLimiter({
  limit,
  windowMs,
  maxKeys = 1024,
  now = () => Date.now(),
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}): RateLimiter {
  const buckets = new Map<string, RateLimitBucket>();

  return {
    take(key) {
      const currentTime = now();

      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= currentTime) {
          buckets.delete(bucketKey);
        }
      }

      if (!buckets.has(key) && buckets.size >= maxKeys) {
        const oldestKey = buckets.keys().next().value as string | undefined;

        if (oldestKey !== undefined) {
          buckets.delete(oldestKey);
        }
      }

      const bucket = buckets.get(key);
      const nextBucket =
        bucket === undefined || bucket.resetAt <= currentTime
          ? { count: 1, resetAt: currentTime + windowMs }
          : { count: bucket.count + 1, resetAt: bucket.resetAt };
      buckets.delete(key);
      buckets.set(key, nextBucket);

      return {
        allowed: nextBucket.count <= limit,
        limit,
        remaining: Math.max(0, limit - nextBucket.count),
        resetAt: nextBucket.resetAt,
      };
    },
  };
}

const defaultRateLimiter = createFixedWindowRateLimiter({
  limit: 20,
  windowMs: 60_000,
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...headers,
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    status,
    headers,
  );
}

function requestIdentity(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous"
  );
}

function validateProtectedRequest(request: Request): Response | null {
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "Use POST for this endpoint.");
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");

  if (origin === null || origin !== requestUrl.origin) {
    return errorResponse(403, "origin_forbidden", "A matching same-origin header is required.");
  }

  if (request.headers.get(CLIENT_HEADER) !== CLIENT_VALUE) {
    return errorResponse(
      403,
      "client_forbidden",
      "The trusted dashboard client header is required.",
    );
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

  if (contentType !== "application/json") {
    return errorResponse(415, "unsupported_media_type", "Use application/json.");
  }

  const declaredLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, "payload_too_large", "Request body exceeds 4096 bytes.");
  }

  return null;
}

async function sha256(payload: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchJsonAsset(
  env: EvidenceApiEnv,
  request: Request,
  path: string,
): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL(path, request.url)));
}

async function verifiedArtifact(
  env: EvidenceApiEnv,
  request: Request,
  buildRoot: string,
  artifact: { path: string; byteSize: number; sha256: string },
): Promise<unknown> {
  const response = await fetchJsonAsset(env, request, `${buildRoot}/${artifact.path}`);

  if (!response.ok) {
    throw new Error(`Required artifact "${artifact.path}" is unavailable.`);
  }

  const payload = new Uint8Array(await response.arrayBuffer());

  if (payload.byteLength !== artifact.byteSize || (await sha256(payload)) !== artifact.sha256) {
    throw new Error(`Required artifact "${artifact.path}" failed integrity verification.`);
  }

  return JSON.parse(new TextDecoder().decode(payload)) as unknown;
}

async function loadActiveEvidence(env: EvidenceApiEnv, request: Request): Promise<ActiveEvidence> {
  const pointerResponse = await fetchJsonAsset(env, request, "/data/active-build.json");

  if (!pointerResponse.ok) {
    throw new Error("Active-build pointer is unavailable.");
  }

  const pointer = ActiveBuildPointerSchema.parse(await pointerResponse.json());
  const buildRoot = `/data/builds/${encodeURIComponent(pointer.activeBuildId)}`;
  const manifestResponse = await fetchJsonAsset(env, request, `${buildRoot}/manifest.json`);

  if (!manifestResponse.ok) {
    throw new Error("Active manifest is unavailable.");
  }

  const manifest = BuildManifestSchema.parse(await manifestResponse.json());
  const scoresArtifact = manifest.files.scores;
  const portfolioArtifact = manifest.files.portfolio;

  if (
    manifest.buildId !== pointer.activeBuildId ||
    manifest.status !== "healthy" ||
    manifest.publication.decision !== "publish" ||
    scoresArtifact?.path !== "scores.json" ||
    portfolioArtifact?.path !== "portfolio.json"
  ) {
    throw new Error("Active evidence manifest is not publishable.");
  }

  const [scoresValue, portfolioValue] = await Promise.all([
    verifiedArtifact(env, request, buildRoot, scoresArtifact),
    verifiedArtifact(env, request, buildRoot, portfolioArtifact),
  ]);
  const scores = PublishedScoresArtifactSchema.parse(scoresValue);
  const portfolio = PublishedPortfolioArtifactSchema.parse(portfolioValue);

  if (
    scores.buildId !== pointer.activeBuildId ||
    portfolio.buildId !== pointer.activeBuildId ||
    scores.schemaVersion !== manifest.schemaVersion ||
    portfolio.schemaVersion !== manifest.schemaVersion ||
    scores.modelVersion !== manifest.modelVersion ||
    portfolio.modelVersion !== manifest.modelVersion
  ) {
    throw new Error("Active evidence lineage does not reconcile.");
  }

  return {
    buildId: pointer.activeBuildId,
    scores,
    portfolio,
  };
}

async function readBody(request: Request): Promise<unknown> {
  if (request.body === null) {
    return JSON.parse("");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("Request body exceeds 4096 bytes.");
    }

    chunks.push(value);
  }

  const payload = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(payload)) as unknown;
}

function findSecurity(evidence: ActiveEvidence, ticker: string): PublishedScoredSecurity | null {
  return evidence.scores.securities.find((security) => security.ticker === ticker) ?? null;
}

function securityResponse(evidence: ActiveEvidence, security: PublishedScoredSecurity) {
  const position =
    evidence.portfolio.portfolio.positions.find(
      (portfolioPosition) => portfolioPosition.ticker === security.ticker,
    ) ?? null;

  return {
    buildId: evidence.buildId,
    schemaVersion: evidence.scores.schemaVersion,
    modelVersion: evidence.scores.modelVersion,
    generatedAt: evidence.scores.generatedAt,
    source: evidence.scores.source,
    security,
    position,
    notice: "Research evidence only. This is not investment advice or a performance guarantee.",
  };
}

function explanationText(
  security: PublishedScoredSecurity,
  position: PublishedPortfolioArtifact["portfolio"]["positions"][number] | null,
  focus: "summary" | "factor-contributions" | "portfolio",
): string {
  if (!security.eligible || security.score === null) {
    return `${security.ticker} is not eligible for a composite score. Recorded reasons: ${security.exclusionReasons.join("; ") || "coverage requirements were not met"}.`;
  }

  const strongest = [...security.contributions]
    .filter((contribution) => contribution.status === "available")
    .sort(
      (left, right) =>
        right.weightedValue - left.weightedValue || left.pillar.localeCompare(right.pillar),
    )
    .slice(0, 2);
  const contributionSummary = strongest
    .map((contribution) => `${contribution.pillar} (${contribution.weightedValue.toFixed(2)})`)
    .join(" and ");

  if (focus === "factor-contributions") {
    return `${security.ticker} has a composite score of ${security.score.toFixed(2)} with ${(security.coverage * 100).toFixed(0)}% factor coverage. Its largest weighted contributions are ${contributionSummary}. Missing factors are never silently reweighted.`;
  }

  if (focus === "portfolio") {
    return position === null
      ? `${security.ticker} is eligible with a composite score of ${security.score.toFixed(2)}, but it is not in the constrained published portfolio.`
      : `${security.ticker} is included at ${(position.weight * 100).toFixed(2)}% of the constrained portfolio against a ${(position.maxWeight * 100).toFixed(2)}% exact position cap.`;
  }

  const portfolioSummary =
    position === null
      ? "It is not in the constrained published portfolio."
      : `It is included at ${(position.weight * 100).toFixed(2)}% of the constrained portfolio.`;

  return `${security.ticker} is eligible with a composite score of ${security.score.toFixed(2)} and ${(security.coverage * 100).toFixed(0)}% factor coverage. Its largest weighted contributions are ${contributionSummary}. ${portfolioSummary}`;
}

async function routeProtectedRequest(
  request: Request,
  env: EvidenceApiEnv,
  rateLimiter: RateLimiter,
): Promise<Response> {
  const requestError = validateProtectedRequest(request);

  if (requestError !== null) {
    return requestError;
  }

  const pathname = new URL(request.url).pathname;

  if (pathname !== `${API_PREFIX}evidence/security` && pathname !== `${API_PREFIX}ai/explain`) {
    return errorResponse(404, "not_found", "API route not found.");
  }

  const limit = rateLimiter.take(`${requestIdentity(request)}:${pathname}`);
  const rateHeaders = {
    "ratelimit-limit": String(limit.limit),
    "ratelimit-remaining": String(limit.remaining),
    "ratelimit-reset": String(Math.ceil(limit.resetAt / 1000)),
  };

  if (!limit.allowed) {
    return errorResponse(429, "rate_limited", "Too many requests. Retry after the window resets.", {
      ...rateHeaders,
      "retry-after": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))),
    });
  }

  let body: unknown;

  try {
    body = await readBody(request);
  } catch (error) {
    if (error instanceof RangeError) {
      return errorResponse(413, "payload_too_large", error.message);
    }

    return errorResponse(400, "invalid_json", "Request body must contain valid JSON.");
  }

  try {
    if (pathname === `${API_PREFIX}evidence/security`) {
      const input = EvidenceSecurityRequestSchema.safeParse(body);

      if (!input.success) {
        return errorResponse(
          400,
          "invalid_request",
          "Ticker must be a valid security symbol.",
          rateHeaders,
        );
      }

      const evidence = await loadActiveEvidence(env, request);
      const security = findSecurity(evidence, input.data.ticker);

      return security === null
        ? errorResponse(
            404,
            "security_not_found",
            "Ticker is not present in the active build.",
            rateHeaders,
          )
        : jsonResponse(securityResponse(evidence, security), 200, rateHeaders);
    }

    if (pathname === `${API_PREFIX}ai/explain`) {
      const input = EvidenceExplanationRequestSchema.safeParse(body);

      if (!input.success) {
        return errorResponse(
          400,
          "invalid_request",
          "Ticker and explanation focus must follow the request contract.",
          rateHeaders,
        );
      }

      const evidence = await loadActiveEvidence(env, request);
      const security = findSecurity(evidence, input.data.ticker);

      if (security === null) {
        return errorResponse(
          404,
          "security_not_found",
          "Ticker is not present in the active build.",
          rateHeaders,
        );
      }

      const base = securityResponse(evidence, security);

      return jsonResponse(
        EvidenceExplanationResponseSchema.parse({
          buildId: base.buildId,
          modelVersion: base.modelVersion,
          mode: "deterministic-evidence",
          externalModelUsed: false,
          focus: input.data.focus,
          ticker: security.ticker,
          explanation: explanationText(security, base.position, input.data.focus),
          citations: [
            "scores.json:security.contributions",
            base.position === null ? "portfolio.json:not-selected" : "portfolio.json:position",
          ],
          notice: base.notice,
        }),
        200,
        rateHeaders,
      );
    }

    return errorResponse(404, "not_found", "API route not found.", rateHeaders);
  } catch {
    return errorResponse(
      503,
      "evidence_unavailable",
      "Active evidence failed server-side integrity or lineage verification.",
    );
  }
}

export async function handleEvidenceApi(
  request: Request,
  env: EvidenceApiEnv,
  rateLimiter: RateLimiter = defaultRateLimiter,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;

  if (!pathname.startsWith(API_PREFIX)) {
    return null;
  }

  if (pathname === `${API_PREFIX}health`) {
    return jsonResponse({
      status: "ok",
      service: "akribeia-v3-evidence-api",
      aiMode: "deterministic-evidence",
      externalModelConfigured: false,
    });
  }

  return routeProtectedRequest(request, env, rateLimiter);
}
