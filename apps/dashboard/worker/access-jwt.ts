// Cloudflare Access JWT verification inside the Worker (owner decision 2026-10-20, audit F1).
//
// Access already gates the hostname at the edge. Verifying its signed assertion here as well
// means a lapse in that edge configuration -- a new route or hostname, an edited Access
// application -- can no longer expose the Worker: every request it handles, /api included,
// must carry a token signed by the team's Access keys for this application's audience.

export interface AccessConfig {
  /** e.g. https://akribeia-insights.cloudflareaccess.com (the token's issuer). */
  teamDomain: string;
  /** the Access application's audience (AUD) tag. */
  audience: string;
}

export type AccessVerdict = { ok: true; email: string | null } | { ok: false; reason: string };

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
}

type Fetcher = (input: string) => Promise<Response>;

const KEY_CACHE_TTL_MS = 60 * 60 * 1000;
const CLOCK_LEEWAY_SECONDS = 60;
const ACCESS_COOKIE = "CF_Authorization";

let keyCache: { url: string; fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;

/** Test hook: forget the cached signing keys. */
export function resetAccessKeyCache(): void {
  keyCache = null;
}

function base64UrlBytes(segment: string): Uint8Array<ArrayBuffer> {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(base64UrlBytes(segment))) as unknown;
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function loadKeys(
  url: string,
  fetcher: Fetcher,
  now: number,
): Promise<Map<string, CryptoKey>> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Access signing keys unavailable (HTTP ${response.status}).`);
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== "RSA" || !jwk.kid || !jwk.n || !jwk.e) continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      ),
    );
  }
  keyCache = { url, fetchedAt: now, keys };
  return keys;
}

async function signingKey(
  kid: string,
  config: AccessConfig,
  fetcher: Fetcher,
  now: number,
): Promise<CryptoKey | null> {
  const url = `${config.teamDomain}/cdn-cgi/access/certs`;
  const cached =
    keyCache !== null && keyCache.url === url && now - keyCache.fetchedAt < KEY_CACHE_TTL_MS
      ? keyCache.keys
      : null;
  // Refetch on expiry or on an unknown kid (Access rotates its keys).
  const keys = cached?.has(kid) ? cached : await loadKeys(url, fetcher, now);
  return keys.get(kid) ?? null;
}

export async function verifyAccessJwt(
  token: string,
  config: AccessConfig,
  options: { fetcher?: Fetcher; now?: number } = {},
): Promise<AccessVerdict> {
  const now = options.now ?? Date.now();
  const fetcher = options.fetcher ?? ((input: string) => fetch(input));
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed token" };
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];
  const header = base64UrlJson(headerSegment);
  const payload = base64UrlJson(payloadSegment);
  if (header === null || payload === null) return { ok: false, reason: "malformed token" };
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    return { ok: false, reason: "unsupported token algorithm" };
  }

  let key: CryptoKey | null;
  try {
    key = await signingKey(header.kid, config, fetcher, now);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "signing keys unavailable",
    };
  }
  if (key === null) return { ok: false, reason: "unknown signing key" };

  const signatureValid = await crypto.subtle
    .verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlBytes(signatureSegment),
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
    )
    .catch(() => false);
  if (!signatureValid) return { ok: false, reason: "invalid signature" };

  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(config.audience)) return { ok: false, reason: "wrong audience" };
  if (payload.iss !== config.teamDomain) return { ok: false, reason: "wrong issuer" };
  const seconds = now / 1000;
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_LEEWAY_SECONDS < seconds) {
    return { ok: false, reason: "expired token" };
  }
  if (typeof payload.nbf === "number" && payload.nbf - CLOCK_LEEWAY_SECONDS > seconds) {
    return { ok: false, reason: "token not yet valid" };
  }
  return { ok: true, email: typeof payload.email === "string" ? payload.email : null };
}

/** The Access assertion header, or the CF_Authorization cookie Access sets on the browser. */
export function accessTokenFrom(request: Request): string | null {
  const header = request.headers.get("cf-access-jwt-assertion");
  if (header) return header;
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === ACCESS_COOKIE && value.length > 0) return value.join("=");
  }
  return null;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Null when the request may proceed; otherwise the 403 to return. Enforced whenever the
 * Worker is configured with ACCESS_TEAM_DOMAIN and ACCESS_AUD (the deployed config always is;
 * a dashboard test asserts it), except for local development hosts, which Access never fronts.
 */
export async function enforceAccess(
  request: Request,
  env: { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string },
  options: { fetcher?: Fetcher; now?: number } = {},
): Promise<Response | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  if (LOCAL_HOSTS.has(new URL(request.url).hostname)) return null;
  const token = accessTokenFrom(request);
  const verdict =
    token === null
      ? ({ ok: false, reason: "missing Access token" } as const)
      : await verifyAccessJwt(
          token,
          { teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD },
          options,
        );
  if (verdict.ok) return null;
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: "access_denied",
        message: `Cloudflare Access verification failed: ${verdict.reason}.`,
      },
    }),
    { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
}
