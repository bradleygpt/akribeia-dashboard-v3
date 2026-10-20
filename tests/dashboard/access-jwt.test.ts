import { beforeEach, describe, expect, it } from "vitest";
import {
  accessTokenFrom,
  enforceAccess,
  resetAccessKeyCache,
  verifyAccessJwt,
} from "../../apps/dashboard/worker/access-jwt.js";

const TEAM = "https://team.cloudflareaccess.example";
const AUD = "aud-tag-for-this-application";
const NOW = Date.parse("2026-10-20T16:00:00Z");
const ALG = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

const keyPair = await crypto.subtle.generateKey(
  { ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
  true,
  ["sign", "verify"],
);
const otherPair = await crypto.subtle.generateKey(
  { ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
  true,
  ["sign", "verify"],
);
const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const json64 = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function sign(
  claims: Record<string, unknown>,
  options: { kid?: string; key?: CryptoKey } = {},
): Promise<string> {
  const head = json64({ alg: "RS256", kid: options.kid ?? "key-1", typ: "JWT" });
  const body = json64(claims);
  const signature = await crypto.subtle.sign(
    ALG.name,
    options.key ?? keyPair.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

const goodClaims = {
  aud: [AUD],
  iss: TEAM,
  email: "owner@example.test",
  exp: NOW / 1000 + 3600,
  nbf: NOW / 1000 - 10,
  type: "app",
};
let jwksCalls = 0;
const fetcher = async (url: string) => {
  jwksCalls += 1;
  expect(url).toBe(`${TEAM}/cdn-cgi/access/certs`);
  return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: "key-1" }] }), { status: 200 });
};
const config = { teamDomain: TEAM, audience: AUD };

beforeEach(() => {
  resetAccessKeyCache();
  jwksCalls = 0;
});

describe("Cloudflare Access JWT verification", () => {
  it("accepts a token signed by the team key for this audience", async () => {
    await expect(
      verifyAccessJwt(await sign(goodClaims), config, { fetcher, now: NOW }),
    ).resolves.toEqual({ ok: true, email: "owner@example.test" });
  });

  it.each([
    ["wrong audience", { ...goodClaims, aud: ["another-app"] }],
    ["wrong issuer", { ...goodClaims, iss: "https://evil.cloudflareaccess.example" }],
    ["expired token", { ...goodClaims, exp: NOW / 1000 - 3600 }],
    ["token not yet valid", { ...goodClaims, nbf: NOW / 1000 + 3600 }],
  ])("rejects a %s", async (reason, claims) => {
    await expect(
      verifyAccessJwt(await sign(claims), config, { fetcher, now: NOW }),
    ).resolves.toEqual({ ok: false, reason });
  });

  it("rejects a token signed by any other key, and an unknown kid after refetching", async () => {
    await expect(
      verifyAccessJwt(await sign(goodClaims, { key: otherPair.privateKey }), config, {
        fetcher,
        now: NOW,
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid signature" });
    await expect(
      verifyAccessJwt(await sign(goodClaims, { kid: "rotated-away" }), config, {
        fetcher,
        now: NOW,
      }),
    ).resolves.toEqual({ ok: false, reason: "unknown signing key" });
  });

  it("rejects a forged payload under a genuine signature", async () => {
    const [head, , signature] = (await sign(goodClaims)).split(".");
    const forged = `${head}.${json64({ ...goodClaims, email: "attacker@example.test" })}.${signature}`;
    await expect(verifyAccessJwt(forged, config, { fetcher, now: NOW })).resolves.toEqual({
      ok: false,
      reason: "invalid signature",
    });
  });

  it("caches the signing keys", async () => {
    await verifyAccessJwt(await sign(goodClaims), config, { fetcher, now: NOW });
    await verifyAccessJwt(await sign(goodClaims), config, { fetcher, now: NOW + 60_000 });
    expect(jwksCalls).toBe(1);
  });

  it("reads the assertion header or the CF_Authorization cookie", () => {
    expect(
      accessTokenFrom(
        new Request("https://x.example/", { headers: { "cf-access-jwt-assertion": "a.b.c" } }),
      ),
    ).toBe("a.b.c");
    expect(
      accessTokenFrom(
        new Request("https://x.example/", { headers: { cookie: "x=1; CF_Authorization=d.e.f" } }),
      ),
    ).toBe("d.e.f");
    expect(accessTokenFrom(new Request("https://x.example/"))).toBeNull();
  });
});

describe("Worker Access enforcement", () => {
  const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
  const prodRequest = (headers: Record<string, string> = {}) =>
    new Request("https://akribeia-dashboard.example.workers.dev/api/v3/health", { headers });

  it("refuses /api without a token and with a bad one", async () => {
    const missing = await enforceAccess(prodRequest(), env, { fetcher, now: NOW });
    expect(missing?.status).toBe(403);
    await expect(missing?.json()).resolves.toMatchObject({
      error: { code: "access_denied", message: expect.stringContaining("missing Access token") },
    });
    const bad = await enforceAccess(
      prodRequest({ "cf-access-jwt-assertion": await sign({ ...goodClaims, aud: ["x"] }) }),
      env,
      { fetcher, now: NOW },
    );
    expect(bad?.status).toBe(403);
  });

  it("lets a verified request through", async () => {
    await expect(
      enforceAccess(prodRequest({ "cf-access-jwt-assertion": await sign(goodClaims) }), env, {
        fetcher,
        now: NOW,
      }),
    ).resolves.toBeNull();
  });

  it("does not run without the Access config or on a local development host", async () => {
    await expect(enforceAccess(prodRequest(), {}, { fetcher, now: NOW })).resolves.toBeNull();
    await expect(
      enforceAccess(new Request("http://127.0.0.1:8799/api/v3/health"), env, { fetcher, now: NOW }),
    ).resolves.toBeNull();
  });
});
