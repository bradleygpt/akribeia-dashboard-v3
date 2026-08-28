import { describe, expect, it, vi } from "vitest";
import { handleEngineApi, type EngineApiEnv } from "../../apps/dashboard/worker/engine-api.js";
import { createFixedWindowRateLimiter } from "../../apps/dashboard/worker/evidence-api.js";

const CONFIGURED: EngineApiEnv = {
  MARKETS_ENGINE_URL: "https://engine.example",
  MARKETS_ENGINE_TOKEN: "secret-engine-token",
};

function limiter(limit = 30) {
  return createFixedWindowRateLimiter({ limit, windowMs: 60_000, now: () => 1_000_000 });
}

function healthRequest(): Request {
  return new Request("https://akribeia.example/api/v3/engine/health");
}

function queryRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://akribeia.example/api/v3/engine/query", {
    method: "POST",
    headers: {
      "cf-connecting-ip": "192.0.2.10",
      "content-type": "application/json",
      origin: "https://akribeia.example",
      "x-akribeia-client": "dashboard-v3",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function resultRequest(job: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://akribeia.example/api/v3/engine/result?job=${job}`, {
    method: "GET",
    headers: {
      "cf-connecting-ip": "192.0.2.10",
      "x-akribeia-client": "dashboard-v3",
      referer: "https://akribeia.example/engine",
      ...headers,
    },
  });
}

interface RecordedCall {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

function recordingFetcher(
  reply: (call: RecordedCall) => Response,
  calls: RecordedCall[],
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
}

describe("markets engine proxy", () => {
  it("leaves non-engine routes to other handlers", async () => {
    const response = await handleEngineApi(
      new Request("https://akribeia.example/api/v3/health"),
      CONFIGURED,
    );

    expect(response).toBeNull();
  });

  it("fails closed with HTTP 200 on all three routes when unconfigured", async () => {
    const fetchSpy = vi.fn();

    for (const [request, envUnderTest] of [
      [healthRequest(), {}],
      [queryRequest({ query: "which sectors lead?" }), {}],
      [resultRequest("job-1"), {}],
      // a partial configuration is still unconfigured
      [healthRequest(), { MARKETS_ENGINE_URL: "https://engine.example" }],
      [queryRequest({ query: "q" }), { MARKETS_ENGINE_TOKEN: "secret-engine-token" }],
    ] as const) {
      const response = await handleEngineApi(request, envUnderTest, {
        fetcher: fetchSpy as unknown as typeof fetch,
        rateLimiter: limiter(),
      });

      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toEqual({
        ok: false,
        unavailableReason: "engine not configured",
      });
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("proxies health without auth and passes the upstream body through", async () => {
    const calls: RecordedCall[] = [];
    const response = await handleEngineApi(healthRequest(), CONFIGURED, {
      fetcher: recordingFetcher(
        () => new Response(JSON.stringify({ ok: true, status: "idle" }), { status: 200 }),
        calls,
      ),
      rateLimiter: limiter(),
    });

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toEqual({ ok: true, status: "idle" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://engine.example/health");
    expect(calls[0].headers.get("authorization")).toBeNull();
  });

  it("submits a query with the bearer credential and never echoes it", async () => {
    const calls: RecordedCall[] = [];
    const response = await handleEngineApi(
      queryRequest({ query: "rank energy names by momentum" }),
      CONFIGURED,
      {
        fetcher: recordingFetcher(
          () => new Response(JSON.stringify({ ok: true, job: "job-abc_123" }), { status: 200 }),
          calls,
        ),
        rateLimiter: limiter(),
      },
    );

    expect(response?.status).toBe(200);
    const text = await response?.text();
    expect(JSON.parse(text ?? "")).toEqual({ ok: true, job: "job-abc_123" });
    expect(text).not.toContain("secret-engine-token");
    expect(response?.headers.get("cache-control")).toBe("no-store");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://engine.example/api/query");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("authorization")).toBe("Bearer secret-engine-token");
    expect(JSON.parse(calls[0].body)).toEqual({ query: "rank energy names by momentum" });
  });

  it("preserves the upstream 503 engine-yielding status distinctly", async () => {
    const calls: RecordedCall[] = [];
    const response = await handleEngineApi(
      queryRequest({ query: "run the weekly regime scan" }),
      CONFIGURED,
      {
        fetcher: recordingFetcher(
          () =>
            new Response(JSON.stringify({ ok: false, status: "yielding", retry_in: 300 }), {
              status: 503,
            }),
          calls,
        ),
        rateLimiter: limiter(),
      },
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      status: "yielding",
      retry_in: 300,
    });
  });

  it("preserves the upstream 429 rate-limit status distinctly", async () => {
    const response = await handleEngineApi(resultRequest("job-abc_123"), CONFIGURED, {
      fetcher: recordingFetcher(
        () => new Response(JSON.stringify({ ok: false, error: "rate_limited" }), { status: 429 }),
        [],
      ),
      rateLimiter: limiter(),
    });

    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toEqual({ ok: false, error: "rate_limited" });
  });

  it("polls a result with the bearer credential and a validated job id", async () => {
    const calls: RecordedCall[] = [];
    const response = await handleEngineApi(resultRequest("job-abc_123"), CONFIGURED, {
      fetcher: recordingFetcher(
        () =>
          new Response(JSON.stringify({ ok: true, status: "done", answer: "42" }), {
            status: 200,
          }),
        calls,
      ),
      rateLimiter: limiter(),
    });

    expect(response?.status).toBe(200);
    const text = await response?.text();
    expect(JSON.parse(text ?? "")).toEqual({ ok: true, status: "done", answer: "42" });
    expect(text).not.toContain("secret-engine-token");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://engine.example/api/result/job-abc_123");
    expect(calls[0].headers.get("authorization")).toBe("Bearer secret-engine-token");
  });

  it("rejects invalid job ids before reaching upstream", async () => {
    const fetchSpy = vi.fn();

    for (const job of ["", "a/b", "a".repeat(65), "job%00"]) {
      const response = await handleEngineApi(resultRequest(encodeURIComponent(job)), CONFIGURED, {
        fetcher: fetchSpy as unknown as typeof fetch,
        rateLimiter: limiter(),
      });

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toMatchObject({
        error: { code: "invalid_job" },
      });
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed query bodies before reaching upstream", async () => {
    const fetchSpy = vi.fn();

    for (const body of [
      "{invalid",
      JSON.stringify({}),
      JSON.stringify({ query: "" }),
      JSON.stringify({ query: "x".repeat(601) }),
      JSON.stringify({ query: "fine", extra: true }),
      JSON.stringify({ query: 7 }),
    ]) {
      const response = await handleEngineApi(queryRequest(body), CONFIGURED, {
        fetcher: fetchSpy as unknown as typeof fetch,
        rateLimiter: limiter(),
      });

      expect(response?.status).toBe(400);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never forwards query or result requests without the trusted client header", async () => {
    const fetchSpy = vi.fn();

    const queryResponse = await handleEngineApi(
      queryRequest({ query: "q" }, { "x-akribeia-client": "unknown" }),
      CONFIGURED,
      { fetcher: fetchSpy as unknown as typeof fetch, rateLimiter: limiter() },
    );
    expect(queryResponse?.status).toBe(403);
    await expect(queryResponse?.json()).resolves.toMatchObject({
      error: { code: "client_forbidden" },
    });

    const resultResponse = await handleEngineApi(
      new Request("https://akribeia.example/api/v3/engine/result?job=job-1", { method: "GET" }),
      CONFIGURED,
      { fetcher: fetchSpy as unknown as typeof fetch, rateLimiter: limiter() },
    );
    expect(resultResponse?.status).toBe(403);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects cross-origin callers on the protected routes", async () => {
    const fetchSpy = vi.fn();

    const crossOriginPost = await handleEngineApi(
      queryRequest({ query: "q" }, { origin: "https://evil.test" }),
      CONFIGURED,
      { fetcher: fetchSpy as unknown as typeof fetch, rateLimiter: limiter() },
    );
    expect(crossOriginPost?.status).toBe(403);

    const crossOriginGet = await handleEngineApi(
      resultRequest("job-1", { referer: "https://evil.test/engine" }),
      CONFIGURED,
      { fetcher: fetchSpy as unknown as typeof fetch, rateLimiter: limiter() },
    );
    expect(crossOriginGet?.status).toBe(403);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed as unreachable when upstream errors or returns non-JSON", async () => {
    const failing = await handleEngineApi(resultRequest("job-1"), CONFIGURED, {
      fetcher: (async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
      rateLimiter: limiter(),
    });
    expect(failing?.status).toBe(503);
    await expect(failing?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "engine_unreachable" },
    });

    const nonJson = await handleEngineApi(resultRequest("job-1"), CONFIGURED, {
      fetcher: recordingFetcher(
        () => new Response("<html>proxy error</html>", { status: 502 }),
        [],
      ),
      rateLimiter: limiter(),
    });
    expect(nonJson?.status).toBe(502);
    await expect(nonJson?.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "engine_invalid_response" },
    });
  });

  it("enforces its own internal rate-limit bucket", async () => {
    const shared = limiter(1);
    const fetcher = recordingFetcher(
      () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      [],
    );

    const first = await handleEngineApi(resultRequest("job-1"), CONFIGURED, {
      fetcher,
      rateLimiter: shared,
    });
    const second = await handleEngineApi(resultRequest("job-1"), CONFIGURED, {
      fetcher,
      rateLimiter: shared,
    });

    expect(first?.status).toBe(200);
    expect(second?.status).toBe(429);
    expect(second?.headers.get("ratelimit-remaining")).toBe("0");
    expect(second?.headers.get("retry-after")).not.toBeNull();
  });
});
