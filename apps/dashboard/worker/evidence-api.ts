import {
  ActiveBuildPointerSchema,
  AiAssistRequestSchema,
  AiAssistResponseSchema,
  BuildManifestSchema,
  EvidenceExplanationRequestSchema,
  EvidenceExplanationResponseSchema,
  EvidenceSecurityRequestSchema,
  PublishedPortfolioArtifactSchema,
  PublishedScoresArtifactSchema,
  ScreenerFilterSpecSchema,
  type PublishedPortfolioArtifact,
  type PublishedScoredSecurity,
  type PublishedScoresArtifact,
  type ScreenerFilterSpec,
} from "@akribeia/contracts";

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface EvidenceApiEnv {
  ASSETS: AssetFetcher;
  /** optional THESIS engine credential; presence alone configures the engine. */
  THESIS_GEMINI_API_KEY?: string;
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

const THESIS_MODEL = "gemini-3.5-flash-lite";
const THESIS_FALLBACK_MODEL = "gemini-3.5-flash";
const THESIS_TIMEOUT_MS = 12_000;
const THESIS_MAX_CHARS = 1_600;
const THESIS_MIN_RELIABLE_CHARS = 200;
/** transient upstream statuses worth retrying before failing closed. */
const TRANSIENT_MODEL_STATUSES = new Set([429, 500, 502, 503, 504]);
/** a bracketed fragment carrying instruction words means the model echoed a template skeleton. */
const BRACKET_LEAK =
  /\[[^\]]*?(bullet|sentence|disclosed|e\.g\.|insert|specific number|one of\s*:|if known|if given|X\.X|Y%|placeholder|most important|net effect)[^\]]*?\]/i;
/** leftover numeric placeholders such as "X.X" or "Y%" mark an ungrounded generation. */
const PLACEHOLDER_LEAK = /\$?X\.X{1,2}\b|\bY%/i;

function thesisEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function thesisConfigured(env: EvidenceApiEnv): boolean {
  return typeof env.THESIS_GEMINI_API_KEY === "string" && env.THESIS_GEMINI_API_KEY.length > 0;
}

/** strips any line that leaks bracketed template instructions out of a generation. */
function scrubBracketLeaks(text: string): string {
  return text
    .split("\n")
    .filter((line) => !BRACKET_LEAK.test(line.trim()))
    .join("\n")
    .trim();
}

/**
 * Refuses sketchy generations: too short to be a grounded narrative, missing the
 * required grounding token, or still carrying placeholder/template leaks.
 */
function reliableNarrative(text: string, requiredToken: string | null): boolean {
  if (text.length < THESIS_MIN_RELIABLE_CHARS) {
    return false;
  }

  if (requiredToken !== null && !text.includes(requiredToken)) {
    return false;
  }

  return !BRACKET_LEAK.test(text) && !PLACEHOLDER_LEAK.test(text);
}

type ExternalModelCall =
  | { text: string; model: string; unavailableReason: null }
  | { text: null; model: null; unavailableReason: string };

/**
 * Retry ladder ported from the V2 AI endpoint: up to three attempts on the lite
 * model with 400/800/1200ms backoff after transient failures (429/5xx/timeout),
 * then one attempt on the bigger flash model before failing closed.
 */
async function callExternalModel(
  apiKey: string,
  prompt: string,
  generationConfig: { temperature: number; maxOutputTokens: number },
): Promise<ExternalModelCall> {
  const attempts = [THESIS_MODEL, THESIS_MODEL, THESIS_MODEL, THESIS_FALLBACK_MODEL];
  let unavailableReason = "external model call failed or timed out";

  for (let attempt = 0; attempt < attempts.length; attempt += 1) {
    const model = attempts[attempt] as string;

    try {
      const response = await fetch(thesisEndpoint(model), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal: AbortSignal.timeout(THESIS_TIMEOUT_MS),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = (payload.candidates?.[0]?.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join("")
          .trim();

        return { text, model, unavailableReason: null };
      }

      unavailableReason = `external model returned HTTP ${response.status}`;

      if (!TRANSIENT_MODEL_STATUSES.has(response.status)) {
        return { text: null, model: null, unavailableReason };
      }
    } catch {
      unavailableReason = "external model call failed or timed out";
    }

    if (attempt < attempts.length - 1) {
      await sleep(400 * (attempt + 1));
    }
  }

  return { text: null, model: null, unavailableReason };
}

function thesisPrompt(
  security: PublishedScoredSecurity,
  position: PublishedPortfolioArtifact["portfolio"]["positions"][number] | null,
): string {
  const contributions = security.contributions
    .map((contribution) =>
      contribution.status === "available"
        ? `${contribution.pillar}: weighted ${contribution.weightedValue.toFixed(2)}`
        : `${contribution.pillar}: unavailable`,
    )
    .join("; ");
  const portfolioFact =
    position === null
      ? "It is not in the constrained published portfolio."
      : `Constrained portfolio weight ${(position.weight * 100).toFixed(2)}% against a ${(position.maxWeight * 100).toFixed(2)}% cap.`;

  return [
    "You are the THESIS engine for Akribeia, a quantitative research preview.",
    "Write a short research note (at most two paragraphs) for the security below.",
    "Use ONLY the published figures provided here. Do not introduce any other",
    "numbers, price targets, forecasts, or market data. Do not give investment",
    "advice or recommendations. Plain prose, no headers, no lists.",
    "",
    `Ticker: ${security.ticker}`,
    `Sector: ${security.sector}`,
    `Published price: $${security.price.toFixed(2)}`,
    `Market cap: $${security.marketCapB.toFixed(1)}B`,
    `Eligible: ${security.eligible}`,
    `Composite score: ${security.score === null ? "null" : security.score.toFixed(2)}`,
    `Factor coverage: ${(security.coverage * 100).toFixed(0)}%`,
    `Factor contributions: ${contributions}`,
    portfolioFact,
  ].join("\n");
}

interface ThesisResult {
  text: string | null;
  model: string | null;
  unavailableReason: string | null;
}

async function generateThesis(
  env: EvidenceApiEnv,
  security: PublishedScoredSecurity,
  position: PublishedPortfolioArtifact["portfolio"]["positions"][number] | null,
): Promise<ThesisResult> {
  if (!thesisConfigured(env)) {
    return { text: null, model: null, unavailableReason: "external model not configured" };
  }

  const call = await callExternalModel(
    env.THESIS_GEMINI_API_KEY as string,
    thesisPrompt(security, position),
    { temperature: 0.2, maxOutputTokens: 512 },
  );

  if (call.text === null) {
    return { text: null, model: null, unavailableReason: call.unavailableReason };
  }

  const scrubbed = scrubBracketLeaks(call.text);

  if (!reliableNarrative(scrubbed, security.ticker)) {
    return {
      text: null,
      model: null,
      unavailableReason: "external model returned an unusable response",
    };
  }

  return { text: scrubbed.slice(0, THESIS_MAX_CHARS), model: call.model, unavailableReason: null };
}

function screenerPrompt(query: string, sectors: readonly string[]): string {
  return [
    "Convert a plain-English stock screen into a filter specification for a",
    "quantitative research preview.",
    `User query: ${JSON.stringify(query)}`,
    `Valid sector names: ${sectors.join(", ")}.`,
    "Return ONLY strict JSON — no prose, no markdown, no code fences — as a",
    "single object using ONLY these optional keys:",
    '{"sectors": string[] (exact valid sector names), "minScore": number,',
    '"maxScore": number, "rating": "Strong Buy"|"Buy"|"Hold"|"Sell",',
    '"minMarketCapB": number, "maxMarketCapB": number,',
    '"maxCount": number (at most 200),',
    '"sort": "score-desc"|"score-asc"|"marketcap-desc"}',
    "Omit every key the query does not imply. Never invent constraints.",
  ].join("\n");
}

/**
 * Parses a screener generation into a validated filter spec. Raw model text is
 * never passed through: anything that is not strict JSON matching the contract
 * fails closed to null.
 */
function parseScreenerFilters(text: string): ScreenerFilterSpec | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let value: unknown;

  try {
    value = JSON.parse(cleaned) as unknown;
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const withoutNulls = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== null),
  );
  const filters = ScreenerFilterSpecSchema.safeParse(withoutNulls);

  return filters.success ? filters.data : null;
}

interface PortfolioFactBlock {
  facts: string;
  citations: string[];
}

/**
 * Builds the portfolio fact block entirely server-side from the verified
 * portfolio.json and scores.json artifacts. No client-supplied data enters it.
 */
function portfolioFactBlock(evidence: ActiveEvidence): PortfolioFactBlock {
  const { positions, sectorWeights, constraints } = evidence.portfolio.portfolio;
  const topPositions = [...positions]
    .sort((left, right) => right.weight - left.weight || left.ticker.localeCompare(right.ticker))
    .slice(0, 5)
    .map((position) => `${position.ticker} ${(position.weight * 100).toFixed(2)}%`)
    .join(", ");
  const sectorTotals = Object.entries(sectorWeights)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sector, weight]) => `${sector} ${(weight * 100).toFixed(2)}%`)
    .join(", ");
  const scoreByTicker = new Map(
    evidence.scores.securities.map((security) => [security.ticker, security.score]),
  );
  let scoredWeight = 0;
  let weightedScoreSum = 0;

  for (const position of positions) {
    const score = scoreByTicker.get(position.ticker);

    if (typeof score === "number") {
      scoredWeight += position.weight;
      weightedScoreSum += position.weight * score;
    }
  }

  const weightedAverageScore =
    scoredWeight > 0 ? (weightedScoreSum / scoredWeight).toFixed(2) : "unavailable";

  return {
    facts: [
      `Position count: ${positions.length}`,
      `Top positions by weight: ${topPositions}`,
      `Exact position cap: ${(constraints.maxPositionWeight * 100).toFixed(2)}%`,
      `Sector weights against a ${(constraints.maxSectorWeight * 100).toFixed(2)}% sector cap: ${sectorTotals}`,
      `Weighted average composite score: ${weightedAverageScore}`,
    ].join("\n"),
    citations: [
      "portfolio.json:positions",
      "portfolio.json:sectorWeights",
      "scores.json:securities",
    ],
  };
}

function portfolioAssistPrompt(facts: string): string {
  return [
    "You are the THESIS engine for Akribeia, a quantitative research preview.",
    "In two to three sentences, give rebalance reasoning for the constrained",
    "research portfolio below: where the book is concentrated, which sector",
    "weights sit close to their caps, and how the weighted average score reads.",
    "Use ONLY the published figures provided here. Never invent figures,",
    "tickers, or market data. Do not give investment advice or recommendations.",
    "Plain prose, no headers, no lists.",
    "",
    facts,
  ].join("\n");
}

async function handleAiAssist(
  env: EvidenceApiEnv,
  request: Request,
  input: { kind: "screener"; query: string } | { kind: "portfolio" },
): Promise<unknown> {
  if (!thesisConfigured(env)) {
    return {
      ok: false,
      kind: input.kind,
      unavailableReason: "external model not configured",
      externalModelUsed: false,
    };
  }

  const apiKey = env.THESIS_GEMINI_API_KEY as string;
  const evidence = await loadActiveEvidence(env, request);

  if (input.kind === "screener") {
    const sectors = [
      ...new Set(evidence.scores.securities.map((security) => security.sector)),
    ].sort((left, right) => left.localeCompare(right));
    const call = await callExternalModel(apiKey, screenerPrompt(input.query, sectors), {
      temperature: 0.1,
      maxOutputTokens: 512,
    });

    if (call.text === null) {
      return {
        ok: false,
        kind: input.kind,
        unavailableReason: call.unavailableReason,
        externalModelUsed: false,
      };
    }

    const filters = parseScreenerFilters(call.text);

    if (filters === null) {
      return {
        ok: false,
        kind: input.kind,
        unavailableReason: "external model returned an invalid filter specification",
        externalModelUsed: false,
      };
    }

    return {
      ok: true,
      kind: input.kind,
      filters,
      externalModelUsed: true,
      model: call.model,
    };
  }

  const { facts, citations } = portfolioFactBlock(evidence);
  const call = await callExternalModel(apiKey, portfolioAssistPrompt(facts), {
    temperature: 0.2,
    maxOutputTokens: 512,
  });

  if (call.text === null) {
    return {
      ok: false,
      kind: input.kind,
      unavailableReason: call.unavailableReason,
      externalModelUsed: false,
    };
  }

  const scrubbed = scrubBracketLeaks(call.text);

  if (!reliableNarrative(scrubbed, null)) {
    return {
      ok: false,
      kind: input.kind,
      unavailableReason: "external model returned an unusable response",
      externalModelUsed: false,
    };
  }

  return {
    ok: true,
    kind: input.kind,
    text: scrubbed.slice(0, THESIS_MAX_CHARS),
    citations: [...citations, `external-model:${call.model}`],
    externalModelUsed: true,
    model: call.model,
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

  if (
    pathname !== `${API_PREFIX}evidence/security` &&
    pathname !== `${API_PREFIX}ai/explain` &&
    pathname !== `${API_PREFIX}ai/assist`
  ) {
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
      const deterministicFocus = input.data.focus === "thesis" ? "summary" : input.data.focus;
      const citations = [
        "scores.json:security.contributions",
        base.position === null ? "portfolio.json:not-selected" : "portfolio.json:position",
      ];

      if (input.data.focus === "thesis") {
        const thesis = await generateThesis(env, security, base.position);

        return jsonResponse(
          EvidenceExplanationResponseSchema.parse(
            thesis.text !== null
              ? {
                  buildId: base.buildId,
                  modelVersion: base.modelVersion,
                  mode: "llm-thesis",
                  externalModelUsed: true,
                  focus: input.data.focus,
                  ticker: security.ticker,
                  explanation: thesis.text,
                  citations: [...citations, `external-model:${thesis.model ?? THESIS_MODEL}`],
                  notice: base.notice,
                }
              : {
                  buildId: base.buildId,
                  modelVersion: base.modelVersion,
                  mode: "deterministic-evidence",
                  externalModelUsed: false,
                  focus: input.data.focus,
                  ticker: security.ticker,
                  explanation: explanationText(security, base.position, deterministicFocus),
                  citations,
                  notice: base.notice,
                  thesisUnavailableReason: thesis.unavailableReason ?? "external model unavailable",
                },
          ),
          200,
          rateHeaders,
        );
      }

      return jsonResponse(
        EvidenceExplanationResponseSchema.parse({
          buildId: base.buildId,
          modelVersion: base.modelVersion,
          mode: "deterministic-evidence",
          externalModelUsed: false,
          focus: input.data.focus,
          ticker: security.ticker,
          explanation: explanationText(security, base.position, deterministicFocus),
          citations,
          notice: base.notice,
        }),
        200,
        rateHeaders,
      );
    }

    if (pathname === `${API_PREFIX}ai/assist`) {
      const input = AiAssistRequestSchema.safeParse(body);

      if (!input.success) {
        return errorResponse(
          400,
          "invalid_request",
          "Assist kind and query must follow the request contract.",
          rateHeaders,
        );
      }

      return jsonResponse(
        AiAssistResponseSchema.parse(await handleAiAssist(env, request, input.data)),
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
    if (request.method !== "GET") {
      return errorResponse(405, "method_not_allowed", "Use GET for the health endpoint.");
    }

    try {
      const evidence = await loadActiveEvidence(env, request);

      return jsonResponse({
        status: "healthy",
        service: "akribeia-v3-evidence-api",
        buildId: evidence.buildId,
        schemaVersion: evidence.scores.schemaVersion,
        modelVersion: evidence.scores.modelVersion,
        checks: {
          activePointer: "pass",
          manifest: "pass",
          scoreArtifact: "sha256-and-byte-size-pass",
          portfolioArtifact: "sha256-and-byte-size-pass",
          schemas: "pass",
          lineage: "pass",
        },
        aiMode: "deterministic-evidence",
        externalModelConfigured: thesisConfigured(env),
      });
    } catch {
      return jsonResponse(
        {
          status: "unavailable",
          service: "akribeia-v3-evidence-api",
          error: {
            code: "evidence_unavailable",
            message: "Active evidence failed health verification.",
          },
        },
        503,
      );
    }
  }

  return routeProtectedRequest(request, env, rateLimiter);
}
