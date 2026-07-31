import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const clientRoot = fileURLToPath(new URL("../dist/client/", import.meta.url));

const browserCandidates = [
  process.env.CHROME_BIN,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

async function findBrowser() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through the known zero-install browser locations.
    }
  }

  throw new Error(
    "Chrome or Chromium is required for the dashboard browser smoke test. Set CHROME_BIN when it is installed elsewhere.",
  );
}

async function assetResponse(request) {
  const requestUrl = new URL(request.url);
  const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
  const filePath = resolve(clientRoot, relativePath);
  const containment = relative(clientRoot, filePath);

  if (
    relativePath.length === 0 ||
    containment.length === 0 ||
    containment.startsWith("..") ||
    isAbsolute(containment)
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const payload = await readFile(filePath);

    return new Response(payload, {
      headers: {
        "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }

    throw error;
  }
}

async function startDashboardServer({ marketHealthResponder } = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("browser-smoke", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const requestUrl = new URL(incoming.url ?? "/", origin);
      const request = new Request(requestUrl, {
        headers: incoming.headers,
        method: incoming.method,
      });
      let response =
        requestUrl.pathname === "/api/v3/market-health" && marketHealthResponder
          ? marketHealthResponder()
          : await assetResponse(request);

      if (response.status === 404) {
        response = await worker.fetch(
          request,
          {
            ASSETS: {
              fetch: assetResponse,
            },
          },
          {
            waitUntil() {},
            passThroughOnException() {},
          },
        );
      }

      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) => outgoing.setHeader(name, value));
      outgoing.end(new Uint8Array(await response.arrayBuffer()));
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.end(error instanceof Error ? error.message : "Unknown server error");
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  return server;
}

async function renderInChrome(browser, url, profileDirectory) {
  const { stdout } = await execFileAsync(
    browser,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
      `--user-data-dir=${profileDirectory}`,
      "--force-device-scale-factor=1",
      "--window-size=390,844",
      "--virtual-time-budget=5000",
      "--dump-dom",
      url,
    ],
    {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
      windowsHide: true,
    },
  );

  return stdout;
}

test("hydrates the responsive dashboard and verifies its active evidence in Chrome", async () => {
  const browser = await findBrowser();
  const server = await startDashboardServer();
  const profileDirectory = await mkdtemp(join(tmpdir(), "akribeia-browser-smoke-"));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/`;
    const stdout = await renderInChrome(browser, url, profileDirectory);

    assert.match(stdout, /data-state="(?:healthy|stale)"/);
    assert.doesNotMatch(stdout, /data-state="(?:loading|error|unavailable)"/);
    assert.match(stdout, /Active evidence build verified|Source freshness window has elapsed/);
    assert.match(stdout, /preview-20260728-pipeline-v4-a34fc842220f/);
    assert.match(stdout, /Skip to main content/);
    assert.match(stdout, /See the market whole/);
    assert.match(stdout, /Test every signal/);
    assert.match(stdout, /Open Market Health/);
    assert.match(stdout, /Research all 1,361 securities/);
    assert.match(stdout, /Research integrity/);
    assert.match(
      stdout,
      /data-market-health-state="(?:loading|healthy|partial|stale|unavailable|error)"/,
    );
    assert.match(stdout, /Overall Market Health/);
    assert.match(stdout, /Market regime/);
    assert.match(stdout, /Macro health/);
    assert.match(stdout, /Earnings health/);
    assert.match(stdout, /Market breadth/);
    assert.match(stdout, /Risk state/);
    assert.match(stdout, /Computed across all 1,361 securities/);
    assert.match(stdout, /Every validated name\. No hidden cap floor\./);
    assert.match(stdout, /Search all securities/);
    assert.match(stdout, /1,361/);
    assert.match(stdout, /authoritative no-floor universe/);
    assert.match(stdout, /Highest composite scores/);
    assert.match(stdout, /A dated receipt, with limits intact/);
    assert.match(stdout, /No point-in-time benchmark input is present/);
    assert.match(stdout, /Accepted before the decision—or excluded/);
    assert.match(stdout, /11<!-- --> \/<!-- --> <!-- -->12/);
    assert.match(stdout, /Post-cutoff excluded/);
    assert.match(stdout, /Retrospective metadata/);
    assert.match(stdout, /CTRA/);
    assert.match(stdout, /What the model is—and is not/);
    assert.match(stdout, /Not release eligible/);
    assert.match(stdout, /Known methodology gap/);
    assert.match(stdout, /Measured now\. Compared when evidence exists/);
    assert.match(stdout, /insufficient history/);
    assert.match(stdout, /Identity evidence, without false permanence/);
    assert.match(stdout, /AKR-TICKER:MU/);
    assert.match(stdout, /Ticker history unavailable/);
    assert.match(stdout, /Every ticker checked\. Identity scope stays honest/);
    assert.match(stdout, /632<!-- --> \/<!-- --> <!-- -->643/);
    assert.match(stdout, /CIK 0000723125/);
    assert.match(stdout, /11 unresolved/);
    assert.match(stdout, /Current association only/);
    assert.match(stdout, /The universe changed\. Eligibility history did not appear/);
    assert.match(stdout, /Observed entrants/);
    assert.match(stdout, /Observed exits/);
    assert.match(stdout, /effective membership intervals available/);
    assert.match(stdout, /Five discontinuities\. Zero verified adjustments/);
    assert.match(stdout, /Possible share discontinuity/);
    assert.match(stdout, /No synthetic adjustment/);
    assert.match(stdout, /Leaving the file is not a delisting/);
    assert.match(stdout, /BLD and HOLX remain unresolved/);
    assert.match(stdout, /Current is not historical/);
    assert.match(stdout, /Nine targets\. Zero invented fills or costs/);
    assert.match(stdout, /No zero-cost shortcut/);
    assert.match(stdout, /Eight candidates\. No benchmark return/);
    assert.match(stdout, /Price change is not return/);
    assert.match(stdout, /One day recorded\. Twenty-nine still must happen/);
    assert.match(stdout, /Immutable observation days/);
    assert.match(stdout, /Executable portfolios/);
    assert.match(stdout, /Costed returns/);
    assert.match(stdout, /Elapsed evidence cannot be generated on demand/);
    assert.match(stdout, /Two snapshots\. Zero eligible folds/);
    assert.match(stdout, /Readiness is not a backtest/);
    assert.match(stdout, /Two snapshots are not a backtest/);
    assert.match(stdout, /10<!-- --> controls unresolved/);
    assert.match(stdout, /No performance claim/);
    assert.match(stdout, /Working product\. Research-preview evidence/);
    assert.match(stdout, /1<!-- --> \/<!-- --> <!-- -->30/);
    assert.match(stdout, /Production cutover: (?:<!-- -->)?not authorized/);
    assert.match(stdout, /Ask the published build/);
    assert.match(stdout, /Explain evidence/);
    assert.match(stdout, /Recheck status/);
  } finally {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
    await rm(profileDirectory, { force: true, recursive: true });
  }
});

test("renders explicit partial and error Market Health states in Chrome", async () => {
  const browser = await findBrowser();
  const partialPayload = {
    status: "partial",
    generatedAt: "2026-07-30T18:00:00.000Z",
    source: {
      v2AppCommit: "b477349a8691fdc5000641a6ae2893dbbfae2de6",
      v2SourceCommit: "1858840c581f406492dec2e809830d05764ad3d9",
      staticUrl: "https://example.test/market_static.json",
      pgiBakedUrl: "https://example.test/pgi_money_market.json",
      staticAsOf: null,
      liveProvider: "Yahoo Finance chart API + FRED fredgraph.csv",
    },
    staticData: null,
    live: {
      indices: [],
      dxy: { ok: false },
      spy: { ok: false },
      vix: { ok: false },
      yields: { ok: false },
      buffett: { ok: false },
      pgi: { ok: false },
      dots: { ok: false },
    },
    unavailable: ["baked macro and earnings", "major indices", "VIX"],
  };
  const scenarios = [
    {
      expected: /data-market-health-state="partial"/,
      responder: () => Response.json(partialPayload),
      message: /Partial data: baked macro and earnings, major indices, VIX unavailable\./,
    },
    {
      expected: /data-market-health-state="error"/,
      responder: () => new Response("Upstream failure", { status: 500 }),
      message: /Market Health could not be verified/,
    },
  ];

  for (const scenario of scenarios) {
    const server = await startDashboardServer({ marketHealthResponder: scenario.responder });
    const profileDirectory = await mkdtemp(join(tmpdir(), "akribeia-market-health-state-"));

    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const stdout = await renderInChrome(
        browser,
        `http://127.0.0.1:${address.port}/#market-health`,
        profileDirectory,
      );

      assert.match(stdout, scenario.expected);
      assert.match(stdout, scenario.message);
      assert.match(stdout, /Retry sources/);
      assert.match(stdout, /Computed across all 1,361 securities/);
    } finally {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
      await rm(profileDirectory, { force: true, recursive: true });
    }
  }
});
